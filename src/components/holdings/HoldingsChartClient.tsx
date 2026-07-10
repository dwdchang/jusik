"use client";

import dynamic from "next/dynamic";
import type { HoldingsChartPoint } from "./HoldingsChart";
import styles from "./HoldingsChartClient.module.css";

const HoldingsChart = dynamic(
  () => import("./HoldingsChart").then((module) => module.HoldingsChart),
  {
    ssr: false,
    loading: () => <div className={styles.chartSkeleton}>차트 로딩 중…</div>,
  }
);

export function HoldingsChartClient({
  points,
}: {
  points: HoldingsChartPoint[];
}) {
  return <HoldingsChart points={points} />;
}
