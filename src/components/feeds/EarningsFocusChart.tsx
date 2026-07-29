"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EarningsQuarterPoint } from "@/lib/feeds/earningsFocus";
import styles from "./EarningsFocusChart.module.css";

/**
 * 분기 실적 차트 — Phase 82. 매출액·영업이익 막대 + 영업이익률 선.
 *
 * 종목분석(`AnalysisCharts`)의 「실적」 차트와 겹쳐 보이지만 **다른 시계열**이다 —
 * 이쪽은 확정 뒤에 잠정 분기가 이어 붙고, 그 지점을 반투명 막대 + 점선으로 구분한다.
 * 기간 탭(연환산/연간/분기)도 없다. 이 화면의 존재 이유가 "가장 최근 분기를 5주 먼저
 * 본다"라서 분기 하나만 그린다.
 *
 * recharts는 클라이언트 전용이라 `EarningsFocusChartClient`(dynamic·ssr:false)를 거친다.
 */

const AXIS_TICK = { fontSize: 10, fill: "var(--color-text-tertiary)" };

/** 억원 축약 — 1조(=10,000억) 이상은 조로 올린다 (AnalysisCharts와 같은 규칙) */
function formatEok(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return `${(value / 10000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}조`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}억`;
}

const SERIES = [
  { key: "revenue", name: "매출액", color: "var(--chart-bar)" },
  {
    key: "operatingProfit",
    name: "영업이익",
    color: "var(--chart-stroke-kospi)",
  },
] as const;

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: EarningsQuarterPoint }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const point = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHead}>
        {point.label}
        {point.provisional ? (
          <span className={styles.tooltipBadge}>잠정</span>
        ) : null}
      </div>
      {SERIES.map((series) => {
        const value = point[series.key];
        return (
          <div key={series.key} className={styles.tooltipRow}>
            <span className={styles.tooltipName} style={{ color: series.color }}>
              {series.name}
            </span>
            <span className={`${styles.tooltipValue} numeric`}>
              {value === null ? "-" : formatEok(value)}
            </span>
          </div>
        );
      })}
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipName} style={{ color: "var(--color-rise)" }}>
          영업이익률
        </span>
        <span className={`${styles.tooltipValue} numeric`}>
          {point.operatingMargin === null
            ? "-"
            : `${point.operatingMargin.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
}

export function EarningsFocusChart({
  points,
}: {
  points: EarningsQuarterPoint[];
}) {
  const hasValue = points.some(
    (point) => point.revenue !== null || point.operatingProfit !== null
  );

  if (!hasValue) {
    return <p className={styles.empty}>그릴 분기 실적이 없습니다.</p>;
  }

  return (
    <div className={styles.chartBody}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            yAxisId="left"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={formatEok}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-bg)" }} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />
          {SERIES.map((series) => (
            <Bar
              key={series.key}
              yAxisId="left"
              dataKey={series.key}
              name={series.name}
              fill={series.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={16}
            >
              {/* 잠정 분기는 확정과 같은 색을 흐리게 — 색을 바꾸면 범례가 늘어난다 */}
              {points.map((point) => (
                <Cell
                  key={point.key}
                  fillOpacity={point.provisional ? 0.45 : 1}
                />
              ))}
            </Bar>
          ))}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="operatingMargin"
            name="영업이익률"
            stroke="var(--color-rise)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
