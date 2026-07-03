import type { MarketIndex } from "@/types/indices";
import { getKisAccessToken } from "./auth";
import {
  KIS_BASE_URL,
  KIS_CACHE_REVALIDATE_SECONDS,
  KIS_CACHE_TAGS,
  KIS_ENDPOINTS,
  KIS_FETCH_TIMEOUT_MS,
  KIS_INDEX_CODE,
  KIS_MARKET_DIV_CODE,
  KIS_TR_ID,
} from "./constants";
import type { KisIndexDailyResponse } from "./types";

/** KST 기준 오늘 날짜 (YYYYMMDD) */
function todayKstYyyyMmDd(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
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
