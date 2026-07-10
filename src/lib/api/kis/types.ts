/**
 * 한국투자증권 Open API — 원본 응답 타입
 */

export interface KisTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  access_token_token_expired?: string;
  error_description?: string;
  error_code?: string;
}

/** 국내업종 일자별지수 — 일자별/요약 행 공통 필드 */
export interface KisIndexDailyOutput {
  /** 영업 일자 (YYYYMMDD) */
  stck_bsop_date?: string;
  /** 업종 지수 현재가(종가) */
  bstp_nmix_prpr?: string;
  /** 전일 대비 */
  bstp_nmix_prdy_vrss?: string;
  /** 전일 대비 부호 (1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락) */
  prdy_vrss_sign?: string;
  /** 전일 대비율(%) */
  bstp_nmix_prdy_ctrt?: string;
  /** 시가 */
  bstp_nmix_oprc?: string;
  /** 고가 */
  bstp_nmix_hgpr?: string;
  /** 저가 */
  bstp_nmix_lwpr?: string;
  [key: string]: unknown;
}

export interface KisIndexDailyResponse {
  /** 성공 여부 (0: 성공) */
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  /** 현재 스냅샷 요약 */
  output1?: KisIndexDailyOutput;
  /** 일자별 배열 (최신순) */
  output2?: KisIndexDailyOutput[];
}

/**
 * 해외지수/환율/금리 기간별시세 (FHKST03030100) — output1 요약
 * 필드 구조는 국내업종의 bstp_nmix_*와 1:1 대응 (ovrs_nmix_* 접두)
 */
export interface KisOverseasDailyOutput1 {
  /** 현재가(종가) */
  ovrs_nmix_prpr?: string;
  /** 전일 대비 */
  ovrs_nmix_prdy_vrss?: string;
  /** 전일 대비 부호 (1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락) */
  prdy_vrss_sign?: string;
  /** 전일 대비율(%) */
  prdy_ctrt?: string;
  [key: string]: unknown;
}

/** 해외지수/환율/금리 기간별시세 — output2 일자별 행 */
export interface KisOverseasDailyOutput2 {
  /** 영업 일자 (YYYYMMDD) */
  stck_bsop_date?: string;
  /** 종가 */
  ovrs_nmix_prpr?: string;
  [key: string]: unknown;
}

export interface KisOverseasDailyResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output1?: KisOverseasDailyOutput1;
  /** 일자별 배열 (최신순) */
  output2?: KisOverseasDailyOutput2[];
}

/** 국내주식 현재가 시세 (FHKST01010100) */
export interface KisStockPriceResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: {
    /** 주식 현재가 */
    stck_prpr?: string;
    [key: string]: unknown;
  };
}
