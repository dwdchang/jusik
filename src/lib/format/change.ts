import { formatIndex } from "./index";

export function formatChangeAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${formatIndex(amount)}`;
}

export function formatChangeRate(rate: number): string {
  const sign = rate > 0 ? "+" : rate < 0 ? "" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

/** %p(퍼센트포인트) 증감 표기 — 전월 대비 등 */
export function formatPercentPoint(diff: number): string {
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)}%p`;
}

export function formatChange(amount: number, rate: number): string {
  return `${formatChangeAmount(amount)} (${formatChangeRate(rate)})`;
}
