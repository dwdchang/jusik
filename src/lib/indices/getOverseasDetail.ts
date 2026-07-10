import { fetchKisOverseasDaily } from "@/lib/api/kis/client";
import {
  KIS_CACHE_REVALIDATE_SECONDS,
  KIS_CACHE_TAGS,
} from "@/lib/api/kis/constants";
import { unstable_cache } from "next/cache";
import {
  KIS_DATA_NOTICE,
  type IndexDetailData,
  type OverseasIndicator,
} from "@/types/indices";
import {
  mapKisOverseasDailyRows,
  mapKisOverseasHistory,
  mapKisOverseasSnapshot,
} from "./kisOverseasMapper";

async function loadOverseasDetailUncached(
  indicator: OverseasIndicator
): Promise<IndexDetailData> {
  const raw = await fetchKisOverseasDaily(indicator);

  return {
    asOf: new Date().toISOString(),
    dataNotice: KIS_DATA_NOTICE,
    snapshot: mapKisOverseasSnapshot(raw, indicator),
    history: mapKisOverseasHistory(raw, indicator),
    dailyRows: mapKisOverseasDailyRows(raw, indicator),
  };
}

export const getOverseasDetail = unstable_cache(
  loadOverseasDetailUncached,
  ["overseas-detail-kis-v1"],
  {
    revalidate: KIS_CACHE_REVALIDATE_SECONDS,
    tags: [...KIS_CACHE_TAGS],
  }
);
