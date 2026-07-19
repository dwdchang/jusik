"use client";

import type { BtcCurrency } from "@/lib/format/btc";
import type { IndexSeries } from "@/types/indices";
import dynamic from "next/dynamic";
import styles from "./IndexChartClient.module.css";

const BtcLineChart = dynamic(
  () => import("./BtcLineChart").then((module) => module.BtcLineChart),
  {
    ssr: false,
    loading: () => <div className={styles.chartSkeleton}>차트 로딩 중…</div>,
  }
);

export function BtcChartClient({
  series,
  currency,
}: {
  series: IndexSeries;
  currency: BtcCurrency;
}) {
  return <BtcLineChart series={series} currency={currency} />;
}
