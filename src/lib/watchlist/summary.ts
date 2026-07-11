import { getStockSnapshots } from "@/lib/market/store";
import type { WatchItem } from "@/types/watchlist";
import { getWatchlist } from "./store";

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

/** 홈 화면 관심종목 카드 요약 — 개수·평균 수익률·최고 수익률 1종목 (§15.4) */
export interface WatchlistCardSummary {
  count: number;
  /** 기준가 확정된 항목의 단순 평균 — 계산 가능한 항목이 없으면 null */
  avgReturnRate: number | null;
  /** 최고 수익률 종목 — 계산 가능한 항목이 없으면 null */
  best: { name: string; symbolCode: string; returnRate: number } | null;
}

/**
 * 관심종목이 없거나 조회에 실패하면 null — 카드에 placeholder 표시.
 */
export async function getWatchlistCardSummary(
  email: string
): Promise<WatchlistCardSummary | null> {
  try {
    const items = await getWatchlist(email);

    if (items.length === 0) {
      return null;
    }

    const snapshots = await getStockSnapshots(
      [...new Set(items.map((item) => item.symbolCode))]
    );

    const rated = items.flatMap((item) => {
      const returnRate = computeWatchReturnRate(
        snapshots.get(item.symbolCode)?.price ?? null,
        item
      );
      return returnRate !== null ? [{ item, returnRate }] : [];
    });

    if (rated.length === 0) {
      return { count: items.length, avgReturnRate: null, best: null };
    }

    const best = rated.reduce((max, row) =>
      row.returnRate > max.returnRate ? row : max
    );

    return {
      count: items.length,
      avgReturnRate:
        rated.reduce((sum, row) => sum + row.returnRate, 0) / rated.length,
      best: {
        name: best.item.name || best.item.symbolCode,
        symbolCode: best.item.symbolCode,
        returnRate: best.returnRate,
      },
    };
  } catch (error) {
    console.error("[getWatchlistCardSummary] failed:", error);
    return null;
  }
}
