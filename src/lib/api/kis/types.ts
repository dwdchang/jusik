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

/**
 * 국내주식 현재가 시세 (FHKST01010100) — output.
 * 종목 상세 정보 블록(시가총액·투자지표)이 함께 쓴다 (plan.md §13.4, 2026-07-10 실측).
 */
export interface KisStockPriceOutput {
  /** 주식 현재가 */
  stck_prpr?: string;
  /** 전일 대비율(%) */
  prdy_ctrt?: string;
  /** 전일 대비 부호 (1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락) */
  prdy_vrss_sign?: string;
  /** HTS 시가총액 (억원) */
  hts_avls?: string;
  per?: string;
  pbr?: string;
  eps?: string;
  bps?: string;
  /** 52주 최고가 / 일자 / 현재가 대비율(%) */
  w52_hgpr?: string;
  w52_hgpr_date?: string;
  w52_hgpr_vrss_prpr_ctrt?: string;
  /** 52주 최저가 / 일자 / 현재가 대비율(%) */
  w52_lwpr?: string;
  w52_lwpr_date?: string;
  w52_lwpr_vrss_prpr_ctrt?: string;
  /** 상장주식수 */
  lstn_stcn?: string;
  /** 시장경보 구분 (00 없음 / 01 투자주의 / 02 투자경고 / 03 투자위험) — 시장경보 알림용 (§10.6 실측) */
  mrkt_warn_cls_code?: string;
  /** 투자주의환기 여부 (Y/N) */
  invt_caful_yn?: string;
  /** 관리종목 여부 */
  mang_issu_cls_code?: string;
  /** 단기과열 여부 (Y/N) */
  short_over_yn?: string;
  /** 거래정지 여부 (Y/N) */
  temp_stop_yn?: string;
  /** 정리매매 여부 (Y/N) */
  sltr_yn?: string;
  [key: string]: unknown;
}

/** 국내주식 현재가 시세 (FHKST01010100) */
export interface KisStockPriceResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: KisStockPriceOutput;
}

/** 국내주식 시가총액 상위 (FHPST01740000) — 1회 상위 30건 (plan.md §13.4 실측) */
export interface KisMarketCapRankingRow {
  /** 종목코드 6자리 */
  mksc_shrn_iscd?: string;
  /** 순위 (1부터) */
  data_rank?: string;
  hts_kor_isnm?: string;
  /** 시가총액 (억원) */
  stck_avls?: string;
  /** 시장 전체 시총 대비 비중(%) */
  mrkt_whol_avls_rlim?: string;
  [key: string]: unknown;
}

export interface KisMarketCapRankingResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: KisMarketCapRankingRow[];
}

/** 등락률 순위 (FHPST01700000) — output 행 (2026-07-14 실측 필드) */
export interface KisFluctuationRankingRow {
  /** 단축 종목코드 6자리 */
  stck_shrn_iscd?: string;
  /** 순위 (1부터) */
  data_rank?: string;
  /** HTS 한글 종목명 */
  hts_kor_isnm?: string;
  /** 현재가(원) */
  stck_prpr?: string;
  /** 전일 대비 */
  prdy_vrss?: string;
  /** 전일 대비 부호 (1:상한 2:상승 3:보합 4:하한 5:하락) */
  prdy_vrss_sign?: string;
  /** 전일 대비율(%) — 부호 미적용, prdy_vrss_sign으로 부호 판단 */
  prdy_ctrt?: string;
  /** 누적 거래량 */
  acml_vol?: string;
  [key: string]: unknown;
}

export interface KisFluctuationRankingResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: KisFluctuationRankingRow[];
}

/** 예탁원 배당일정 (HHKDB669102C0) — output1 행 (plan.md §13.4 실측) */
export interface KisDividendRow {
  /** 기준일 (YYYYMMDD) */
  record_date?: string;
  sht_cd?: string;
  isin_name?: string;
  /** 배당종류 — "분기", "결산", "중간" 등 */
  divi_kind?: string;
  /** 주당배당금(원) — 미확정 회차는 0 */
  per_sto_divi_amt?: string;
  /** 액면가배당률(%) — 시가배당률 아님 */
  divi_rate?: string;
  /** 현금배당 지급일 (YYYYMMDD, 미정이면 빈 문자열) */
  divi_pay_dt?: string;
  stk_kind?: string;
  [key: string]: unknown;
}

export interface KisDividendResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output1?: KisDividendRow[];
}

/**
 * 국내주식 손익계산서 (FHKST66430200) — output 행.
 * 금액 단위 억원, 값은 연중 누적(YTD) — 분기 단독값은 차감 계산 (plan.md §13.4 실측).
 */
export interface KisIncomeStatementRow {
  /** 결산 연월 (YYYYMM) */
  stac_yymm?: string;
  /** 매출액 (억원, YTD) */
  sale_account?: string;
  /** 영업이익 (억원, YTD) */
  bsop_prti?: string;
  /** 당기순이익 (억원, YTD) */
  thtr_ntin?: string;
  [key: string]: unknown;
}

export interface KisIncomeStatementResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: KisIncomeStatementRow[];
}

/** 국내주식 재무비율 (FHKST66430300) — output 행. 증가율은 전년 동기 대비(%) */
export interface KisFinancialRatioRow {
  /** 결산 연월 (YYYYMM) */
  stac_yymm?: string;
  /** 매출액 증가율(%) */
  grs?: string;
  /** 영업이익 증가율(%) */
  bsop_prfi_inrt?: string;
  /** 순이익 증가율(%) */
  ntin_inrt?: string;
  roe_val?: string;
  [key: string]: unknown;
}

export interface KisFinancialRatioResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: KisFinancialRatioRow[];
}

/** 국내주식 기간별시세 (FHKST03010100) — output2 일자별 행 */
export interface KisStockDailyChartRow {
  /** 영업 일자 (YYYYMMDD) */
  stck_bsop_date?: string;
  /** 종가 */
  stck_clpr?: string;
  [key: string]: unknown;
}

export interface KisStockDailyChartResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output1?: Record<string, unknown>;
  /** 일자별 배열 (최신순) — 빈 슬롯이 섞여 올 수 있어 필드 존재 여부로 걸러야 함 */
  output2?: KisStockDailyChartRow[];
}

/** 주식기본조회 (CTPF1002R) — 종목명 자동 저장용 (plan.md §13.2 실측 확정) */
export interface KisStockBasicInfoResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: {
    /** 상품명 약어 — 예: "삼성전자" */
    prdt_abrv_name?: string;
    /** 상품명 — 예: "삼성전자보통주" */
    prdt_name?: string;
    [key: string]: unknown;
  };
}
