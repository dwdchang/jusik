import type { Metadata } from "next";
import { VolatilityChartClient } from "@/components/indices/VolatilityChartClient";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { todayKstDate } from "@/lib/date/kst";
import {
  aggregateMonthlyAverages,
  getVolatilityHistory,
} from "@/lib/indices/volatility";
import type {
  KospiVolatilityRecord,
  VolatilityMonthlyPoint,
} from "@/types/indices";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "코스피 변동성 지수 — jusik",
  description: "코스피 일중 변동성 — 최근 6개월 월별 평균 차트 + 당월 일별 기록",
};

export default async function KospiVolatilityPage() {
  await ensureAllowedSession();

  let points: VolatilityMonthlyPoint[];
  let currentMonthRecords: KospiVolatilityRecord[];

  try {
    const records = await getVolatilityHistory();
    points = aggregateMonthlyAverages(records);

    const currentMonth = todayKstDate().slice(0, 7);
    currentMonthRecords = records
      .filter((record) => record.date.startsWith(currentMonth))
      .reverse();
  } catch (error) {
    console.error("[KospiVolatilityPage] getVolatilityHistory failed:", error);

    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <NavIconLink href="/" label="홈으로" icon="home" />
            <h1 className={styles.title}>코스피 변동성 지수</h1>
          </header>
          <p className={styles.errorBanner} role="alert">
            변동성 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>코스피 변동성 지수</h1>
        </header>

        <section className={styles.section} aria-label="월별 평균 변동성">
          {points.length > 0 ? (
            <VolatilityChartClient points={points} />
          ) : (
            <p className={styles.emptyNotice}>
              변동성 기록이 아직 없습니다. 평일 18:15(KST) 기록 생성 이후
              월별 평균 차트가 표시됩니다.
            </p>
          )}
        </section>

        {currentMonthRecords.length > 0 ? (
          <section className={styles.section} aria-label="당월 일별 기록">
            <h2 className={styles.sectionTitle}>당월 일별 기록</h2>
            <ol className={styles.dailyList}>
              {currentMonthRecords.map((record) => (
                <li key={record.date} className={styles.dailyRow}>
                  <span className={styles.dailyDate}>{record.date}</span>
                  <span className={`${styles.dailyValue} numeric`}>
                    {record.dailyGapPercent.toFixed(2)}%
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <footer className={styles.footer}>
          <p className={styles.notice}>
            코스피 변동성 지수는 일중 (고가 − 저가) ÷ 저가 × 100(%)의 월별
            평균입니다. 당월은 오늘까지의 진행분 평균이며, 일별 기록은 평일
            장중 갱신 회차(09:00~15:30 KST, 10분 간격)마다 저장됩니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
