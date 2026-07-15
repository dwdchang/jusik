/**
 * 수출입 통계 표시 포맷 — Phase 17-4 (plan.md §17-4).
 * 관세청 값은 USD 원값이라 한국 무역통계 관례인 "억 달러"(1억 달러 = 1e8 USD)로 환산해 표기한다.
 */

const USD_PER_EOK = 1e8;

const eokFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** USD 원값 → "607.5억 달러" */
export function formatUsdEok(usd: number): string {
  return `${eokFormatter.format(usd / USD_PER_EOK)}억 달러`;
}

/** 무역수지 등 부호 있는 억 달러 — 양수 앞에 + */
export function formatUsdEokSigned(usd: number): string {
  const sign = usd > 0 ? "+" : "";
  return `${sign}${formatUsdEok(usd)}`;
}

/** "YYYYMM" → "2026.06" */
export function formatYyyymm(yyyymm: string): string {
  if (yyyymm.length !== 6) {
    return yyyymm;
  }
  return `${yyyymm.slice(0, 4)}.${yyyymm.slice(4, 6)}`;
}

/** 전년동월비 % — 양수 앞에 + (null이면 "—") */
export function formatYoy(pct: number | null): string {
  if (pct === null) {
    return "—";
  }
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
