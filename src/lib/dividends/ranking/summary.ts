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

/** 지급 주기 표기 — 배당 기준일 평균 간격 기반 라벨(월/분기/반기/연), 없으면 "—" (Phase 44) */
export function formatPayoutCycle(entry: DividendRankingEntry): string {
  return entry.payoutCycle ?? "—";
}

/** 연속 배당 연수 표기 — 조회 상한에 걸렸으면 "N년+" (§43) */
export function formatConsecutiveYears(entry: DividendRankingEntry): string {
  if (entry.consecutiveYears === 0) {
    return "—";
  }
  return `${entry.consecutiveYears}년${entry.yearsCapped ? "+" : ""}`;
}

/** 주식배당 병행 표기 — "현+주0.75%", 없으면 null (Phase 44).
    `== null`로 구 스키마(필드 미존재)도 안전하게 null 처리 */
export function formatStockDividend(entry: DividendRankingEntry): string | null {
  if (entry.stockDividendRate == null || entry.stockDividendRate <= 0) {
    return null;
  }
  return `현+주${entry.stockDividendRate}%`;
}

/** DART 공시 원문 딥링크 */
export function dartDisclosureUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}

/** 폭배 툴팁 — DART 배당결정 수치 요약(주당배당금·공식 시가배당율·기준일) */
export function surgeTooltip(entry: DividendRankingEntry): string {
  const parts = ["비경상 급증 — DART 배당결정 공시"];
  const surge = entry.surge;
  if (surge !== null) {
    if (surge.perShare !== null) {
      parts.push(`주당 ${surge.perShare.toLocaleString("ko-KR")}원`);
    }
    if (surge.officialYield !== null) {
      parts.push(`공식 시가배당율 ${surge.officialYield}%`);
    }
    if (surge.recordDate !== null) {
      parts.push(`기준일 ${surge.recordDate}`);
    }
  }
  return parts.join(" · ");
}
