"use client";

import type { AnalysisPeriodMode } from "@/lib/analysis/overview";
import type { PriceChangeEntry } from "@/lib/analysis/quote";
import type { AnalysisViewPoint } from "@/lib/analysis/view";
import { useState } from "react";
import {
  Bar,
  BarChart,
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
import styles from "./AnalysisCharts.module.css";

/**
 * 종목분석 차트 묶음 — Phase 72. 주가 변동률 막대 + 4종 차트(실적·배당금&시가배당률·
 * 현금흐름표·주당현금흐름)를 한 청크로 묶는다.
 * 차트마다 연환산/연간/분기 탭을 따로 들고 있어(서로 독립) 관심 있는 지표만 바꿔 본다.
 *
 * recharts는 클라이언트 전용이라 이 파일 전체가 `'use client'`이고, 페이지는
 * `AnalysisChartsClient`(dynamic·ssr:false)를 통해 부른다.
 */

export interface AnalysisSeriesSet {
  ttm: AnalysisViewPoint[];
  annual: AnalysisViewPoint[];
  quarter: AnalysisViewPoint[];
}

const MODE_LABELS: ReadonlyArray<{ mode: AnalysisPeriodMode; label: string }> = [
  { mode: "ttm", label: "연환산" },
  { mode: "annual", label: "연간" },
  { mode: "quarter", label: "분기" },
];

/** 억원 축약 — 1조(=10,000억) 이상은 조로 올린다 */
function formatEok(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return `${(value / 10000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}조`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}억`;
}

function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 차트 한 종류가 그릴 계열 정의 */
interface SeriesSpec {
  /** 데이터 키 (AnalysisViewPoint의 필드명) */
  key: keyof AnalysisViewPoint;
  name: string;
  color: string;
  /** 막대(기본) 또는 선 */
  type?: "bar" | "line";
  /** 오른쪽 축(비율)에 붙일지 */
  axis?: "left" | "right";
  /** 값 포맷 */
  format: (value: number) => string;
}

// ── 공통 요소 ────────────────────────────────────────────

function ModeTabs({
  mode,
  onChange,
}: {
  mode: AnalysisPeriodMode;
  onChange: (mode: AnalysisPeriodMode) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist">
      {MODE_LABELS.map((item) => (
        <button
          key={item.mode}
          type="button"
          role="tab"
          aria-selected={mode === item.mode}
          className={`${styles.tab} ${mode === item.mode ? styles.tabActive : ""}`}
          onClick={() => onChange(item.mode)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  specs,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
  specs: SeriesSpec[];
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHead}>{label}</div>
      {payload.map((entry) => {
        const spec = specs.find((item) => item.key === entry.dataKey);
        if (!spec || typeof entry.value !== "number") {
          return null;
        }
        return (
          <div key={spec.key} className={styles.tooltipRow}>
            <span className={styles.tooltipName} style={{ color: spec.color }}>
              {spec.name}
            </span>
            <span className={`${styles.tooltipValue} numeric`}>
              {spec.format(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const AXIS_TICK = { fontSize: 10, fill: "var(--color-text-tertiary)" } as const;

/**
 * 지표 차트 한 장 — 제목 + 모드 탭 + 막대/선 혼합 차트.
 * 모드를 바꿨을 때 값이 전부 비면 빈 축 대신 안내 문구를 띄운다.
 */
function MetricChart({
  title,
  series,
  specs,
}: {
  title: string;
  series: AnalysisSeriesSet;
  specs: SeriesSpec[];
}) {
  const [mode, setMode] = useState<AnalysisPeriodMode>("annual");
  const points = series[mode];

  const hasValue = points.some((point) =>
    specs.some((spec) => typeof point[spec.key] === "number")
  );
  const hasRightAxis = specs.some((spec) => spec.axis === "right");

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <ModeTabs mode={mode} onChange={setMode} />
      </div>
      {hasValue ? (
        <div className={styles.chartBody}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 8, right: hasRightAxis ? 4 : 8, left: 0, bottom: 0 }}
            >
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
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(value: number) =>
                  specs[0].format(value).replace(/원$/, "")
                }
              />
              {hasRightAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                />
              ) : null}
              <Tooltip
                content={<ChartTooltip specs={specs} />}
                cursor={{ fill: "var(--color-bg)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                iconSize={8}
              />
              {specs.map((spec) =>
                spec.type === "line" ? (
                  <Line
                    key={spec.key}
                    yAxisId={spec.axis ?? "left"}
                    type="monotone"
                    dataKey={spec.key}
                    name={spec.name}
                    stroke={spec.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ) : (
                  <Bar
                    key={spec.key}
                    yAxisId={spec.axis ?? "left"}
                    dataKey={spec.key}
                    name={spec.name}
                    fill={spec.color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                  />
                )
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className={styles.empty}>이 기간의 자료가 없습니다.</p>
      )}
    </section>
  );
}

// ── 주가 변동률 ──────────────────────────────────────────

function PriceChangeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PriceChangeEntry }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHead}>{point.label}</div>
      <div className={`${styles.tooltipValue} numeric`}>
        {point.rate === null ? "-" : `${point.rate.toFixed(2)}%`}
      </div>
    </div>
  );
}

/** 주가 변동률 — 4구간 막대. 상승은 빨강, 하락은 파랑(국내 관례) */
function PriceChangeChart({ changes }: { changes: PriceChangeEntry[] }) {
  const hasValue = changes.some((entry) => entry.rate !== null);

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>주가 변동률</h3>
      </div>
      {hasValue ? (
        <div className={styles.chartBodyShort}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={changes}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
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
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(value: number) => `${value.toFixed(0)}%`}
              />
              <Tooltip
                content={<PriceChangeTooltip />}
                cursor={{ fill: "var(--color-bg)" }}
              />
              <Bar dataKey="rate" radius={[3, 3, 0, 0]} maxBarSize={44}>
                {changes.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={
                      (entry.rate ?? 0) < 0
                        ? "var(--color-fall)"
                        : "var(--color-rise)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className={styles.empty}>시세 자료가 없습니다.</p>
      )}
    </section>
  );
}

// ── 차트 4종 조립 ────────────────────────────────────────

export function AnalysisCharts({
  changes,
  series,
}: {
  changes: PriceChangeEntry[];
  series: AnalysisSeriesSet;
}) {
  return (
    <div className={styles.stack}>
      <PriceChangeChart changes={changes} />

      <MetricChart
        title="실적"
        series={series}
        specs={[
          { key: "revenue", name: "매출액", color: "var(--chart-bar)", format: formatEok },
          {
            key: "operatingProfit",
            name: "영업이익",
            color: "var(--chart-stroke-kospi)",
            format: formatEok,
          },
          {
            key: "netProfit",
            name: "순이익",
            color: "var(--color-holding-name)",
            format: formatEok,
          },
          {
            key: "operatingMargin",
            name: "영업이익률",
            color: "var(--color-rise)",
            type: "line",
            axis: "right",
            format: formatPercent,
          },
        ]}
      />

      <MetricChart
        title="배당금 · 시가배당률"
        series={series}
        specs={[
          { key: "dps", name: "주당배당금", color: "var(--chart-stroke-kospi)", format: formatWon },
          {
            key: "dividendYield",
            name: "시가배당률",
            color: "var(--color-rise)",
            type: "line",
            axis: "right",
            format: formatPercent,
          },
        ]}
      />

      <MetricChart
        title="현금흐름표"
        series={series}
        specs={[
          {
            key: "cfo",
            name: "영업활동",
            color: "var(--chart-stroke-kospi)",
            type: "line",
            format: formatEok,
          },
          {
            key: "cfi",
            name: "투자활동",
            color: "var(--color-rise)",
            type: "line",
            format: formatEok,
          },
          {
            key: "cff",
            name: "재무활동",
            color: "var(--chart-bar)",
            type: "line",
            format: formatEok,
          },
        ]}
      />

      <MetricChart
        title="주당현금흐름"
        series={series}
        specs={[
          {
            key: "cfps",
            name: "주당 영업현금흐름",
            color: "var(--chart-stroke-kospi)",
            type: "line",
            format: formatWon,
          },
        ]}
      />
    </div>
  );
}
