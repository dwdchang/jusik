import {
  fetchStockDailySeries,
  type FscDailyPrice,
} from "@/lib/api/fsc/stockPrice";
import { getRedis } from "@/lib/redis/client";
import { mapLimit } from "./financials";

/**
 * 종목분석 시세 파생 read-through 캐시 — Phase 72 (plan.md §72).
 *
 * 52주 최고·최저, 기간 변동률(1개월·3개월·1년·올해), 연말 종가(과거 PER·PBR 분자)를
 * 한 군데서 만든다. 원천은 **금융위원회 주식시세정보**(KRX EOD)다.
 *
 * KIS를 쓰지 않는 이유: 화면은 Redis 스냅샷만 읽는 게 원칙인데(AGENTS.md §3)
 * `market:stock:*`에는 **보유·관심 종목만** 있다. 종목분석은 임의 종목을 검색해 여는
 * 화면이라 스냅샷이 없는 종목이 대부분이다. 금융위 API는 호출 시간창 제약이 없고
 * 이미 종목 등록 액션이 같은 예외로 직접 호출하고 있어(Phase 63) 경로를 맞췄다.
 *
 * ⚠️ 값은 **직전 영업일 확정 종가** 기준이다(장중 실시간 아님). 화면은 기준일을 함께
 * 표기해야 한다. 재무(TTL 30일)와 달리 매일 바뀌므로 **TTL 6시간**으로 따로 캐시한다.
 *
 * 캐시는 두 층이다 (Phase 78) — 파생 지표 묶음 전체(`analysis:quote:v1:*`, TTL 6시간)와
 * 그 안에서 재료로 쓰는 **확정 기간말 종가**(`analysis:closes:v1:*`, TTL 1년). 뒤엣것을
 * 나눠 둔 이유는 § `CLOSE_CACHE_KEY_PREFIX`에 적었다.
 */

const QUOTE_TTL_SECONDS = 6 * 60 * 60; // 6시간
const QUOTE_KEY_PREFIX = "analysis:quote:v1:";

/**
 * 확정 기간말 종가 캐시 — 종목당 한 키에 `{"2023Q2": 71500, ...}` 꼴로 모은다.
 *
 * 지나간 기간말의 종가는 다시 변하지 않는데(무수정주가라 액면분할에도 소급 조정이 없다)
 * 여기 없으면 TTL 6시간이 만료될 때마다 2020년치까지 전부 다시 받는다. 그 재조회가
 * 첫 열람 지연의 대부분이었다(2026-07-29 실측: 15콜 5~15초).
 *
 * 값이 불변이라 TTL은 사실상 없어도 되지만, 한 번 열어보고 마는 종목의 키가 영원히
 * 남지 않도록 1년을 건다 — 만료돼도 다음 열람 때 다시 채우면 그만이다.
 */
const CLOSE_CACHE_TTL_SECONDS = 365 * 24 * 60 * 60;
const CLOSE_CACHE_KEY_PREFIX = "analysis:closes:v1:";
/**
 * 기간말이 이 일수만큼 지나야 확정으로 보고 캐시에 넣는다. 금융위는 영업일+1 오후 1시에
 * 확정 종가를 올리므로, 갓 지난 기간말은 아직 데이터가 없어 **직전 거래일 종가**가
 * 잡힌다 — 그 값을 영구 캐시하면 틀린 종가가 1년간 고정된다.
 */
const CLOSE_SETTLE_DAYS = 7;

/**
 * 기간말 종가 조회 동시성. 재무(`DART_CONCURRENCY` = 5)와 달리 크게 잡는다 —
 * 금융위 API는 콜당 지연이 130ms 또는 5.2초로 갈리는데(2026-07-29 실측, 순차 호출에서도
 * 나타나 스로틀이 아니라 백엔드 편차다) 동시 15콜의 총 시간이 최악 콜 하나(5.2초)와
 * 같았다. 5로 나누면 3라운드가 각자 자기 라운드의 최악 콜에 묶여 15초를 문다.
 */
const QUOTE_CONCURRENCY = 20;

/** 일별 시세를 받아올 창(달력일) — 1년 변동률·52주 계산에 여유를 둔다 */
const QUOTE_WINDOW_DAYS = 400;
/** 금융위 시세 제공 시작 연도 (2019년 이전은 결과 0건, 2026-07-28 실측) */
const FSC_FIRST_YEAR = 2020;
/**
 * 분기말 종가를 확보할 연수. `overview.ts`의 분기 시계열은 **확정 사업연도 3년 + 진행 중인
 * 올해**라 달력 연도로 4개이고, 여기 기준(**시세 최신 연도**부터 역순)과 정확히 겹친다
 * (2026-07-28 실측: 3으로 두니 2023Q4 TTM 지점의 시가배당률이 비었다).
 */
