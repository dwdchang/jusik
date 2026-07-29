"use client";

import dynamic from "next/dynamic";
import type { EarningsQuarterPoint } from "@/lib/feeds/earningsFocus";
import styles from "./EarningsFocusChartClient.module.css";

/**
 * 분기 실적 차트 dynamic 래퍼 — Phase 82 (§4 관례: recharts는 `ssr: false`로 분리).
 * 뉴스·공시 페이지에서 recharts를 쓰는 유일한 자리라, 실적 탭을 안 여는 방문에는
 * 이 청크가 아예 내려가지 않는다.
 */
const Chart = dynamic(
  () => import("./EarningsFocusChart").then((module) => module.EarningsFocusChart),
  {
    ssr: false,
    loading: () => <div className={styles.skeleton}>차트 로딩 중…</div>,
  }
);

export function EarningsFocusChartClient({
  points,
}: {
  points: EarningsQuarterPoint[];
}) {
  return <Chart points={points} />;
}
