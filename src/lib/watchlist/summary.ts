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

/** 홈 관심종목 카드 1행 — 종목별 수익률·전일 등락률 (§24) */
export interface WatchlistCardEntry {
  name: string;
  symbolCode: string;
  /** 등록 기준일 종가 대비 수익률(%) — 기준가 확정 전이면 null (「-」 표기) */
  returnRate: number | null;
  /** 전일 대비 등락률(%) — 스냅샷 없으면 null (괄호 생략) */
  dailyChangeRate: number | null;
}

/** 홈 화면 관심종목 카드 요약 — 수익률 상위 3종목 개별 표시 (§24) */
export interface WatchlistCardSummary {
  count: number;
  /** 수익률 내림차순 상위 3개 — 기준가 확정 전 항목은 뒤 순위 */
  top3: WatchlistCardEntry[];
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

    const entries = items.map((item): WatchlistCardEntry => {
      const snapshot = snapshots.get(item.symbolCode);
      return {
        name: item.name || item.symbolCode,
        symbolCode: item.symbolCode,
        returnRate: computeWatchReturnRate(snapshot?.price ?? null, item),
        dailyChangeRate: snapshot?.changeRate ?? null,
      };
    });

    entries.sort(
      (a, b) =>
        (b.returnRate ?? Number.NEGATIVE_INFINITY) -
        (a.returnRate ?? Number.NEGATIVE_INFINITY)
    );

    return { count: items.length, top3: entries.slice(0, 3) };
  } catch (error) {
    console.error("[getWatchlistCardSummary] failed:", error);
    return null;
  }
}
