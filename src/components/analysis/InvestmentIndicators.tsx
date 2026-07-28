import type { InvestmentIndicator } from "@/lib/analysis/view";
import styles from "./InvestmentIndicators.module.css";

/**
 * 투자지표 카드 — Phase 72. 3열 그리드에 숫자를 크게 세운다(모바일 폭 480px 기준
 * 한 칸 ≈ 145px). 값은 `lib/analysis/view.ts`에서 이미 문자열로 포맷돼 온다.
 */
export function InvestmentIndicators({
  indicators,
  basisDate,
}: {
  indicators: InvestmentIndicator[];
  /** 시세 기준일 "YYYY-MM-DD" — 없으면 각주를 생략한다 */
  basisDate: string | null;
}) {
  if (indicators.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>투자지표</h2>
        {basisDate !== null ? (
          <span className={styles.basis}>{basisDate} 종가 기준</span>
        ) : null}
      </div>
      <dl className={styles.grid}>
        {indicators.map((indicator) => (
          <div key={indicator.label} className={styles.cell}>
            <dt className={styles.label}>{indicator.label}</dt>
            <dd className={`${styles.value} numeric`}>{indicator.value}</dd>
            {indicator.note !== undefined ? (
              <dd className={styles.note}>{indicator.note}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
