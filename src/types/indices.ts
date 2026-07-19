/**
 * 국내 지수 대시보드 — 도메인 타입 (UI · Recharts 공용)
 * @see plan.md §2.4
 */

export type MarketIndex = "KOSPI" | "KOSDAQ";

/** KIS 해외지수/환율/금리/유가/금 계열 지표 — FHKST03030100 단일 조회 가능 4종 */
export type OverseasIndicator = "USDKRW" | "US10Y" | "OIL" | "GOLD";

/**
 * 홈/상세에서 다루는 전체 지표 식별자.
 * DXY는 KIS에 종목이 없어 환율 6종으로 계산하는 파생 지표 (plan.md §28).
 * BTCKRW/BTCUSD는 KIS에 종목이 없어 업비트 공개 API로 수집하는 외부 지표 (plan.md §30).
 */
export type IndicatorId =
  | MarketIndex
  | OverseasIndicator
  | "DXY"
  | "BTCKRW"
  | "BTCUSD";

export const INDICATOR_NAMES: Record<IndicatorId, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  USDKRW: "원/달러 환율",
  US10Y: "미국 10년물 국채금리(%)",
  OIL: "국제유가 WTI(USD/배럴)",
  GOLD: "금 현물(국제, USD/온스)",
  DXY: "달러 인덱스",
  BTCKRW: "비트코인(원)",
  BTCUSD: "비트코인(달러)",
};

export type PriceDirection = "rise" | "fall" | "flat";

export interface IndexSnapshot {
  market: IndicatorId;
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
  market: IndicatorId;
  points: IndexChartPoint[];
}

export interface IndexDashboardData {
  asOf: string;
  dataNotice: string;
  kospi: IndexSnapshot;
  kosdaq: IndexSnapshot;
  kospiHistory: IndexSeries;
  kosdaqHistory: IndexSeries;
  usdKrw: IndexSnapshot;
  usTreasury10y: IndexSnapshot;
  /** 국제유가 WTI — Phase 15 추가 키라 첫 갱신 회차 전에는 null */
  oil: IndexSnapshot | null;
}

/** 상세 페이지 일별 시세 리스트 행 */
export interface IndexDailyRow {
  basDt: string;
  date: string;
  close: number;
  changeAmount: number;
  changeRate: number;
  direction: PriceDirection;
}

/** 지수 상세 페이지 데이터 (차트 + 일별 리스트) */
export interface IndexDetailData {
  asOf: string;
  dataNotice: string;
  snapshot: IndexSnapshot;
  history: IndexSeries;
  /** 최신순 정렬 */
  dailyRows: IndexDailyRow[];
}

export const KIS_DATA_NOTICE =
  "지수 데이터는 10분 간격으로 갱신됩니다. (장중 시세 지연 가능)";

/** kospiVolatility:history 일별 기록 — 코스피 일중 변동성 */
export interface KospiVolatilityRecord {
  /** "YYYY-MM-DD" (KST 기준) */
  date: string;
  /** (고가 − 저가) / 저가 × 100 (%) */
  dailyGapPercent: number;
}

/** 변동성 상세 차트 — 월별 평균 점 */
export interface VolatilityMonthlyPoint {
  /** "YYYY-MM" */
  month: string;
  /** x축 라벨, 예: "7월" */
  label: string;
  /** 해당 월 일일 변동성 평균(%) */
  avgGapPercent: number;
}

/** 홈 화면 코스피 변동성 카드 요약 */
export interface VolatilityCardSummary {
  /** 당월 평균 변동성(%) — 오늘까지의 진행분 평균 */
  currentMonthAvg: number;
  /** 전월 대비 증감(%p), 전월 기록이 없으면 null */
  monthOverMonthDiff: number | null;
}
