import type { MarketIndex, OverseasIndicator } from "@/types/indices";
import { getKisAccessToken } from "./auth";
import {
  KIS_BASE_URL,
  KIS_ENDPOINTS,
  KIS_FETCH_TIMEOUT_MS,
  KIS_INDEX_CODE,
  KIS_MARKET_DIV_CODE,
  KIS_MULTI_PRICE_BATCH_SIZE,
  KIS_OVERSEAS_INDICATOR,
  KIS_OVERSEAS_LOOKBACK_DAYS,
  KIS_STOCK_MARKET_DIV_CODE,
  KIS_STOCK_PRDT_TYPE_CD,
  KIS_TR_ID,
} from "./constants";
import type {
  KisDividendResponse,
  KisDividendRow,
  KisFinancialRatioResponse,
  KisFinancialRatioRow,
  KisFluctuationRankingResponse,
  KisFluctuationRankingRow,
  KisIncomeStatementResponse,
  KisIncomeStatementRow,
  KisIndexDailyResponse,
  KisMarketCapRankingResponse,
  KisMarketCapRankingRow,
  KisMultiPriceResponse,
  KisMultiPriceRow,
  KisOverseasDailyResponse,
  KisStockBasicInfoResponse,
  KisStockDailyChartResponse,
  KisStockPriceOutput,
  KisStockPriceResponse,
} from "./types";

interface KisBaseResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
}

/**
 * KIS GET 공통 처리 — 표준 헤더 + rt_cd 검증.
 * 호출 주체가 QStash 갱신 잡뿐이므로 캐시하지 않는다 (plan.md §11.6).
 */
