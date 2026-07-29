import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  FeedTabsClient,
  type TabKey,
} from "@/components/feeds/FeedTabsClient";
import { EarningsFocusPanel } from "@/components/feeds/EarningsFocusPanel";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getEarningsStockOptions } from "@/lib/feeds/earningsFocus";
import {
  getDisclosureBoard,
  getEarningsBoard,
  getNewsBoard,
} from "@/lib/feeds/homeFeed";
import { getTradeStatsView } from "@/lib/feeds/tradeStats";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "뉴스·공시 — jusik",
  description: "보유·관심종목의 뉴스·공시·실적·수출입 통합 피드",
};

const TAB_KEYS: ReadonlyArray<TabKey> = [
  "news",
  "disclosure",
  "earnings",
  "trade",
];

/** `?tab=` → 진입 탭. 미지정·오값은 기본 탭(뉴스)으로 떨어뜨린다 (Phase 81) */
function toTabKey(value: string | undefined): TabKey {
  return TAB_KEYS.find((key) => key === value) ?? "news";
}

/**
 * 뉴스·공시 상세 페이지 (Phase 17-2b, plan.md §17.8) — 홈 요약 카드에서 이동.
 * 17-2에서 홈 전체폭에 있던 탭+게시판+아코디언(FeedTabsClient)을 위치만 이 페이지로 옮겼다.
 * 데이터·컴포넌트는 무변경 재사용, 페이지는 세션 가드와 헤더만 담당한다.
 * Phase 81에서 실적 탭과 `?tab=` 진입 탭(실적 푸시 알림 링크용)이 추가됐다.
 * Phase 82에서 실적 탭 상단에 종목 선택(`?code=`)+분기 실적 블록이 붙었다 — 그 조회는
 * **실적 탭으로 들어왔을 때만** 한다(다른 탭에서 DART를 부를 이유가 없다).
 */
export default async function FeedsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; code?: string }>;
}) {
  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const { tab, code } = await searchParams;
  const activeTab = toTabKey(tab);

  const stockOptions =
    activeTab === "earnings"
      ? await getEarningsStockOptions(email).catch((err) => {
          console.error("[FeedsPage] getEarningsStockOptions failed:", err);
          return [];
        })
      : [];

  // `?code=`는 외부 입력이라 **보유·관심 목록에 있고 자료를 뽑을 수 있는 종목**만 통과시킨다.
  // 미지정이면 첫 종목을 기본 선택 — 빈 화면으로 시작하지 않게 한다.
  const selectable = stockOptions.filter((option) => option.supported);
  const selected =
    selectable.find((option) => option.symbolCode === code)?.symbolCode ??
    selectable[0]?.symbolCode ??
    null;

  const [disclosures, news, earnings, tradeStats] = await Promise.all([
    getDisclosureBoard(email).catch((err) => {
      console.error("[FeedsPage] getDisclosureBoard failed:", err);
      return [];
    }),
    getNewsBoard(email).catch((err) => {
      console.error("[FeedsPage] getNewsBoard failed:", err);
      return [];
    }),
    getEarningsBoard(email).catch((err) => {
      console.error("[FeedsPage] getEarningsBoard failed:", err);
      return [];
    }),
    getTradeStatsView().catch((err) => {
      console.error("[FeedsPage] getTradeStatsView failed:", err);
      return null;
    }),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>뉴스·공시</h1>
        </header>

        <FeedTabsClient
          disclosures={disclosures}
          news={news}
          earnings={earnings}
          earningsFocus={
            activeTab === "earnings" ? (
              <EarningsFocusPanel options={stockOptions} selected={selected} />
            ) : null
          }
          tradeStats={tradeStats}
          activeTab={activeTab}
        />
      </div>
    </main>
  );
}
