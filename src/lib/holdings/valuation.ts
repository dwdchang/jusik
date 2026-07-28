import { getStockSnapshots, type StoredStockSnapshot } from "@/lib/market/store";
import type { Holding, PortfolioValuation } from "@/types/holdings";

/**
 * 보유종목 평가 — QStash 갱신 잡이 저장한 `market:stock:{code}` 스냅샷으로 계산한다.
 * 접속 시 KIS 호출 없음 (Phase 11 §11.6). 스냅샷이 없는 종목(방금 등록·잘못된 코드)은
 * null 평가로 격리하고 합계에서 제외한다 (§11.10-A4).
 *
 * `prefetchedSnapshots`는 호출부가 이미 읽어 둔 스냅샷 맵 — 보유 외 종목이 섞여 있어도
 * 무관하다(코드로 조회하므로). 홈 「내 종목」 카드처럼 보유·관심을 합쳐 MGET 1회로
 * 끝내는 경로에서 재조회를 없애는 용도 (§67). 미전달이면 기존과 동일하게 직접 읽는다.
 */
export async function getPortfolioValuation(
  holdings: Holding[],
  prefetchedSnapshots?: Map<string, StoredStockSnapshot>
): Promise<PortfolioValuation> {
  const symbolCodes = [...new Set(holdings.map((h) => h.symbolCode))];
  const snapshots =
    prefetchedSnapshots ?? (await getStockSnapshots(symbolCodes));

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

  // 일일 등락 — 종목별 KIS 전일 대비(changeRate)로 전일 평가액을 역산해 가중.
  // 포트폴리오 히스토리(전일 스냅샷)에 의존하지 않아 첫날·기록 공백에도 항상 가용.
  let dailyPrevValue = 0;
  let dailyNowValue = 0;
  for (const item of priced) {
    const snapshot = snapshots.get(item.holding.symbolCode);
    if (snapshot === undefined || item.value === null) {
      continue;
    }
    const denom = 1 + snapshot.changeRate / 100;
    if (denom > 0) {
      dailyPrevValue += item.value / denom;
      dailyNowValue += item.value;
    }
  }
  const totalDailyChangeRate =
    dailyPrevValue > 0
      ? ((dailyNowValue - dailyPrevValue) / dailyPrevValue) * 100
      : null;

  return {
    items,
    totalCost,
    totalValue,
    totalProfit,
    totalReturnRate: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
    totalDailyChangeRate,
    missingPriceSymbols: [
      ...new Set(
        items
          .filter((item) => item.currentPrice === null)
          .map((item) => item.holding.symbolCode)
      ),
    ],
  };
}
