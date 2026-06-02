/**
 * 국내 지수 대시보드 — 도메인 타입 (UI · Recharts 공용)
 * @see plan.md §2.4
 */

export type MarketIndex = "KOSPI" | "KOSDAQ";

export type PriceDirection = "rise" | "fall" | "flat";

export interface IndexSnapshot {
  market: MarketIndex;
  name: string;
  basDt: string;
  close: number;
  changeAmount: number;
  changeRate: number;
  direction: PriceDirection;
}

/** Recharts LineChart `data` 배열 요소 */
export interface IndexChartPoint {
  date: string;
  basDt: string;
  close: number;
}

export interface IndexSeries {
  market: MarketIndex;
  points: IndexChartPoint[];
}

export interface IndexDashboardData {
  asOf: string;
  dataNotice: string;
  kospi: IndexSnapshot;
  kosdaq: IndexSnapshot;
  kospiHistory: IndexSeries;
  kosdaqHistory: IndexSeries;
}

export const DATA_UPDATE_NOTICE =
  "지수 데이터는 공공데이터포털 기준 익영업일 오후 1시 이후 반영됩니다.";