const QUOTE_QUARTER_YEARS = 4;
/** 분기말 월일 — 1Q~4Q 순서 */
const QUARTER_END_DATES = ["0331", "0630", "0930", "1231"];

/** 기간 변동률 한 칸 */
export interface PriceChangeEntry {
  /** 표시 라벨 — "최근 1개월" 등 */
  label: string;
  /** 변동률(%) — 비교 기준일 시세가 없으면 null */
  rate: number | null;
}

export interface AnalysisQuote {
  symbolCode: string;
  /** 최근 확정 종가(원)와 그 기준일 "YYYY-MM-DD" */
  close: number;
  basisDate: string;
  /** 52주 최고·최저 — 장중 고가/저가 기준 */
  high52w: number | null;
  low52w: number | null;
  /** 시가총액(원)·상장주식수(주) */
  marketCap: number | null;
  listedShares: number | null;
  /** 1개월·3개월·1년·올해 변동률 */
  changes: PriceChangeEntry[];
  /** 연말 종가 — 연도별 PER·PBR 분자 ("2025" → 종가) */
  yearEndCloses: Record<string, number>;
  /** 분기말 종가 — 연환산(TTM) 지표의 분자 ("2025Q3" → 종가) */
  quarterEndCloses: Record<string, number>;
  fetchedAt: string;
}

/** "YYYYMMDD" n일 전 */
function yyyymmddDaysBefore(yyyymmdd: string, days: number): string {
  const base = new Date(
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8))
    )
  );
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10).replace(/-/g, "");
}

/** KST 오늘 "YYYYMMDD" */
function todayKstYyyymmdd(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
}

/**
 * 기준일 **이하**의 마지막 시세를 찾는다(그날이 휴장일이어도 직전 거래일로 내려간다).
 * 시계열은 오름차순이라 뒤에서부터 훑는다.
 */
function priceAsOf(
  series: FscDailyPrice[],
  targetYyyymmdd: string
): FscDailyPrice | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].date <= targetYyyymmdd) {
      return series[i];
    }
  }
  return null;
}

/** 기준일 대비 변동률(%) */
function changeRateSince(
  series: FscDailyPrice[],
  latestClose: number,
  targetYyyymmdd: string
): number | null {
  const past = priceAsOf(series, targetYyyymmdd);
  if (past === null || past.close <= 0) {
    return null;
  }
  return ((latestClose - past.close) / past.close) * 100;
}

/** "YYYYMMDD"에서 개월 수를 뺀다 (말일 보정 없이 같은 일자, 없으면 직전 거래일로 흡수) */
function subtractMonths(yyyymmdd: string, months: number): string {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const base = new Date(Date.UTC(year, month - 1 - months, day));
  return base.toISOString().slice(0, 10).replace(/-/g, "");
}

