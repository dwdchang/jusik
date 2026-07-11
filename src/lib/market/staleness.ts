/**
 * KST 허용 시간 가드·갱신 상태(배지) 판정 — Phase 11 (plan.md §11.4, §11.10-B).
 */

/** KST 기준 요일(0=일)·자정 이후 경과 분 */
function kstNowParts(now: Date): { day: number; minutesOfDay: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    day: kst.getUTCDay(),
    minutesOfDay: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
  };
}

function isKstWeekday(day: number): boolean {
  return day >= 1 && day <= 5;
}

/**
 * KIS 호출 허용 창 — KST 평일 09:00~18:40 (§11.4 이중 방어 가드).
 * 상한 18:40은 18:15 회차의 재시도(≈18:20)와 처리 여유를 막지 않기 위한 값.
 * 이 창 밖에서 갱신 잡은 KIS를 호출하지 않고 no-op 200을 반환해야 한다.
 */
export function isWithinKisCallWindow(now: Date = new Date()): boolean {
  const { day, minutesOfDay } = kstNowParts(now);
  return isKstWeekday(day) && minutesOfDay >= 9 * 60 && minutesOfDay <= 18 * 60 + 40;
}

/**
 * 배지 판정 창 — KST 평일 09:00~18:20 (정규+재시도 창, §11.10-B1).
 * 장외·주말에는 배지 자체를 표시하지 않는다.
 */
export function isWithinBadgeWindow(now: Date = new Date()): boolean {
  const { day, minutesOfDay } = kstNowParts(now);
  return isKstWeekday(day) && minutesOfDay >= 9 * 60 && minutesOfDay <= 18 * 60 + 20;
}

/** 홈 카드 배지 심각도 — 경고: 20분~1시간 미만 / 심각: 1시간 이상 (§11.10-B2) */
export type StalenessLevel = "warn" | "critical";

const WARN_AFTER_MS = 20 * 60 * 1000;
const CRITICAL_AFTER_MS = 60 * 60 * 1000;

/**
 * fetchedAt 경과 기준 배지 레벨 — 배지 창 밖이거나 신선하면 null.
 * fetchedAt이 없으면(빈 Redis) 배지가 아니라 카드 placeholder가 담당하므로 null.
 */
export function resolveStaleness(
  fetchedAt: string | null | undefined,
  now: Date = new Date()
): StalenessLevel | null {
  if (!fetchedAt || !isWithinBadgeWindow(now)) {
    return null;
  }

  const age = now.getTime() - new Date(fetchedAt).getTime();

  if (!Number.isFinite(age) || age < WARN_AFTER_MS) {
    return null;
  }
  return age >= CRITICAL_AFTER_MS ? "critical" : "warn";
}
