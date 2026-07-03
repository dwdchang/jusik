import { fetchKisIndexDaily } from "@/lib/api/kis/client";
import {
  KIS_CACHE_REVALIDATE_SECONDS,
  KIS_CACHE_TAGS,
} from "@/lib/api/kis/constants";
import { unstable_cache } from "next/cache";
import { KIS_DATA_NOTICE, type IndexDashboardData } from "@/types/indices";
import { mapKisHistory, mapKisSnapshot } from "./kisMapper";

async function loadDashboardUncached(): Promise<IndexDashboardData> {
  const [kospiRaw, kosdaqRaw] = await Promise.all([
    fetchKisIndexDaily("KOSPI"),
    fetchKisIndexDaily("KOSDAQ"),
  ]);

  return {
    asOf: new Date().toISOString(),
    dataNotice: KIS_DATA_NOTICE,
    kospi: mapKisSnapshot(kospiRaw, "KOSPI"),
    kosdaq: mapKisSnapshot(kosdaqRaw, "KOSDAQ"),
    kospiHistory: mapKisHistory(kospiRaw, "KOSPI"),
    kosdaqHistory: mapKisHistory(kosdaqRaw, "KOSDAQ"),
  };
}

export const getDashboardData = unstable_cache(
  loadDashboardUncached,
  ["dashboard-indices-kis-v1"],
  {
    revalidate: KIS_CACHE_REVALIDATE_SECONDS,
    tags: [...KIS_CACHE_TAGS],
  }
);
