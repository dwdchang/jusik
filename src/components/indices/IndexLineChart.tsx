"use client";

import { useState } from "react";
import { formatIndex } from "@/lib/format/index";
import { formatEokFromMillion, formatSharesKo } from "@/lib/format/krw";
import {
  INDICATOR_NAMES,
  type IndexChartPoint,
  type IndexSeries,
} from "@/types/indices";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./IndexLineChart.module.css";

/** 막대 지표 — 거래량(천주) / 거래대금(백만원) */
type BarMetric = "volume" | "tradingValue";

const BAR_LABEL: Record<BarMetric, string> = {
  volume: "거래량",
  tradingValue: "거래대금",
};

function getChartTitle(market: IndexSeries["market"]): string {
  return INDICATOR_NAMES[market];
}

function getChartStroke(market: IndexSeries["market"]): string {
  if (market === "KOSDAQ") {
    return "var(--chart-stroke-kosdaq)";
  }
  return "var(--chart-stroke-kospi)";
}

/** 막대 지표 표시값 — 거래량은 만주/억주, 거래대금은 조/억원 */
function formatBarValue(metric: BarMetric, value: number): string {
  return metric === "volume"
    ? formatSharesKo(value * 1000)
    : formatEokFromMillion(value);
}

function ChartTooltipContent({
  active,
  payload,
  barMetric,
}: {
  active?: boolean;
  payload?: Array<{ payload: IndexChartPoint }>;
  barMetric?: BarMetric;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;
  const barValue = barMetric ? point[barMetric] : undefined;

  return (
    <div className={styles.tooltipLabel}>
      <div>{point.date}</div>
      <div className={`${styles.tooltipValue} numeric`}>
        {formatIndex(point.close)}
      </div>
      {barMetric && barValue !== undefined && (
        <div className={`${styles.tooltipBar} numeric`}>
          {BAR_LABEL[barMetric]} {formatBarValue(barMetric, barValue)}
        </div>
      )}
    </div>
  );
}

export function IndexLineChart({ series }: { series: IndexSeries }) {
  const title = getChartTitle(series.market);
  const stroke = getChartStroke(series.market);
  const [barMetric, setBarMetric] = useState<BarMetric>("volume");

  // 거래량 데이터가 있는 국내 지수만 막대 토글을 노출한다 (해외 지표는 선만)
  const hasBars = series.points.some(
    (point) => point.volume !== undefined && point.volume > 0
  );

  return (
    <div className={styles.chart}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {hasBars && (
          <div
            className={styles.toggleGroup}
            role="group"
            aria-label="막대 지표"
          >
            {(["volume", "tradingValue"] as const).map((metric) => (
              <button
                key={metric}
                type="button"
                className={styles.toggle}
                aria-pressed={barMetric === metric}
                onClick={() => setBarMetric(metric)}
              >
                {BAR_LABEL[metric]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.chartBody}>
        <ResponsiveContainer width="100%" height="100%">
          {hasBars ? (
            <ComposedChart
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
                yAxisId="price"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={(value: number) => formatIndex(value)}
              />
              {/* 막대는 차트 하단 약 40%에만 오도록 도메인을 상단으로 늘려 압축.
                  정확한 값은 툴팁·일별 시세 표에서 확인 (축 라벨은 감춤). */}
              <YAxis
                yAxisId="bar"
                orientation="right"
                domain={[0, (dataMax: number) => dataMax * 2.5]}
                hide
              />
              <Tooltip
                content={<ChartTooltipContent barMetric={barMetric} />}
              />
              <Bar
                yAxisId="bar"
                dataKey={barMetric}
                fill="var(--chart-bar)"
                fillOpacity={0.75}
                isAnimationActive={false}
              />
              <Line
                yAxisId="price"
                type="monotone"
                dataKey="close"
                stroke={stroke}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </ComposedChart>
          ) : (
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
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
