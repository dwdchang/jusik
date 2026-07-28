"use client";

import type { AnalysisPeriodMode } from "@/lib/analysis/overview";
import type { AnalysisViewPoint } from "@/lib/analysis/view";
import { useState } from "react";
import styles from "./KeyMetricsTable.module.css";

/**
 * 주요 재무지표 표 — Phase 72. 지표명 열 sticky + 기간 열 가로 스크롤(재무제표 전문의
 * `FinancialSection`과 같은 골격)이되, **행마다 단위가 달라** 포맷을 행 정의에 둔다.
 *
 * 열 순서는 **최신이 왼쪽**이다 — 차트(과거→최신)와 방향이 반대인데, 표는 최근 실적을
 * 먼저 읽는 쪽이 자연스럽고 가로 스크롤도 최신부터 보이는 게 낫다.
 */

const MODE_LABELS: ReadonlyArray<{ mode: AnalysisPeriodMode; label: string }> = [
  { mode: "ttm", label: "연환산" },
  { mode: "annual", label: "연간" },
  { mode: "quarter", label: "분기" },
];

function formatEok(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatWon(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatRatio(value: number): string {
  return value.toFixed(2);
}

function formatPercent(value: number): string {
  return value.toFixed(1);
}

interface MetricRow {
  label: string;
  pick: (point: AnalysisViewPoint) => number | null;
  format: (value: number) => string;
}

const METRIC_ROWS: MetricRow[] = [
  { label: "매출액(억원)", pick: (p) => p.revenue, format: formatEok },
  { label: "영업이익(억원)", pick: (p) => p.operatingProfit, format: formatEok },
  { label: "ROE(%)", pick: (p) => p.roe, format: formatPercent },
  { label: "주당배당금(원)", pick: (p) => p.dps, format: formatWon },
  { label: "배당성향(%)", pick: (p) => p.payoutRatio, format: formatPercent },
  { label: "배당수익률(%)", pick: (p) => p.dividendYield, format: formatPercent },
  { label: "EPS(연결지배)", pick: (p) => p.eps, format: formatWon },
  { label: "EPS(개별)", pick: (p) => p.epsSeparate, format: formatWon },
  { label: "PER(배)", pick: (p) => p.per, format: formatRatio },
  { label: "BPS(원)", pick: (p) => p.bps, format: formatWon },
  { label: "PBR(배)", pick: (p) => p.pbr, format: formatRatio },
];

export function KeyMetricsTable({
  series,
}: {
  series: {
    ttm: AnalysisViewPoint[];
    annual: AnalysisViewPoint[];
    quarter: AnalysisViewPoint[];
  };
}) {
  const [mode, setMode] = useState<AnalysisPeriodMode>("annual");
  const points = [...series[mode]].reverse();

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>주요 재무지표</h2>
        <div className={styles.tabs} role="tablist">
          {MODE_LABELS.map((item) => (
            <button
              key={item.mode}
              type="button"
              role="tab"
              aria-selected={mode === item.mode}
              className={`${styles.tab} ${
                mode === item.mode ? styles.tabActive : ""
              }`}
              onClick={() => setMode(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <p className={styles.empty}>이 기간의 자료가 없습니다.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.nameHead} scope="col">
                  지표
                </th>
                {points.map((point) => (
                  <th key={point.key} className={styles.numHead} scope="col">
                    {point.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((row) => (
                <tr key={row.label}>
                  <th className={styles.nameCell} scope="row">
                    {row.label}
                  </th>
                  {points.map((point) => {
                    const value = row.pick(point);
                    return (
                      <td
                        key={point.key}
                        className={`${styles.numCell} numeric`}
                      >
                        {value === null ? "-" : row.format(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
