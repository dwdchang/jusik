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
  /** 국내업종 일자별지수 (현재 스냅샷 output1 + 일자별 output2) */
  INDEX_DAILY_PRICE:
    "/uapi/domestic-stock/v1/quotations/inquire-index-daily-price",
  /** 해외지수/환율/금리 기간별시세 (output1 요약 + output2 일자별) */
  OVERSEAS_DAILY_CHART:
    "/uapi/overseas-price/v1/quotations/inquire-daily-chartprice",
  /** 국내주식 현재가 시세 */
  STOCK_PRICE: "/uapi/domestic-stock/v1/quotations/inquire-price",
  /** 주식기본조회 — 종목명 (plan.md §13.2 실측 확정) */
  STOCK_BASIC_INFO: "/uapi/domestic-stock/v1/quotations/search-stock-info",
  /** 국내주식 기간별시세 (일/주/월/년) — 1회 최대 100거래일 (plan.md §13.3 실측) */
  STOCK_DAILY_CHART:
    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
  /** 시가총액 상위 랭킹 — 1회 상위 30건 (plan.md §13.4 실측) */
  MARKET_CAP_RANKING: "/uapi/domestic-stock/v1/ranking/market-cap",
  /** 국내주식 등락률 순위 — 1회 상위 30건, tr_cont 연속조회 미지원 (2026-07-14 실측) */
  FLUCTUATION_RANKING: "/uapi/domestic-stock/v1/ranking/fluctuation",
  /** 예탁원 배당일정 */
  DIVIDEND: "/uapi/domestic-stock/v1/ksdinfo/dividend",
  /** 관심종목(멀티종목) 시세조회 — 1콜 최대 30종목 (Phase 43) */
  MULTI_PRICE: "/uapi/domestic-stock/v1/quotations/intstock-multprice",
  /** 손익계산서 — 분기값은 연중 누적(YTD), 단위 억원 (plan.md §13.4 실측) */
  INCOME_STATEMENT: "/uapi/domestic-stock/v1/finance/income-statement",
  /** 재무비율 — 증가율은 전년 동기 대비 직접 제공 */
  FINANCIAL_RATIO: "/uapi/domestic-stock/v1/finance/financial-ratio",
} as const;

export const KIS_TR_ID = {
  INDEX_DAILY_PRICE: "FHPUP02120000",
  OVERSEAS_DAILY_CHART: "FHKST03030100",
  STOCK_PRICE: "FHKST01010100",
  STOCK_BASIC_INFO: "CTPF1002R",
  STOCK_DAILY_CHART: "FHKST03010100",
  MARKET_CAP_RANKING: "FHPST01740000",
  FLUCTUATION_RANKING: "FHPST01700000",
  DIVIDEND: "HHKDB669102C0",
  MULTI_PRICE: "FHKST11300006",
  INCOME_STATEMENT: "FHKST66430200",
  FINANCIAL_RATIO: "FHKST66430300",
} as const;

/**
 * 등락률 순위 1회 응답 건수 — 전체시장 상위 30건이 상한 (2026-07-14 실측).
 * fid_input_cnt_1을 키워도 30건, tr_cont 연속조회도 1페이지로 리셋돼 100위는 불가.
 */
export const KIS_FLUCTUATION_RANKING_SIZE = 30;

/** 배당 정보 집계 범위 — 최근 1년 주당배당금 합계로 시가배당률을 계산 */
export const DIVIDEND_LOOKBACK_DAYS = 365;

/** 멀티시세 1콜 종목 수 상한 — FID_COND_MRKT_DIV_CODE_1~30 (Phase 43) */
export const KIS_MULTI_PRICE_BATCH_SIZE = 30;

/**
 * 배당률 순위의 연속 배당 연수 판정 범위(년) — Phase 43.
 * 예탁원 배당일정은 F_DT~T_DT 범위 조회라 이 값을 키워도 종목당 콜 수는 1로 불변이다.
 * KIS의 과거 조회 상한이 명세에 없어, 가장 이른 회차가 조회 시작 연도에 닿으면
 * 상한에 걸린 것으로 보고 "N년+"로 표기한다 (yearsCapped).
 */
export const DIVIDEND_RANKING_LOOKBACK_YEARS = 10;

/** 배당률 순위 표시 건수 — 전 종목 스캔 후 상위 N만 저장 (사용자 확정) */
export const DIVIDEND_RANKING_SIZE = 100;

/** 주식기본조회 상품유형코드 — 300: 국내주식 */
export const KIS_STOCK_PRDT_TYPE_CD = "300";

/** 종목별 일별 히스토리 저장 범위 — 최근 2년 (plan.md §13.3 확정) */
export const STOCK_HISTORY_WINDOW_DAYS = 730;

/** 기간별시세 1회 응답 최대 거래일 수 (2026-07-10 실측) */
export const STOCK_DAILY_CHART_PAGE_SIZE = 100;

/** 국내주식(현재가 조회) 시장 분류 코드 */
export const KIS_STOCK_MARKET_DIV_CODE = "J";

/**
 * 해외지수/환율/금리 지표별 조회 코드 — plan.md §9.1 (2026-07-08 실측 검증)
 * marketDivCode: N 해외지수 / X 환율 / I 국채 / S 금선물
 * OIL은 N/WTIF만 사용 — S/M0401 계열은 일자별(output2)이 비어 응답해 사용 금지 (§15.1 실측)
 */
export const KIS_OVERSEAS_INDICATOR = {
  USDKRW: { marketDivCode: "X", code: "FX@KRW" },
  US10Y: { marketDivCode: "I", code: "Y0202" },
  OIL: { marketDivCode: "N", code: "WTIF" },
  /** LBMA 런던 금 현물 (USD/온스) — N/GOLDLNPM 일자별 정상 (2026-07-19 실측, §30) */
  GOLD: { marketDivCode: "N", code: "GOLDLNPM" },
} as const;

/** 해외 기간별시세 조회 기간(일) — 최근 7거래일 확보용 여유 포함 */
export const KIS_OVERSEAS_LOOKBACK_DAYS = 31;

/**
 * 달러 인덱스(DXY) 계산용 환율 통화쌍 — plan.md §28 (2026-07-19 실측 검증).
 * KIS 마스터에 DXY 종목이 없어 ICE 공식의 가중 기하평균으로 계산한다:
 * DXY = 50.14348112 × EURUSD^-0.576 × USDJPY^0.136 × GBPUSD^-0.119
 *       × USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036
 * 6종 모두 marketDivCode X, 호가 방향은 공식과 일치 확인. ICE 공표값 대비
 * 소수점 수준 오차가 있을 수 있는 근사치다.
 */
export const KIS_DXY_BASE = 50.14348112;

export const KIS_DXY_COMPONENTS = [
  { code: "FX@EUR", exponent: -0.576 },
  { code: "FX@JPY", exponent: 0.136 },
  { code: "FX@GBP", exponent: -0.119 },
  { code: "FX@CAD", exponent: 0.091 },
  { code: "FX@SEK", exponent: 0.042 },
  { code: "FX@CHF", exponent: 0.036 },
] as const;

/** 업종(지수) 시장 분류 코드 */
export const KIS_MARKET_DIV_CODE = "U";

/** 업종 코드 — 가이드와 불일치 시 이 파일만 수정 */
export const KIS_INDEX_CODE = {
  KOSPI: "0001",
  KOSDAQ: "1001",
} as const;

/** 차트에 표시할 최근 거래일 수 */
export const KIS_HISTORY_POINT_COUNT = 7;

export const KIS_FETCH_TIMEOUT_MS = 15_000;
