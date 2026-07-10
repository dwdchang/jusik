"use client";

import type { VolatilityMonthlyPoint } from "@/types/indices";
import dynamic from "next/dynamic";
import styles from "./VolatilityChartClient.module.css";

const VolatilityChart = dynamic(
  () => import("./VolatilityChart").then((module) => module.VolatilityChart),
  {
    ssr: false,
    loading: () => <div className={styles.chartSkeleton}>차트 로딩 중…</div>,
  }
);

export function VolatilityChartClient({
  points,
}: {
  points: VolatilityMonthlyPoint[];
}) {
  return <VolatilityChart points={points} />;
}
