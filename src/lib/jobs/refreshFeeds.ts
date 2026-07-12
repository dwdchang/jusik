import {
  fetchDartCorpCodeMap,
  fetchDartDisclosures,
} from "@/lib/api/dart/client";
import { todayKstDate } from "@/lib/date/kst";
import {
  getCorpCodeMap,
  setCorpCodeMap,
  setDisclosures,
  type DisclosureItem,
} from "@/lib/feeds/store";
import {
  collectHoldings,
  collectWatchlists,
  errorMessage,
  unionSymbolCodes,
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
/** 매핑에 없는 신규 종목 발견 시 보정 갱신 최소 간격 — 미매핑 코드가 매 회차 zip을 받지 않게 제한 */
const CORP_CODE_MAP_RETRY_AGE_MS = 24 * 60 * 60 * 1000;
/** 공시 조회 기간 — 최근 90일 */
const DISCLOSURE_WINDOW_DAYS = 90;
/** 종목당 저장하는 최근 공시 최대 건수 */
const DISCLOSURE_MAX_ITEMS = 10;
/** DART 분당 과다 호출 차단 대비 종목 간 유량 제한 */
const DART_CALL_INTERVAL_MS = 150;

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
  /** 데이터 갱신 성공 여부 — false면 잡 엔드포인트가 500을 반환(QStash 재시도) */
  ok: boolean;
}

/**
 * corpCode 매핑 확보 — 30일 주기 갱신 + 미매핑 신규 종목 발견 시 1일 1회 보정.
 * 갱신 실패 시 기존 캐시가 있으면 그대로 사용하되 ok:false로 표면화한다.
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
  const age =
    stored !== null ? Date.now() - Date.parse(stored.fetchedAt) : Infinity;
  const hasUnknownCodes =
    cached !== null &&
    symbolCodes.some((code) => cached[code] === undefined);

  const shouldRefresh =
    cached === null ||
    age > CORP_CODE_MAP_MAX_AGE_MS ||
    (hasUnknownCodes && age > CORP_CODE_MAP_RETRY_AGE_MS);

  if (shouldRefresh) {
    try {
      const map = await fetchDartCorpCodeMap();
      await setCorpCodeMap({ map, fetchedAt: new Date().toISOString() });
      return {
        map,
        report: { ok: true, refreshed: true, size: Object.keys(map).length },
      };
    } catch (error) {
      console.error("[job] corpCodeMap refresh failed:", error);
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

export async function refreshFeeds(
  trigger: string
): Promise<RefreshFeedsReport> {
  const startedAt = new Date().toISOString();

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
      ok: true,
    };
  }

  // 2. 종목코드→DART 고유번호 매핑 확보 (30일 주기 + 신규 종목 보정)
  const { map, report: corpCodeMap } = await ensureCorpCodeMap(symbolCodes);

  // 3. 종목별 최근 공시 조회 → market:disclosures:{code} (SET 덮어쓰기)
  const disclosures = await refreshDisclosures(symbolCodes, map, startedAt);

  const ok = corpCodeMap.ok && disclosures.every((row) => row.ok);

  return {
    trigger,
    startedAt,
    finishedAt: new Date().toISOString(),
    corpCodeMap,
    watchlists,
    disclosures,
    ok,
  };
}
