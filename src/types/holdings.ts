/**
 * 보유종목 관리 — 도메인 타입
 * @see plan.md §9.4.3, §13.1
 */

export interface Holding {
  id: string;
  /** 종목코드 6자리, 예: "005930" */
  symbolCode: string;
  /** 종목명 (KIS 주식기본조회 응답에서 자동 저장) */
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

/** 종목별 평가 결과 */
export interface HoldingValuation {
  holding: Holding;
  currentPrice: number;
  /** 매입금액 = totalCost */
  cost: number;
  /** 평가금액 = 현재가 × 수량 */
  value: number;
  /** 평가손익 = 평가금액 − 매입금액 */
  profit: number;
  /** 수익률(%) = 평가손익 / 매입금액 × 100 */
  returnRate: number;
}

export interface PortfolioValuation {
  items: HoldingValuation[];
  totalCost: number;
  totalValue: number;
  totalProfit: number;
  /** 총 수익률(%) */
  totalReturnRate: number;
}

/** 홈 화면 보유종목 카드 요약 */
export interface HoldingsCardSummary {
  totalReturnRate: number;
  /** 전일 기록이 없으면 null */
  dailyChangeRate: number | null;
}
