import {
  getIntradayBaseline,
  getInvestorFlows,
  getMarketDetails,
  type MarketDetailKey,
  type StoredMarketDetail,
} from "@/lib/market/store";
import { KIS_DATA_NOTICE, type IndexDashboardData } from "@/types/indices";
import { buildHomeIndexFlow } from "./marketFlow";

/**
 * 홈 대시보드 데이터 — QStash 갱신 잡이 저장한 `market:detail:*`를 읽는다.
 * KIS 직접 호출 없음 (Phase 11 §11.6). 빈 Redis(최초 배포)면 안내 메시지로 throw.
 * oil(Phase 15)·gold·btcUsd(Phase 30, §32~§33에서 홈 합류)·dxy(§28, §85에서 홈 합류)는
 * 나중에 추가된 키 — 배포 직후 첫 갱신 회차 전에는 없을 수 있어 필수 4종과 달리
 * null을 허용한다 (시장 카드에서 해당 행 생략, dxy는 원/달러 카드 보조줄 생략).
 */

const REQUIRED_KEYS: MarketDetailKey[] = ["kospi", "kosdaq", "usdkrw", "us10y"];
const OPTIONAL_KEYS: MarketDetailKey[] = ["oil", "gold", "btcUsd", "dxy"];

export const MARKET_DATA_EMPTY_MESSAGE =
  "아직 수집된 시세 데이터가 없습니다. 평일 09:00~15:30(KST) 갱신 회차 이후 표시됩니다.";

export interface DashboardData extends IndexDashboardData {
  /** 카드 배지 판정용 — 지표별 잡 수집 시각 (§11.10-B2). oil·gold는 수집 전 null.
   * dxy(§28)·btcKrw는 홈 미사용이라 제외, btcUsd는 홈에 표시하지만(§33)
   * 잡 `ok` 게이팅 밖의 외부 지표(§30 dxy 관례)라 배지 판정에서 제외 */
  fetchedAtByKey: Record<
    Exclude<MarketDetailKey, "dxy" | "btcKrw" | "btcUsd">,
    string | null
  >;
}

export async function getDashboardData(): Promise<DashboardData> {
  // 수급 4키(§86)는 코스피·코스닥 카드 보조줄 전용 — 없으면 보조줄만 생략되므로
  // detail과 함께 병렬로 읽고 실패·미시딩은 null로 흘린다. KIS 호출은 여전히 0.
  const [rows, kospiInvestor, kosdaqInvestor, kospiBaseline, kosdaqBaseline] =
    await Promise.all([
      getMarketDetails([...REQUIRED_KEYS, ...OPTIONAL_KEYS]),
      getInvestorFlows("KOSPI"),
      getInvestorFlows("KOSDAQ"),
      getIntradayBaseline("KOSPI"),
      getIntradayBaseline("KOSDAQ"),
    ]);
  const missing = REQUIRED_KEYS.filter((_, i) => rows[i] === null);

  if (missing.length > 0) {
    throw new Error(MARKET_DATA_EMPTY_MESSAGE);
  }

  const [kospi, kosdaq, usdkrw, us10y] = rows as StoredMarketDetail[];
  const [oil, gold, btcUsd, dxy] = rows.slice(REQUIRED_KEYS.length);

  // 화면의 asOf는 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다.
  // dxy는 제외 — 실패해도 잡 ok에 영향 없는 파생 지표라(§28) 계산이 계속 실패하면
  // 낡은 fetchedAt이 남는데, 그걸 후보에 넣으면 부수 지표 하나가 화면 전체의
  // 「마지막 갱신」을 끌어내린다 (§85)
  const asOf = [kospi, kosdaq, usdkrw, us10y, oil, gold, btcUsd]
    .filter((row): row is StoredMarketDetail => row !== null)
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
    gold: gold?.snapshot ?? null,
    btcUsd: btcUsd?.snapshot ?? null,
    dxy: dxy?.snapshot ?? null,
    // 보조줄은 각 지수의 자기 수집 시각을 기준으로 삼는다 — 위 asOf(가장 오래된 시각)를
    // 쓰면 다른 지표가 지연될 때 엉뚱한 슬롯과 비교하게 된다 (§86)
    kospiFlow: buildHomeIndexFlow({
      dailyRows: kospi.dailyRows,
      investorRows: kospiInvestor?.rows ?? null,
      intradayBaseline: kospiBaseline,
      asOf: kospi.fetchedAt,
    }),
    kosdaqFlow: buildHomeIndexFlow({
      dailyRows: kosdaq.dailyRows,
      investorRows: kosdaqInvestor?.rows ?? null,
      intradayBaseline: kosdaqBaseline,
      asOf: kosdaq.fetchedAt,
    }),
    fetchedAtByKey: {
      kospi: kospi.fetchedAt,
      kosdaq: kosdaq.fetchedAt,
      usdkrw: usdkrw.fetchedAt,
      us10y: us10y.fetchedAt,
      oil: oil?.fetchedAt ?? null,
      gold: gold?.fetchedAt ?? null,
    },
  };
}
