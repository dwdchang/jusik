import {
  evaluateDividendAlerts,
  type DividendAlertsReport,
} from "@/lib/alerts/dividendAlerts";
import {
  evaluateFeedAlerts,
  type FeedAlertsReport,
} from "@/lib/alerts/feedAlerts";
import { fetchTradeStats } from "@/lib/api/customs/client";
import {
  DART_PBLNTF_EXCHANGE,
  DART_PBLNTF_PERIODIC,
  fetchDartCorpCodeMap,
  fetchDartDisclosures,
  fetchDartDividendDetail,
  fetchDartEarningsDetail,
  fetchDartIrDetail,
  isDividendDecisionReport,
} from "@/lib/api/dart/client";
import { fetchNaverNews } from "@/lib/api/naver/client";
import {
  currentKstMonth,
  kstYyyyMmDd,
  subtractMonths,
  todayKstDate,
} from "@/lib/date/kst";
import {
  EARNINGS_PARSER_VERSION,
  hasEarningsFigures,
  hasIrSchedule,
  isEarningsNewsTarget,
  matchEarningsCategories,
  needsEarningsDocument,
} from "@/lib/feeds/earnings";
import {
  EARNINGS_NEWS_WINDOW_DAYS,
  daysBetweenYyyyMmDd,
  earningsNewsQuery,
  rankEarningsArticles,
} from "@/lib/feeds/earningsNews";
import {
  getCorpCodeMap,
  getDividendDecisionSnapshots,
  getEarningsNews,
  getEarningsSnapshots,
  getTradeStats,
  setCorpCodeMap,
  setDisclosures,
  setDividendDecisions,
  setEarnings,
  setEarningsNews,
  setNews,
  setTradeStats,
  type DisclosureItem,
  type DividendDecisionItem,
  type EarningsItem,
  type EarningsNewsItem,
  type StoredDividendDecisions,
  type StoredEarnings,
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
/** 실적 공시 조회 기간 — 분기 발표 주기를 한 번은 포함하도록 공시와 같은 90일 */
const EARNINGS_WINDOW_DAYS = 90;
/** 종목당 저장하는 최근 실적 공시 최대 건수 */
const EARNINGS_MAX_ITEMS = 10;
/**
 * 유형별 조회 요청 건수 — `pblntf_ty`로 좁히면 대형주도 90일 15건 수준이라
 * (삼성전자 실측: 무필터 818건 → 거래소공시 15건) 30건이면 전부 들어온다.
 */
const EARNINGS_PAGE_COUNT = 30;
/**
 * 한 회차에 새로 받는 실적 공시 원문(zip) 최대 건수 — 첫 회차에 전 종목 원문을
 * 한꺼번에 받지 않게 막는 상한. 남은 건은 다음 회차가 이어받는다(파싱 결과는 굳혀 재사용).
 *
 * Phase 82에서 파싱 대상이 잠정실적 + IR로 늘었다(실측 13종목 90일: 잠정 15건 + IR 24건).
 * 파서 버전이 올라 기존 저장분도 한 번씩 다시 받으므로 상한을 30으로 키운다 —
 * 회차당 최대 30콜(간격 150ms)이라 잡 시간에 4.5초를 더할 뿐이다.
 */
const EARNINGS_DOC_BUDGET = 30;
/** 종목당 저장하는 최근 배당결정 공시 건수 — 분기배당사도 90일에 1~2건이라 넉넉하다 */
const DIVIDEND_DECISION_MAX_ITEMS = 6;
/**
 * 한 회차에 새로 받는 배당결정 공시 원문(zip) 최대 건수 (Phase 83).
 * 실적 원문 예산과 분리해 둔다 — 실적 시즌에 예산을 다 쓰면 배당이 계속 밀린다.
 * 종목당 90일에 0~2건이고 파싱 결과를 굳혀 재사용하므로 정상 회차엔 0~1건만 쓴다.
 */
const DIVIDEND_DOC_BUDGET = 8;
/**
 * 배당결정 공시 파서 버전 — 올리면 저장분이 다음 회차부터 다시 파싱된다
 * (실적 공시 `EARNINGS_PARSER_VERSION`과 같은 장치).
 */
const DIVIDEND_PARSER_VERSION = 1;
/**
 * 실적 보도 검색에서 API로부터 받아오는 원본 건수 (Phase 84) — 점수 필터로 걸러낼
 * 여유분을 두고 넉넉히 받는다. 실제 저장은 `EARNINGS_NEWS_MAX_ITEMS`(5)건.
 */
const NAVER_FETCH_MAX = 20;
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
  /** 실적 공시 갱신 결과 (Phase 81) — 종목별 실패 격리 */
  earnings: Array<{
    symbolCode: string;
    ok: boolean;
    count?: number;
    /** 이번 회차에 원문을 새로 파싱한 건수 */
    parsed?: number;
    skipped?: "unlisted";
    error?: string;
  }>;
  /**
   * 실적 보도 갱신 결과 (Phase 84) — **실적 발표 직후 종목만** 나온다.
   * 발표가 없는 회차에는 빈 배열이고, 그게 정상이다(네이버 콜 0).
   */
  earningsNews: Array<{
    symbolCode: string;
    ok: boolean;
    count?: number;
    /** 같은 공시로 이미 모아 둔 스냅샷이 있어 재검색하지 않음 */
    skipped?: "already_collected";
    error?: string;
  }>;
  /**
   * 배당결정 공시 갱신 결과 (Phase 83) — 실적과 **같은 거래소공시 목록**에서 뽑으므로
   * 목록 조회는 추가되지 않고, 원문(zip)만 새 건에 한해 받는다.
   */
  dividendDecisions: Array<{
    symbolCode: string;
    ok: boolean;
    count?: number;
    /** 이번 회차에 원문을 새로 파싱한 건수 */
    parsed?: number;
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
  /** 공시·시장경보 알림 훅 결과 — 실패해도 잡 ok는 게이팅하지 않는다 (§10.6 3단계) */
  alerts: { evaluated: boolean; reason?: string; summary?: FeedAlertsReport };
  /** 배당 지급일 당일 알림 훅 결과 — 실패해도 잡 ok는 게이팅하지 않는다 (Phase 25) */
  dividendAlerts: {
    evaluated: boolean;
    reason?: string;
    summary?: DividendAlertsReport;
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

/**
 * 종목별 순차 공시 조회 → market:disclosures:{code} 저장 (종목별 실패 격리).
 * 방금 받아온 공시는 알림 훅이 Redis 재조회 없이 쓰도록 itemsBySymbol로도 돌려준다.
 */
async function refreshDisclosures(
  symbolCodes: string[],
  corpCodeMap: Record<string, string>,
  fetchedAt: string
): Promise<{
  results: RefreshFeedsReport["disclosures"];
  itemsBySymbol: Map<string, DisclosureItem[]>;
}> {
  const results: RefreshFeedsReport["disclosures"] = [];
  const itemsBySymbol = new Map<string, DisclosureItem[]>();
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
      itemsBySymbol.set(symbolCode, items);
      results.push({ symbolCode, ok: true, count: items.length });
    } catch (error) {
      console.error(`[job] disclosures refresh failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }

    await sleep(DART_CALL_INTERVAL_MS);
  }

  return { results, itemsBySymbol };
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
 * 종목별 실적 공시 조회 → market:earnings:{code} 저장 (Phase 81, 종목별 실패 격리).
 *
 * 기존 공시 수집(유형 무필터 상위 10건)은 대형주에서 실적 공시가 컷에 밀리므로
 * `pblntf_ty`를 좁힌 조회를 따로 돌린다 — 거래소공시(I, 잠정실적·IR)와
 * 정기공시(A, 분기·반기·사업보고서) 2회. 잠정실적은 수치표를, IR 개최는 일정을(Phase 82)
 * 원문(zip)에서 파싱해 굳히되, **직전 회차에 같은 파서 버전으로 파싱한 접수번호는 결과를
 * 그대로 물려받아** 원문을 다시 받지 않는다(회차당 신규 파싱은 EARNINGS_DOC_BUDGET건 제한).
 *
 * Phase 83 — **배당결정 공시도 같은 목록에서 함께 뽑는다.** 「현금ㆍ현물배당결정」은
 * 실적 공시와 같은 거래소공시(`pblntf_ty=I`)라 이미 받아 둔 `rows`에 들어 있어(실측
 * 2026-07-30 삼성전자) 목록 조회가 늘지 않는다. 저장은 성격이 달라 별도 키로 나눈다.
 */
async function refreshEarnings(
  symbolCodes: string[],
  corpCodeMap: Record<string, string>,
  fetchedAt: string
): Promise<{
  results: RefreshFeedsReport["earnings"];
  dividendResults: RefreshFeedsReport["dividendDecisions"];
  itemsBySymbol: Map<string, EarningsItem[]>;
}> {
  const results: RefreshFeedsReport["earnings"] = [];
  const dividendResults: RefreshFeedsReport["dividendDecisions"] = [];
  const itemsBySymbol = new Map<string, EarningsItem[]>();
  const bgnDe = kstYyyyMmDdDaysAgo(EARNINGS_WINDOW_DAYS);
  const endDe = kstYyyyMmDdDaysAgo(0);

  // 직전 회차 스냅샷 — 접수번호별 파싱 결과 재사용 기준 (MGET 1회씩)
  const previous = await getEarningsSnapshots(symbolCodes).catch(
    (error: unknown) => {
      // 읽기 실패는 "직전 결과 없음"으로 격리 — 파싱만 다시 할 뿐 수집은 계속된다
      console.error("[job] earnings snapshot read failed:", error);
      return new Map<string, StoredEarnings>();
    }
  );
  const previousDividends = await getDividendDecisionSnapshots(
    symbolCodes
  ).catch((error: unknown) => {
    console.error("[job] dividend decision snapshot read failed:", error);
    return new Map<string, StoredDividendDecisions>();
  });

  let docBudget = EARNINGS_DOC_BUDGET;
  let dividendDocBudget = DIVIDEND_DOC_BUDGET;

  for (const symbolCode of symbolCodes) {
    const corpCode = corpCodeMap[symbolCode];

    if (corpCode === undefined) {
      results.push({ symbolCode, ok: true, skipped: "unlisted" });
      continue;
    }

    try {
      const rows: Awaited<ReturnType<typeof fetchDartDisclosures>> = [];
      for (const pblntfTy of [DART_PBLNTF_EXCHANGE, DART_PBLNTF_PERIODIC]) {
        rows.push(
          ...(await fetchDartDisclosures(corpCode, {
            bgnDe,
            endDe,
            pageCount: EARNINGS_PAGE_COUNT,
            pblntfTy,
          }))
        );
        await sleep(DART_CALL_INTERVAL_MS);
      }

      // 실적 유형만 남기고 접수번호로 중복 제거 → 최신순 상위 N건
      const byRceptNo = new Map<string, EarningsItem>();
      for (const row of rows) {
        const reportNm = row.report_nm?.trim() ?? "";
        const rceptNo = row.rcept_no ?? "";
        const categories = matchEarningsCategories(reportNm);

        if (rceptNo === "" || categories.length === 0) {
          continue;
        }
        byRceptNo.set(rceptNo, {
          reportNm,
          rceptNo,
          rceptDt: row.rcept_dt ?? "",
          flrNm: row.flr_nm ?? "",
          rm: row.rm?.trim() ?? "",
          categories,
        });
      }

      const items = [...byRceptNo.values()]
        // 접수번호는 "YYYYMMDD+일련" 14자리 고정이라 문자열 비교가 곧 시간순이다
        .sort((a, b) => (a.rceptNo < b.rceptNo ? 1 : a.rceptNo > b.rceptNo ? -1 : 0))
        .slice(0, EARNINGS_MAX_ITEMS);

      const carried = new Map(
        (previous.get(symbolCode)?.items ?? []).map((item) => [
          item.rceptNo,
          item,
        ])
      );

      let parsed = 0;
      for (const item of items) {
        const before = carried.get(item.rceptNo);
        // 같은 파서 버전으로 이미 뜯어본 건은 결과만 물려받는다.
        // 버전이 낮으면(=옛 파서) 새 필드를 채우러 아래에서 다시 파싱한다.
        if (before?.parsedV === EARNINGS_PARSER_VERSION) {
          item.parsedV = before.parsedV;
          item.figures = before.figures;
          item.period = before.period;
          item.unit = before.unit;
          item.ir = before.ir;
          item.briefing = before.briefing;
          item.correctionReason = before.correctionReason;
          item.irUrl = before.irUrl;
          continue;
        }
        if (!needsEarningsDocument(item.categories) || docBudget <= 0) {
          continue;
        }

        docBudget -= 1;
        try {
          if (hasEarningsFigures(item.categories)) {
            const detail = await fetchDartEarningsDetail(item.rceptNo);
            item.period = detail.period;
            item.unit = detail.unit;
            if (detail.figures.length > 0) {
              item.figures = detail.figures;
            }
            // 발표 안내 3종 (Phase 84) — 같은 원문에서 나오므로 추가 호출이 없다.
            // 값이 "-"인 회사가 다수라 있는 것만 담는다(빈 필드를 굳히지 않는다).
            if (detail.briefing !== null) {
              item.briefing = detail.briefing;
            }
            if (detail.correctionReason !== null) {
              item.correctionReason = detail.correctionReason;
            }
            if (detail.irUrl !== null) {
              item.irUrl = detail.irUrl;
            }
          } else if (hasIrSchedule(item.categories)) {
            const ir = await fetchDartIrDetail(item.rceptNo);
            if (ir !== null) {
              item.ir = ir;
            }
          }
          item.parsedV = EARNINGS_PARSER_VERSION;
          parsed += 1;
        } catch (error) {
          // 원문 조회·파싱 실패는 제목·링크만 있는 항목으로 남긴다 (버전 미표기 → 다음 회차 재시도)
          console.error(
            `[job] earnings document parse failed (${item.rceptNo}):`,
            error
          );
        }
        await sleep(DART_CALL_INTERVAL_MS);
      }

      await setEarnings({ symbolCode, items, fetchedAt });
      itemsBySymbol.set(symbolCode, items);
      results.push({ symbolCode, ok: true, count: items.length, parsed });

      // 배당결정 공시 — 같은 rows에서 추린다. 실패해도 실적 수집은 이미 끝나 있다.
      try {
        const decisions = await collectDividendDecisions(
          rows,
          previousDividends.get(symbolCode)?.items ?? [],
          () => {
            if (dividendDocBudget <= 0) {
              return false;
            }
            dividendDocBudget -= 1;
            return true;
          }
        );
        await setDividendDecisions({
          symbolCode,
          items: decisions.items,
          fetchedAt,
        });
        dividendResults.push({
          symbolCode,
          ok: true,
          count: decisions.items.length,
          parsed: decisions.parsed,
        });
      } catch (error) {
        console.error(
          `[job] dividend decision refresh failed (${symbolCode}):`,
          error
        );
        dividendResults.push({
          symbolCode,
          ok: false,
          error: errorMessage(error),
        });
      }
    } catch (error) {
      console.error(`[job] earnings refresh failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }
  }

  return { results, dividendResults, itemsBySymbol };
}

/**
 * 실적 발표 직후 종목만 「실적 관련 보도」 수집 → market:earningsNews:{code} (Phase 84).
 *
 * **평상시 네이버 콜은 0이다.** 전 종목을 매 회차 부르지 않고, 방금 수집한 실적 공시 중
 * **최근 EARNINGS_NEWS_WINDOW_DAYS일 안에 접수된 수치 공시**(잠정실적·정기보고서·실적변동)가
 * 있는 종목만 부른다 — 실적 보도는 발표 시점에만 쏟아지고, 그 밖의 날에 종목명을 검색해
 * 봐야 뉴스 탭과 같은 결과가 나올 뿐이다.
 *
 * 같은 공시로 이미 모아 둔 스냅샷이 있으면 건너뛴다(`basisRceptNo` 대조) — 발표 후 7일
 * 동안 회차마다(하루 15번) 같은 검색을 반복하지 않기 위한 것이고, 그래서 발표 종목당
 * 네이버 콜은 **분기에 1번**이 된다.
 */
async function refreshEarningsNews(
  earningsBySymbol: Map<string, EarningsItem[]>,
  codeNames: Map<string, string>,
  fetchedAt: string
): Promise<RefreshFeedsReport["earningsNews"]> {
  const results: RefreshFeedsReport["earningsNews"] = [];
  const today = kstYyyyMmDdDaysAgo(0);

  for (const [symbolCode, items] of earningsBySymbol) {
    const name = codeNames.get(symbolCode) ?? "";
    if (name === "") {
      continue; // 종목명이 없으면 검색어를 만들 수 없다 (뉴스 탭과 같은 방침)
    }

    // 가장 최근의 "수치가 공개된" 실적 공시 — items는 접수번호 내림차순이라 첫 매치가 최신
    const basis = items.find((item) => isEarningsNewsTarget(item.categories));
    if (basis === undefined) {
      continue;
    }
    const age = daysBetweenYyyyMmDd(basis.rceptDt, today);
    if (age === null || age > EARNINGS_NEWS_WINDOW_DAYS || age < 0) {
      continue;
    }

    try {
      const stored = await getEarningsNews(symbolCode);
      if (stored?.basisRceptNo === basis.rceptNo) {
        results.push({ symbolCode, ok: true, skipped: "already_collected" });
        continue;
      }

      const articles = await fetchNaverNews(
        earningsNewsQuery(name),
        NAVER_FETCH_MAX,
        { sort: "sim", match: name }
      );
      const newsItems: EarningsNewsItem[] = rankEarningsArticles(
        articles,
        name
      ).map((article) => ({
        title: article.title,
        link: article.link,
        summary: article.summary,
        pubDateMs: article.pubDateMs,
        pubDateKst: kstYyyyMmDd(article.pubDateMs),
      }));

      await setEarningsNews({
        symbolCode,
        items: newsItems,
        basisRceptNo: basis.rceptNo,
        basisRceptDt: basis.rceptDt,
        fetchedAt,
      });
      results.push({ symbolCode, ok: true, count: newsItems.length });
    } catch (error) {
      console.error(`[job] earnings news refresh failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }

    await sleep(NAVER_CALL_INTERVAL_MS);
  }

  return results;
}

/**
 * 거래소공시 목록에서 배당결정 공시만 추려 원문을 파싱한다 (Phase 83).
 * 실적과 같은 규칙 — 접수번호 단위로 직전 결과를 물려받고, 새 건만 `takeBudget()`이
 * 허락하는 만큼 원문을 받는다. 예산이 없으면 제목·접수번호만 남기고 다음 회차로 넘긴다.
 */
async function collectDividendDecisions(
  rows: Awaited<ReturnType<typeof fetchDartDisclosures>>,
  previousItems: DividendDecisionItem[],
  takeBudget: () => boolean
): Promise<{ items: DividendDecisionItem[]; parsed: number }> {
  const byRceptNo = new Map<string, DividendDecisionItem>();
  for (const row of rows) {
    const reportNm = row.report_nm?.trim() ?? "";
    const rceptNo = row.rcept_no ?? "";
    if (rceptNo === "" || !isDividendDecisionReport(reportNm)) {
      continue;
    }
    byRceptNo.set(rceptNo, {
      rceptNo,
      rceptDt: row.rcept_dt ?? "",
      kind: null,
      perShare: null,
      recordDate: null,
      payDate: null,
    });
  }

  const items = [...byRceptNo.values()]
    .sort((a, b) => (a.rceptNo < b.rceptNo ? 1 : a.rceptNo > b.rceptNo ? -1 : 0))
    .slice(0, DIVIDEND_DECISION_MAX_ITEMS);

  const carried = new Map(previousItems.map((item) => [item.rceptNo, item]));

  let parsed = 0;
  for (const item of items) {
    const before = carried.get(item.rceptNo);
    if (before?.parsedV === DIVIDEND_PARSER_VERSION) {
      item.parsedV = before.parsedV;
      item.kind = before.kind;
      item.perShare = before.perShare;
      item.recordDate = before.recordDate;
      item.payDate = before.payDate;
      continue;
    }
    if (!takeBudget()) {
      continue;
    }

    try {
      const detail = await fetchDartDividendDetail(item.rceptNo);
      item.kind = detail.kind;
      item.perShare = detail.perShare;
      item.recordDate = detail.recordDate;
      item.payDate = detail.payDate;
      item.parsedV = DIVIDEND_PARSER_VERSION;
      parsed += 1;
    } catch (error) {
      // 버전을 안 남겨 다음 회차가 다시 시도한다 (실적 원문 파싱과 같은 방침)
      console.error(
        `[job] dividend decision parse failed (${item.rceptNo}):`,
        error
      );
    }
    await sleep(DART_CALL_INTERVAL_MS);
  }

  return { items, parsed };
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
      earnings: [],
      earningsNews: [],
      dividendDecisions: [],
      tradeStats,
      alerts: { evaluated: false, reason: "no target symbols" },
      dividendAlerts: { evaluated: false, reason: "no target symbols" },
      ok: true,
    };
  }

  // 2. 종목코드→DART 고유번호 매핑 확보 (30일 주기 + 신규 종목 보정)
  const { map, report: corpCodeMap } = await ensureCorpCodeMap(symbolCodes);

  // 3. 종목별 최근 공시 조회 → market:disclosures:{code} (SET 덮어쓰기)
  const { results: disclosures, itemsBySymbol } = await refreshDisclosures(
    symbolCodes,
    map,
    startedAt
  );

  // 4. 종목별 최근 뉴스 조회(종목명 키워드) → market:news:{code} (SET 덮어쓰기)
  const codeNames = unionSymbolNames(holdingsByEmail, watchlistsByEmail);
  const news = await refreshNews(codeNames, startedAt);

  // 5. 종목별 실적 공시 조회(유형 한정 2회 + 잠정실적 원문) → market:earnings:{code}
  //    같은 거래소공시 목록에서 배당결정 공시도 함께 추린다 → market:dividendDecision:{code}
  const {
    results: earnings,
    dividendResults: dividendDecisions,
    itemsBySymbol: earningsBySymbol,
  } = await refreshEarnings(symbolCodes, map, startedAt);

  // 6. 실적 발표 직후 종목만 실적 보도 수집 → market:earningsNews:{code} (Phase 84)
  //    발표가 없으면 네이버를 아예 부르지 않는다. 실패해도 로그만 남긴다.
  const earningsNews = await refreshEarningsNews(
    earningsBySymbol,
    codeNames,
    startedAt
  ).catch((error: unknown) => {
    console.error("[job] earnings news step failed:", error);
    return [] as RefreshFeedsReport["earningsNews"];
  });

  // 7. 공시·시장경보·실적 알림 훅 — 실패해도 로그만 남기고 잡 ok는 게이팅하지 않는다
  let alerts: RefreshFeedsReport["alerts"];
  try {
    const summary = await evaluateFeedAlerts({
      disclosuresBySymbol: itemsBySymbol,
      earningsBySymbol,
      holdingsByEmail,
      watchlistsByEmail,
      names: codeNames,
    });
    alerts = { evaluated: true, summary };
  } catch (error) {
    console.error("[job] feed alert evaluation failed:", error);
    alerts = { evaluated: false, reason: errorMessage(error) };
  }

  // 8. 배당 지급일 당일 알림 훅 — 보유 사용자만 대상 (Phase 25), 실패해도 로그만
  let dividendAlerts: RefreshFeedsReport["dividendAlerts"];
  try {
    const summary = await evaluateDividendAlerts({
      holdingsByEmail,
      names: codeNames,
    });
    dividendAlerts = { evaluated: true, summary };
  } catch (error) {
    console.error("[job] dividend alert evaluation failed:", error);
    dividendAlerts = { evaluated: false, reason: errorMessage(error) };
  }

  // tradeStats는 ok 게이팅에서 제외 — 월간 소스 실패로 뉴스·공시 파이프라인을
  // 반복 재실행시키지 않고, 가드가 다음 회차에 자연히 재시도한다 (§17-4).
  // dividendDecisions도 같은 이유로 제외한다 — 예탁원 회차를 보완하는 부가 소스라
  // 실패해도 「내 배당」은 예탁원 값으로 돌아가고, 다음 회차가 원문을 다시 받는다.
  // earningsNews(Phase 84)도 마찬가지 — 실적 수치는 이미 earnings에 들어와 있고
  // 보도는 곁들이는 자료라, 네이버 장애로 공시 파이프라인을 재실행시키지 않는다.
  const ok =
    corpCodeMap.ok &&
    disclosures.every((row) => row.ok) &&
    news.every((row) => row.ok) &&
    earnings.every((row) => row.ok);

  return {
    trigger,
    startedAt,
    finishedAt: new Date().toISOString(),
    corpCodeMap,
    watchlists,
    disclosures,
    news,
    earnings,
    earningsNews,
    dividendDecisions,
    tradeStats,
    alerts,
    dividendAlerts,
    ok,
  };
}
