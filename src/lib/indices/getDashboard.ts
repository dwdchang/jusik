import {
  getMarketDetails,
  type MarketDetailKey,
  type StoredMarketDetail,
} from "@/lib/market/store";
import { KIS_DATA_NOTICE, type IndexDashboardData } from "@/types/indices";

/**
 * 홈 대시보드 데이터 — QStash 갱신 잡이 저장한 `market:detail:*`를 읽는다.
 * KIS 직접 호출 없음 (Phase 11 §11.6). 빈 Redis(최초 배포)면 안내 메시지로 throw.
 * oil은 Phase 15에서 추가된 키 — 배포 직후 첫 갱신 회차 전에는 없을 수 있어
 * 필수 4종과 달리 null을 허용한다(시장 카드에서 「준비 중」 처리).
 */

const REQUIRED_KEYS: MarketDetailKey[] = ["kospi", "kosdaq", "usdkrw", "us10y"];

export const MARKET_DATA_EMPTY_MESSAGE =
  "아직 수집된 시세 데이터가 없습니다. 평일 09:00~15:30(KST) 갱신 회차 이후 표시됩니다.";

export interface DashboardData extends IndexDashboardData {
  /** 카드 배지 판정용 — 지표별 잡 수집 시각 (§11.10-B2). oil은 수집 전 null */
  fetchedAtByKey: Record<MarketDetailKey, string | null>;
}

export async function getDashboardData(): Promise<DashboardData> {
  const rows = await getMarketDetails([...REQUIRED_KEYS, "oil"]);
  const missing = REQUIRED_KEYS.filter((_, i) => rows[i] === null);

  if (missing.length > 0) {
    throw new Error(MARKET_DATA_EMPTY_MESSAGE);
  }

  const [kospi, kosdaq, usdkrw, us10y] = rows as StoredMarketDetail[];
  const oil = rows[4];

  // 화면의 asOf는 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다
  const asOf = [kospi, kosdaq, usdkrw, us10y, ...(oil ? [oil] : [])]
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
    oil: oil?.snapshot ?? null,
    fetchedAtByKey: {
      kospi: kospi.fetchedAt,
      kosdaq: kosdaq.fetchedAt,
      usdkrw: usdkrw.fetchedAt,
      us10y: us10y.fetchedAt,
      oil: oil?.fetchedAt ?? null,
    },
  };
}
