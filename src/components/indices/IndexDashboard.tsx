import { HeaderMenu } from "@/components/nav/HeaderMenu";
import { NavIconLink } from "@/components/nav/NavIconLink";
import type { DividendCardSummary } from "@/lib/dividends/summary";
import type { TodayFeedCounts } from "@/lib/feeds/homeFeed";
import { formatBasDtDisplay } from "@/lib/format/basDt";
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
import { SummaryCard } from "./SummaryCard";
import { WatchlistCard } from "./WatchlistCard";

/** 카드 배지 판정 결과 — 장중(09:00~18:20 KST)에만 non-null (§11.10-B).
 * market은 환율·금리·유가 3종 중 가장 오래된 수집 시각 기준 (§15.2) */
export type DashboardStaleness = Record<
  | "kospi"
  | "kosdaq"
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
    footnote: `기준일 ${formatBasDtDisplay(snapshot.basDt)}`,
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
          title="시장"
          href="/indices/market"
          staleness={staleness.market}
          value={formatIndex(data.usdKrw.close)}
          change={{
            text: formatChange(
              data.usdKrw.changeAmount,
              data.usdKrw.changeRate
            ),
            direction: data.usdKrw.direction,
          }}
          footnote={`원/달러 대표 표시 · 금리·유가 포함 — 기준일 ${formatBasDtDisplay(
            data.usdKrw.basDt
          )}`}
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
            footnote="총 수익률 · 현재가 기준"
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
            footnote="당월 평균 · 일중 (고가−저가)/저가"
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
