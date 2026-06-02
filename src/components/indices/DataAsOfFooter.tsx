import { formatBasDtDisplay } from "@/lib/format/basDt";
import { formatKstDateTime } from "@/lib/format/datetime";
import type { IndexDashboardData } from "@/types/indices";
import styles from "./DataAsOfFooter.module.css";

export function DataAsOfFooter({ data }: { data: IndexDashboardData }) {
  return (
    <footer className={styles.footer}>
      <p className={styles.notice}>{data.dataNotice}</p>
      <p className={styles.asOf}>
        화면 데이터 조회 시각 (KST): {formatKstDateTime(data.asOf)}
      </p>
      <p className={styles.basDt}>
        코스피 기준일 {formatBasDtDisplay(data.kospi.basDt)} · 코스닥 기준일{" "}
        {formatBasDtDisplay(data.kosdaq.basDt)}
      </p>
    </footer>
  );
}
