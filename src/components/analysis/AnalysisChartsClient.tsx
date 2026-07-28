"use client";

import type { PriceChangeEntry } from "@/lib/analysis/quote";
import dynamic from "next/dynamic";
import type { AnalysisSeriesSet } from "./AnalysisCharts";
import styles from "./AnalysisChartsClient.module.css";

/**
 * 차트 묶음 dynamic 래퍼 — Phase 72 (§4 관례: recharts는 `ssr: false`로 분리).
 * 종목분석 상세에서 가장 무거운 청크라 초기 HTML에서 떼어낸다.
 */
const AnalysisCharts = dynamic(
  () => import("./AnalysisCharts").then((module) => module.AnalysisCharts),
  {
    ssr: false,
    loading: () => <div className={styles.skeleton}>차트 로딩 중…</div>,
  }
);

export function AnalysisChartsClient({
  changes,
  series,
}: {
  changes: PriceChangeEntry[];
  series: AnalysisSeriesSet;
}) {
  return <AnalysisCharts changes={changes} series={series} />;
}
