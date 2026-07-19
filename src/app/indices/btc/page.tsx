import type { Metadata } from "next";
import { BtcDetailSection } from "@/components/indices/BtcDetailSection";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatKstDateTime } from "@/lib/format/datetime";
import { getMarketDetails, type StoredMarketDetail } from "@/lib/market/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "비트코인 — jusik",
  description: "비트코인 시세 상세 (업비트 원화·달러, 최근 7일 차트·일별 시세)",
};

export default async function BtcDetailPage() {
  await ensureAllowedSession();

  let krw: StoredMarketDetail | null = null;
  let usd: StoredMarketDetail | null = null;

  try {
    [krw, usd] = await getMarketDetails(["btcKrw", "btcUsd"]);
  } catch (error) {
    console.error("[BtcDetailPage] getMarketDetails failed:", error);
  }

  const fetchedAts = [krw?.fetchedAt, usd?.fetchedAt]
    .filter((at): at is string => typeof at === "string");
  // 「마지막 갱신」은 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다
  const oldestFetchedAt = fetchedAts.sort()[0] ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          {oldestFetchedAt !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(oldestFetchedAt)}
            </span>
          ) : null}
        </header>

        <BtcDetailSection krw={krw} usd={usd} />

        <footer className={styles.footer}>
          <p className={styles.notice}>
            비트코인 시세는 업비트 원화(KRW-BTC)·USDT(USDT-BTC) 마켓 기준이며,
            달러 표기는 USDT 시세입니다. 갱신은 평일 09:00~18:15(KST)에만
            이루어지므로 24시간 거래 특성상 주말·야간에는 마지막 갱신 시점의
            시세로 표시됩니다. 일봉 기준일 경계는 KST 09:00입니다.
          </p>
          {oldestFetchedAt !== null ? (
            <p className={styles.asOf}>
              마지막 갱신 (KST): {formatKstDateTime(oldestFetchedAt)}
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
