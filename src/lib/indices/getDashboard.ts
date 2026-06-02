import { fetchStockMarketIndex } from "@/lib/api/data-go-kr/client";
import {
  CACHE_REVALIDATE_SECONDS,
  CACHE_TAGS,
  INDEX_NAMES,
} from "@/lib/api/data-go-kr/constants";
import { getRawItems } from "@/lib/api/data-go-kr/normalize";
import { unstable_cache } from "next/cache";
import {
  DATA_UPDATE_NOTICE,
  type IndexDashboardData,
} from "@/types/indices";
import { fetchIndexHistory } from "./history";
import { mapLatestSnapshotFromItems } from "./mapper";

async function loadDashboardUncached(): Promise<IndexDashboardData> {
  const [kospiRaw, kosdaqRaw, kospiHistory, kosdaqHistory] =
    await Promise.all([
      fetchStockMarketIndex({
        idxNm: INDEX_NAMES.KOSPI,
        numOfRows: 1,
        pageNo: 1,
        resultType: "json",
      }),
      fetchStockMarketIndex({
        idxNm: INDEX_NAMES.KOSDAQ,
        numOfRows: 1,
        pageNo: 1,
        resultType: "json",
      }),
      fetchIndexHistory(INDEX_NAMES.KOSPI, "KOSPI"),
      fetchIndexHistory(INDEX_NAMES.KOSDAQ, "KOSDAQ"),
    ]);

  const kospiItems = getRawItems(kospiRaw);
  const kosdaqItems = getRawItems(kosdaqRaw);

  return {
    asOf: new Date().toISOString(),
    dataNotice: DATA_UPDATE_NOTICE,
    kospi: mapLatestSnapshotFromItems(kospiItems, "KOSPI"),
    kosdaq: mapLatestSnapshotFromItems(kosdaqItems, "KOSDAQ"),
    kospiHistory,
    kosdaqHistory,
  };
}

export const getDashboardData = unstable_cache(
  loadDashboardUncached,
  ["dashboard-indices-v1"],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
    tags: [...CACHE_TAGS],
  }
);
