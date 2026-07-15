/** KST 기준 오늘 날짜 "YYYY-MM-DD" */
export function todayKstDate(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 임의 시각(ms)을 KST 캘린더 날짜 "YYYYMMDD"로 — 뉴스 pubDate(RFC822, 타임존 포함)를
 * 저장 시점에 KST 날짜 문자열로 굳혀 읽기 경로가 문자열 비교만 하도록 한다 (§17.13).
 */
export function kstYyyyMmDd(ms: number): string {
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return (
    String(kst.getUTCFullYear()) +
    String(kst.getUTCMonth() + 1).padStart(2, "0") +
    String(kst.getUTCDate()).padStart(2, "0")
  );
}
