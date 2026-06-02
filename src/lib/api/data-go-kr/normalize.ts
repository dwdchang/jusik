import type {
  RawApiHeader,
  RawItemsWrapper,
  RawStockMarketIndexItem,
  RawStockMarketIndexResponse,
} from "./types";

/**
 * 공공 API `items.item` — 단일 객체 또는 배열을 항상 배열로 정규화한다.
 */
export function ensureItemsArray<T>(
  items: RawItemsWrapper<T> | undefined | null
): T[] {
  if (!items?.item) {
    return [];
  }
  return Array.isArray(items.item) ? items.item : [items.item];
}

/**
 * `response.header.resultCode === '00'` 이 아니면 예외를 던진다.
 */
export function assertApiSuccess(raw: RawStockMarketIndexResponse): void {
  const header: RawApiHeader | undefined = raw.response?.header;
  const code = header?.resultCode;
  const msg = header?.resultMsg ?? "Unknown error";

  if (code !== "00") {
    throw new Error(`data.go.kr API error: [${code ?? "MISSING"}] ${msg}`);
  }
}

/**
 * API 성공 검증 후 `items.item` 배열을 반환한다.
 */
export function getRawItems(
  raw: RawStockMarketIndexResponse
): RawStockMarketIndexItem[] {
  assertApiSuccess(raw);
  return ensureItemsArray(raw.response?.body?.items);
}
