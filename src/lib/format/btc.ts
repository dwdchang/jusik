import { formatIndex } from "./index";
import { formatKrw } from "./krw";

/** 비트코인 표시 통화 (plan.md §30) — 원화(KRW-BTC)·달러(USDT-BTC) */
export type BtcCurrency = "KRW" | "USD";

/** 통화별 값 표기 — 원화는 정수 "…원", 달러는 소수 2자리 */
export function formatBtcValue(value: number, currency: BtcCurrency): string {
  return currency === "KRW" ? formatKrw(value) : formatIndex(value);
}
