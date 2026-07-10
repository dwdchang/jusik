import { fetchKisStockPrice } from "@/lib/api/kis/client";
import type {
  Holding,
  PortfolioDailyRecord,
  PortfolioValuation,
} from "@/types/holdings";

/**
 * 보유종목 평가 — 종목별 현재가 조회 후 평가금액/손익/수익률 계산.
 * @see plan.md §9.4.3
 */
export async function getPortfolioValuation(
  holdings: Holding[]
): Promise<PortfolioValuation> {
  const prices = await Promise.all(
    holdings.map((holding) => fetchKisStockPrice(holding.symbolCode))
  );

  const items = holdings.map((holding, i) => {
    const currentPrice = prices[i];
    const cost = holding.totalCost;
    const value = currentPrice * holding.quantity;
    const profit = value - cost;

    return {
      holding,
      currentPrice,
      cost,
      value,
      profit,
      returnRate: cost > 0 ? (profit / cost) * 100 : 0,
    };
  });

  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
  const totalValue = items.reduce((sum, item) => sum + item.value, 0);
  const totalProfit = totalValue - totalCost;

  return {
    items,
    totalCost,
    totalValue,
    totalProfit,
    totalReturnRate: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
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
