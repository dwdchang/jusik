import {
  getDividendRanking,
  type DividendRankingEntry,
} from "./store";

/**
 * 배당률 순위 리더 — Phase 43 (plan.md §43).
 * 갱신 잡이 저장한 `market:dividendRanking`을 화면이 그대로 읽는다 — KIS 호출 0건.
 */

export interface DividendRankingView {
  /** 산출 기준일 "YYYY-MM-DD" */
  computedFor: string;
  /** 스캔 대상 종목 수 — "전 종목 N개 중" 표기용 */
  universeCount: number;
  entries: DividendRankingEntry[];
}

/** 저장된 순위가 없으면 null — 화면은 emptyNotice로 대체한다 */
export async function getDividendRankingView(): Promise<DividendRankingView | null> {
  const stored = await getDividendRanking();

  if (stored === null || stored.entries.length === 0) {
    return null;
  }

  return {
    computedFor: stored.computedFor,
    universeCount: stored.universeCount,
    entries: stored.entries,
  };
}

/** 지급 주기 표기 — "분기(4회)" 형태, 종류가 없으면 회차 수만 */
export function formatPayoutCycle(entry: DividendRankingEntry): string {
  if (entry.payoutCycle === null) {
    return `연 ${entry.roundsPerYear}회`;
  }
  return `${entry.payoutCycle}(${entry.roundsPerYear}회)`;
}

/** 연속 배당 연수 표기 — 조회 상한에 걸렸으면 "N년+" (§43) */
export function formatConsecutiveYears(entry: DividendRankingEntry): string {
  if (entry.consecutiveYears === 0) {
    return "—";
  }
  return `${entry.consecutiveYears}년${entry.yearsCapped ? "+" : ""}`;
}

/** 현금/주식 배당 표기 */
export function formatPayoutForm(entry: DividendRankingEntry): string {
  switch (entry.payoutForm) {
    case "cash":
      return "현금";
    case "stock":
      return "주식";
    default:
      return "—";
  }
}
