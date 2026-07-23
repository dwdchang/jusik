import Link from "next/link";
import { formatChangeRate } from "@/lib/format/change";
import type { DailyHotCardSummary } from "@/lib/hotstocks/dailyCard";
import { resolveDirection } from "@/lib/indices/kisMapper";
import { resolveStaleness } from "@/lib/market/staleness";
import styles from "./HotStocksCard.module.css";

/**
 * 홈 "핫종목" 카드 (7번째) — 당일 등락률 상위 4종목 미리보기 (§17.12, §33).
 * 장중 시세 갱신 잡이 저장한 당일 등락률 스냅샷을 읽으며, 카드를 누르면
 * 기본 탭이 "당일 등락률"인 핫종목 페이지로 이동한다.
 */
export function HotStocksCard({
  summary,
  suppressStale = false,
}: {
  summary: DailyHotCardSummary | null;
  /** 홈 전반 갱신 지연(인시던트) 시 개별 배지 억제 — 헤더 상태 표시로 통합 (§52) */
  suppressStale?: boolean;
}) {
  const stale =
    summary !== null && !suppressStale
      ? resolveStaleness(summary.fetchedAt)
      : null;

  return (
    <Link href="/hot-stocks" className={styles.card}>
      <h2 className={styles.title}>핫종목</h2>
      {summary !== null && summary.top4.length > 0 ? (
        <>
          <ol className={styles.list}>
            {summary.top4.map((item) => (
              <li key={item.code} className={styles.row}>
                <span className={`${styles.rank} numeric`}>{item.rank}</span>
                <span className={styles.name}>{item.name}</span>
                <span
                  className={`${styles.rate} numeric ${
                    styles[resolveDirection(item.changeRate)]
                  }`}
                >
                  {formatChangeRate(item.changeRate)}
                </span>
              </li>
            ))}
          </ol>
          {stale !== null ? (
            <p className={styles.staleNotice}>갱신 지연 — 마지막 갱신 기준</p>
          ) : null}
        </>
      ) : (
        <p className={styles.placeholder}>장중 갱신 회차에 채워집니다</p>
      )}
    </Link>
  );
}
