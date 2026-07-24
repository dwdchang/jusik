import Link from "next/link";
import { formatChangeRate } from "@/lib/format/change";
import { resolveDirection } from "@/lib/indices/kisMapper";
import type { StalenessLevel } from "@/lib/market/staleness";
import type { WatchlistCardSummary } from "@/lib/watchlist/summary";
import { STALENESS_LABELS } from "./SummaryCard";
import styles from "./WatchlistCard.module.css";

/**
 * 홈 "관심종목" 카드 — 수익률 상위 4종목 개별 표시 (§24, §33에서 4행 통일).
 * 행마다 등록 기준일 대비 수익률을 메인으로, 그 뒤에 전일 대비 등락률을
 * 한 단계 작은 글자로 함께 표시한다(§35에서 괄호 제거).
 * 기준가 확정 전 종목은 수익률 자리에 「-」.
 * staleness 배지는 SummaryCard와 동일 정책(§11.10-B2) — 홈에서 판정값을 받는다.
 */
export function WatchlistCard({
  summary,
  staleness,
}: {
  summary: WatchlistCardSummary | null;
  staleness: StalenessLevel | null;
}) {
  return (
    <Link href="/watchlist" className={styles.card}>
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
      {/* 카드 제목은 §57에서 "관심종목"→"내 종목" — 이동 대상 화면(/watchlist)이
          보유·관심을 함께 담는 3탭 화면이 됐다. 카드 본문은 여전히 관심종목
          수익률 상위 4종목(보유는 별도 카드) */}
      <h2 className={styles.title}>내 종목</h2>
      {summary !== null && summary.top4.length > 0 ? (
        <>
          <ol className={styles.list}>
            {summary.top4.map((entry) => (
              <li key={entry.symbolCode} className={styles.row}>
                <span className={styles.name}>{entry.name}</span>
                <span
                  className={`${styles.rate} numeric ${
                    entry.returnRate !== null
                      ? styles[resolveDirection(entry.returnRate)]
                      : styles.pending
                  }`}
                >
                  {entry.returnRate !== null
                    ? formatChangeRate(entry.returnRate)
                    : "-"}
                </span>
                {entry.dailyChangeRate !== null ? (
                  <span
                    className={`${styles.daily} numeric ${
                      styles[resolveDirection(entry.dailyChangeRate)]
                    }`}
                  >
                    {formatChangeRate(entry.dailyChangeRate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={styles.placeholder}>종목을 등록해보세요</p>
      )}
    </Link>
  );
}
