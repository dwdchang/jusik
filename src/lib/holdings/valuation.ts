import { getStockSnapshots } from "@/lib/market/store";
import type {
  Holding,
  PortfolioDailyRecord,
  PortfolioValuation,
} from "@/types/holdings";

/**
 * 보유종목 평가 — QStash 갱신 잡이 저장한 `market:stock:{code}` 스냅샷으로 계산한다.
 * 접속 시 KIS 호출 없음 (Phase 11 §11.6). 스냅샷이 없는 종목(방금 등록·잘못된 코드)은
 * null 평가로 격리하고 합계에서 제외한다 (§11.10-A4).
 */
export async function getPortfolioValuation(
  holdings: Holding[]
): Promise<PortfolioValuation> {
  const symbolCodes = [...new Set(holdings.map((h) => h.symbolCode))];
  const snapshots = await getStockSnapshots(symbolCodes);

  const items = holdings.map((holding) => {
    const snapshot = snapshots.get(holding.symbolCode);
    const cost = holding.totalCost;

    if (snapshot === undefined) {
      return {
        holding,
        currentPrice: null,
        cost,
        value: null,
        profit: null,
        returnRate: null,
      };
    }

    const value = snapshot.price * holding.quantity;
    const profit = value - cost;

    return {
      holding,
      currentPrice: snapshot.price,
      cost,
      value,
      profit,
      returnRate: cost > 0 ? (profit / cost) * 100 : 0,
    };
  });

  const priced = items.filter((item) => item.value !== null);
  const totalCost = priced.reduce((sum, item) => sum + item.cost, 0);
  const totalValue = priced.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const totalProfit = totalValue - totalCost;

  return {
    items,
    totalCost,
    totalValue,
    totalProfit,
    totalReturnRate: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
    missingPriceSymbols: [
      ...new Set(
        items
          .filter((item) => item.currentPrice === null)
          .map((item) => item.holding.symbolCode)
      ),
    ],
  };
}

/** history에서 기준일(KST "YYYY-MM-DD") 이전의 가장 최근 기록 */
export function latestRecordBefore(
  history: PortfolioDailyRecord[],
  date: string
): PortfolioDailyRecord | undefined {
  return [...history]
    .filter((record) => record.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** 일일 변동률(%) — 전일 기록이 없거나 0이면 null */
export function computeDailyChangeRate(
  todayValue: number,
  prevRecord: PortfolioDailyRecord | undefined
): number | null {
  if (!prevRecord || prevRecord.totalValue <= 0) {
    return null;
  }
  return ((todayValue - prevRecord.totalValue) / prevRecord.totalValue) * 100;
}
