import { QuoteElapsed } from "./QuoteElapsed";
import styles from "./QuotePending.module.css";

/**
 * 시세 대기 자리표시자 — Phase 78.
 *
 * 종목분석 상세는 재무(DART, 1초)와 시세(금융위, 5~15초)를 병렬로 읽는데, 예전에는 둘 다
 * 끝나야 화면이 나왔다. 이제 시세 의존 블록만 `<Suspense>`로 감싸 재무 차트를 먼저
 * 내보내고, 그 자리를 이 컴포넌트들이 지킨다 (plan.md §78).
 *
 * 실제 블록과 **같은 자리에 같은 크기로** 그려야 시세 도착 시 화면이 튀지 않는다
 * (`PageSkeleton`과 같은 방침). 경과 시간은 맨 위 투자지표 자리에만 붙인다 — 블록마다
 * 반복하면 같은 말이 세 번 뜬다.
 */

/** 투자지표 15칸 자리 — 유일하게 경과 시간을 함께 보여주는 블록 */
export function InvestmentIndicatorsPending() {
  return (
    <section className={styles.section} role="status" aria-busy="true">
      <div className={styles.head}>
        <h2 className={styles.title}>투자지표</h2>
        <span className={styles.status}>
          시세 불러오는 중
          <QuoteElapsed />
        </span>
      </div>
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 15 }, (_, index) => (
          <div key={index} className={styles.cell}>
            <div className={styles.cellLabel} />
            <div className={styles.cellValue} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 시세 의존 차트(주가 변동률·배당금&시가배당률) 자리 */
export function QuoteChartsPending() {
  return (
    <div className={styles.stack} aria-hidden="true">
      <div className={`${styles.card} ${styles.cardShort}`} />
      <div className={styles.card} />
    </div>
  );
}

/** 주요 재무지표 표 자리 — PER·PBR 행이 시세에 걸려 표 전체가 시세를 기다린다 */
export function KeyMetricsTablePending() {
  return (
    <section className={styles.section} aria-hidden="true">
      <div className={styles.head}>
        <h2 className={styles.title}>주요 재무지표</h2>
      </div>
      <div className={styles.rows}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={styles.row}>
            <div className={styles.rowLabel} />
            <div className={styles.rowValue} />
          </div>
        ))}
      </div>
    </section>
  );
}
