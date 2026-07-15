import {
  fetchNitemTradeChapter,
  type NitemTradeRow,
} from "@/lib/api/customs/client";
import { currentKstMonth, subtractMonths } from "@/lib/date/kst";
import {
  getTradeDetail,
  getTradeDetailMonths,
  setTradeDetail,
  setTradeDetailMonths,
  type TradeDetailCountry,
  type TradeDetailItem,
} from "@/lib/feeds/store";
import { errorMessage } from "./collectTargets";

/**
 * 수출입 상세 갱신 잡 — 월 1회성 (plan.md §17.15).
 * 관세청 "품목별 국가별 수출입실적(GW)"을 97개 류(HS 2단위) 전수로 조회해
 * (국가 × 4단위 품목) 행렬을 만들고, 화면이 쓰는 집계분만 Redis에 굳힌다.
 *
 * 잡을 refreshFeeds에 얹지 않고 분리한 이유: 전수 조회가 실측 ~61초라 매일 도는
 * 뉴스·공시 파이프라인의 시간 예산과 실패 범위를 함께 오염시킨다. 별도 라우트면
 * 300초 예산을 독립으로 쓰고 실패도 격리된다.
 *
 * 저장은 월별 키 SET 덮어쓰기라 멱등 — 재시도·중복 실행에 안전하다.
 */

/**
 * 류(HS 2단위) 01~97 — 98·99류는 실측상 빈 응답이라 제외한다.
 * 01~97 합계는 수출입총괄 월 합계와 0.03% 차이나는데(202606 실측 1021.3억 vs 1021.7억),
 * 두 API가 원래 그만큼 어긋나는 것이라 류를 더 돌아도 메워지지 않는다.
 * 합계·"기타"를 이 데이터 안에서만 계산해 자체 정합을 지키고, 차이는 화면에 밝힌다.
 */
const HS_CHAPTERS: readonly string[] = Array.from({ length: 97 }, (_, i) =>
  String(i + 1).padStart(2, "0")
);

/**
 * 류 전수 조회 동시성 — 4에서 97개 류가 실측 ~61초/13.5MB.
 * 올리면 공공 API에 부담을 주고, 내리면 maxDuration 300초에 근접한다.
 */
const CHAPTER_CONCURRENCY = 4;
/** 품목별 표에 담는 상위 품목 수 (나머지는 "기타" 한 줄로 합산) */
const TOP_ITEMS = 15;
/** 국가별 표에 담는 상위 국가 수 (나머지는 "기타" 한 줄로 합산) */
const TOP_COUNTRIES = 8;
/** 국가 클릭 팝업에 담는 그 나라의 상위 품목 수 — 미니멀 유지 */
const TOP_ITEMS_PER_COUNTRY = 5;
/** 상세 보관 개월 수 — 수출입 탭이 보여주는 13개월과 맞춘다 */
const TRADE_DETAIL_MONTHS = 13;

/** 교역액(수출+수입) 내림차순 — 두 표의 공통 랭킹 기준 */
const byTradeValueDesc = (
  a: { expDlr: number; impDlr: number },
  b: { expDlr: number; impDlr: number }
): number => b.expDlr + b.impDlr - (a.expDlr + a.impDlr);

export interface RefreshTradeDetailReport {
  trigger: string;
  startedAt: string;
  finishedAt: string;
  /** 이번 실행에서 관세청 API를 실제로 호출·갱신했는지 (false=이미 최신) */
  refreshed: boolean;
  /** 대상 확정월 "YYYYMM" */
  yyyymm: string;
  /** 조회에 실패한 류 — 일부 실패해도 나머지로 집계를 만들되 표면화한다 */
  failedChapters: Array<{ hsSgn: string; error: string }>;
  ok: boolean;
  error?: string;
}

/** 동시성 제한 워커 풀 — 큐를 나눠 갖는 방식이라 순서 보장은 필요 없다 */
async function fetchAllChapters(
  yyyymm: string,
  failures: RefreshTradeDetailReport["failedChapters"]
): Promise<NitemTradeRow[]> {
  const queue = [...HS_CHAPTERS];
  const rows: NitemTradeRow[] = [];

  await Promise.all(
    Array.from({ length: CHAPTER_CONCURRENCY }, async () => {
      for (let hsSgn = queue.shift(); hsSgn !== undefined; hsSgn = queue.shift()) {
        try {
          rows.push(...(await fetchNitemTradeChapter(hsSgn, yyyymm)));
        } catch (error) {
          console.error(`[job] tradeDetail chapter failed (${hsSgn}):`, error);
          failures.push({ hsSgn, error: errorMessage(error) });
        }
      }
    })
  );

  return rows;
}

/** (국가 × 4단위 품목) 행 → 국가 무관 품목별 교역액 상위 (순수) */
function aggregateItems(rows: NitemTradeRow[]): TradeDetailItem[] {
  const byHs = new Map<string, TradeDetailItem>();

  for (const row of rows) {
    const cur = byHs.get(row.hsCd);
    if (cur === undefined) {
      byHs.set(row.hsCd, {
        hsCd: row.hsCd,
        name: row.hsName,
        expDlr: row.expDlr,
        impDlr: row.impDlr,
      });
      continue;
    }
    cur.expDlr += row.expDlr;
    cur.impDlr += row.impDlr;
  }

  return [...byHs.values()].sort(byTradeValueDesc);
}

