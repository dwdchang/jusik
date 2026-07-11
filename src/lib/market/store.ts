import { getRedis } from "@/lib/redis/client";
import type { KisStockPriceOutput } from "@/lib/api/kis/types";
import type { StockEarningsInfo } from "@/lib/holdings/stockInfo";
import type {
  IndexDailyRow,
  IndexSeries,
  IndexSnapshot,
  IndicatorId,
} from "@/types/indices";

/**
 * 시세 스냅샷 Redis 스토어 — Phase 11 (plan.md §11.2).
 * 쓰기는 QStash 갱신 잡(refreshMarketData)만, 읽기는 화면(Server Component)만 수행한다.
 * 전부 사용자 무관 공용 시세 데이터라 암호화하지 않는다.
 */

export type MarketDetailKey = "kospi" | "kosdaq" | "usdkrw" | "us10y" | "oil";

export const INDICATOR_TO_DETAIL_KEY: Record<IndicatorId, MarketDetailKey> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  USDKRW: "usdkrw",
  US10Y: "us10y",
  OIL: "oil",
};

/** market:detail:{key} — 상세 페이지가 그대로 읽는 스냅샷+차트+일별 리스트 */
export interface StoredMarketDetail {
  snapshot: IndexSnapshot;
  history: IndexSeries;
  dailyRows: IndexDailyRow[];
  /** 잡이 KIS에서 받아온 시각 (ISO) */
  fetchedAt: string;
}

/** market:stock:{symbolCode} — 종목 현재가 스냅샷 (사용자 무관 공용) */
export interface StoredStockSnapshot {
  symbolCode: string;
  /** 현재가(원) */
  price: number;
  /** 전일 대비율(%) — 부호 적용, Phase 10 알림 조건용 */
  changeRate: number;
  /** 소속 시장 (예: "KOSPI200") — Phase 10 알림 조건용 */
  marketName: string | null;
  /** 현재가 응답 전체 필드 — 상세 페이지 투자지표·시가총액 재사용 */
  raw: KisStockPriceOutput;
  fetchedAt: string;
}

/** market:stockInfo:{symbolCode} — 가격 무관 정보 블록 (확정 회차에 1일 1회 갱신) */
export interface StoredStockInfoBlocks {
  symbolCode: string;
  /** 시총 순위 — "3위" | "30위권 밖" | 랭킹 조회 실패 시 null */
  rankLabel: string | null;
  /** 배당 — 시가배당률은 읽기 시 현재가로 계산 */
  dividend: {
    kindLabel: string | null;
    annualDividendPerShare: number;
    lastPayDate: string | null;
  } | null;
  /** 실적 — 분기 단독값·YoY·QoQ (stockInfo.ts에서 계산) */
  earnings: StockEarningsInfo | null;
  fetchedAt: string;
}

/** market:lastRefreshAt — 마지막 갱신 잡 실행 기록 (staleness 판단·수동 점검용) */
export interface LastRefreshRecord {
  /** 실행 완료 시각 (ISO) */
  at: string;
  /** 실행 주체 — "qstash" | "manual" 등 */
  trigger: string;
  ok: boolean;
}

function detailKey(key: MarketDetailKey): string {
  return `market:detail:${key}`;
}

function stockKey(symbolCode: string): string {
  return `market:stock:${symbolCode}`;
}

function stockInfoKey(symbolCode: string): string {
  return `market:stockInfo:${symbolCode}`;
}

const LAST_REFRESH_KEY = "market:lastRefreshAt";

export async function getMarketDetail(
  key: MarketDetailKey
): Promise<StoredMarketDetail | null> {
  return getRedis().get<StoredMarketDetail>(detailKey(key));
}

/** 4개 지표를 한 번에 읽는다 (홈 대시보드용, MGET 1회) */
export async function getMarketDetails(
  keys: MarketDetailKey[]
): Promise<Array<StoredMarketDetail | null>> {
  if (keys.length === 0) {
    return [];
  }
  return getRedis().mget<Array<StoredMarketDetail | null>>(
    ...keys.map(detailKey)
  );
}

export async function setMarketDetail(
  key: MarketDetailKey,
  value: StoredMarketDetail
): Promise<void> {
  await getRedis().set(detailKey(key), value);
}

export async function getStockSnapshot(
  symbolCode: string
): Promise<StoredStockSnapshot | null> {
  return getRedis().get<StoredStockSnapshot>(stockKey(symbolCode));
}

/** 종목별 스냅샷 일괄 조회 (포트폴리오 평가용, MGET 1회) */
export async function getStockSnapshots(
  symbolCodes: string[]
): Promise<Map<string, StoredStockSnapshot>> {
  if (symbolCodes.length === 0) {
    return new Map();
  }

  const rows = await getRedis().mget<Array<StoredStockSnapshot | null>>(
    ...symbolCodes.map(stockKey)
  );

  const bySymbol = new Map<string, StoredStockSnapshot>();
  rows.forEach((row, i) => {
    if (row !== null) {
      bySymbol.set(symbolCodes[i], row);
    }
  });
  return bySymbol;
}

export async function setStockSnapshot(
  value: StoredStockSnapshot
): Promise<void> {
  await getRedis().set(stockKey(value.symbolCode), value);
}

export async function getStockInfoBlocks(
  symbolCode: string
): Promise<StoredStockInfoBlocks | null> {
  return getRedis().get<StoredStockInfoBlocks>(stockInfoKey(symbolCode));
}

export async function setStockInfoBlocks(
  value: StoredStockInfoBlocks
): Promise<void> {
  await getRedis().set(stockInfoKey(value.symbolCode), value);
}

export async function getLastRefreshRecord(): Promise<LastRefreshRecord | null> {
  return getRedis().get<LastRefreshRecord>(LAST_REFRESH_KEY);
}

export async function setLastRefreshRecord(
  value: LastRefreshRecord
): Promise<void> {
  await getRedis().set(LAST_REFRESH_KEY, value);
}
