import type { HoldingsCardSummary } from "@/types/holdings";
import { getHoldings, getPortfolioHistory, todayKstDate } from "./store";
import {
  computeDailyChangeRate,
  getPortfolioValuation,
  latestRecordBefore,
} from "./valuation";

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

    const [valuation, history] = await Promise.all([
      getPortfolioValuation(holdings),
      getPortfolioHistory(email),
    ]);

    return {
      totalReturnRate: valuation.totalReturnRate,
      dailyChangeRate: computeDailyChangeRate(
        valuation.totalValue,
        latestRecordBefore(history, todayKstDate())
      ),
    };
  } catch (error) {
    console.error("[getHoldingsCardSummary] failed:", error);
    return null;
  }
}