/** (국가 × 4단위 품목) 행 → 국가별 집계 + 국가별 상위 품목 (순수) */
function aggregateCountries(rows: NitemTradeRow[]): TradeDetailCountry[] {
  const byCountry = new Map<
    string,
    { country: TradeDetailCountry; items: Map<string, TradeDetailItem> }
  >();

  for (const row of rows) {
    let entry = byCountry.get(row.countryCode);
    if (entry === undefined) {
      entry = {
        country: {
          code: row.countryCode,
          name: row.countryName,
          expDlr: 0,
          impDlr: 0,
          items: [],
        },
        items: new Map(),
      };
      byCountry.set(row.countryCode, entry);
    }

    entry.country.expDlr += row.expDlr;
    entry.country.impDlr += row.impDlr;

    const item = entry.items.get(row.hsCd);
    if (item === undefined) {
      entry.items.set(row.hsCd, {
        hsCd: row.hsCd,
        name: row.hsName,
        expDlr: row.expDlr,
        impDlr: row.impDlr,
      });
      continue;
    }
    item.expDlr += row.expDlr;
    item.impDlr += row.impDlr;
  }

  return [...byCountry.values()]
    .sort((a, b) => byTradeValueDesc(a.country, b.country))
    .slice(0, TOP_COUNTRIES)
    .map(({ country, items }) => ({
      ...country,
      // 상위 국가만 남긴 뒤에 품목을 자른다 — 버려질 국가의 품목은 정렬하지 않는다
      items: [...items.values()]
        .sort(byTradeValueDesc)
        .slice(0, TOP_ITEMS_PER_COUNTRY),
    }));
}

/**
 * 확정월 상세 갱신 — 이미 그 달을 확보했으면 관세청을 다시 부르지 않는다.
 * 현재 KST 월은 월중 집계라 미완결이므로 직전 달을 기대 최신 확정월로 본다 (§17-4와 동일 규칙).
 */
export async function refreshTradeDetail(
  trigger: string
): Promise<RefreshTradeDetailReport> {
  const startedAt = new Date().toISOString();
  const yyyymm = subtractMonths(currentKstMonth(), 1);
  const base = { trigger, startedAt, yyyymm };

  const stored = await getTradeDetail(yyyymm).catch((error): null => {
    console.error("[job] tradeDetail read failed:", error);
    return null;
  });

  if (stored !== null) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      refreshed: false,
      failedChapters: [],
      ok: true,
    };
  }

  const failedChapters: RefreshTradeDetailReport["failedChapters"] = [];

  try {
    const rows = await fetchAllChapters(yyyymm, failedChapters);

    // 일부 류라도 실패하면 저장하지 않는다 — 빠진 류만큼 집계가 왜곡되는데,
    // 한 번 저장하면 위의 "이미 확보" 가드에 걸려 그 왜곡이 영구히 고착된다.
    // 저장을 건너뛰면 다음 회차가 전 류를 다시 조회한다.
    if (failedChapters.length > 0) {
      return {
        ...base,
        finishedAt: new Date().toISOString(),
        refreshed: false,
        failedChapters,
        ok: false,
        error: `류 ${failedChapters.length}개 조회 실패 — 집계 왜곡 방지로 저장 생략`,
      };
    }

    if (rows.length === 0) {
      // 아직 확정 통계가 공표되지 않음 — 저장 없이 다음 회차 재시도
      return {
        ...base,
        finishedAt: new Date().toISOString(),
        refreshed: false,
        failedChapters,
        ok: false,
        error: "확정월 상세 데이터 없음",
      };
    }

    const items = aggregateItems(rows);

    await setTradeDetail({
      yyyymm,
      // 전 류 합계 — 표의 "기타" 행은 이 값에서 상위 N개를 빼서 구한다
      totalExpDlr: items.reduce((sum, item) => sum + item.expDlr, 0),
      totalImpDlr: items.reduce((sum, item) => sum + item.impDlr, 0),
      items: items.slice(0, TOP_ITEMS),
      countries: aggregateCountries(rows),
      fetchedAt: startedAt,
    });

    // 상세를 확보한 달 목록 갱신 — 수출입 탭이 어느 달에 링크를 걸지 판단하는 근거
    const months = [
      ...new Set([yyyymm, ...(await getTradeDetailMonths())]),
    ]
      .sort()
      .reverse()
      .slice(0, TRADE_DETAIL_MONTHS);
    await setTradeDetailMonths(months);

    return {
      ...base,
      finishedAt: new Date().toISOString(),
      refreshed: true,
      failedChapters,
      ok: true,
    };
  } catch (error) {
    console.error("[job] tradeDetail refresh failed:", error);
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      refreshed: false,
      failedChapters,
      ok: false,
      error: errorMessage(error),
    };
  }
}
