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

/** KST 기준 이번 달 "YYYYMM" — 수출입 월간 잡의 부분월 판정 기준 (§17-4) */
export function currentKstMonth(): string {
  return todayKstDate().slice(0, 7).replace("-", "");
}

/** "YYYYMM"에서 n개월 뺀 "YYYYMM" — 연 경계 정확 처리 (전년동월·조회창 계산용) */
export function subtractMonths(yyyymm: string, n: number): string {
  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4, 6));
  const total = year * 12 + (month - 1) - n;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return `${y}${String(mo).padStart(2, "0")}`;
}
