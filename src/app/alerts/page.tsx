import type { Metadata } from "next";
import { PushSubscriptionManager } from "@/components/alerts/PushSubscriptionManager";
import {
  StockAlertToggles,
  type StockAlertItem,
} from "@/components/alerts/StockAlertToggles";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { getMutedSymbols } from "@/lib/alerts/store";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getHoldings } from "@/lib/holdings/store";
import { getPushSubscriptions } from "@/lib/push/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "알림 설정 — jusik",
  description: "웹 푸시 알림 구독 관리",
};

/**
 * 알림 설정 화면 — 햄버거 메뉴에서 진입.
 * 기기별 푸시 구독 등록·해지·테스트 발송(1단계) + 보유종목별 알림 on/off(2단계).
 * 시세 알림 판정·발송은 시세 갱신 잡(evaluateAlertsHook → lib/alerts/evaluate.ts)이 수행한다.
 */
export default async function AlertsPage() {
  const session = await ensureAllowedSession();
  const email = session.user?.email ?? "";

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";

  let deviceCount = 0;
  let storeError = false;
  try {
    deviceCount = (await getPushSubscriptions(email)).length;
  } catch (error) {
    console.error("[AlertsPage] getPushSubscriptions failed:", error);
    storeError = true;
  }

  let stockItems: StockAlertItem[] = [];
  let stockError = false;
  try {
    const [holdings, muted] = await Promise.all([
      getHoldings(email),
      getMutedSymbols(email),
    ]);
    const mutedSet = new Set(muted);
    stockItems = holdings.map((holding) => ({
      symbolCode: holding.symbolCode,
      name: holding.name,
      enabled: !mutedSet.has(holding.symbolCode),
    }));
  } catch (error) {
    console.error("[AlertsPage] stock alert prefs load failed:", error);
    stockError = true;
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>알림 설정</h1>
        </header>

        <p className={styles.description}>
          보유종목 급락·공시 알림을 웹 푸시로 받습니다. 기기(브라우저)마다
          한 번씩 켜 주세요.
        </p>

        <section className={styles.card}>
          {vapidPublicKey === "" ? (
            <p className={styles.error} role="alert">
              서버에 VAPID 키가 설정되어 있지 않아 알림을 사용할 수 없습니다.
            </p>
          ) : (
            <PushSubscriptionManager vapidPublicKey={vapidPublicKey} />
          )}
        </section>

        <section className={styles.card}>
          <p className={styles.cardTitle}>종목별 알림</p>
          {stockError ? (
            <p className={styles.error} role="alert">
              종목별 알림 설정을 불러오지 못했습니다.
            </p>
          ) : stockItems.length === 0 ? (
            <p className={styles.cardBody}>
              보유종목이 없습니다. 보유종목을 등록하면 종목별로 알림을 켜고 끌
              수 있습니다.
            </p>
          ) : (
            <StockAlertToggles items={stockItems} />
          )}
        </section>

        <section className={styles.card}>
          <p className={styles.cardTitle}>등록된 기기</p>
          {storeError ? (
            <p className={styles.error} role="alert">
              구독 정보를 불러오지 못했습니다.
            </p>
          ) : (
            <p className={styles.cardBody}>
              <span className="numeric">{deviceCount}</span>개 기기가 알림을
              받도록 등록되어 있습니다.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