async function fetchKisJson<T extends KisBaseResponse>(
  label: string,
  endpoint: string,
  trId: string,
  params: Record<string, string>
): Promise<T> {
  const token = await getKisAccessToken();
  const appKey = process.env.KIS_APP_KEY?.trim() ?? "";
  const appSecret = process.env.KIS_APP_SECRET?.trim() ?? "";

  const url = `${KIS_BASE_URL}${endpoint}?${new URLSearchParams(params).toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
      custtype: "P",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(KIS_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIS ${label} HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as T;

  if (data.rt_cd !== "0") {
    throw new Error(
      `KIS ${label} error [${data.msg_cd ?? "?"}] ${data.msg1 ?? "unknown error"}`
    );
  }

  return data;
}

/** KST 기준 n일 전 날짜 (YYYYMMDD) */
function kstYyyyMmDd(daysAgo = 0): string {
  const kst = new Date(
    Date.now() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000
  );
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function todayKstYyyyMmDd(): string {
  return kstYyyyMmDd(0);
}

/**
 * 국내업종 일자별지수 조회.
 * output1(현재 스냅샷)과 output2(일자별 배열)를 함께 반환한다.
 */
export async function fetchKisIndexDaily(
  market: MarketIndex
): Promise<KisIndexDailyResponse> {
  return fetchKisJson<KisIndexDailyResponse>(
    "index daily",
    KIS_ENDPOINTS.INDEX_DAILY_PRICE,
    KIS_TR_ID.INDEX_DAILY_PRICE,
    {
      FID_COND_MRKT_DIV_CODE: KIS_MARKET_DIV_CODE,
      FID_INPUT_ISCD: KIS_INDEX_CODE[market],
      FID_INPUT_DATE_1: todayKstYyyyMmDd(),
      FID_PERIOD_DIV_CODE: "D",
    }
  );
}

/**
 * 해외지수/환율/금리 기간별시세 조회 (FHKST03030100).
 * 최근 KIS_OVERSEAS_LOOKBACK_DAYS일 범위를 일 단위로 조회한다.
 */
export async function fetchKisOverseasDaily(
  indicator: OverseasIndicator
): Promise<KisOverseasDailyResponse> {
  const { marketDivCode, code } = KIS_OVERSEAS_INDICATOR[indicator];

  return fetchKisJson<KisOverseasDailyResponse>(
    "overseas daily",
    KIS_ENDPOINTS.OVERSEAS_DAILY_CHART,
    KIS_TR_ID.OVERSEAS_DAILY_CHART,
    {
      FID_COND_MRKT_DIV_CODE: marketDivCode,
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: kstYyyyMmDd(KIS_OVERSEAS_LOOKBACK_DAYS),
      FID_INPUT_DATE_2: todayKstYyyyMmDd(),
      FID_PERIOD_DIV_CODE: "D",
    }
  );
}

/**
 * 환율 통화쌍 기간별시세 조회 (FHKST03030100, marketDivCode X) — 달러 인덱스
 * 계산용 (plan.md §28). 고정 3종의 fetchKisOverseasDaily와 달리 코드를 직접 받는다.
 */
export async function fetchKisFxPairDaily(
  code: string
): Promise<KisOverseasDailyResponse> {
  return fetchKisJson<KisOverseasDailyResponse>(
    "fx pair daily",
    KIS_ENDPOINTS.OVERSEAS_DAILY_CHART,
    KIS_TR_ID.OVERSEAS_DAILY_CHART,
    {
      FID_COND_MRKT_DIV_CODE: "X",
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: kstYyyyMmDd(KIS_OVERSEAS_LOOKBACK_DAYS),
      FID_INPUT_DATE_2: todayKstYyyyMmDd(),
      FID_PERIOD_DIV_CODE: "D",
    }
  );
}

/**
 * 국내주식 현재가 전체 필드 (FHKST01010100) — 현재가·시가총액·PER/PBR·52주 최고/최저 등.
 * Phase 11부터 갱신 잡이 종목당 1회 호출해 `market:stock:{code}`에 저장한다.
 */
export async function fetchKisStockSnapshot(
  symbolCode: string
): Promise<KisStockPriceOutput> {
  const data = await fetchKisJson<KisStockPriceResponse>(
    "stock price",
    KIS_ENDPOINTS.STOCK_PRICE,
    KIS_TR_ID.STOCK_PRICE,
    {
      FID_COND_MRKT_DIV_CODE: KIS_STOCK_MARKET_DIV_CODE,
      FID_INPUT_ISCD: symbolCode,
    }
  );

  if (!data.output) {
    throw new Error(`KIS stock snapshot missing output for ${symbolCode}`);
  }

  return data.output;
}

/** 시가총액 상위 랭킹 (FHPST01740000) — 상위 30건 (plan.md §13.4 실측) */
export async function fetchKisMarketCapRanking(): Promise<
  KisMarketCapRankingRow[]
> {
  const data = await fetchKisJson<KisMarketCapRankingResponse>(
    "market cap ranking",
    KIS_ENDPOINTS.MARKET_CAP_RANKING,
    KIS_TR_ID.MARKET_CAP_RANKING,
    {
      fid_cond_mrkt_div_code: KIS_STOCK_MARKET_DIV_CODE,
      fid_cond_scr_div_code: "20174",
      fid_div_cls_code: "0",
      fid_input_iscd: "0000",
      fid_trgt_cls_code: "0",
      fid_trgt_exls_cls_code: "0",
      fid_input_price_1: "",
      fid_input_price_2: "",
      fid_vol_cnt: "",
    }
  );

  return data.output ?? [];
}

/**
 * 국내주식 등락률 순위 (FHPST01700000) — 전체시장 상위 30건 (2026-07-14 실측).
 * sort "0" 상승률순 / "1" 하락률순. 1콜 30건이 상한이라 페이지네이션은 하지 않는다.
 * fid_prc_cls_code는 비교 기준가 선택으로 "0"이면 저가대비(당일 저가 대비 수익률)
 * 순위가 나온다 — 전일 종가 대비 등락률순은 "1"(종가대비)이어야 한다 (2026-07-17 실측).
 * compareDays는 fid_input_cnt_1 값 — "0" 당일(전일 종가 대비, prdy_ctrt가 기준),
 * "5" 5거래일 전 종가 대비(dsgt_date_clpr_vrss_prpr_rate가 기준·정렬값, 2026-07-18 실측).
 * 시세 갱신 잡이 회차당 각 1회 호출해 `market:dailyFluctuation`·`market:weeklyFluctuation`에
 * 저장한다.
 */
export async function fetchKisFluctuationRanking(
  sort: "0" | "1" = "0",
  compareDays: "0" | "5" = "0"
): Promise<KisFluctuationRankingRow[]> {
  const data = await fetchKisJson<KisFluctuationRankingResponse>(
    "fluctuation ranking",
    KIS_ENDPOINTS.FLUCTUATION_RANKING,
    KIS_TR_ID.FLUCTUATION_RANKING,
    {
      fid_cond_mrkt_div_code: KIS_STOCK_MARKET_DIV_CODE,
      fid_cond_scr_div_code: "20170",
      fid_input_iscd: "0000",
      fid_rank_sort_cls_code: sort,
      fid_input_cnt_1: compareDays,
      fid_prc_cls_code: "1",
      fid_input_price_1: "",
      fid_input_price_2: "",
      fid_vol_cnt: "",
      fid_trgt_cls_code: "0",
      fid_trgt_exls_cls_code: "0",
      fid_div_cls_code: "0",
      fid_rsfl_rate1: "",
      fid_rsfl_rate2: "",
    }
  );

  return data.output ?? [];
}

/** 예탁원 배당일정 (HHKDB669102C0) — 기준일 범위 내 배당 이벤트 목록 */
export async function fetchKisDividends(
  symbolCode: string,
  fromYyyyMmDd: string,
  toYyyyMmDd: string
): Promise<KisDividendRow[]> {
  const data = await fetchKisJson<KisDividendResponse>(
    "dividend",
    KIS_ENDPOINTS.DIVIDEND,
    KIS_TR_ID.DIVIDEND,
    {
      CTS: "",
      GB1: "0",
      F_DT: fromYyyyMmDd,
      T_DT: toYyyyMmDd,
      SHT_CD: symbolCode,
      HIGH_GB: "",
    }
  );

  return data.output1 ?? [];
}

/**
 * 관심종목(멀티종목) 시세조회 (FHKST11300006) — 1콜 최대 30종목. Phase 43.
 * 파라미터가 `FID_COND_MRKT_DIV_CODE_N`/`FID_INPUT_ISCD_N`(N=1..30) 쌍으로 평탄하게
 * 나열되는 특이 스펙이라 배열이 아닌 인덱스 접미사로 조립한다.
 */
export async function fetchKisMultiPrice(
  symbolCodes: string[]
): Promise<KisMultiPriceRow[]> {
  if (symbolCodes.length === 0) {
    return [];
  }

  if (symbolCodes.length > KIS_MULTI_PRICE_BATCH_SIZE) {
    throw new Error(
      `multi price accepts at most ${KIS_MULTI_PRICE_BATCH_SIZE} codes (got ${symbolCodes.length})`
    );
  }

  const params: Record<string, string> = {};
  symbolCodes.forEach((code, i) => {
    const n = i + 1;
    params[`FID_COND_MRKT_DIV_CODE_${n}`] = KIS_STOCK_MARKET_DIV_CODE;
    params[`FID_INPUT_ISCD_${n}`] = code;
  });

  const data = await fetchKisJson<KisMultiPriceResponse>(
    "multi price",
    KIS_ENDPOINTS.MULTI_PRICE,
    KIS_TR_ID.MULTI_PRICE,
    params
  );

  return data.output ?? [];
}

/** 손익계산서 분기 조회 (FHKST66430200) — 값은 연중 누적(YTD, 억원), 최신순 */
export async function fetchKisIncomeStatement(
  symbolCode: string
): Promise<KisIncomeStatementRow[]> {
  const data = await fetchKisJson<KisIncomeStatementResponse>(
    "income statement",
    KIS_ENDPOINTS.INCOME_STATEMENT,
    KIS_TR_ID.INCOME_STATEMENT,
    {
      FID_DIV_CLS_CODE: "1",
      fid_cond_mrkt_div_code: KIS_STOCK_MARKET_DIV_CODE,
      fid_input_iscd: symbolCode,
    }
  );

  return data.output ?? [];
}

/** 재무비율 분기 조회 (FHKST66430300) — 증가율은 전년 동기 대비(%), 최신순 */
export async function fetchKisFinancialRatio(
  symbolCode: string
): Promise<KisFinancialRatioRow[]> {
  const data = await fetchKisJson<KisFinancialRatioResponse>(
    "financial ratio",
    KIS_ENDPOINTS.FINANCIAL_RATIO,
    KIS_TR_ID.FINANCIAL_RATIO,
    {
      FID_DIV_CLS_CODE: "1",
      fid_cond_mrkt_div_code: KIS_STOCK_MARKET_DIV_CODE,
      fid_input_iscd: symbolCode,
    }
  );

  return data.output ?? [];
}

/**
 * 주식기본조회 (CTPF1002R) → 종목명.
 * 현재가 응답(FHKST01010100)에는 종목명이 없어(2026-07-10 실측) 이 엔드포인트를 쓴다.
 * Phase 11부터 갱신 잡이 종목명 미확정 보유종목에 대해 호출해 채운다 (§11.10-A4).
 */
export async function fetchKisStockName(symbolCode: string): Promise<string> {
  const data = await fetchKisJson<KisStockBasicInfoResponse>(
    "stock basic info",
    KIS_ENDPOINTS.STOCK_BASIC_INFO,
    KIS_TR_ID.STOCK_BASIC_INFO,
    {
      PRDT_TYPE_CD: KIS_STOCK_PRDT_TYPE_CD,
      PDNO: symbolCode,
    }
  );

  const name =
    data.output?.prdt_abrv_name?.trim() || data.output?.prdt_name?.trim();

  if (!name) {
    throw new Error(`KIS stock name missing for ${symbolCode}`);
  }

  return name;
}

/**
 * 국내주식 기간별시세 (FHKST03010100, 월 단위) — 범위 내 각 월 마지막 거래일의
 * 종가를 최신순으로 반환, 1회 최대 100행 (plan.md §14.1 실측).
 * FID_INPUT_DATE_2를 월말로 주면 진행 중인 달은 포함되지 않는다.
 * 핫종목 갱신 잡 전용 — 종목당 1콜로 구간 4종 수익률을 계산한다 (§14.2).
 */
export async function fetchKisStockMonthlyChart(
  symbolCode: string,
  fromYyyyMmDd: string,
  toYyyyMmDd: string
): Promise<KisStockDailyChartResponse> {
  return fetchKisJson<KisStockDailyChartResponse>(
    "stock monthly chart",
    KIS_ENDPOINTS.STOCK_DAILY_CHART,
    KIS_TR_ID.STOCK_DAILY_CHART,
    {
      FID_COND_MRKT_DIV_CODE: KIS_STOCK_MARKET_DIV_CODE,
      FID_INPUT_ISCD: symbolCode,
      FID_INPUT_DATE_1: fromYyyyMmDd,
      FID_INPUT_DATE_2: toYyyyMmDd,
      FID_PERIOD_DIV_CODE: "M",
      FID_ORG_ADJ_PRC: "0",
    }
  );
}

/**
 * 국내주식 기간별시세 (FHKST03010100, 일 단위) — 1회 최대 100거래일 (최신순).
 * 백필·갱신 잡 전용 (plan.md §13.3).
 */
export async function fetchKisStockDailyChart(
  symbolCode: string,
  fromYyyyMmDd: string,
  toYyyyMmDd: string
): Promise<KisStockDailyChartResponse> {
  return fetchKisJson<KisStockDailyChartResponse>(
    "stock daily chart",
    KIS_ENDPOINTS.STOCK_DAILY_CHART,
    KIS_TR_ID.STOCK_DAILY_CHART,
    {
      FID_COND_MRKT_DIV_CODE: KIS_STOCK_MARKET_DIV_CODE,
      FID_INPUT_ISCD: symbolCode,
      FID_INPUT_DATE_1: fromYyyyMmDd,
      FID_INPUT_DATE_2: toYyyyMmDd,
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0",
    }
  );
}
