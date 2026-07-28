import {
  getFiRanking,
  getIntradayBaseline,
  getInvestorFlows,
  getMarketCapRanking,
  getMarketDetail,
  INDICATOR_TO_DETAIL_KEY,
} from "@/lib/market/store";
import { MARKET_DATA_EMPTY_MESSAGE } from "./getDashboard";
import {
  KIS_DATA_NOTICE,
  type IndexDetailData,
  type MarketIndex,
} from "@/types/indices";

/**
 * 국내 지수 상세 — QStash 갱신 잡이 저장한 `market:detail:{key}`를 읽는다.
 * KIS 직접 호출 없음 (Phase 11 §11.6).
 */
export async function getIndexDetail(
  market: MarketIndex
): Promise<IndexDetailData> {
  const [stored, investor, fiRanking, marketCap, intradayBaseline] =
    await Promise.all([
      getMarketDetail(INDICATOR_TO_DETAIL_KEY[market]),
      getInvestorFlows(market),
      getFiRanking(market),
      getMarketCapRanking(market),
      getIntradayBaseline(market),
    ]);

  if (stored === null) {
    throw new Error(MARKET_DATA_EMPTY_MESSAGE);
  }

  return {
    asOf: stored.fetchedAt,
    dataNotice: KIS_DATA_NOTICE,
    snapshot: stored.snapshot,
    history: stored.history,
    dailyRows: stored.dailyRows,
    // 수급·순위 스냅샷은 아직 없을 수 있어(초기 시딩 전) 있을 때만 포함한다.
    ...(investor ? { investorRows: investor.rows } : {}),
    ...(fiRanking ? { fiRanking: fiRanking.groups } : {}),
    ...(marketCap
      ? {
          marketCapRanking: {
            rows: marketCap.rows,
            baseDate: marketCap.baseDate ?? null,
          },
        }
      : {}),
    // 전일 시각 슬롯은 배포 첫 거래일엔 없다 — 있을 때만 넘겨 화면이 폴백하게 둔다 (§70)
    ...(intradayBaseline && intradayBaseline.slots.length > 0
      ? {
          intradayBaseline: {
            tradingDate: intradayBaseline.tradingDate,
            slots: intradayBaseline.slots,
          },
        }
      : {}),
  };
}
