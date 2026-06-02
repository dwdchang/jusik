/**
 * 지수 포맷 (원 단위 아님, 지수 포인트)
 */
export function formatIndex(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
