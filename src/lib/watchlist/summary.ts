import type { WatchItem } from "@/types/watchlist";

/**
 * 관심종목 수익률 — 등록 기준일 종가 대비 현재가 (plan.md §15.4).
 * 스냅샷·기준가 어느 쪽이든 없으면 null (화면에 「-」·「기준가 확정 중」 표기).
 */
export function computeWatchReturnRate(
  currentPrice: number | null,
  item: WatchItem
): number | null {
  if (
    currentPrice === null ||
    item.priceAtRegistration === null ||
    item.priceAtRegistration <= 0
  ) {
    return null;
  }
  return (
    ((currentPrice - item.priceAtRegistration) / item.priceAtRegistration) *
    100
  );
}
