import Link from "next/link";
import type { TodayFeedCounts } from "@/lib/feeds/homeFeed";
import styles from "./FeedSummaryCard.module.css";

/**
 * 홈 "뉴스·공시" 카드 (Phase 17-2b, plan.md §17.8) — 그리드 요약 카드.
 * 골격은 SummaryCard와 동일, 내용은 소스별 오늘 업로드 건수.
 * 카드 전체가 상세 게시판 페이지(/feeds)로 가는 링크.
 * 수출입은 월간 데이터라 "오늘 N건"에 안 맞아 이 카드에서 제외한다 (§17.13).
 */

const ROWS: ReadonlyArray<{ key: keyof TodayFeedCounts; label: string }> = [
  { key: "disclosures", label: "공시" },
  { key: "news", label: "뉴스" },
];

export function FeedSummaryCard({ counts }: { counts: TodayFeedCounts }) {
  return (
    <Link href="/feeds" className={styles.card}>
      <h2 className={styles.title}>뉴스·공시</h2>
      <ul className={styles.list}>
        {ROWS.map((row) => (
          <li key={row.key} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span className={`${styles.count} numeric`}>{counts[row.key]}건</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
