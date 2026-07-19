import {
  getMarketDetail,
  INDICATOR_TO_DETAIL_KEY,
} from "@/lib/market/store";
import { MARKET_DATA_EMPTY_MESSAGE } from "./getDashboard";
import {
  KIS_DATA_NOTICE,
  type IndexDetailData,
  type IndicatorId,
  type MarketIndex,
} from "@/types/indices";

/**
 * 환율/금리/유가·달러 인덱스 상세 — QStash 갱신 잡이 저장한
 * `market:detail:{key}`를 읽는다. KIS 직접 호출 없음 (Phase 11 §11.6).
 */
export async function getOverseasDetail(
  indicator: Exclude<IndicatorId, MarketIndex>
): Promise<IndexDetailData> {
  const stored = await getMarketDetail(INDICATOR_TO_DETAIL_KEY[indicator]);

  if (stored === null) {
    throw new Error(MARKET_DATA_EMPTY_MESSAGE);
  }

  return {
    asOf: stored.fetchedAt,
    dataNotice: KIS_DATA_NOTICE,
    snapshot: stored.snapshot,
    history: stored.history,
    dailyRows: stored.dailyRows,
  };
}
