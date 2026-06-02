import {
  CACHE_REVALIDATE_SECONDS,
  CACHE_TAGS,
  DATA_GO_KR_INDEX_BASE,
  FETCH_TIMEOUT_MS,
  OPERATION_STOCK_MARKET_INDEX,
} from "./constants";
import { assertApiSuccess } from "./normalize";
import type { RawStockMarketIndexResponse } from "./types";

export type StockMarketIndexParams = {
  idxNm: string;
  pageNo?: number;
  numOfRows?: number;
  basDt?: string;
  resultType?: "json";
};

function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key?.trim()) {
    throw new Error("DATA_GO_KR_SERVICE_KEY is not set");
  }
  return key.trim().replace(/^['"]|['"]$/g, "");
}

function buildIndexParams(input: StockMarketIndexParams): URLSearchParams {
  const params = new URLSearchParams({
    serviceKey: getServiceKey(),
    resultType: input.resultType ?? "json",
    pageNo: String(input.pageNo ?? 1),
    numOfRows: String(input.numOfRows ?? 1),
    idxNm: input.idxNm,
  });

  if (input.basDt) {
    params.set("basDt", input.basDt);
  }

  return params;
}

export function buildStockMarketIndexUrl(
  input: StockMarketIndexParams
): string {
  const queryString = buildIndexParams(input).toString();
  return `${DATA_GO_KR_INDEX_BASE}${OPERATION_STOCK_MARKET_INDEX}?${queryString}`;
}

const FETCH_MAX_ATTEMPTS = 2;

export async function fetchDataGoKr<T>(url: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        next: {
          revalidate: CACHE_REVALIDATE_SECONDS,
          tags: [...CACHE_TAGS],
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(
          `data.go.kr HTTP ${response.status} ${response.statusText}`
        );
      }

      const json = (await response.json()) as T;
      return json;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("data.go.kr fetch failed");

      if (attempt < FETCH_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError ?? new Error("data.go.kr fetch failed");
}

export async function fetchStockMarketIndex(
  params: StockMarketIndexParams
): Promise<RawStockMarketIndexResponse> {
  const url = buildStockMarketIndexUrl(params);
  const raw = await fetchDataGoKr<RawStockMarketIndexResponse>(url);
  assertApiSuccess(raw);
  return raw;
}
