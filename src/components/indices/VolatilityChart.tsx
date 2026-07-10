"use client";

import type { VolatilityMonthlyPoint } from "@/types/indices";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./VolatilityChart.module.css";

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: VolatilityMonthlyPoint }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div>{point.month} 평균</div>
      <div className={`${styles.tooltipValue} numeric`}>
        {point.avgGapPercent.toFixed(2)}%
      </div>
    </div>
  );
}

/** 최근 6개월 월별 평균 변동성 막대 차트 (당월 포함) */
export function VolatilityChart({
  points,
}: {
  points: VolatilityMonthlyPoint[];
}) {
  return (
    <div className={styles.chart}>
      <h3 className={styles.title}>최근 6개월 월별 평균 변동성</h3>
      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, "auto"]}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
              axisLine={false}
              tickLine={false}
              width={55}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              content={<ChartTooltipContent />}
              cursor={{ fill: "var(--color-bg)" }}
            />
            <Bar
              dataKey="avgGapPercent"
              fill="var(--chart-stroke-kospi)"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
