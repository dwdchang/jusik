import Link from "next/link";
import type { TodayFeedCounts } from "@/lib/feeds/homeFeed";
import styles from "./FeedSummaryCard.module.css";

/**
 * 홈 "새 소식" 카드 (Phase 17-2b, plan.md §17.8) — 그리드 요약 카드.
 * 골격은 SummaryCard와 동일, 내용은 소스별 오늘 업로드 건수 3줄.
 * 카드 전체가 상세 게시판 페이지(/feeds)로 가는 링크.
 * 뉴스·수출입은 백엔드(17-3/17-4) 준비 전이라 건수 대신 "준비 중" 표기.
 */

const ROWS: ReadonlyArray<{ key: keyof TodayFeedCounts; label: string }> = [
  { key: "disclosures", label: "공시" },
  { key: "news", label: "뉴스" },
  { key: "trade", label: "수출입" },
];

export function FeedSummaryCard({ counts }: { counts: TodayFeedCounts }) {
  return (
    <Link href="/feeds" className={styles.card}>
      <h2 className={styles.title}>새 소식</h2>
      <ul className={styles.list}>
        {ROWS.map((row) => {
          const value = counts[row.key];
          return (
            <li key={row.key} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              {value !== null ? (
                <span className={`${styles.count} numeric`}>{value}건</span>
              ) : (
                <span className={styles.pending}>준비 중</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.footnote}>오늘 업로드 · 보유·관심종목 기준</p>
    </Link>
  );
}
