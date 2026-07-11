import { todayKstDate } from "@/lib/date/kst";
import { addMonths, baseMonthKst } from "./months";
import { getHotStocks, type HotStockEntry } from "./store";

/**
 * 홈 "핫종목" 카드 요약 — 최근 1개월 TOP 3 (plan.md §14.5).
 * 데이터 미존재 시 null (카드는 placeholder 표시).
 */

export interface HotStocksCardSummary {
  /** 기준월 M "YYYY-MM" */
  computedFor: string;
  /** 최근 1개월 구간 상위 3종목 */
  top3: HotStockEntry[];
  /**
   * 갱신 지연 여부 — 잡은 매월 1~7일에 도는데(§14.4) KST 8일 이후에도
   * 전월 랭킹이 반영되지 않았거나, 두 달 이상 밀린 경우 true
   */
  staleNotice: boolean;
}

/**
 * 갱신 지연 판정 — 잡은 매월 1~7일에 돈다(§14.4). KST 8일 이후에도 기준월이
 * 반영되지 않았거나, 1~7일인데 두 달 이상 밀린 경우 지연으로 본다.
 */
export function isHotStocksStale(computedFor: string): boolean {
  const expected = baseMonthKst();
  const kstDayOfMonth = Number(todayKstDate().slice(8));
  return (
    computedFor !== expected &&
    (kstDayOfMonth >= 8 || computedFor !== addMonths(expected, -1))
  );
}

export async function getHotStocksCardSummary(): Promise<HotStocksCardSummary | null> {
  const stored = await getHotStocks();
  if (stored === null) {
    return null;
  }

  return {
    computedFor: stored.computedFor,
    top3: stored.windows["1m"].entries.slice(0, 3),
    staleNotice: isHotStocksStale(stored.computedFor),
  };
}
