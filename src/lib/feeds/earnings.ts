/**
 * 실적 공시 분류기 — Phase 81 (plan.md §81).
 *
 * DART `list.json` 응답에는 공시유형 필드가 없어 보고서명 키워드로 분류한다
 * (기존 공시 8유형 분류기 `alerts/feedAlerts.ts`와 같은 방침). 아래 키워드는
 * 2026-05-01~05-20 거래소공시 전수 2,488건 실스캔으로 확정했다.
 *
 * Redis·web-push를 물지 않는 순수 모듈이라 갱신 잡·알림 판정·화면이 함께 import한다.
 *
 * 왜 별도 수집 경로인가: 기존 공시 수집은 유형 무필터 최근 90일 상위 10건이라
 * 대형주(삼성전자 90일 818건 실측)에서는 실적 공시가 컷에 밀려 한 건도 안 남는다.
 * 그래서 `pblntf_ty`(거래소공시 I·정기공시 A)로 좁힌 조회를 따로 돌린다.
 */

interface EarningsCategory {
  /** 표시·알림 본문에 붙일 유형 라벨 */
  label: string;
  /** 보고서명 부분 문자열 — 하나라도 포함되면 매칭 */
  keywords: string[];
  /** 포함 시 이 유형에서 제외할 부분 문자열 */
  excludes?: string[];
}

/**
 * 실적 이벤트 6유형 — 앞쪽이 "실적 그 자체"에 가깝다.
 * `(잠정)실적`은 연결(`연결재무제표기준영업(잠정)실적(공정공시)`)·별도
 * (`영업(잠정)실적(공정공시)`)·자회사 건을 한 번에 걸러낸다. 컨퍼런스콜·보도자료로
 * 실적을 공개하기 전(또는 동시에) 공정공시할 의무가 있어, 이 공시가 곧 발표 시점이다.
 */
const EARNINGS_CATEGORIES: EarningsCategory[] = [
  { label: "잠정실적", keywords: ["(잠정)실적"] },
  { label: "실적전망", keywords: ["영업실적등에대한전망"] },
  { label: "실적예고", keywords: ["결산실적공시예고"] },
  // 실적 급변·부진으로 발생하는 의무 공시 (기존 공시 8유형과 키워드가 겹치지 않는다)
  {
    label: "실적변동",
    keywords: ["매출액또는손익구조", "매출액미달", "자본잠식"],
  },
  { label: "IR", keywords: ["기업설명회"] },
  // 확정 실적 — 잠정실적을 내지 않는 종목(상장사 다수)은 이쪽이 최초 공개다.
  // "기타시장안내 (분기보고서 미제출 관련 …)"처럼 보고서명을 인용만 한 안내 공시는 제외
  // (실측 2026-05 상반기: 정기보고서 매칭 18종 중 유일한 오탐).
  {
    label: "정기보고서",
    keywords: ["사업보고서", "반기보고서", "분기보고서"],
    excludes: ["기타시장안내"],
  },
];

/** 보고서명 → 매칭된 실적 유형 라벨 (없으면 빈 배열 = 실적 이벤트 아님) */
export function matchEarningsCategories(reportNm: string): string[] {
  return EARNINGS_CATEGORIES.filter(
    (category) =>
      category.keywords.some((keyword) => reportNm.includes(keyword)) &&
      !(category.excludes ?? []).some((keyword) => reportNm.includes(keyword))
  ).map((category) => category.label);
}

/** 원문에서 실적 수치를 뽑을 수 있는 유형인가 — 잠정실적 서식만 표준 표를 갖는다 */
export function hasEarningsFigures(categories: string[]): boolean {
  return categories.includes("잠정실적");
}

/**
 * 푸시 알림을 보낼 유형 (Phase 81-1) — **화면 탭은 6유형 전부 보여주되 알림은 좁힌다.**
 *
 * 실측(보유·관심 13종목 최근 90일 58건)에서 「IR」이 41%(24건)·「실적예고」가 5%로
 * 합쳐 절반 가까이인데, 둘 다 **수치가 없는 일정 안내**다(IR 24건 중 수치표 0건,
 * 한 종목이 90일에 6번). 실적 자체가 아니라 "언제 발표하겠다"는 예고라 푸시로 받을
 * 이유가 없어 알림에서만 뺀다 — 탭에서 훑어보는 값은 그대로 있다 (사용자 확정).
 *
 * 「실적변동」은 이 표본에 0건이라 소음이 없으면서, 뜨면 매출·손익 30% 이상 변동
 * ·매출액 미달·자본잠식 같은 실적 급변 의무공시라 놓치면 안 되는 신호다.
 */
const ALERTABLE_LABELS = new Set(["잠정실적", "정기보고서", "실적변동"]);

/** 이 공시가 푸시 알림 대상인가 — 매칭 유형 중 하나라도 알림 대상이면 보낸다 */
export function isAlertableEarnings(categories: string[]): boolean {
  return categories.some((label) => ALERTABLE_LABELS.has(label));
}
