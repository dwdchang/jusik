import {
  getMarketDetails,
  type MarketDetailKey,
  type StoredMarketDetail,
} from "@/lib/market/store";
import { KIS_DATA_NOTICE, type IndexDashboardData } from "@/types/indices";

/**
 * 홈 대시보드 데이터 — QStash 갱신 잡이 저장한 `market:detail:*` 4키를 읽는다.
 * KIS 직접 호출 없음 (Phase 11 §11.6). 빈 Redis(최초 배포)면 안내 메시지로 throw.
 */

const DETAIL_KEYS: MarketDetailKey[] = ["kospi", "kosdaq", "usdkrw", "us10y"];

export const MARKET_DATA_EMPTY_MESSAGE =
  "아직 수집된 시세 데이터가 없습니다. 평일 09:00~15:30(KST) 갱신 회차 이후 표시됩니다.";

export interface DashboardData extends IndexDashboardData {
  /** 카드 배지 판정용 — 지표별 잡 수집 시각 (§11.10-B2) */
  fetchedAtByKey: Record<MarketDetailKey, string>;
}

export async function getDashboardData(): Promise<DashboardData> {
  const rows = await getMarketDetails(DETAIL_KEYS);
  const missing = DETAIL_KEYS.filter((_, i) => rows[i] === null);

  if (missing.length > 0) {
    throw new Error(MARKET_DATA_EMPTY_MESSAGE);
  }

  const [kospi, kosdaq, usdkrw, us10y] = rows as StoredMarketDetail[];

  // 화면의 asOf는 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다
  const asOf = [kospi, kosdaq, usdkrw, us10y]
    .map((row) => row.fetchedAt)
    .sort()[0];

  return {
    asOf,
    dataNotice: KIS_DATA_NOTICE,
    kospi: kospi.snapshot,
    kosdaq: kosdaq.snapshot,
    kospiHistory: kospi.history,
    kosdaqHistory: kosdaq.history,
    usdKrw: usdkrw.snapshot,
    usTreasury10y: us10y.snapshot,
    fetchedAtByKey: {
      kospi: kospi.fetchedAt,
      kosdaq: kosdaq.fetchedAt,
      usdkrw: usdkrw.fetchedAt,
      us10y: us10y.fetchedAt,
    },
  };
}