async function buildQuote(symbolCode: string): Promise<AnalysisQuote | null> {
  const today = todayKstYyyymmdd();
  const series = await fetchStockDailySeries(
    symbolCode,
    yyyymmddDaysBefore(today, QUOTE_WINDOW_DAYS),
    today
  );

  const latest = series.at(-1);
  if (!latest) {
    return null;
  }

  // 52주 = 최근 1년 창. 400일치를 받아뒀으므로 여기서 다시 잘라낸다.
  const yearAgo = subtractMonths(latest.date, 12);
  const lastYear = series.filter((row) => row.date >= yearAgo);
  const highs = lastYear.map((row) => row.high);
  const lows = lastYear.map((row) => row.low);

  const changes: PriceChangeEntry[] = [
    {
      label: "최근 1개월",
      rate: changeRateSince(series, latest.close, subtractMonths(latest.date, 1)),
    },
    {
      label: "최근 3개월",
      rate: changeRateSince(series, latest.close, subtractMonths(latest.date, 3)),
    },
    {
      label: "최근 1년",
      rate: changeRateSince(series, latest.close, yearAgo),
    },
    {
      label: "올해",
      // 올해 첫 거래일 직전(작년 마지막 거래일) 종가가 기준
      rate: changeRateSince(series, latest.close, `${latest.date.slice(0, 4)}0101`),
    },
  ];

  // 기간말 종가 — 연도별 PER·PBR(연말)과 연환산 지표(분기말)의 분자.
  // 이미 받아둔 시계열 안에 있는 날짜는 재조회하지 않고 그대로 쓴다.
  const latestYear = Number(latest.date.slice(0, 4));
  const periodEnds: Array<{ key: string; end: string; kind: "year" | "quarter" }> =
    [];

  for (let year = latestYear; year >= FSC_FIRST_YEAR; year -= 1) {
    if (year < latestYear) {
      periodEnds.push({ key: String(year), end: `${year}1231`, kind: "year" });
    }
    // 연환산은 최근 3년치 분기만 만든다(overview와 같은 범위)
    if (year > latestYear - QUOTE_QUARTER_YEARS) {
      for (const [quarter, monthDay] of QUARTER_END_DATES.entries()) {
        periodEnds.push({
          key: `${year}Q${quarter + 1}`,
          end: `${year}${monthDay}`,
          kind: "quarter",
        });
      }
    }
  }

  const today8 = todayKstYyyymmdd();
  const redis = getRedis();
  const closeCacheKey = `${CLOSE_CACHE_KEY_PREFIX}${symbolCode}`;
  const closeCache =
    (await redis
      .get<Record<string, number>>(closeCacheKey)
      .catch(() => null)) ?? {};

  const resolved = await mapLimit(
    // 아직 오지 않은 기간말은 조회할 값이 없다
    periodEnds.filter((period) => period.end <= today8),
    QUOTE_CONCURRENCY,
    async (period) => {
      // 지난 회차에 확정해 둔 종가가 있으면 그걸로 끝 — 콜도, 시계열 탐색도 없다
      const settled = closeCache[period.key];
      if (typeof settled === "number") {
        return { ...period, close: settled };
      }
      // 보유 시계열로 해결되면 콜을 아낀다(최근 1년 남짓은 대부분 여기서 걸린다)
      const cached = series[0] && period.end >= series[0].date
        ? priceAsOf(series, period.end)
        : null;
      if (cached !== null) {
        return { ...period, close: cached.close };
      }
      const rows = await fetchStockDailySeries(
        symbolCode,
        yyyymmddDaysBefore(period.end, 14),
        period.end,
        30
      );
      return { ...period, close: rows.at(-1)?.close ?? null };
    }
  );

  // 확정 구간에 들어온 새 종가만 캐시에 보탠다. 갓 지난 기간말은 아직 미확정이라
  // 다음 열람으로 미룬다(§ `CLOSE_SETTLE_DAYS`).
  const settledBefore = yyyymmddDaysBefore(today8, CLOSE_SETTLE_DAYS);
  const freshCloses: Record<string, number> = {};
  for (const { key, end, close } of resolved) {
    if (close !== null && end <= settledBefore && closeCache[key] === undefined) {
      freshCloses[key] = close;
    }
  }
  if (Object.keys(freshCloses).length > 0) {
    await redis
      .set(
        closeCacheKey,
        { ...closeCache, ...freshCloses },
        { ex: CLOSE_CACHE_TTL_SECONDS }
      )
      .catch((err) =>
        console.error("[analysis] period close cache write failed:", err)
      );
  }

  const yearEndCloses: Record<string, number> = {};
  const quarterEndCloses: Record<string, number> = {};
  for (const { key, kind, close } of resolved) {
    if (close === null) {
      continue;
    }
    if (kind === "year") {
      yearEndCloses[key] = close;
    } else {
      quarterEndCloses[key] = close;
    }
  }
  // 진행 중인 기간은 최신 종가를 대표값으로 쓴다(기간말 확정 전 임시값)
  yearEndCloses[String(latestYear)] = latest.close;

  return {
    symbolCode,
    close: latest.close,
    basisDate: `${latest.date.slice(0, 4)}-${latest.date.slice(
      4,
      6
    )}-${latest.date.slice(6, 8)}`,
    high52w: highs.length > 0 ? Math.max(...highs) : null,
    low52w: lows.length > 0 ? Math.min(...lows) : null,
    marketCap: latest.marketCap,
    listedShares: latest.listedShares,
    changes,
    yearEndCloses,
    quarterEndCloses,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 종목의 시세 파생 지표를 조회한다(read-through, TTL 6시간).
 * 원천이 없거나(미상장·데이터 없음) 호출이 실패하면 null — 화면은 시세 블록만 비운다.
 */
export async function getAnalysisQuote(
  symbolCode: string
): Promise<AnalysisQuote | null> {
  const redis = getRedis();
  const key = `${QUOTE_KEY_PREFIX}${symbolCode}`;

  const cached = await redis.get<AnalysisQuote>(key).catch(() => null);
  if (cached) {
    return cached;
  }

  let quote: AnalysisQuote | null;
  try {
    quote = await buildQuote(symbolCode);
  } catch (err) {
    console.error("[analysis] quote build failed:", err);
    return null;
  }

  if (quote === null) {
    return null;
  }

  await redis
    .set(key, quote, { ex: QUOTE_TTL_SECONDS })
    .catch((err) => console.error("[analysis] quote cache write failed:", err));

  return quote;
}
