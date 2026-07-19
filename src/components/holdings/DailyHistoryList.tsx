"use client";

import { useState } from "react";
import { formatChangeRate } from "@/lib/format/change";
import { formatKrw } from "@/lib/format/krw";
import styles from "./DailyHistoryList.module.css";

export interface DailyHistoryRow {
  /** "YYYY-MM-DD" (KST 거래일) */
  date: string;
  /** 종가(원) — 종목 상세에서만 전달, 홈 포트폴리오 목록은 생략 */
  close?: number;
  /** 평가금액(원) */
  totalValue: number;
  /** 그날의 수익률(%) */
  returnRate: number;
}

/** resolveDirection(kisMapper)과 동일 판정 — KIS mapper를 클라이언트 번들에 넣지 않기 위한 로컬 사본 */
function direction(rate: number): "rise" | "fall" | "flat" {
  if (rate > 0) {
    return "rise";
  }
  if (rate < 0) {
    return "fall";
  }
  return "flat";
}

/** "YYYY-MM" → "YYYY년 M월" */
function formatMonthLabel(month: string): string {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

/**
 * 일별 기록 목록 — 접힘 기본 `<details>` + 월 단위 페이지네이션 (plan.md §29).
 * 서버가 내려준 전체 히스토리를 받아 기록이 있는 달만 이전/다음 버튼으로 넘겨본다.
 * 보유종목 홈(`/holdings`)·종목 상세(`/holdings/[symbolCode]`) 공용.
 */
export function DailyHistoryList({
  rows,
  title = "일별 기록",
}: {
  rows: DailyHistoryRow[];
  title?: string;
}) {
  // 기록이 있는 달만 최신순으로 — 빈 달은 내비게이션에서 자연히 건너뛴다
  const months = [...new Set(rows.map((row) => row.date.slice(0, 7)))].sort(
    (a, b) => b.localeCompare(a)
  );
  const [monthIndex, setMonthIndex] = useState(0);

  if (months.length === 0) {
    return null;
  }

  const month = months[Math.min(monthIndex, months.length - 1)];
  const monthRows = rows
    .filter((row) => row.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const hasOlder = monthIndex < months.length - 1;
  const hasNewer = monthIndex > 0;

  return (
    <details className={styles.details}>
      <summary className={styles.toggle}>
        {title}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </summary>

      <div
        className={styles.monthNav}
        role="group"
        aria-label="일별 기록 월 이동"
      >
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setMonthIndex(monthIndex + 1)}
          disabled={!hasOlder}
        >
          ← 이전
        </button>
        <span className={styles.monthLabel}>{formatMonthLabel(month)}</span>
        <button
          type="button"
          className={styles.monthButton}
          onClick={() => setMonthIndex(monthIndex - 1)}
          disabled={!hasNewer}
        >
          다음 →
        </button>
      </div>

      <ol className={styles.dailyList}>
        {monthRows.map((row) => (
          <li key={row.date} className={styles.dailyRow}>
            <span className={styles.dailyDate}>{row.date}</span>
            {row.close !== undefined ? (
              <span className={`${styles.dailyClose} numeric`}>
                {formatKrw(row.close)}
              </span>
            ) : null}
            <span className={`${styles.dailyValue} numeric`}>
              {formatKrw(row.totalValue)}
            </span>
            <span
              className={`${styles.dailyRate} numeric ${
                styles[direction(row.returnRate)]
              }`}
            >
              {formatChangeRate(row.returnRate)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
