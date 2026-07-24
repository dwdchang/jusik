import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import {
  IndexDashboard,
  type DashboardStaleness,
} from "@/components/indices/IndexDashboard";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getDividendCardSummary } from "@/lib/dividends/summary";
import { getTodayFeedCounts } from "@/lib/feeds/homeFeed";
import { getDailyHotCardSummary } from "@/lib/hotstocks/dailyCard";
import { getDashboardData } from "@/lib/indices/getDashboard";
import { getVolatilityCardSummary } from "@/lib/indices/volatility";
import {
  resolveRefreshIncident,
  resolveStaleness,
} from "@/lib/market/staleness";
import { getLastRefreshRecord } from "@/lib/market/store";
import { getWatchlistCardSummary } from "@/lib/watchlist/summary";
import styles from "./page.module.css";

export default async function HomePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const email = session.user?.email;

  if (!isEmailAllowed(email)) {
    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <h1 className={styles.errorTitle}>접근 권한이 없습니다</h1>
          <p className={styles.errorMessage}>
            {email ?? "이 계정"}은(는) 이 대시보드에 접근할 수 있는 목록에
            없습니다.
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className={styles.signOutButton}>
              로그아웃
            </button>
          </form>
        </div>
      </main>
    );
  }

  let data: Awaited<ReturnType<typeof getDashboardData>>;
  let volatilitySummary: Awaited<ReturnType<typeof getVolatilityCardSummary>>;
  let hotStocksSummary: Awaited<ReturnType<typeof getDailyHotCardSummary>>;
  let watchlistSummary: Awaited<ReturnType<typeof getWatchlistCardSummary>>;
  let dividendSummary: Awaited<ReturnType<typeof getDividendCardSummary>>;
  let lastRefresh: Awaited<ReturnType<typeof getLastRefreshRecord>>;
  let feedCounts: Awaited<ReturnType<typeof getTodayFeedCounts>>;

  try {
    // 카드 요약(변동성·핫종목·관심종목·배당)과 피드 건수는 실패 시 빈/null 반환 — 홈 전체를 막지 않는다
    [
      data,
      volatilitySummary,
      hotStocksSummary,
      watchlistSummary,
      dividendSummary,
      lastRefresh,
      feedCounts,
    ] = await Promise.all([
      getDashboardData(),
      getVolatilityCardSummary(),
      getDailyHotCardSummary(),
      getWatchlistCardSummary(email),
      getDividendCardSummary(email),
      getLastRefreshRecord().catch(() => null),
      getTodayFeedCounts(email).catch(() => ({
        disclosures: 0,
        news: 0,
      })),
    ]);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지수 데이터를 불러오지 못했습니다.";

    console.error(
      "[HomePage] getDashboardData failed:",
      message,
      error instanceof Error ? error.cause : undefined
    );

    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <h1 className={styles.errorTitle}>데이터를 불러올 수 없습니다</h1>
          <p className={styles.errorMessage}>{message}</p>
        </div>
      </main>
    );
  }

  // 카드 배지 — 지수 2종·원/달러는 각 지표의 fetchedAt, 시장 카드는 금리·유가·금
  // 3종 중 가장 오래된 수집 시각(§15.2, §28에서 원/달러 분리, §32에서 금 합류),
  // 변동성·관심종목·배당은 마지막 갱신 잡 성공 시각 기준(§58에서 보유종목 카드 삭제).
  // 장중(평일 09:00~18:20 KST)에만 판정된다 (§11.10-B)
  const lastRefreshAt = lastRefresh?.at ?? null;
  const marketFetchedAt =
    [
      data.fetchedAtByKey.us10y,
      data.fetchedAtByKey.oil,
      data.fetchedAtByKey.gold,
    ]
      .filter((at): at is string => at !== null)
      .sort()[0] ?? null;
  // 갱신 잡이 예정 회차를 놓쳐 홈 전체가 stale이면 인시던트로 판정(§52 방법1+2).
  // 이 경우 카드마다 배지를 흩뿌리지 않고 헤더 상태 표시 1개로 통합하므로 per-card 배지는 억제.
  const incident = resolveRefreshIncident(lastRefresh);
  const staleness: DashboardStaleness =
    incident !== null
      ? {
        kospi: null,
        kosdaq: null,
        usdkrw: null,
        market: null,
        volatility: null,
        watchlist: null,
        dividends: null,
      }
      : {
        kospi: resolveStaleness(data.fetchedAtByKey.kospi),
        kosdaq: resolveStaleness(data.fetchedAtByKey.kosdaq),
        usdkrw: resolveStaleness(data.fetchedAtByKey.usdkrw),
        market: resolveStaleness(marketFetchedAt),
        volatility: resolveStaleness(lastRefreshAt),
        watchlist: resolveStaleness(lastRefreshAt),
        dividends: resolveStaleness(lastRefreshAt),
      };

  return (
    <main className={styles.page}>
      <IndexDashboard
        data={data}
        volatilitySummary={volatilitySummary}
        hotStocksSummary={hotStocksSummary}
        watchlistSummary={watchlistSummary}
        dividendSummary={dividendSummary}
        staleness={staleness}
        incident={incident}
        feedCounts={feedCounts}
      />
    </main>
  );
}
