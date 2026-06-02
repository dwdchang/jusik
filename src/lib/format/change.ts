import { formatIndex } from "./index";

export function formatChangeAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${formatIndex(amount)}`;
}

export function formatChangeRate(rate: number): string {
  const sign = rate > 0 ? "+" : rate < 0 ? "" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

export function formatChange(amount: number, rate: number): string {
  return `${formatChangeAmount(amount)} (${formatChangeRate(rate)})`;
}
