"use client";

import { formatIndex } from "@/lib/format/index";
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
import styles from "./IndexLineChart.module.css";

function getChartTitle(market: IndexSeries["market"]): string {
  return INDICATOR_NAMES[market];
}

function getChartStroke(market: IndexSeries["market"]): string {
  if (market === "KOSDAQ") {
    return "var(--chart-stroke-kosdaq)";
  }
  return "var(--chart-stroke-kospi)";
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: IndexChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className={styles.tooltipLabel}>
      <div>{point.date}</div>
      <div className={`${styles.tooltipValue} numeric`}>
        {formatIndex(point.close)}
      </div>
    </div>
  );
}

export function IndexLineChart({ series }: { series: IndexSeries }) {
  const title = getChartTitle(series.market);
  const stroke = getChartStroke(series.market);

  return (
    <div className={styles.chart}>
      <h3 className={styles.title}>{title}</h3>
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
              width={55}
              tickFormatter={(value: number) => formatIndex(value)}
            />
            <Tooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="close"
              stroke={stroke}
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
