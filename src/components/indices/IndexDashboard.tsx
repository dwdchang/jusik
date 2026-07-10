import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import {
  formatChange,
  formatChangeRate,
  formatPercentPoint,
} from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import { resolveDirection } from "@/lib/indices/kisMapper";
import type { HoldingsCardSummary } from "@/types/holdings";
import type {
  IndexDashboardData,
  IndexSnapshot,
  VolatilityCardSummary,
} from "@/types/indices";
import { DataAsOfFooter } from "./DataAsOfFooter";
import styles from "./IndexDashboard.module.css";
import { SummaryCard } from "./SummaryCard";

function indexSummaryProps(snapshot: IndexSnapshot, href: string) {
  return {
    title: snapshot.name,
    href,
    value: formatIndex(snapshot.close),
    change: {
      text: formatChange(snapshot.changeAmount, snapshot.changeRate),
      direction: snapshot.direction,
    },
    footnote: `기준일 ${formatBasDtDisplay(snapshot.basDt)}`,
  };
}

export function IndexDashboard({
  data,
  holdingsSummary,
  volatilitySummary,
}: {
  data: IndexDashboardData;
  holdingsSummary: HoldingsCardSummary | null;
  volatilitySummary: VolatilityCardSummary | null;
}) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>시장 지표</h1>
          <p className={styles.subtitle}>
            지수 · 환율 · 금리 · 보유종목 요약 — 카드를 누르면 상세로 이동
          </p>
        </div>
        <div className={styles.headerActions}>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <section className={styles.cards} aria-label="지표 요약">
        <SummaryCard {...indexSummaryProps(data.kospi, "/indices/kospi")} />
        <SummaryCard {...indexSummaryProps(data.kosdaq, "/indices/kosdaq")} />
        <SummaryCard {...indexSummaryProps(data.usdKrw, "/indices/usdkrw")} />
        <SummaryCard
          {...indexSummaryProps(data.usTreasury10y, "/indices/us10y")}
        />
        {holdingsSummary !== null ? (
          <SummaryCard
            title="보유종목 수익률"
            href="/holdings"
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
      </section>

      <DataAsOfFooter data={data} />
    </div>
  );
}
