"use client";

import type { PriceChangeEntry } from "@/lib/analysis/quote";
import dynamic from "next/dynamic";
import type { AnalysisSeriesSet } from "./AnalysisCharts";
import styles from "./AnalysisChartsClient.module.css";

/**
 * 차트 묶음 dynamic 래퍼 — Phase 72 (§4 관례: recharts는 `ssr: false`로 분리).
 * 종목분석 상세에서 가장 무거운 청크라 초기 HTML에서 떼어낸다.
 *
 * 래퍼가 둘인 이유는 원천 응답 속도 차이다 (Phase 78, § `AnalysisCharts`) — 재무 차트는
 * 시세를 기다리지 않고 먼저 그린다. 두 래퍼가 **같은 모듈**을 가리키므로 recharts 청크는
 * 하나만 받는다(export만 갈렸을 뿐 번들은 공유).
 */

function ChartSkeleton() {
  return <div className={styles.skeleton}>차트 로딩 중…</div>;
}

const FinancialCharts = dynamic(
  () =>
    import("./AnalysisCharts").then((module) => module.AnalysisFinancialCharts),
  { ssr: false, loading: ChartSkeleton }
);

const QuoteCharts = dynamic(
  () => import("./AnalysisCharts").then((module) => module.AnalysisQuoteCharts),
  { ssr: false, loading: ChartSkeleton }
);

/** 실적·현금흐름표·주당현금흐름 — DART 재무만 있으면 그려진다 */
export function AnalysisFinancialChartsClient({
  series,
}: {
  series: AnalysisSeriesSet;
}) {
  return <FinancialCharts series={series} />;
}

/** 주가 변동률·배당금&시가배당률 — 금융위 시세가 도착해야 완성된다 */
export function AnalysisQuoteChartsClient({
  changes,
  series,
}: {
  changes: PriceChangeEntry[];
  series: AnalysisSeriesSet;
}) {
  return <QuoteCharts changes={changes} series={series} />;
}
