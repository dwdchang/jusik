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
import { formatKstTime } from "@/lib/format/datetime";
import { formatBasDtLabel, resolveDirection } from "@/lib/indices/kisMapper";
import type {
  RefreshIncident,
  StalenessLevel,
} from "@/lib/market/staleness";
import type { MyStocksCardSummary } from "@/lib/stocks/myStocksCard";
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
import { MyStocksCard } from "./MyStocksCard";
import { SummaryCard } from "./SummaryCard";

/** 카드 배지 판정 결과 — 장중(09:00~18:20 KST)에만 non-null (§11.10-B).
 * market은 금리·유가·금 3종 중 가장 오래된 수집 시각 기준
 * (§15.2, §28에서 원/달러 분리, §32에서 금 합류) */
export type DashboardStaleness = Record<
  | "kospi"
  | "kosdaq"
  | "usdkrw"
  | "market"
  | "volatility"
  | "myStocks"
  | "dividends",
  StalenessLevel | null
>;

/** 헤더 갱신 상태 문구 — 제목 오른쪽 라벨(짧게)과 제목 밑 설명(멈춘 시각·다음 회차) */
function refreshStatusText(incident: RefreshIncident): {
  label: string;
  description: string;
} {
  const since = incident.sinceIso ? formatKstTime(incident.sinceIso) : null;
  const next =
    incident.nextSlotMs !== null
      ? `다음 ${formatKstTime(incident.nextSlotMs)} 예정`
      : null;

  if (incident.kind === "failing") {
    const head = since ? `${since} 이후 갱신 실패` : "최근 갱신 실패";
    return {
      label: "갱신 실패",
      description: [head, "잠시 후 자동 재시도", next]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const head = since
    ? `${since}부터 실시간 갱신 지연`
    : "실시간 갱신 지연";
  return {
    label: "갱신 지연",
    description: [head, "보통 수 분 내 자동 복구", next]
      .filter(Boolean)
      .join(" · "),
  };
}

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

/**
 * 원/달러 카드의 보조 한 줄 — 달러 인덱스 (§85). 대표값은 원/달러가 유지하고,
 * 달러 인덱스는 `note`(caption-sm·tertiary·무채색)로만 얹는다.
 *
 * dxy는 통화쌍 6종의 기준일 교집합에서 계산해(§28) 원/달러보다 기준일이 하루
 * 밀릴 수 있다. 요약 카드는 기준일을 표시하지 않으니 어긋난 경우에만 날짜를
 * 덧붙여, 두 값을 같은 날짜로 읽는 오독을 막는다.
 */
function dollarIndexNote(
  dxy: IndexSnapshot | null,
  usdKrwBasDt: string
): string | undefined {
  if (dxy === null) {
    return undefined;
  }

  const head = `달러인덱스 ${formatIndex(dxy.close)} (${formatChangeRate(
    dxy.changeRate
  )})`;

  return dxy.basDt === usdKrwBasDt
    ? head
    : `${head} · ${formatBasDtLabel(dxy.basDt)} 기준`;
}

/**
 * 변동성 카드 — 대표값은 최신 거래일의 일중 변동폭, 1행 전일 대비(장중이면 진행 중 표시),
 * 2행은 기준이 다른 월 지표(당월 평균 · 전월 대비)를 한 줄로 (§71).
 */
function volatilitySummaryProps(
  summary: VolatilityCardSummary,
  href: string,
  staleness: StalenessLevel | null
) {
  const monthParts = [
    summary.currentMonthAvg !== null
      ? `월평균 ${summary.currentMonthAvg.toFixed(2)}%`
      : null,
    summary.monthOverMonthDiff !== null
      ? `전월 ${formatPercentPoint(summary.monthOverMonthDiff)}`
      : null,
  ].filter((part): part is string => part !== null);

  return {
    title: "코스피 변동성 지수",
    href,
    staleness,
    value: `${summary.latestGapPercent.toFixed(2)}%`,
    change:
      summary.dayOverDayDiff !== null
        ? {
          // 장중에는 고가·저가 폭이 아직 벌어지는 중이라 전일 대비가 낮게 나온다
          text: `${summary.latestIntraday ? "장중 · " : ""}전일 대비 ${formatPercentPoint(
            summary.dayOverDayDiff
          )}`,
          direction: resolveDirection(summary.dayOverDayDiff),
        }
        : undefined,
    note: monthParts.length > 0 ? monthParts.join(" · ") : undefined,
  };
}

export function IndexDashboard({
  data,
  volatilitySummary,
  hotStocksSummary,
  myStocksSummary,
  dividendSummary,
  staleness,
  incident,
  feedCounts,
}: {
  data: IndexDashboardData;
  volatilitySummary: VolatilityCardSummary | null;
  hotStocksSummary: DailyHotCardSummary | null;
  myStocksSummary: MyStocksCardSummary | null;
  dividendSummary: DividendCardSummary | null;
  staleness: DashboardStaleness;
  incident: RefreshIncident | null;
  feedCounts: TodayFeedCounts;
}) {
  const status = incident !== null ? refreshStatusText(incident) : null;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <NavIconLink href="/" label="홈" icon="home" />
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Dashboard</h1>
            {status !== null ? (
              <span
                className={`${styles.statusLabel} ${
                  incident?.kind === "failing"
                    ? styles.statusFailing
                    : styles.statusStalled
                }`}
              >
                {status.label}
              </span>
            ) : null}
          </div>
          {status !== null ? (
            <p className={styles.statusDesc} role="status">
              {status.description}
            </p>
          ) : null}
        </div>
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
          note={dollarIndexNote(data.dxy, data.usdKrw.basDt)}
        />
        <MarketCard
          usTreasury10y={data.usTreasury10y}
          oil={data.oil}
          gold={data.gold}
          btcUsd={data.btcUsd}
          staleness={staleness.market}
        />
        {volatilitySummary !== null ? (
          <SummaryCard
            {...volatilitySummaryProps(
              volatilitySummary,
              "/indices/kospi-volatility",
              staleness.volatility
            )}
          />
        ) : (
          <SummaryCard
            title="코스피 변동성 지수"
            href="/indices/kospi-volatility"
            placeholder="기록 수집 전"
          />
        )}
        <HotStocksCard
          summary={hotStocksSummary}
          suppressStale={incident !== null}
        />
        <MyStocksCard
          summary={myStocksSummary}
          staleness={staleness.myStocks}
        />
        <DividendCard
          summary={dividendSummary}
          staleness={staleness.dividends}
        />
        <FeedSummaryCard counts={feedCounts} />
        <SummaryCard
          title="종목분석"
          href="/analysis"
          placeholder="종목 재무·실적 분석"
        />
      </section>

      <DataAsOfFooter data={data} />
    </div>
  );
}
