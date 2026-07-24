import type { FinancialAccountRow } from "@/lib/analysis/financials";
import styles from "./FinancialSection.module.css";

/**
 * 종목분석 재무 표 한 절(재무상태표·손익계산서·재무지표 등) — Phase 64.
 * 계정명 열 sticky + 연도별 값 열(우측 정렬)로 가로 스크롤한다. 재무제표·재무지표
 * 공용이며 값 포맷(억/조 vs 지표 비율)만 `format`으로 주입받는다.
 */
export function FinancialSection({
  title,
  years,
  rows,
  format,
  unitNote,
}: {
  title: string;
  years: string[];
  rows: FinancialAccountRow[];
  format: (value: number) => string;
  unitNote?: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {unitNote !== undefined ? (
          <span className={styles.unit}>{unitNote}</span>
        ) : null}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.nameHead} scope="col">
                계정
              </th>
              {years.map((year) => (
                <th key={year} className={styles.numHead} scope="col">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th className={styles.nameCell} scope="row">
                  {row.name}
                </th>
                {years.map((year) => {
                  const value = row.values[year];
                  return (
                    <td key={year} className={`${styles.numCell} numeric`}>
                      {value === undefined ? "-" : format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
