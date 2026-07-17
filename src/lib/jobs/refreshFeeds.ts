import { fetchTradeStats } from "@/lib/api/customs/client";
import {
  fetchDartCorpCodeMap,
  fetchDartDisclosures,
} from "@/lib/api/dart/client";
import { fetchNaverNews } from "@/lib/api/naver/client";
import {
  currentKstMonth,
  kstYyyyMmDd,
  subtractMonths,
  todayKstDate,
} from "@/lib/date/kst";
import {
  getCorpCodeMap,
  getTradeStats,
  setCorpCodeMap,
  setDisclosures,
  setNews,
  setTradeStats,
  type DisclosureItem,
  type NewsItem,
  type TradeStatMonth,
} from "@/lib/feeds/store";
import {
  collectHoldings,
  collectWatchlists,
  errorMessage,
  unionSymbolCodes,
  unionSymbolNames,
  type EmailReadResult,
} from "./collectTargets";

/**
 * 뉴스·공시 피드 갱신 잡 파이프라인 — Phase 17 (plan.md §17.2).
 * QStash 스케줄(매일 08~22시 정시 KST)이 호출하며, KIS가 아니므로
 * 호출 시간창 가드를 적용하지 않는다. 17-1은 공시(DART)만 수집하고
 * 뉴스(17-2)·정부자료(17-3)는 같은 파이프라인에 소스별로 증분 추가한다.
 * 모든 저장은 멱등(SET 덮어쓰기)이라 재시도·중복 실행에 안전하다.
 */

/** corpCode 매핑 저빈도 갱신 주기 — 상장·폐지 반영용 (§17.2) */
const CORP_CODE_MAP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * 캐시가 있을 때 corpCode.xml 재다운로드 최소 간격 — 성공·실패 모두에 적용한다.
 * 실패해도 시도 시각을 남겨 이 간격을 소진시키므로, 다운로드가 계속 실패해도
 * 매 회차(시간당)가 아니라 하루 1회만 수 MB zip을 시도한다.
 */
const CORP_CODE_MAP_RETRY_AGE_MS = 24 * 60 * 60 * 1000;
/** 공시 조회 기간 — 최근 90일 */
const DISCLOSURE_WINDOW_DAYS = 90;
/** 종목당 저장하는 최근 공시 최대 건수 */
const DISCLOSURE_MAX_ITEMS = 10;
/** 종목당 저장하는 최근 뉴스 최대 건수 */
const NEWS_MAX_ITEMS = 10;
/** DART 분당 과다 호출 차단 대비 종목 간 유량 제한 */
const DART_CALL_INTERVAL_MS = 150;
/** 네이버 검색 API 종목 간 유량 제한 (일 25,000콜 내 여유) */
const NAVER_CALL_INTERVAL_MS = 150;
/**
 * 관세청 API는 조회 범위를 최대 12개월(inclusive)로 제한한다(초과 시 code 99).
 * 최신월+전년동월(13개월 스팬)은 한 번에 못 받으므로, 최근 12개월(A)과 전년동월(B)을
 * 나눠 조회해 13개월 연속 시리즈로 합친다 (실측 확정 2026-07, §17-4).
 */
const TRADE_STATS_RECENT_SPAN = 11; // end 기준 과거로 11개월 → 12개월 inclusive
/** 보관·표시 개월 수 — 최신 확정월 + 전년동월(YoY)까지 13개월 연속 */
const TRADE_STATS_MONTHS = 13;

const byMonthDesc = (a: { yyyymm: string }, b: { yyyymm: string }): number =>
  a.yyyymm < b.yyyymm ? 1 : a.yyyymm > b.yyyymm ? -1 : 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** KST 기준 n일 전 "YYYYMMDD" — todayKstDate(YYYY-MM-DD)를 UTC 자정으로 파싱해 차감 */
