"use client";

import type { IndexSeries } from "@/types/indices";
import dynamic from "next/dynamic";
import styles from "./IndexChartClient.module.css";

const IndexLineChart = dynamic(
  () => import("./IndexLineChart").then((module) => module.IndexLineChart),
  {
    ssr: false,
    loading: () => <div className={styles.chartSkeleton}>차트 로딩 중…</div>,
  }
);

export function IndexChartClient({ series }: { series: IndexSeries }) {
  return <IndexLineChart series={series} />;
}
