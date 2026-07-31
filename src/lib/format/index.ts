/**
 * 지수 포맷 (원 단위 아님, 지수 포인트)
 */
export function formatIndex(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * 소수점 자리를 지정하는 숫자 표기 — 글로벌 지표 표(§88)처럼 항목마다 자리 수가 다를 때.
 * 환율 4자리(6.7663)·지수 2자리(52,208.06)·국내 금 정수(187,820)가 한 표에 섞인다.
 */
export function formatFixed(value: number, digits: number): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
