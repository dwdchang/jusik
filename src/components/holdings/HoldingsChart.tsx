"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChangeRate } from "@/lib/format/change";
import { formatKrw, formatKrwAbbrev } from "@/lib/format/krw";
import styles from "./HoldingsChart.module.css";

export interface HoldingsChartPoint {
  /** "MM/DD" */
  date: string;
  /** "YYYY-MM-DD" */
  fullDate: string;
  totalValue: number;
  /** 그날의 수익률(%) */
  returnRate: number;
}

type ChartMode = "rate" | "value";

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HoldingsChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div>{point.fullDate}</div>
      <div className={`${styles.tooltipValue} numeric`}>
        {formatChangeRate(point.returnRate)}
      </div>
      <div className={`${styles.tooltipValue} numeric`}>
        {formatKrw(point.totalValue)}
      </div>
    </div>
  );
}

/** 보유종목 추이 차트 — 수익률(%) ↔ 원 단위(M/B) 토글 */
export function HoldingsChart({
  points,
  title = "연초 이후 추이",
}: {
  points: HoldingsChartPoint[];
  title?: string;
}) {
  const [mode, setMode] = useState<ChartMode>("rate");

  return (
    <div className={styles.chart}>
      <div className={styles.toolbar}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.toggle} role="group" aria-label="차트 단위 전환">
          <button
            type="button"
            className={mode === "rate" ? styles.toggleActive : styles.toggleButton}
            onClick={() => setMode("rate")}
          >
            수익률 %
          </button>
          <button
            type="button"
            className={mode === "value" ? styles.toggleActive : styles.toggleButton}
            onClick={() => setMode("value")}
          >
            원 단위
          </button>
        </div>
      </div>
      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              axisLine={false}
              tickLine={false}
              width={55}
              tickFormatter={(value: number) =>
                mode === "rate" ? `${value}%` : formatKrwAbbrev(value)
              }
            />
            <Tooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey={mode === "rate" ? "returnRate" : "totalValue"}
              stroke="var(--chart-stroke-kospi)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
