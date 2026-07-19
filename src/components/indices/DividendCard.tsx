import Link from "next/link";
import type { DividendCardSummary } from "@/lib/dividends/summary";
import { formatKrw } from "@/lib/format/krw";
import type { StalenessLevel } from "@/lib/market/staleness";
import { STALENESS_LABELS } from "./SummaryCard";
import styles from "./DividendCard.module.css";

/** "YYYY-MM-DD" → "MM/DD" — 카드 행 지급일 표기 */
function shortDate(isoDate: string): string {
  return isoDate.slice(5).replace("-", "/");
}

/**
 * 홈 "배당" 카드 — 다가오는 배당 지급일 상위 4행 (Phase 25, §33에서 4행 통일).
 * 보유종목만 대상(관심종목 제외). 행마다 종목명·지급일·주당배당금을 표시하고
 * 카드를 누르면 /dividends 상세로 이동한다.
 * staleness 배지는 SummaryCard와 동일 정책 — 홈에서 판정값을 받는다.
 */
export function DividendCard({
  summary,
  staleness,
}: {
  summary: DividendCardSummary | null;
  staleness: StalenessLevel | null;
}) {
  return (
    <Link href="/dividends" className={styles.card}>
      {staleness !== null ? (
        <span
          className={`${styles.badge} ${
            staleness === "critical" ? styles.badgeCritical : styles.badgeWarn
          }`}
          role="img"
          aria-label={STALENESS_LABELS[staleness]}
          title={STALENESS_LABELS[staleness]}
        >
          !
        </span>
      ) : null}
      <h2 className={styles.title}>배당</h2>
      {summary !== null && summary.upcoming.length > 0 ? (
        <>
          <ol className={styles.list}>
            {summary.upcoming.map((entry) => (
              <li
                key={`${entry.symbolCode}-${entry.payDate}`}
                className={styles.row}
              >
                <span className={styles.name}>{entry.name}</span>
                <span className={`${styles.date} numeric`}>
                  {shortDate(entry.payDate)}
                </span>
                <span className={`${styles.amount} numeric`}>
                  {formatKrw(entry.amountPerShare)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={styles.placeholder}>예정된 배당 지급일이 없습니다</p>
      )}
    </Link>
  );
}
