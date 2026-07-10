/**
 * 한국투자증권(KIS) Open API — 국내업종 지수 시세
 * @see https://apiportal.koreainvestment.com/
 *
 * 인증키(App Key/Secret)는 서버 전용 환경변수에서만 참조한다.
 */

export const KIS_BASE_URL =
  process.env.KIS_BASE_URL?.trim() ||
  "https://openapi.koreainvestment.com:9443";

export const KIS_ENDPOINTS = {
  /** 접근토큰 발급 (1초 1건 제한) */
  TOKEN: "/oauth2/tokenP",
  /** 국내업종 현재지수 */
  INDEX_PRICE: "/uapi/domestic-stock/v1/quotations/inquire-index-price",
  /** 국내업종 일자별지수 (현재 스냅샷 output1 + 일자별 output2) */
  INDEX_DAILY_PRICE:
    "/uapi/domestic-stock/v1/quotations/inquire-index-daily-price",
  /** 해외지수/환율/금리 기간별시세 (output1 요약 + output2 일자별) */
  OVERSEAS_DAILY_CHART:
    "/uapi/overseas-price/v1/quotations/inquire-daily-chartprice",
  /** 국내주식 현재가 시세 */
  STOCK_PRICE: "/uapi/domestic-stock/v1/quotations/inquire-price",
} as const;

export const KIS_TR_ID = {
  INDEX_PRICE: "FHPUP02100000",
  INDEX_DAILY_PRICE: "FHPUP02120000",
  OVERSEAS_DAILY_CHART: "FHKST03030100",
  STOCK_PRICE: "FHKST01010100",
} as const;

/** 국내주식(현재가 조회) 시장 분류 코드 */
export const KIS_STOCK_MARKET_DIV_CODE = "J";

/**
 * 해외지수/환율/금리 지표별 조회 코드 — plan.md §9.1 (2026-07-08 실측 검증)
 * marketDivCode: N 해외지수 / X 환율 / I 국채 / S 금선물
 */
export const KIS_OVERSEAS_INDICATOR = {
  USDKRW: { marketDivCode: "X", code: "FX@KRW" },
  US10Y: { marketDivCode: "I", code: "Y0202" },
} as const;

/** 해외 기간별시세 조회 기간(일) — 최근 7거래일 확보용 여유 포함 */
export const KIS_OVERSEAS_LOOKBACK_DAYS = 31;

/** 업종(지수) 시장 분류 코드 */
export const KIS_MARKET_DIV_CODE = "U";

/** 업종 코드 — 가이드와 불일치 시 이 파일만 수정 */
export const KIS_INDEX_CODE = {
  KOSPI: "0001",
  KOSDAQ: "1001",
} as const;

/** 차트에 표시할 최근 거래일 수 */
export const KIS_HISTORY_POINT_COUNT = 7;

/** 준실시간 — 10분 단위 캐시 */
export const KIS_CACHE_REVALIDATE_SECONDS = 600;

export const KIS_CACHE_TAGS = ["indices"] as const;

export const KIS_FETCH_TIMEOUT_MS = 15_000;
