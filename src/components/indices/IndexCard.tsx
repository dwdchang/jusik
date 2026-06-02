import { formatBasDtDisplay } from "@/lib/format/basDt";
import { formatChange } from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import type { IndexSnapshot } from "@/types/indices";
import styles from "./IndexCard.module.css";

export function IndexCard({ snapshot }: { snapshot: IndexSnapshot }) {
  const directionClass = styles[snapshot.direction];

  return (
    <article className={styles.card}>
      <h2 className={styles.name}>{snapshot.name}</h2>
      <p className={`${styles.close} numeric`}>{formatIndex(snapshot.close)}</p>
      <p className={`${styles.change} numeric ${directionClass}`}>
        {formatChange(snapshot.changeAmount, snapshot.changeRate)}
      </p>
      <p className={styles.basDt}>
        기준일 {formatBasDtDisplay(snapshot.basDt)}
      </p>
    </article>
  );
}
