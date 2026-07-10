import { formatChange } from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import type { IndexDailyRow } from "@/types/indices";
import styles from "./IndexDailyList.module.css";

export function IndexDailyList({ rows }: { rows: IndexDailyRow[] }) {
  return (
    <ol className={styles.list}>
      {rows.map((row) => (
        <li key={row.basDt} className={styles.row}>
          <span className={styles.date}>{row.date}</span>
          <span className={`${styles.close} numeric`}>
            {formatIndex(row.close)}
          </span>
          <span
            className={`${styles.change} numeric ${styles[row.direction]}`}
          >
            {formatChange(row.changeAmount, row.changeRate)}
          </span>
        </li>
      ))}
    </ol>
  );
}
