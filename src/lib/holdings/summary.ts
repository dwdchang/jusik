import type { HoldingsCardSummary } from "@/types/holdings";
import { getHoldings } from "./store";
import { getPortfolioValuation } from "./valuation";

/**
 * 홈 화면 보유종목 카드 요약.
 * 보유종목이 없거나 조회에 실패하면 null — 카드에 placeholder 표시.
 */
export async function getHoldingsCardSummary(
  email: string
): Promise<HoldingsCardSummary | null> {
  try {
    const holdings = await getHoldings(email);

    if (holdings.length === 0) {
      return null;
    }

    const valuation = await getPortfolioValuation(holdings);

    return {
      totalReturnRate: valuation.totalReturnRate,
      dailyChangeRate: valuation.totalDailyChangeRate,
    };
  } catch (error) {
    console.error("[getHoldingsCardSummary] failed:", error);
    return null;
  }
}
