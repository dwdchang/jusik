import type { Metadata } from "next";
import Link from "next/link";
import { IndexChartClient } from "@/components/indices/IndexChartClient";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import { formatChange } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatIndex } from "@/lib/format/index";
import {
  getMarketDetails,
  type MarketDetailKey,
  type StoredMarketDetail,
} from "@/lib/market/store";
import { KIS_DATA_NOTICE } from "@/types/indices";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "시장 — jusik",
  description: "원/달러 환율 · 미국 10년물 금리 · 국제유가 WTI 요약",
};

/** 미니 카드 3종 — 각 개별 상세 페이지로 링크 (plan.md §15.2) */
const MARKET_ITEMS: Array<{ key: MarketDetailKey; href: string }> = [
  { key: "usdkrw", href: "/indices/usdkrw" },
  { key: "us10y", href: "/indices/us10y" },
  { key: "oil", href: "/indices/oil" },
];

export default async function MarketOverviewPage() {
  await ensureAllowedSession();

  let rows: Array<StoredMarketDetail | null>;

  try {
    rows = await getMarketDetails(MARKET_ITEMS.map((item) => item.key));
  } catch (error) {
    console.error("[MarketOverviewPage] getMarketDetails failed:", error);
    rows = MARKET_ITEMS.map(() => null);
  }

  const fetchedAts = rows
    .map((row) => row?.fetchedAt)
    .filter((at): at is string => typeof at === "string");
  // 「마지막 갱신」은 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다
  const oldestFetchedAt = fetchedAts.sort()[0] ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>시장</h1>
          {oldestFetchedAt !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(oldestFetchedAt)}
            </span>
          ) : null}
        </header>

        <section className={styles.cards} aria-label="시장 지표 3종">
          {MARKET_ITEMS.map((item, i) => {
            const stored = rows[i];

            if (stored === null) {
              return (
                <article key={item.key} className={styles.card}>
                  <p className={styles.emptyNotice}>
                    아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일
                    09:00~18:15 KST)에 반영됩니다.
                  </p>
                </article>
              );
            }

            const { snapshot } = stored;

            return (
              <article key={item.key} className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <Link href={item.href} className={styles.cardLink}>
                        {snapshot.name}
                      </Link>
                    </h2>
                    <p className={styles.basDt}>
                      기준일 {formatBasDtDisplay(snapshot.basDt)}
                    </p>
                  </div>
                  <div className={styles.cardValues}>
                    <p className={`${styles.value} numeric`}>
                      {formatIndex(snapshot.close)}
                    </p>
                    <p
                      className={`${styles.change} numeric ${
                        styles[snapshot.direction]
                      }`}
                    >
                      {formatChange(snapshot.changeAmount, snapshot.changeRate)}
                    </p>
                  </div>
                </div>
                <IndexChartClient series={stored.history} />
                <Link href={item.href} className={styles.detailLink}>
                  일별 시세 보기 →
                </Link>
              </article>
            );
          })}
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            {KIS_DATA_NOTICE} 유가는 WTI 서부텍사스산 근월물 기준(USD/배럴)
            입니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
