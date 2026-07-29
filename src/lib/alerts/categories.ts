/**
 * 알림 종류(카테고리) 정의 — Phase 73.
 * Redis·web-push를 물지 않는 순수 모듈이라 서버 컴포넌트·서버 액션·클라이언트
 * 토글이 함께 import한다 (store.ts는 I/O만 담당).
 *
 * 종목별 음소거(`alerts:{email}:muted`)와는 축이 다르다 — 음소거는 "어떤 종목을",
 * 이 카테고리는 "어떤 종류의 알림을" 받을지 고른다. **4종 모두 둘 다 통과해야
 * 발송된다** — Phase 73의 배당 예외(음소거를 무시하고 발송)는 Phase 79에서
 * 폐기됐다(사용자 확정 — 종목별 알림을 끄면 그 종목은 4종 전부 멈추는 게 맞다).
 */

export type AlertCategory = "price" | "disclosure" | "marketWarn" | "dividend";

export type AlertCategoryPrefs = Record<AlertCategory, boolean>;

/** 미설정 사용자는 전부 켬 — Phase 73 이전과 동작이 같다 */
export const DEFAULT_ALERT_PREFS: AlertCategoryPrefs = {
  price: true,
  disclosure: true,
  marketWarn: true,
  dividend: true,
};

/** 설정 화면 표기 메타 — 배열 순서가 곧 화면 순서 */
export const ALERT_CATEGORY_META: ReadonlyArray<{
  key: AlertCategory;
  label: string;
  description: string;
}> = [
  {
    key: "price",
    label: "시세 급락",
    description:
      "기준가 대비 −10% · 신고가 대비 −10% · 소속 지수보다 10%p 이상 뒤처질 때",
  },
  {
    key: "disclosure",
    label: "공시",
    description:
      "상장폐지·회계·관리종목·증자·회사채·채무보증 공시 (배당 공시는 아래 「배당」)",
  },
  {
    key: "marketWarn",
    label: "시장경보",
    description: "투자주의·경고·위험 지정, 관리종목·거래정지·정리매매 변동",
  },
  {
    key: "dividend",
    label: "배당",
    description: "배당 공시 + 보유종목 배당 지급일 당일 알림",
  },
];

export function isAlertCategory(value: string): value is AlertCategory {
  return ALERT_CATEGORY_META.some((meta) => meta.key === value);
}
