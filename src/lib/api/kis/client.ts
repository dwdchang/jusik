import type { MarketIndex, OverseasIndicator } from "@/types/indices";
import { getKisAccessToken } from "./auth";
import {
  KIS_BASE_URL,
  KIS_CACHE_REVALIDATE_SECONDS,
  KIS_CACHE_TAGS,
  KIS_ENDPOINTS,
  KIS_FETCH_TIMEOUT_MS,
  KIS_INDEX_CODE,
  KIS_MARKET_DIV_CODE,
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
  KisIncomeStatementResponse,
  KisIncomeStatementRow,
  KisIndexDailyResponse,
  KisMarketCapRankingResponse,
  KisMarketCapRankingRow,
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
 * KIS GET 공통 처리 — 표준 헤더 + 10분 캐시(revalidate) + rt_cd 검증.
 * 같은 URL·옵션 호출은 Next fetch 캐시로 중복 제거된다.
 */
async function fetchKisJson<T extends KisBaseResponse>(
  label: string,
  endpoint: string,
  trId: string,
  params: Record<string, string>,
  cacheTags: string[]
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
    next: {
      revalidate: KIS_CACHE_REVALIDATE_SECONDS,
      tags: cacheTags,
    },
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
  const token = await getKisAccessToken();
  const appKey = process.env.KIS_APP_KEY?.trim() ?? "";
  const appSecret = process.env.KIS_APP_SECRET?.trim() ?? "";

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: KIS_MARKET_DIV_CODE,
    FID_INPUT_ISCD: KIS_INDEX_CODE[market],
    FID_INPUT_DATE_1: todayKstYyyyMmDd(),
    FID_PERIOD_DIV_CODE: "D",
  });

  const url = `${KIS_BASE_URL}${KIS_ENDPOINTS.INDEX_DAILY_PRICE}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: KIS_TR_ID.INDEX_DAILY_PRICE,
      custtype: "P",
    },
    next: {
      revalidate: KIS_CACHE_REVALIDATE_SECONDS,
      tags: [...KIS_CACHE_TAGS],
    },
    signal: AbortSignal.timeout(KIS_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIS index daily HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as KisIndexDailyResponse;

  if (data.rt_cd !== "0") {
    throw new Error(
      `KIS index daily error [${data.msg_cd ?? "?"}] ${
        data.msg1 ?? "unknown error"
      }`
    );
  }

  return data;
}

/**
 * 해외지수/환율/금리 기간별시세 조회 (FHKST03030100).
 * 최근 KIS_OVERSEAS_LOOKBACK_DAYS일 범위를 일 단위로 조회한다.
 */
export async function fetchKisOverseasDaily(
  indicator: OverseasIndicator
): Promise<KisOverseasDailyResponse> {
  const token = await getKisAccessToken();
  const appKey = process.env.KIS_APP_KEY?.trim() ?? "";
  const appSecret = process.env.KIS_APP_SECRET?.trim() ?? "";
  const { marketDivCode, code } = KIS_OVERSEAS_INDICATOR[indicator];

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: marketDivCode,
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: kstYyyyMmDd(KIS_OVERSEAS_LOOKBACK_DAYS),
    FID_INPUT_DATE_2: todayKstYyyyMmDd(),
    FID_PERIOD_DIV_CODE: "D",
  });

  const url = `${KIS_BASE_URL}${KIS_ENDPOINTS.OVERSEAS_DAILY_CHART}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: KIS_TR_ID.OVERSEAS_DAILY_CHART,
      custtype: "P",
    },
    next: {
      revalidate: KIS_CACHE_REVALIDATE_SECONDS,
      tags: [...KIS_CACHE_TAGS],
    },
    signal: AbortSignal.timeout(KIS_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIS overseas daily HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as KisOverseasDailyResponse;

  if (data.rt_cd !== "0") {
    throw new Error(
      `KIS overseas daily error [${data.msg_cd ?? "?"}] ${
        data.msg1 ?? "unknown error"
      }`
    );
  }

  return data;
}

/** 국내주식 현재가 시세 원본 응답 — 현재가·스냅샷이 같은 캐시 항목을 공유한다 */
async function fetchKisStockPriceResponse(
  symbolCode: string
): Promise<KisStockPriceResponse> {
  return fetchKisJson<KisStockPriceResponse>(
    "stock price",
    KIS_ENDPOINTS.STOCK_PRICE,
    KIS_TR_ID.STOCK_PRICE,
    {
      FID_COND_MRKT_DIV_CODE: KIS_STOCK_MARKET_DIV_CODE,
      FID_INPUT_ISCD: symbolCode,
    },
    [...KIS_CACHE_TAGS, `stock:${symbolCode}`]
  );
}

