/**
 * 영업일(주말 제외) 기준일자 계산 — 공휴일은 Phase 2에서 미반영
 * @see plan.md §2.5.3
 */

function formatYyyyMmDd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * 기준 시점부터 과거로 거슬러 최근 7거래일(토·일 제외)의 basDt 배열을 반환한다.
 * 오래된 날짜 → 최신 날짜 순으로 정렬된다.
 */
export function getLast7BusinessDates(from: Date = new Date()): string[] {
  const dates: string[] = [];
  const cursor = new Date(from);

  while (dates.length < 7) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(formatYyyyMmDd(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return dates.reverse();
}
