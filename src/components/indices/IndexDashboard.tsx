import { HeaderMenu } from "@/components/nav/HeaderMenu";
import { NavIconLink } from "@/components/nav/NavIconLink";
import type { DividendCardSummary } from "@/lib/dividends/summary";
import type { TodayFeedCounts } from "@/lib/feeds/homeFeed";
import {
  formatChange,
  formatChangeRate,
  formatPercentPoint,
} from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import type { DailyHotCardSummary } from "@/lib/hotstocks/dailyCard";
import { resolveDirection } from "@/lib/indices/kisMapper";
import type { StalenessLevel } from "@/lib/market/staleness";
import type { WatchlistCardSummary } from "@/lib/watchlist/summary";
import type { HoldingsCardSummary } from "@/types/holdings";
import type {
  IndexDashboardData,
  IndexSnapshot,
  VolatilityCardSummary,
} from "@/types/indices";
import { DataAsOfFooter } from "./DataAsOfFooter";
import { DividendCard } from "./DividendCard";
import { FeedSummaryCard } from "./FeedSummaryCard";
import { HotStocksCard } from "./HotStocksCard";
import styles from "./IndexDashboard.module.css";
import { MarketCard } from "./MarketCard";
import { SummaryCard } from "./SummaryCard";
import { WatchlistCard } from "./WatchlistCard";

/** 카드 배지 판정 결과 — 장중(09:00~18:20 KST)에만 non-null (§11.10-B).
 * market은 금리·유가·금 3종 중 가장 오래된 수집 시각 기준
 * (§15.2, §28에서 원/달러 분리, §32에서 금 합류) */
export type DashboardStaleness = Record<
  | "kospi"
  | "kosdaq"
  | "usdkrw"
  | "market"
  | "holdings"
  | "volatility"
  | "watchlist"
  | "dividends",
  StalenessLevel | null
>;

function indexSummaryProps(
  snapshot: IndexSnapshot,
  href: string,
  staleness: StalenessLevel | null
) {
  return {
    title: snapshot.name,
    href,
    value: formatIndex(snapshot.close),
    change: {
      text: formatChange(snapshot.changeAmount, snapshot.changeRate),
      direction: snapshot.direction,
    },
    staleness,
  };
}

export function IndexDashboard({
  data,
  holdingsSummary,
  volatilitySummary,
  hotStocksSummary,
  watchlistSummary,
  dividendSummary,
  staleness,
  feedCounts,
}: {
  data: IndexDashboardData;
  holdingsSummary: HoldingsCardSummary | null;
  volatilitySummary: VolatilityCardSummary | null;
  hotStocksSummary: DailyHotCardSummary | null;
  watchlistSummary: WatchlistCardSummary | null;
  dividendSummary: DividendCardSummary | null;
  staleness: DashboardStaleness;
  feedCounts: TodayFeedCounts;
}) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <NavIconLink href="/" label="홈" icon="home" />
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.headerActions}>
          <HeaderMenu />
        </div>
      </header>

      <section className={styles.cards} aria-label="지표 요약">
        <SummaryCard
          {...indexSummaryProps(data.kospi, "/indices/kospi", staleness.kospi)}
        />
        <SummaryCard
          {...indexSummaryProps(
            data.kosdaq,
            "/indices/kosdaq",
            staleness.kosdaq
          )}
        />
        <SummaryCard
          {...indexSummaryProps(
            data.usdKrw,
            "/indices/usdkrw",
            staleness.usdkrw
          )}
        />
        <MarketCard
          usTreasury10y={data.usTreasury10y}
          oil={data.oil}
          gold={data.gold}
          btcUsd={data.btcUsd}
          staleness={staleness.market}
        />
        {holdingsSummary !== null ? (
          <SummaryCard
            title="보유종목 수익률"
            href="/holdings"
            staleness={staleness.holdings}
            value={formatChangeRate(holdingsSummary.totalReturnRate)}
            valueDirection={resolveDirection(holdingsSummary.totalReturnRate)}
            change={
              holdingsSummary.dailyChangeRate !== null
                ? {
                  text: `전일 대비 ${formatChangeRate(
                    holdingsSummary.dailyChangeRate
                  )}`,
                  direction: resolveDirection(
                    holdingsSummary.dailyChangeRate
                  ),
                }
                : undefined
            }
          />
        ) : (
          <SummaryCard
            title="보유종목 수익률"
            href="/holdings"
            placeholder="종목을 등록해보세요"
          />
        )}
        {volatilitySummary !== null ? (
          <SummaryCard
            title="코스피 변동성 지수"
            href="/indices/kospi-volatility"
            staleness={staleness.volatility}
            value={`${volatilitySummary.currentMonthAvg.toFixed(2)}%`}
            change={
              volatilitySummary.monthOverMonthDiff !== null
                ? {
                  text: `전월 대비 ${formatPercentPoint(
                    volatilitySummary.monthOverMonthDiff
                  )}`,
                  direction: resolveDirection(
                    volatilitySummary.monthOverMonthDiff
                  ),
                }
                : undefined
            }
          />
        ) : (
          <SummaryCard
            title="코스피 변동성 지수"
            href="/indices/kospi-volatility"
            placeholder="기록 수집 전"
          />
        )}
        <HotStocksCard summary={hotStocksSummary} />
        <WatchlistCard
          summary={watchlistSummary}
          staleness={staleness.watchlist}
        />
        <DividendCard
          summary={dividendSummary}
          staleness={staleness.dividends}
        />
        <FeedSummaryCard counts={feedCounts} />
      </section>

      <DataAsOfFooter data={data} />
    </div>
  );
}
