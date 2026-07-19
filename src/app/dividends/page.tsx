import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getDividendSchedule } from "@/lib/dividends/summary";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatKrw } from "@/lib/format/krw";
import { getLastRefreshRecord } from "@/lib/market/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "배당 일정 — jusik",
  description: "보유종목의 확정 배당 기준일·지급일·예상 지급액",
};

/** "YYYY-MM-DD" → "YYYY.MM.DD" 표시 */
function displayDate(isoDate: string): string {
  return isoDate.replaceAll("-", ".");
}

/**
 * 배당 일정 상세 페이지 — Phase 25 (plan.md §25). 홈 "배당 일정" 카드에서 이동.
 * 보유종목만 대상(관심종목 제외 — 사용자 확정). 시세 잡이 저장한 확정 배당
 * 회차를 한 줄씩 나열하며, 예상 지급액은 현재 보유수량 기준·세전 금액이다.
 */
export default async function DividendsPage() {
  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const [rows, lastRefresh] = await Promise.all([
    getDividendSchedule(email).catch((err): [] => {
      console.error("[DividendsPage] getDividendSchedule failed:", err);
      return [];
    }),
    getLastRefreshRecord().catch(() => null),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>배당 일정</h1>
          {lastRefresh !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(lastRefresh.at)}
            </span>
          ) : null}
        </header>

        <section className={styles.section} aria-label="배당 일정 목록">
          <h2 className={styles.sectionTitle}>
            보유종목 확정 배당 ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <p className={styles.emptyNotice}>
              표시할 배당 일정이 없습니다. 보유종목의 확정 배당(최근 1년)이
              다음 갱신 회차에 수집되면 여기에 표시됩니다.{" "}
              <Link href="/holdings" className={styles.emptyLink}>
                보유종목 관리 →
              </Link>
            </p>
          ) : (
            <ul className={styles.itemList}>
              {rows.map((row) => (
                <li
                  key={`${row.symbolCode}-${row.recordDate}`}
                  className={styles.item}
                >
                  <div className={styles.itemHead}>
                    <Link
                      href={`/holdings/${row.symbolCode}`}
                      className={styles.itemName}
                    >
                      {row.name}
                      <span className={`${styles.itemCode} numeric`}>
                        {row.symbolCode}
                      </span>
                    </Link>
                    <span className={`${styles.itemAmount} numeric`}>
                      예상 {formatKrw(row.expectedAmount)}
                    </span>
                  </div>
                  <p className={`${styles.itemMeta} numeric`}>
                    {row.kind !== null ? `${row.kind} · ` : ""}기준일{" "}
                    {displayDate(row.recordDate)} · 지급일{" "}
                    {row.payDate !== null ? (
                      displayDate(row.payDate)
                    ) : (
                      <span className={styles.payPending}>미정</span>
                    )}{" "}
                    · 주당 {formatKrw(row.amountPerShare)} × {row.quantity}주
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            예상 지급액은 <strong>현재 보유수량 기준</strong>입니다 — 실제 수령
            자격은 배당 기준일 시점 보유 여부로 결정되며, 수량 변경 이력은
            반영되지 않습니다. 금액은 <strong>세전</strong>(배당소득세 15.4%
            원천징수 전) 기준입니다. 지급일이 미정인 회차는 공시로 확정되면
            자동으로 채워집니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
