import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedTabsClient } from "@/components/feeds/FeedTabsClient";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getDisclosureBoard, getNewsBoard } from "@/lib/feeds/homeFeed";
import { getTradeStatsView } from "@/lib/feeds/tradeStats";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "뉴스·공시 — jusik",
  description: "보유·관심종목의 뉴스·공시·수출입 통합 피드",
};

/**
 * 뉴스·공시 상세 페이지 (Phase 17-2b, plan.md §17.8) — 홈 요약 카드에서 이동.
 * 17-2에서 홈 전체폭에 있던 탭+게시판+아코디언(FeedTabsClient)을 위치만 이 페이지로 옮겼다.
 * 데이터·컴포넌트는 무변경 재사용, 페이지는 세션 가드와 헤더만 담당한다.
 */
export default async function FeedsPage() {
  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const [disclosures, news, tradeStats] = await Promise.all([
    getDisclosureBoard(email).catch((err) => {
      console.error("[FeedsPage] getDisclosureBoard failed:", err);
      return [];
    }),
    getNewsBoard(email).catch((err) => {
      console.error("[FeedsPage] getNewsBoard failed:", err);
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
          tradeStats={tradeStats}
        />
      </div>
    </main>
  );
}