function kstYyyyMmDdDaysAgo(daysAgo: number): string {
  const base = new Date(`${todayKstDate()}T00:00:00Z`);
  return new Date(base.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
}

export interface RefreshFeedsReport {
  trigger: string;
  startedAt: string;
  finishedAt: string;
  /** 종목코드→DART 고유번호 매핑 확보 결과 */
  corpCodeMap: {
    ok: boolean;
    /** 이번 실행에서 corpCode.xml을 새로 내려받았는지 */
    refreshed: boolean;
    size?: number;
    error?: string;
  };
  /** 관심종목 읽기 결과 — 이메일별 실패 격리 (시세 잡과 동일 리포트 형식) */
  watchlists: EmailReadResult[];
  disclosures: Array<{
    symbolCode: string;
    ok: boolean;
    count?: number;
    /** 매핑에 고유번호가 없는 종목(비상장·매핑 미반영) — 실패로 치지 않는다 */
    skipped?: "unlisted";
    error?: string;
  }>;
  news: Array<{
    symbolCode: string;
    ok: boolean;
    count?: number;
    /** 종목명이 아직 안 채워져 검색어를 만들 수 없는 종목 — 실패로 치지 않는다 */
    skipped?: "no_name";
    error?: string;
  }>;
  /** 수출입 월간 통계 갱신 결과 — 월 1회성 (§17-4) */
  tradeStats: {
    ok: boolean;
    /** 이번 실행에서 관세청 API를 실제로 호출·갱신했는지 (false=이미 최신) */
    refreshed: boolean;
    /** 저장된 최신 확정월 "YYYYMM" */
    latest?: string;
    error?: string;
  };
  /** 데이터 갱신 성공 여부 — false면 잡 엔드포인트가 500을 반환(QStash 재시도) */
  ok: boolean;
}

/**
 * corpCode 매핑 확보 — 30일 주기 갱신 + 미매핑 신규 종목 발견 시 보정 갱신.
 * 캐시가 있으면 성공·실패 무관하게 재다운로드를 1일 1회로 제한하고, 매핑이 없다고
 * 확인된 코드(우선주 등)는 네거티브 캐시로 걸러 보정 갱신이 매 회차 반복되지 않게 한다.
 * 갱신 실패 시 기존 캐시로 계속 진행하되 ok:false로 표면화한다.
 */
async function ensureCorpCodeMap(symbolCodes: string[]): Promise<{
  map: Record<string, string>;
  report: RefreshFeedsReport["corpCodeMap"];
}> {
  const stored = await getCorpCodeMap().catch((error): null => {
    console.error("[job] corpCodeMap read failed:", error);
    return null;
  });

  const cached = stored?.map ?? null;
  const dataAge =
    stored !== null ? Date.now() - Date.parse(stored.fetchedAt) : Infinity;
  // attemptedAt 도입 전 값은 fetchedAt이 곧 마지막 시도 시각이었다
  const attemptAge =
    stored !== null
      ? Date.now() - Date.parse(stored.attemptedAt ?? stored.fetchedAt)
      : Infinity;

  const knownUnmappable = new Set(stored?.unmappable ?? []);
  const hasUnknownCodes =
    cached !== null &&
    symbolCodes.some(
      (code) => cached[code] === undefined && !knownUnmappable.has(code)
    );

  const shouldRefresh =
    cached === null ||
    ((dataAge > CORP_CODE_MAP_MAX_AGE_MS || hasUnknownCodes) &&
      attemptAge > CORP_CODE_MAP_RETRY_AGE_MS);

  if (shouldRefresh) {
    const attemptedAt = new Date().toISOString();
    try {
      const map = await fetchDartCorpCodeMap();
      // 이번 map에 없는 관심종목은 매핑이 없다고 확정된 것 — 기존 등재분도 함께
      // 재검증해 매핑이 생긴 코드는 자연히 빠진다.
      const unmappable = [
        ...new Set([...knownUnmappable, ...symbolCodes]),
      ].filter((code) => map[code] === undefined);
      await setCorpCodeMap({
        map,
        fetchedAt: attemptedAt,
        attemptedAt,
        unmappable,
      });
      return {
        map,
        report: { ok: true, refreshed: true, size: Object.keys(map).length },
      };
    } catch (error) {
      console.error("[job] corpCodeMap refresh failed:", error);
      // 실패해도 시도 시각은 남겨 재시도 간격을 소진시킨다 — 안 그러면 매 회차 재시도한다.
      // 캐시가 아예 없으면 남길 map이 없으므로 기록하지 않고 다음 회차에 다시 시도한다.
      if (stored !== null) {
        await setCorpCodeMap({ ...stored, attemptedAt }).catch(
          (writeError: unknown) => {
            console.error("[job] corpCodeMap attempt stamp failed:", writeError);
          }
        );
      }
      // 기존 캐시로 계속 진행하되 실패를 report에 남긴다 (ok:false → 500 → QStash 재시도)
      return {
        map: cached ?? {},
        report: { ok: false, refreshed: false, error: errorMessage(error) },
      };
    }
  }

  const map = cached ?? {};
  return {
    map,
    report: { ok: true, refreshed: false, size: Object.keys(map).length },
  };
}

/** 종목별 순차 공시 조회 → market:disclosures:{code} 저장 (종목별 실패 격리) */
async function refreshDisclosures(
  symbolCodes: string[],
  corpCodeMap: Record<string, string>,
  fetchedAt: string
): Promise<RefreshFeedsReport["disclosures"]> {
  const results: RefreshFeedsReport["disclosures"] = [];
  const bgnDe = kstYyyyMmDdDaysAgo(DISCLOSURE_WINDOW_DAYS);
  const endDe = kstYyyyMmDdDaysAgo(0);

  for (const symbolCode of symbolCodes) {
    const corpCode = corpCodeMap[symbolCode];

    if (corpCode === undefined) {
      results.push({ symbolCode, ok: true, skipped: "unlisted" });
      continue;
    }

    try {
      const rows = await fetchDartDisclosures(corpCode, {
        bgnDe,
        endDe,
        pageCount: DISCLOSURE_MAX_ITEMS,
      });

      const items: DisclosureItem[] = rows.map((row) => ({
        reportNm: row.report_nm?.trim() ?? "",
        rceptNo: row.rcept_no ?? "",
        rceptDt: row.rcept_dt ?? "",
        flrNm: row.flr_nm ?? "",
        rm: row.rm?.trim() ?? "",
      }));

      await setDisclosures({ symbolCode, items, fetchedAt });
      results.push({ symbolCode, ok: true, count: items.length });
    } catch (error) {
      console.error(`[job] disclosures refresh failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }

    await sleep(DART_CALL_INTERVAL_MS);
  }

  return results;
}

/**
 * 종목별 순차 뉴스 조회(종목명 키워드) → market:news:{code} 저장 (종목별 실패 격리).
 * 종목명이 비어 있으면(잡이 아직 안 채운 신규 등록) 검색어를 만들 수 없어 건너뛴다.
 */
async function refreshNews(
  codeNames: Map<string, string>,
  fetchedAt: string
): Promise<RefreshFeedsReport["news"]> {
  const results: RefreshFeedsReport["news"] = [];

  for (const [symbolCode, name] of codeNames) {
    if (name === "") {
      results.push({ symbolCode, ok: true, skipped: "no_name" });
      continue;
    }

    try {
      const articles = await fetchNaverNews(name, NEWS_MAX_ITEMS);
      const items: NewsItem[] = articles.map((article) => ({
        title: article.title,
        link: article.link,
        pubDateMs: article.pubDateMs,
        pubDateKst: kstYyyyMmDd(article.pubDateMs),
      }));

      await setNews({ symbolCode, items, fetchedAt });
      results.push({ symbolCode, ok: true, count: items.length });
    } catch (error) {
      console.error(`[job] news refresh failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }

    await sleep(NAVER_CALL_INTERVAL_MS);
  }

  return results;
}

/**
 * 수출입 월간 통계 갱신 — 월 1회성 (§17-4). 관세청 API 실측 확정 규칙 반영:
 * 현재 KST 월은 월중 집계라 미완결 → "직전 달"을 기대 최신 확정월로 본다.
 * 이미 그 달(이상)을 확보했으면 KIS 외 월간 소스를 다시 부르지 않는다.
 * 실패는 report에만 남기고 throw하지 않으며, 잡 전체 ok도 게이팅하지 않는다
 * — 다음 회차에 가드(haveLatest < expectedLatest)가 자연히 재시도한다.
 */
async function refreshTradeStats(
  fetchedAt: string
): Promise<RefreshFeedsReport["tradeStats"]> {
  const thisMonth = currentKstMonth();
  const expectedLatest = subtractMonths(thisMonth, 1);

  const stored = await getTradeStats().catch((error): null => {
    console.error("[job] tradeStats read failed:", error);
    return null;
  });

  const haveLatest = stored?.months[0]?.yyyymm ?? "";
  if (haveLatest >= expectedLatest && haveLatest !== "") {
    return { ok: true, refreshed: false, latest: haveLatest };
  }

  try {
    // A) 최근 12개월(전월까지) — end를 확정월로 잡아 부분월(현재 월)이 섞이지 않게 한다
    const recent = (
      await fetchTradeStats(
        subtractMonths(expectedLatest, TRADE_STATS_RECENT_SPAN),
        expectedLatest
      )
    ).filter((row) => row.yyyymm < thisMonth); // 방어적 부분월 제외

    if (recent.length === 0) {
      // 아직 직전 완결월이 공표되지 않았을 수 있음 — 저장 없이 다음 회차 재시도
      return { ok: false, refreshed: false, error: "확정월 데이터 없음" };
    }

    const latest = [...recent].sort(byMonthDesc)[0].yyyymm;

    // B) 전년동월 1개월 — YoY 기준(최신월-12). 12개월 한도상 A와 한 번에 못 받는다.
    //    YoY는 부가 정보라 실패해도 스텝 전체를 실패로 보지 않는다.
    let yoyBase: TradeStatMonth[] = [];
    try {
      const yoyMonth = subtractMonths(latest, 12);
      yoyBase = await fetchTradeStats(yoyMonth, yoyMonth);
    } catch (error) {
      console.error("[job] tradeStats YoY base fetch failed:", error);
    }

    // A+B 합쳐 월별 중복 제거 → 최신순 13개월 (전년동월~최신월 연속)
    const byMonth = new Map<string, TradeStatMonth>();
    for (const row of [...recent, ...yoyBase]) {
      byMonth.set(row.yyyymm, {
        yyyymm: row.yyyymm,
        expDlr: row.expDlr,
        impDlr: row.impDlr,
        balPayments: row.balPayments,
      });
    }
    const months = [...byMonth.values()]
      .sort(byMonthDesc)
      .slice(0, TRADE_STATS_MONTHS);

    await setTradeStats({ months, fetchedAt });
    return { ok: true, refreshed: true, latest: months[0].yyyymm };
  } catch (error) {
    console.error("[job] tradeStats refresh failed:", error);
    return { ok: false, refreshed: false, error: errorMessage(error) };
  }
}

export async function refreshFeeds(
  trigger: string
): Promise<RefreshFeedsReport> {
  const startedAt = new Date().toISOString();

  // 0. 수출입 월간 통계 — 종목 무관 시장 지표라 보유/관심종목 유무와 무관하게 갱신
  const tradeStats = await refreshTradeStats(startedAt);

  // 1. 수집 대상 종목 = 전체 허용 이메일의 보유+관심종목 union (시세 잡과 동일 로직 공유)
  const [holdingsByEmail, { byEmail: watchlistsByEmail, results: watchlists }] =
    await Promise.all([collectHoldings(), collectWatchlists()]);
  const symbolCodes = unionSymbolCodes(holdingsByEmail, watchlistsByEmail);

  // 수집 대상이 없으면 corpCode.xml(수 MB) 다운로드 없이 종료 (멱등·부하 회피)
  if (symbolCodes.length === 0) {
    return {
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      corpCodeMap: { ok: true, refreshed: false },
      watchlists,
      disclosures: [],
      news: [],
      tradeStats,
      ok: true,
    };
  }

  // 2. 종목코드→DART 고유번호 매핑 확보 (30일 주기 + 신규 종목 보정)
  const { map, report: corpCodeMap } = await ensureCorpCodeMap(symbolCodes);

  // 3. 종목별 최근 공시 조회 → market:disclosures:{code} (SET 덮어쓰기)
  const disclosures = await refreshDisclosures(symbolCodes, map, startedAt);

  // 4. 종목별 최근 뉴스 조회(종목명 키워드) → market:news:{code} (SET 덮어쓰기)
  const codeNames = unionSymbolNames(holdingsByEmail, watchlistsByEmail);
  const news = await refreshNews(codeNames, startedAt);

  // tradeStats는 ok 게이팅에서 제외 — 월간 소스 실패로 뉴스·공시 파이프라인을
  // 반복 재실행시키지 않고, 가드가 다음 회차에 자연히 재시도한다 (§17-4).
  const ok =
    corpCodeMap.ok &&
    disclosures.every((row) => row.ok) &&
    news.every((row) => row.ok);

  return {
    trigger,
    startedAt,
    finishedAt: new Date().toISOString(),
    corpCodeMap,
    watchlists,
    disclosures,
    news,
    tradeStats,
    ok,
  };
}
