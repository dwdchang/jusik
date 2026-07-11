import Link from "next/link";
import { formatChangeRate } from "@/lib/format/change";
import { formatMonthDisplay } from "@/lib/hotstocks/months";
import type { HotStocksCardSummary } from "@/lib/hotstocks/summary";
import { resolveDirection } from "@/lib/indices/kisMapper";
import styles from "./HotStocksCard.module.css";

/**
 * 홈 "핫종목" 카드 (7번째) — 최근 1개월 수익률 TOP 3 미리보기 (plan.md §14.5).
 * 매월 첫 평일에만 갱신되는 랭킹이라 staleness 배지 대신
 * 기준월이 밀렸을 때만 "갱신 지연" 안내 텍스트를 표시한다.
 */
export function HotStocksCard({
  summary,
}: {
  summary: HotStocksCardSummary | null;
}) {
  return (
    <Link href="/hot-stocks" className={styles.card}>
      <h2 className={styles.title}>핫종목</h2>
      {summary !== null && summary.top3.length > 0 ? (
        <>
          <ol className={styles.list}>
            {summary.top3.map((entry) => (
              <li key={entry.code} className={styles.row}>
                <span className={`${styles.rank} numeric`}>{entry.rank}</span>
                <span className={styles.name}>{entry.name}</span>
                <span
                  className={`${styles.rate} numeric ${
                    styles[resolveDirection(entry.returnRate)]
                  }`}
                >
                  {formatChangeRate(entry.returnRate)}
                </span>
              </li>
            ))}
          </ol>
          {summary.staleNotice ? (
            <p className={styles.staleNotice}>
              갱신 지연 — 최신 기준월이 아직 반영되지 않았습니다
            </p>
          ) : null}
          <p className={styles.footnote}>
            최근 1개월 TOP 3 · 기준: {formatMonthDisplay(summary.computedFor)}{" "}
            월말
          </p>
        </>
      ) : (
        <p className={styles.placeholder}>매월 첫 평일 갱신</p>
      )}
    </Link>
  );
}
