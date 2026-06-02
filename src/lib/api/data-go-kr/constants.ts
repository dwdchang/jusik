/**
 * 금융위원회_지수시세정보 — 주가지수 시세 (getStockMarketIndex)
 * @see https://www.data.go.kr/data/15094807/openapi.do
 * 포털 가이드와 URL이 다르면 이 파일만 수정한다.
 */

export const DATA_GO_KR_INDEX_BASE =
  "https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService";

export const OPERATION_STOCK_MARKET_INDEX = "/getStockMarketIndex";

/** 공공 API fetch 타임아웃 (ms) — 7일 병렬 호출 시 여유 확보 */
export const FETCH_TIMEOUT_MS = 30_000;

/** Next.js fetch 캐시 — plan.md / research.md */
export const CACHE_REVALIDATE_SECONDS = 86_400;

export const CACHE_TAGS = ["indices"] as const;

/** idxNm 쿼리 값 (Decoding 키와 별개) */
export const INDEX_NAMES = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
} as const;

export type IndexNameKey = keyof typeof INDEX_NAMES;
