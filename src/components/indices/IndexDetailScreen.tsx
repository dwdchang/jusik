import { NavIconLink } from "@/components/nav/NavIconLink";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import { formatKstDateTime } from "@/lib/format/datetime";
import { getIndexDetail } from "@/lib/indices/getIndexDetail";
import { getOverseasDetail } from "@/lib/indices/getOverseasDetail";
import type { IndexDetailData, IndicatorId } from "@/types/indices";
import { IndexCard } from "./IndexCard";
import { IndexChartClient } from "./IndexChartClient";
import { IndexDailyList } from "./IndexDailyList";
import styles from "./IndexDetailScreen.module.css";

export async function IndexDetailScreen({
  market,
  children,
}: {
  market: IndicatorId;
  /** 일별 시세 섹션과 푸터 사이에 렌더되는 추가 섹션 (§28 달러 인덱스 등) */
  children?: React.ReactNode;
}) {
  let data: IndexDetailData;

  try {
    data =
      market === "KOSPI" || market === "KOSDAQ"
        ? await getIndexDetail(market)
        : await getOverseasDetail(market);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지수 데이터를 불러오지 못했습니다.";

    console.error(
      `[IndexDetailScreen] getIndexDetail(${market}) failed:`,
      message,
      error instanceof Error ? error.cause : undefined
    );

    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <NavIconLink href="/" label="홈으로" icon="home" />
          </header>
          <div className={styles.error} role="alert">
            <h1 className={styles.errorTitle}>데이터를 불러올 수 없습니다</h1>
            <p className={styles.errorMessage}>{message}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <span className={styles.lastRefresh}>
            마지막 갱신: {formatKstDateTime(data.asOf)}
          </span>
        </header>

        <section
          className={styles.section}
          aria-label={`${data.snapshot.name} 현황`}
        >
          <IndexCard snapshot={data.snapshot} />
        </section>

        <section className={styles.section} aria-label="최근 7거래일 추이">
          <IndexChartClient series={data.history} />
        </section>

        <section className={styles.section} aria-label="일별 시세">
          <h2 className={styles.sectionTitle}>일별 시세</h2>
          <IndexDailyList rows={data.dailyRows} />
        </section>

        {children}

        <footer className={styles.footer}>
          <p className={styles.notice}>{data.dataNotice}</p>
          <p className={styles.asOf}>
            마지막 갱신 (KST): {formatKstDateTime(data.asOf)}
          </p>
          <p className={styles.basDt}>
            기준일 {formatBasDtDisplay(data.snapshot.basDt)}
          </p>
        </footer>
      </div>
    </main>
  );
}
