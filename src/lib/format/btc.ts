import { formatChange, formatChangeRate } from "./change";
import { formatIndex } from "./index";
import { formatKrw } from "./krw";

/** 비트코인 표시 통화 (plan.md §30) — 원화(KRW-BTC)·달러(USDT-BTC) */
export type BtcCurrency = "KRW" | "USD";

/** 통화별 값 표기 — 원화는 정수 "…원", 달러는 소수 2자리 */
export function formatBtcValue(value: number, currency: BtcCurrency): string {
  return currency === "KRW" ? formatKrw(value) : formatIndex(value);
}

/** 통화별 전일 대비 표기 — 원화는 정수 "+1,234,000원 (+1.23%)", 달러는 소수 2자리 */
export function formatBtcChange(
  amount: number,
  rate: number,
  currency: BtcCurrency
): string {
  if (currency === "USD") {
    return formatChange(amount, rate);
  }
  const sign = amount > 0 ? "+" : "";
  const formatted = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${sign}${formatted}원 (${formatChangeRate(rate)})`;
}
