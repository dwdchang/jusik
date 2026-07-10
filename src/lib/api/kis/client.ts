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
  KIS_TR_ID,
} from "./constants";
import type {
  KisIndexDailyResponse,
  KisOverseasDailyResponse,
  KisStockPriceResponse,
} from "./types";

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

/**
 * 국내주식 현재가 조회 (FHKST01010100) → 현재가(원).
 * 종목코드가 유효하지 않으면 throw — 보유종목 저장 시 실존 검증에도 사용된다.
 */
export async function fetchKisStockPrice(symbolCode: string): Promise<number> {
  const token = await getKisAccessToken();
  const appKey = process.env.KIS_APP_KEY?.trim() ?? "";
  const appSecret = process.env.KIS_APP_SECRET?.trim() ?? "";

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: KIS_STOCK_MARKET_DIV_CODE,
    FID_INPUT_ISCD: symbolCode,
  });

  const url = `${KIS_BASE_URL}${KIS_ENDPOINTS.STOCK_PRICE}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: KIS_TR_ID.STOCK_PRICE,
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
    throw new Error(`KIS stock price HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as KisStockPriceResponse;

  if (data.rt_cd !== "0") {
    throw new Error(
      `KIS stock price error [${data.msg_cd ?? "?"}] ${
        data.msg1 ?? "unknown error"
      }`
    );
  }

  const price = Number(data.output?.stck_prpr);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`KIS stock price invalid for ${symbolCode}`);
  }

  return price;
}
