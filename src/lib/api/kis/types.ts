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
