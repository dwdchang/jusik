import { fetchStockMarketIndex } from "@/lib/api/data-go-kr/client";
import { getRawItems } from "@/lib/api/data-go-kr/normalize";
import type { RawStockMarketIndexResponse } from "@/lib/api/data-go-kr/types";
import type { IndexSeries, MarketIndex } from "@/types/indices";
import { getLast7BusinessDates } from "./dates";
import { mapToChartPoints } from "./mapper";

const HISTORY_ROW_COUNT = 7;

async function fetchHistoryByBulkRows(
  idxNm: string,
  market: MarketIndex
): Promise<IndexSeries | null> {
  const raw = await fetchStockMarketIndex({
    idxNm,
    numOfRows: HISTORY_ROW_COUNT,
    pageNo: 1,
    resultType: "json",
  });

  const items = getRawItems(raw);
  if (items.length === 0) {
    return null;
  }

  const points = mapToChartPoints(items).slice(-HISTORY_ROW_COUNT);
  if (points.length === 0) {
    return null;
  }

  return { market, points };
}

async function fetchHistoryByBusinessDates(
  idxNm: string,
  market: MarketIndex
): Promise<IndexSeries> {
  const businessDates = getLast7BusinessDates();

  const settled = await Promise.allSettled(
    businessDates.map((basDt) =>
      fetchStockMarketIndex({
        idxNm,
        basDt,
        numOfRows: 1,
        pageNo: 1,
        resultType: "json",
      })
    )
  );

  const items = settled
    .filter(
      (result): result is PromiseFulfilledResult<RawStockMarketIndexResponse> =>
        result.status === "fulfilled"
    )
    .flatMap((result) => getRawItems(result.value));

  const points = mapToChartPoints(items).slice(-HISTORY_ROW_COUNT);

  if (points.length === 0) {
    throw new Error(
      `Failed to load index history for ${market} (${idxNm}): no data points`
    );
  }

  return { market, points };
}

/**
 * 최근 7거래일 차트 시리즈를 확보한다.
 * 1) numOfRows=7 단일 호출 (plan.md 전략 B)
 * 2) 실패 시 basDt별 병렬 호출 (plan.md 전략 A)
 */
export async function fetchIndexHistory(
  idxNm: string,
  market: MarketIndex
): Promise<IndexSeries> {
  try {
    const bulk = await fetchHistoryByBulkRows(idxNm, market);
    if (bulk && bulk.points.length > 0) {
      return bulk;
    }
  } catch {
    /* 단일 호출 실패 시 basDt 전략으로 폴백 */
  }

  return fetchHistoryByBusinessDates(idxNm, market);
}
