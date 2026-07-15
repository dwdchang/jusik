import { todayKstDate } from "@/lib/date/kst";
import { addMonths, baseMonthKst } from "./months";

/**
 * 월간 핫종목 랭킹 갱신 지연 판정 — 핫종목 페이지 월간 뷰에서 사용 (§14.5).
 * (홈 카드는 §17.12부터 당일 등락률 기준으로 바뀌어 lib/hotstocks/dailyCard.ts를 쓴다.)
 */

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
