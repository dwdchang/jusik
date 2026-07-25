/**
 * 관심종목 — 도메인 타입 (plan.md §15.4)
 * 수량·금액 없이 등록 기준일 종가 대비 수익률만 추적한다.
 */

export interface WatchItem {
  id: string;
  /** 종목코드 6자리, 예: "005930" */
  symbolCode: string;
  /** 종목명 — 등록 직후엔 빈 문자열, 다음 갱신 회차에 잡이 채운다 (§11.10-A4) */
  name: string;
  /** 등록 기준일 "YYYY-MM-DD" — 사용자가 나중에 수정 가능 */
  registeredAt: string;
  /** 기준일 종가(원) — null이면 「기준가 확정 중」, 갱신 잡이 히스토리에서 확정 */
  priceAtRegistration: number | null;
  /** 실제 사용한 종가의 날짜 — registeredAt보다 과거면 잠정(직전 거래일), 이후 회차에 승격 재확인 */
  priceBasisDate: string | null;
  /**
   * 기준가 종가일의 전일 대비 등락률(%) — 시세 스냅샷이 아직 없을 때 등락률 열의
   * 폴백값으로만 쓴다 (§65). 스냅샷이 생기면 실시간 값이 이기므로 갱신하지 않는다.
   */
  changeRateAtRegistration?: number | null;
  createdAt: string;
  updatedAt: string;
}
