"use client";

import type { IndexSeries } from "@/types/indices";
import dynamic from "next/dynamic";
import styles from "./IndexChartsSection.module.css";

const IndexLineChart = dynamic(
  () => import("./IndexLineChart").then((module) => module.IndexLineChart),
  {
    ssr: false,
    loading: () => (
      <div className={styles.chartSkeleton}>차트 로딩 중…</div>
    ),
  }
);

export function IndexChartsSectionClient({
  kospi,
  kosdaq,
}: {
  kospi: IndexSeries;
  kosdaq: IndexSeries;
}) {
  return (
    <section className={styles.charts} aria-label="최근 7거래일 추이">
      <IndexLineChart series={kospi} />
      <IndexLineChart series={kosdaq} />
    </section>
  );
}
