"use client";

import { formatBtcValue, type BtcCurrency } from "@/lib/format/btc";
import { formatIndex } from "@/lib/format/index";
import { formatKrwAbbrev } from "@/lib/format/krw";
import {
  INDICATOR_NAMES,
  type IndexChartPoint,
  type IndexSeries,
} from "@/types/indices";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./BtcLineChart.module.css";

function ChartTooltipContent({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: IndexChartPoint }>;
  currency: BtcCurrency;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className={styles.tooltipLabel}>
      <div>{point.date}</div>
      <div className={`${styles.tooltipValue} numeric`}>
        {formatBtcValue(point.close, currency)}
      </div>
    </div>
  );
}

/** 비트코인 차트 — IndexLineChart와 동일 폼, 통화별 축·툴팁 포맷만 분기 (§30) */
export function BtcLineChart({
  series,
  currency,
}: {
  series: IndexSeries;
  currency: BtcCurrency;
}) {
  return (
    <div className={styles.chart}>
      <h3 className={styles.title}>{INDICATOR_NAMES[series.market]}</h3>
      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series.points}
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
              width={62}
              tickFormatter={(value: number) =>
                currency === "KRW" ? formatKrwAbbrev(value) : formatIndex(value)
              }
            />
            <Tooltip content={<ChartTooltipContent currency={currency} />} />
            <Line
              type="monotone"
              dataKey="close"
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
