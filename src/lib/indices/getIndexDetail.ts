import { fetchKisIndexDaily } from "@/lib/api/kis/client";
import {
  KIS_CACHE_REVALIDATE_SECONDS,
  KIS_CACHE_TAGS,
} from "@/lib/api/kis/constants";
import { unstable_cache } from "next/cache";
import {
  KIS_DATA_NOTICE,
  type IndexDetailData,
  type MarketIndex,
} from "@/types/indices";
import { mapKisDailyRows, mapKisHistory, mapKisSnapshot } from "./kisMapper";

async function loadIndexDetailUncached(
  market: MarketIndex
): Promise<IndexDetailData> {
  const raw = await fetchKisIndexDaily(market);

  return {
    asOf: new Date().toISOString(),
    dataNotice: KIS_DATA_NOTICE,
    snapshot: mapKisSnapshot(raw, market),
    history: mapKisHistory(raw, market),
    dailyRows: mapKisDailyRows(raw, market),
  };
}

export const getIndexDetail = unstable_cache(
  loadIndexDetailUncached,
  ["index-detail-kis-v1"],
  {
    revalidate: KIS_CACHE_REVALIDATE_SECONDS,
    tags: [...KIS_CACHE_TAGS],
  }
);
