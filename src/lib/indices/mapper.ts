import type { RawStockMarketIndexItem } from "@/lib/api/data-go-kr/types";
import type {
  IndexChartPoint,
  IndexSnapshot,
  MarketIndex,
  PriceDirection,
} from "@/types/indices";

export function parseNum(value: string | number | undefined): number {
  if (value === undefined || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

export function resolveDirection(changeRate: number): PriceDirection {
  if (changeRate > 0) {
    return "rise";
  }
  if (changeRate < 0) {
    return "fall";
  }
  return "flat";
}

/** "20260601" → "06/01" */
export function formatBasDtLabel(basDt: string): string {
  if (basDt.length !== 8) {
    return basDt;
  }
  return `${basDt.slice(4, 6)}/${basDt.slice(6, 8)}`;
}

export function mapToSnapshot(
  item: RawStockMarketIndexItem,
  market: MarketIndex
): IndexSnapshot {
  const changeRate = parseNum(item.fltRt);
  return {
    market,
    name: item.idxNm ?? (market === "KOSPI" ? "코스피" : "코스닥"),
    basDt: item.basDt ?? "",
    close: parseNum(item.clpr),
    changeAmount: parseNum(item.vs),
    changeRate,
    direction: resolveDirection(changeRate),
  };
}

export function mapToChartPoints(
  items: RawStockMarketIndexItem[]
): IndexChartPoint[] {
  return [...items]
    .sort((a, b) => (a.basDt ?? "").localeCompare(b.basDt ?? ""))
    .map((row) => ({
      basDt: row.basDt ?? "",
      date: formatBasDtLabel(row.basDt ?? ""),
      close: parseNum(row.clpr),
    }));
}

/**
 * 응답 item 목록에서 basDt가 가장 최신인 행을 스냅샷으로 변환한다.
 */
export function mapLatestSnapshotFromItems(
  items: RawStockMarketIndexItem[],
  market: MarketIndex
): IndexSnapshot {
  if (items.length === 0) {
    throw new Error(`No index items available for ${market}`);
  }

  const sorted = [...items].sort((a, b) =>
    (b.basDt ?? "").localeCompare(a.basDt ?? "")
  );

  return mapToSnapshot(sorted[0], market);
}