/**
 * 국내주식 현재가 조회 (FHKST01010100) → 현재가(원).
 * 종목코드가 유효하지 않으면 throw — 보유종목 저장 시 실존 검증에도 사용된다.
 */
export async function fetchKisStockPrice(symbolCode: string): Promise<number> {
  const data = await fetchKisStockPriceResponse(symbolCode);
  const price = Number(data.output?.stck_prpr);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`KIS stock price invalid for ${symbolCode}`);
  }

  return price;
}

/**
 * 국내주식 현재가 전체 필드 (FHKST01010100) — 시가총액·PER/PBR·52주 최고/최저 등.
 * fetchKisStockPrice와 같은 요청이라 추가 KIS 호출 없이 캐시를 공유한다 (plan.md §13.4).
 */
export async function fetchKisStockSnapshot(
  symbolCode: string
): Promise<KisStockPriceOutput> {
  const data = await fetchKisStockPriceResponse(symbolCode);

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
    },
    [...KIS_CACHE_TAGS]
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
    },
    [...KIS_CACHE_TAGS, `stock:${symbolCode}`]
  );

  return data.output1 ?? [];
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
    },
    [...KIS_CACHE_TAGS, `stock:${symbolCode}`]
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
    },
    [...KIS_CACHE_TAGS, `stock:${symbolCode}`]
  );

  return data.output ?? [];
}

/**
 * 주식기본조회 (CTPF1002R) → 종목명.
 * 현재가 응답(FHKST01010100)에는 종목명이 없어(2026-07-10 실측) 이 엔드포인트를 쓴다.
 * 종목 추가 시 1회 호출해 저장한다 — plan.md §13.2.
 */
export async function fetchKisStockName(symbolCode: string): Promise<string> {
  const token = await getKisAccessToken();
  const appKey = process.env.KIS_APP_KEY?.trim() ?? "";
  const appSecret = process.env.KIS_APP_SECRET?.trim() ?? "";

  const params = new URLSearchParams({
    PRDT_TYPE_CD: KIS_STOCK_PRDT_TYPE_CD,
    PDNO: symbolCode,
  });

  const url = `${KIS_BASE_URL}${KIS_ENDPOINTS.STOCK_BASIC_INFO}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: KIS_TR_ID.STOCK_BASIC_INFO,
      custtype: "P",
    },
    next: {
      revalidate: KIS_CACHE_REVALIDATE_SECONDS,
      tags: [...KIS_CACHE_TAGS, `stock:${symbolCode}`],
    },
    signal: AbortSignal.timeout(KIS_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIS stock basic info HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as KisStockBasicInfoResponse;

  if (data.rt_cd !== "0") {
    throw new Error(
      `KIS stock basic info error [${data.msg_cd ?? "?"}] ${
        data.msg1 ?? "unknown error"
      }`
    );
  }

  const name =
    data.output?.prdt_abrv_name?.trim() || data.output?.prdt_name?.trim();

  if (!name) {
    throw new Error(`KIS stock name missing for ${symbolCode}`);
  }

  return name;
}

/**
 * 국내주식 기간별시세 (FHKST03010100, 일 단위) — 1회 최대 100거래일 (최신순).
 * 백필·cron 갱신 전용이라 캐시하지 않는다 (plan.md §13.3).
 */
export async function fetchKisStockDailyChart(
  symbolCode: string,
  fromYyyyMmDd: string,
  toYyyyMmDd: string
): Promise<KisStockDailyChartResponse> {
  const token = await getKisAccessToken();
  const appKey = process.env.KIS_APP_KEY?.trim() ?? "";
  const appSecret = process.env.KIS_APP_SECRET?.trim() ?? "";

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: KIS_STOCK_MARKET_DIV_CODE,
    FID_INPUT_ISCD: symbolCode,
    FID_INPUT_DATE_1: fromYyyyMmDd,
    FID_INPUT_DATE_2: toYyyyMmDd,
    FID_PERIOD_DIV_CODE: "D",
    FID_ORG_ADJ_PRC: "0",
  });

  const url = `${KIS_BASE_URL}${KIS_ENDPOINTS.STOCK_DAILY_CHART}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: KIS_TR_ID.STOCK_DAILY_CHART,
      custtype: "P",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(KIS_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIS stock daily chart HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as KisStockDailyChartResponse;

  if (data.rt_cd !== "0") {
    throw new Error(
      `KIS stock daily chart error [${data.msg_cd ?? "?"}] ${
        data.msg1 ?? "unknown error"
      }`
    );
  }

  return data;
}
