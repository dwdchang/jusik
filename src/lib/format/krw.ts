/** 원화 금액 — "12,345,678원" */
export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

/**
 * 원화 축약 표기 (차트 y축용) — M(백만원)/B(십억원) 영어 단위.
 * 예: 12,000,000 → "12M", 1,000,000,000 → "1B"
 */
export function formatKrwAbbrev(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  const trim = (n: number): string => {
    const fixed = n.toFixed(1);
    return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  };

  if (abs >= 1_000_000_000) {
    return `${sign}${trim(abs / 1_000_000_000)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${trim(abs / 1_000_000)}M`;
  }
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(value);
}
