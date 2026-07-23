/**
 * ISO 문자열을 KST 표시용으로 포맷한다.
 */
export function formatKstDateTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * ISO 문자열 또는 epoch(ms)를 KST "HH:MM"으로 포맷한다 — 상태 표시 등 시:분만 필요할 때.
 */
export function formatKstTime(input: string | number): string {
  const date = new Date(input);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
