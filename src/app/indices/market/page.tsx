import type { Metadata } from "next";
import { BtcChartClient } from "@/components/indices/BtcChartClient";
import { IndexChartClient } from "@/components/indices/IndexChartClient";
import { IndexDailyList } from "@/components/indices/IndexDailyList";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import { formatBtcChange, formatBtcValue } from "@/lib/format/btc";
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
  description: "미국 10년물 금리 · 국제유가 WTI · 금 현물(국제) · 비트코인",
};

/** 미니 카드 3종 (plan.md §15.2, §28 원/달러 분리, §30 금 추가, §31 개별 상세 제거) */
const MARKET_ITEMS: MarketDetailKey[] = ["us10y", "oil", "gold"];

export default async function MarketOverviewPage() {
  await ensureAllowedSession();

  let rows: Array<StoredMarketDetail | null>;

  try {
    rows = await getMarketDetails([...MARKET_ITEMS, "btcKrw", "btcUsd"]);
  } catch (error) {
    console.error("[MarketOverviewPage] getMarketDetails failed:", error);
    rows = [...MARKET_ITEMS.map(() => null), null, null];
  }

  const btcKrw = rows[MARKET_ITEMS.length];
  const btcUsd = rows[MARKET_ITEMS.length + 1];

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

        <section className={styles.cards} aria-label="시장 지표 4종">
          {MARKET_ITEMS.map((itemKey, i) => {
            const stored = rows[i];

            if (stored === null) {
              return (
                <article key={itemKey} className={styles.card}>
                  <p className={styles.emptyNotice}>
                    아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일
                    09:00~18:15 KST)에 반영됩니다.
                  </p>
                </article>
              );
            }

            const { snapshot } = stored;

            return (
              <article key={itemKey} className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.cardTitle}>{snapshot.name}</h2>
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
                <details className={styles.dailyDetails}>
                  <summary className={styles.dailyToggle}>
                    일별 기록
                    <span className={styles.chevron} aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <IndexDailyList rows={stored.dailyRows} />
                </details>
              </article>
            );
          })}

          <article className={styles.card} aria-label="비트코인">
            {btcKrw === null ? (
              <p className={styles.emptyNotice}>
                아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일 09:00~18:15
                KST)에 반영됩니다.
              </p>
            ) : (
              <>
                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.cardTitle}>비트코인</h2>
                    <p className={styles.basDt}>
                      기준일 {formatBasDtDisplay(btcKrw.snapshot.basDt)}
                    </p>
                  </div>
                  <div className={styles.cardValues}>
                    <p className={`${styles.value} numeric`}>
                      {formatBtcValue(btcKrw.snapshot.close, "KRW")}
                    </p>
                    <p
                      className={`${styles.change} numeric ${
                        styles[btcKrw.snapshot.direction]
                      }`}
                    >
                      {formatBtcChange(
                        btcKrw.snapshot.changeAmount,
                        btcKrw.snapshot.changeRate,
                        "KRW"
                      )}
                    </p>
                    {btcUsd !== null ? (
                      <p className={`${styles.subValue} numeric`}>
                        {formatBtcValue(btcUsd.snapshot.close, "USD")} USD{" "}
                        <span className={styles[btcUsd.snapshot.direction]}>
                          {formatBtcChange(
                            btcUsd.snapshot.changeAmount,
                            btcUsd.snapshot.changeRate,
                            "USD"
                          )}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <BtcChartClient series={btcKrw.history} currency="KRW" />
                <details className={styles.dailyDetails}>
                  <summary className={styles.dailyToggle}>
                    일별 기록
                    <span className={styles.chevron} aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <ol className={styles.dailyList}>
                    {btcKrw.dailyRows.map((row) => (
                      <li key={row.basDt} className={styles.dailyRow}>
                        <span className={styles.dailyDate}>{row.date}</span>
                        <span className={`${styles.dailyClose} numeric`}>
                          {formatBtcValue(row.close, "KRW")}
                        </span>
                        <span
                          className={`${styles.dailyChange} numeric ${
                            styles[row.direction]
                          }`}
                        >
                          {formatBtcChange(
                            row.changeAmount,
                            row.changeRate,
                            "KRW"
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )}
          </article>
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            {KIS_DATA_NOTICE} 유가는 WTI 서부텍사스산 근월물 기준(USD/배럴),
            금은 LBMA 런던 금 현물 기준(USD/트로이온스)입니다. 비트코인은
            업비트 원화(KRW-BTC)·USDT(USDT-BTC) 마켓 시세이며 갱신은 평일
            09:00~18:15(KST)에만 이루어집니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
