import { formatEokFromMillion } from "@/lib/format/krw";
import type { InvestorFlowRow } from "@/types/indices";
import styles from "./InvestorFlowTable.module.css";

/** 표 열 구성 — 개인·외국인·기관계 + 기관 세부 7종 (순매수 금액, 백만원) */
const COLUMNS: Array<{ key: keyof InvestorFlowRow; label: string }> = [
  { key: "individual", label: "개인" },
  { key: "foreign", label: "외국인" },
  { key: "institution", label: "기관계" },
  { key: "finInvest", label: "금융투자" },
  { key: "trust", label: "투신" },
  { key: "privateFund", label: "사모" },
  { key: "bank", label: "은행" },
  { key: "insurance", label: "보험" },
  { key: "merchantBank", label: "종금" },
  { key: "pension", label: "연기금" },
];

function toneClass(value: number): string {
  if (value > 0) {
    return styles.rise;
  }
  if (value < 0) {
    return styles.fall;
  }
  return styles.flat;
}

/**
 * 일별 수급 표 — 시장 전체 투자자 순매수 금액(백만원). 열이 많아 가로 스크롤한다
 * (AGENTS.md — 넓은 표는 자체 컨테이너에서 스크롤). 날짜 열은 스크롤 시 고정.
 */
export function InvestorFlowTable({ rows }: { rows: InvestorFlowRow[] }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.dateHead} scope="col">
              날짜
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} className={styles.numHead} scope="col">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.basDt}>
              <th className={styles.dateCell} scope="row">
                {row.date}
              </th>
              {COLUMNS.map((col) => {
                const value = row[col.key] as number;
                return (
                  <td
                    key={col.key}
                    className={`${styles.num} numeric ${toneClass(value)}`}
                  >
                    {formatEokFromMillion(value, true)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
