import Link from "next/link";
import { formatChangeRate } from "@/lib/format/change";
import { resolveDirection } from "@/lib/indices/kisMapper";
import type { StalenessLevel } from "@/lib/market/staleness";
import type {
  MyStocksCardEntry,
  MyStocksCardSummary,
} from "@/lib/stocks/myStocksCard";
import { STALENESS_LABELS } from "./SummaryCard";
import styles from "./MyStocksCard.module.css";

/**
 * 홈 "내 종목" 카드 — 보유 4종목(왼쪽) · 관심 4종목(오른쪽) 2열, 제목 우측에
 * 보유 전체 수익률·전일 대비 등락률 (§67에서 관심 전용 카드를 대체).
 *
 * 라벨 텍스트(「보유」·「관심」·「전체 수익률」)는 두지 않는다 — 좌/우 위치와
 * 글자 크기(수익률 크게 · 전일 대비 작게)만으로 구분한다(사용자 확정). 시각 라벨이
 * 없는 만큼 스크린리더용 텍스트(`aria-label`·`.srOnly`)는 반드시 남긴다.
 *
 * 카드가 홈 그리드에서 전폭을 쓰는 이유는 §67 폭 계산 참조 — 2열로 쪼개면
 * 기존 반폭(열당 94px)에서는 종목명이 잘린다.
 * staleness 배지는 SummaryCard와 동일 정책(§11.10-B2) — 홈에서 판정값을 받는다.
 */
export function MyStocksCard({
  summary,
  staleness,
}: {
  summary: MyStocksCardSummary | null;
  staleness: StalenessLevel | null;
}) {
  return (
    <Link href="/stocks" className={styles.card}>
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

      <div className={styles.titleRow}>
        <h2 className={styles.title}>내 종목</h2>
        {summary !== null && summary.totalReturnRate !== null ? (
          <span className={styles.totals}>
            <span
              className={`${styles.rate} numeric ${
                styles[resolveDirection(summary.totalReturnRate)]
              }`}
            >
              <span className={styles.srOnly}>보유 전체 수익률 </span>
              {formatChangeRate(summary.totalReturnRate)}
            </span>
            {summary.totalDailyChangeRate !== null ? (
              <span
                className={`${styles.daily} numeric ${
                  styles[resolveDirection(summary.totalDailyChangeRate)]
                }`}
              >
                <span className={styles.srOnly}>보유 전체 전일 대비 </span>
                {formatChangeRate(summary.totalDailyChangeRate)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {summary === null ||
      (summary.holdings.length === 0 && summary.watches.length === 0) ? (
        <p className={styles.placeholder}>종목을 등록해보세요</p>
      ) : (
        <div className={styles.columns}>
          <StockColumn label="보유종목" entries={summary.holdings} />
          <StockColumn label="관심종목" entries={summary.watches} />
        </div>
      )}
    </Link>
  );
}

/**
 * 한쪽이 비어도 열 자체는 남긴다 — 열을 없애면 나머지 4행이 보유인지 관심인지
 * 위치로 구분할 수 없다. 문구는 목록과 같은 「종목을 등록해보세요」(이름 미포함).
 */
function StockColumn({
  label,
  entries,
}: {
  label: string;
  entries: MyStocksCardEntry[];
}) {
  if (entries.length === 0) {
    return <p className={styles.columnPlaceholder}>종목을 등록해보세요</p>;
  }

  return (
    <ol className={styles.list} aria-label={label}>
      {entries.map((entry) => (
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
  );
}
