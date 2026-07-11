/**
 * 핫종목 월 단위 날짜 헬퍼 — Phase 14 (plan.md §14.2).
 * 월은 "YYYY-MM" 문자열로 다룬다 (완결 달력 구간의 최소 단위).
 */

/** 기준월 M = 실행 시점 KST의 전월 — 직전 완결 월 (§14.2) */
export function baseMonthKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return addMonths(
    `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`,
    -1
  );
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const mon = (total % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

export function monthStartYyyyMmDd(month: string): string {
  return `${month.replace("-", "")}01`;
}

export function monthEndYyyyMmDd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.replace("-", "")}${lastDay}`;
}

/** "2026-06" → "2026.06" (UI 표기) */
export function formatMonthDisplay(month: string): string {
  return month.replace("-", ".");
}

/** "2025-07"·"2026-06" → "2025.07 ~ 2026.06" (구간 병기 표기, §14.5) */
export function formatMonthRangeDisplay(
  startMonth: string,
  endMonth: string
): string {
  return `${formatMonthDisplay(startMonth)} ~ ${formatMonthDisplay(endMonth)}`;
}
