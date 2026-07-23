import { formatChange } from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import { formatEokFromMillion, formatSharesKo } from "@/lib/format/krw";
import type { IndexDailyRow } from "@/types/indices";
import styles from "./IndexDailyTable.module.css";

/**
 * 국내 지수 일별 시세 표 (Phase 50) — 종가·전일 대비 + 거래량(천주)·거래대금(백만원).
 * 거래량은 만주/억주, 거래대금은 조/억원으로 표시한다. 값이 길어 가로 스크롤하며
 * 날짜 열은 스크롤 시 고정(AGENTS.md — 넓은 표는 자체 컨테이너에서 스크롤).
 */
export function IndexDailyTable({ rows }: { rows: IndexDailyRow[] }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.dateHead} scope="col">
              날짜
            </th>
            <th className={styles.numHead} scope="col">
              종가
            </th>
            <th className={styles.numHead} scope="col">
              전일 대비
            </th>
            <th className={styles.numHead} scope="col">
              거래량
            </th>
            <th className={styles.numHead} scope="col">
              거래대금
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.basDt}>
              <th className={styles.dateCell} scope="row">
                {row.date}
              </th>
              <td className={`${styles.num} numeric`}>
                {formatIndex(row.close)}
              </td>
              <td
                className={`${styles.num} numeric ${styles[row.direction]}`}
              >
                {formatChange(row.changeAmount, row.changeRate)}
              </td>
              <td className={`${styles.num} numeric`}>
                {row.volume === undefined ? "—" : formatSharesKo(row.volume * 1000)}
              </td>
              <td className={`${styles.num} numeric`}>
                {row.tradingValue === undefined
                  ? "—"
                  : formatEokFromMillion(row.tradingValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
