/**
 * 보유종목 관리 — 도메인 타입
 * @see plan.md §9.4.3, §13.1
 */

export interface Holding {
  id: string;
  /** 종목코드 6자리, 예: "005930" */
  symbolCode: string;
  /** 종목명 — 등록 직후엔 빈 문자열, 다음 갱신 회차에 잡이 KIS 조회로 채운다 (§11.10-A4) */
  name: string;
  quantity: number;
  /** 총 매입금액(원) — 1주당 평균 매입가는 저장하지 않고 표시 시 계산 */
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

/** holdings:{email}:history 일별 기록 */
export interface PortfolioDailyRecord {
  /** "YYYY-MM-DD" (KST 기준) */
  date: string;
  /** 그날의 총 매입금액(원) */
  totalCost: number;
  /** 그날의 총 평가금액(원) */
  totalValue: number;
}

/**
 * 종목별 평가 결과.
 * 저장된 시세 스냅샷이 없는 종목은 currentPrice가 null — 화면에 「시세 없음」 표기,
 * 다른 종목 평가에는 영향 없음 (Phase 11 §11.10-A4 실패 격리).
 */
export interface HoldingValuation {
  holding: Holding;
  currentPrice: number | null;
  /** 매입금액 = totalCost */
  cost: number;
  /** 평가금액 = 현재가 × 수량 — 시세 없으면 null */
  value: number | null;
  /** 평가손익 = 평가금액 − 매입금액 — 시세 없으면 null */
  profit: number | null;
  /** 수익률(%) = 평가손익 / 매입금액 × 100 — 시세 없으면 null */
  returnRate: number | null;
}

export interface PortfolioValuation {
  items: HoldingValuation[];
  /** 합계는 시세가 있는 종목만 집계한다 */
  totalCost: number;
  totalValue: number;
  totalProfit: number;
  /** 총 수익률(%) */
  totalReturnRate: number;
  /** 시세 스냅샷이 없어 합계에서 제외된 종목코드 */
  missingPriceSymbols: string[];
}

/** 홈 화면 보유종목 카드 요약 */
export interface HoldingsCardSummary {
  totalReturnRate: number;
  /** 전일 기록이 없으면 null */
  dailyChangeRate: number | null;
}
