import { getHoldings } from "@/lib/holdings/store";
import { getPortfolioValuation } from "@/lib/holdings/valuation";
import { getStockSnapshots } from "@/lib/market/store";
import { computeWatchReturnRate } from "@/lib/watchlist/summary";
import { getWatchlist } from "@/lib/watchlist/store";

/**
 * 홈 「내 종목」 카드 요약 — 보유 4종목(왼쪽)·관심 4종목(오른쪽)을 한 카드에 담는다 (§67).
 * 구 `getWatchlistCardSummary`(관심 전용)를 대체한다.
 *
 * Redis만 읽는다(§2 대원칙). 보유·관심 합집합으로 스냅샷 MGET을 1회로 합치고,
 * 그 맵을 `getPortfolioValuation`에 주입해 평가 계산이 다시 조회하지 않게 한다.
 */

/** 카드 1행 — 종목명 + 수익률 + 전일 대비 등락률 (§24 행 폼 승계) */
export interface MyStocksCardEntry {
  name: string;
  symbolCode: string;
  /** 수익률(%) — 보유=매입가 대비, 관심=등록 기준가 대비. 확정 전이면 null (「-」 표기) */
  returnRate: number | null;
  /** 전일 대비 등락률(%) — 스냅샷·폴백 어느 쪽도 없으면 null (생략) */
  dailyChangeRate: number | null;
}

export interface MyStocksCardSummary {
  /** 수익률 내림차순 상위 4개 — 없으면 빈 배열(그 열에 placeholder) */
  holdings: MyStocksCardEntry[];
  watches: MyStocksCardEntry[];
  /** 보유 전체 수익률(%) — 시세 있는 보유가 없으면 null (제목 우측 수치 생략) */
  totalReturnRate: number | null;
  /** 보유 전체 전일 대비 등락률(%) — 같은 조건에서 null */
  totalDailyChangeRate: number | null;
}

const TOP_COUNT = 4;

/**
 * 수익률 내림차순 — `/stocks` 목록(`sortRowsByReturnRate`, §56)과 같은 규칙.
 * 수익률이 없는 행은 순서를 매길 수 없으므로 맨 뒤로 보내고 그들끼리는 종목명순.
 */
function topByReturnRate(entries: MyStocksCardEntry[]): MyStocksCardEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (a.returnRate === null && b.returnRate === null) {
        return a.name.localeCompare(b.name, "ko-KR");
      }
      if (a.returnRate === null) {
        return 1;
      }
      if (b.returnRate === null) {
        return -1;
      }
      return b.returnRate - a.returnRate;
    })
    .slice(0, TOP_COUNT);
}

/**
 * 보유·관심이 둘 다 없거나 조회에 실패하면 null — 카드 전체에 placeholder 표시.
 */
export async function getMyStocksCardSummary(
  email: string
): Promise<MyStocksCardSummary | null> {
  try {
    const [holdings, watchItems] = await Promise.all([
      getHoldings(email),
      getWatchlist(email),
    ]);

    if (holdings.length === 0 && watchItems.length === 0) {
      return null;
    }

    const snapshots = await getStockSnapshots([
      ...new Set([
        ...holdings.map((holding) => holding.symbolCode),
        ...watchItems.map((item) => item.symbolCode),
      ]),
    ]);

    const valuation = await getPortfolioValuation(holdings, snapshots);

    const holdingEntries = valuation.items.map(
      (item): MyStocksCardEntry => ({
        name: item.holding.name || item.holding.symbolCode,
        symbolCode: item.holding.symbolCode,
        returnRate: item.returnRate,
        dailyChangeRate:
          snapshots.get(item.holding.symbolCode)?.changeRate ?? null,
      })
    );

    const watchEntries = watchItems.map((item): MyStocksCardEntry => {
      const snapshot = snapshots.get(item.symbolCode);
      // 스냅샷이 아직 없으면 등록 시 종가로 폴백 — 내 종목 목록과 같은 규칙 (§65).
      // 두 화면이 어긋나면(카드는 「-」, 목록은 0%) 같은 종목이 달라 보인다.
      const provisional = snapshot === undefined;
      return {
        name: item.name || item.symbolCode,
        symbolCode: item.symbolCode,
        returnRate: computeWatchReturnRate(
          snapshot?.price ?? item.priceAtRegistration,
          item
        ),
        dailyChangeRate: provisional
          ? (item.changeRateAtRegistration ?? null)
          : snapshot.changeRate,
      };
    });

    return {
      holdings: topByReturnRate(holdingEntries),
      watches: topByReturnRate(watchEntries),
      // 시세 없는 보유만 있으면 totalCost가 0이라 수익률 0%가 되므로 그때는 감춘다
      totalReturnRate:
        valuation.totalCost > 0 ? valuation.totalReturnRate : null,
      totalDailyChangeRate: valuation.totalDailyChangeRate,
    };
  } catch (error) {
    console.error("[getMyStocksCardSummary] failed:", error);
    return null;
  }
}
