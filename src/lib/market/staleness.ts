/**
 * KST 허용 시간 가드·갱신 상태(배지) 판정 — Phase 11 (plan.md §11.4, §11.10-B).
 * 배지는 실제 시세 잡 스케줄(research.md §4.1)을 기준으로 "예정된 갱신 시각이
 * 지났는데도 갱신되지 않은 경우"에만 표시한다 — 정상 휴지 구간(예: 15:40~18:15,
 * 장 마감 후·주말)에는 마지막 갱신이 오래됐어도 배지를 띄우지 않는다 (§11.10-B 개정 2026-07-13).
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

/** 홈 카드 배지 심각도 — 예정 갱신 누락이 최근(<1시간)이면 warn, 1시간 이상이면 critical */
export type StalenessLevel = "warn" | "critical";

const CRITICAL_AFTER_MS = 60 * 60 * 1000;
/** 잡 실행 시간 + QStash 재시도 여유 — 예정 시각 직후 잠깐의 미반영은 정상 (사용자 승인 2026-07-13) */
const SLOT_GRACE_MS = 20 * 60 * 1000;

/**
 * 시세 잡 QStash 스케줄 — KST 자정 이후 분 (평일 09:00~15:30 10분 간격 + 15:40 + 18:15).
 * **외부 QStash 등록(research.md §4.1)과 반드시 일치해야 한다** — 스케줄을 바꾸면
 * 이 상수도 함께 고친다 (§8.13 스케줄 동기화와 같은 결합점).
 */
const SCHEDULE_MINUTES: number[] = (() => {
  const slots: number[] = [];
  for (let m = 9 * 60; m <= 15 * 60 + 30; m += 10) {
    slots.push(m); // 09:00~15:30 10분 간격
  }
  slots.push(15 * 60 + 40); // 15:40 확정
  slots.push(18 * 60 + 15); // 18:15 확정
  return slots;
})();

/**
 * now 기준 "이미 완료됐어야 할(예정 시각 + 유예 경과) 가장 최근 스케줄 슬롯"의 절대 시각(ms).
 * 평일만 슬롯이 있어 주말·야간·이른 아침(첫 슬롯 유예 전)은 직전 평일 18:15로 귀결된다.
 * 최근 5일 내에 해당 슬롯이 없으면 null(스케줄 이력 없음 — 배지 판정 보류).
 */
function lastDueRefreshMs(now: Date): number | null {
  const nowMs = now.getTime();
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const baseUtcMidnight = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate()
  );

  for (let back = 0; back < 5; back++) {
    const dayUtcMidnight = baseUtcMidnight - back * 24 * 60 * 60 * 1000;
    if (!isKstWeekday(new Date(dayUtcMidnight).getUTCDay())) {
      continue;
    }
    // 이 KST 날짜의 00:00(KST)에 해당하는 실제 UTC 시각
    const kstMidnightMs = dayUtcMidnight - 9 * 60 * 60 * 1000;
    for (let i = SCHEDULE_MINUTES.length - 1; i >= 0; i--) {
      const slotMs = kstMidnightMs + SCHEDULE_MINUTES[i] * 60 * 1000;
      if (slotMs + SLOT_GRACE_MS <= nowMs) {
        return slotMs;
      }
    }
  }
  return null;
}

/**
 * fetchedAt이 "가장 최근 예정 갱신 슬롯"보다 오래됐을 때만 배지 — 즉 예정된 갱신이
 * 실제로 누락된 경우에만. 정상 휴지 구간(예: 15:40~18:15)에는 lastDue가 15:40이라
 * 15:40 데이터는 신선으로 판정돼 null(배지 없음). 심각도는 예정 슬롯 대비 지연으로 결정.
 * fetchedAt이 없으면(빈 Redis) 배지가 아니라 카드 placeholder가 담당하므로 null.
 */
export function resolveStaleness(
  fetchedAt: string | null | undefined,
  now: Date = new Date()
): StalenessLevel | null {
  if (!fetchedAt) {
    return null;
  }

  const fetchedMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedMs)) {
    return null;
  }

  const lastDue = lastDueRefreshMs(now);
  if (lastDue === null || fetchedMs >= lastDue) {
    return null;
  }

  const overdue = now.getTime() - lastDue;
  return overdue >= CRITICAL_AFTER_MS ? "critical" : "warn";
}
