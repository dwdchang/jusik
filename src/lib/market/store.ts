import { getRedis } from "@/lib/redis/client";
import type { KisStockPriceOutput } from "@/lib/api/kis/types";
import type { StockEarningsInfo } from "@/lib/holdings/stockInfo";
import type {
  FiFlowRanking,
  IndexDailyRow,
  IndexSeries,
  IndexSnapshot,
  IndicatorId,
  InvestorFlowRow,
  MarketIndex,
} from "@/types/indices";

/**
 * 시세 스냅샷 Redis 스토어 — Phase 11 (plan.md §11.2).
 * 쓰기는 QStash 갱신 잡(refreshMarketData)만, 읽기는 화면(Server Component)만 수행한다.
 * 전부 사용자 무관 공용 시세 데이터라 암호화하지 않는다.
 */

export type MarketDetailKey =
  | "kospi"
  | "kosdaq"
  | "usdkrw"
  | "us10y"
  | "oil"
  | "gold"
  | "dxy"
  | "btcKrw"
  | "btcUsd";

export const INDICATOR_TO_DETAIL_KEY: Record<IndicatorId, MarketDetailKey> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  USDKRW: "usdkrw",
  US10Y: "us10y",
  OIL: "oil",
  GOLD: "gold",
  DXY: "dxy",
  BTCKRW: "btcKrw",
  BTCUSD: "btcUsd",
};

/** market:detail:{key} — 상세 페이지가 그대로 읽는 스냅샷+차트+일별 리스트 */
export interface StoredMarketDetail {
  snapshot: IndexSnapshot;
  history: IndexSeries;
  dailyRows: IndexDailyRow[];
  /** 잡이 KIS에서 받아온 시각 (ISO) */
  fetchedAt: string;
}

/**
 * market:investor:{kospi|kosdaq} — 일별 수급 스냅샷 (Phase 42).
 * 시장 전체 투자자 순매수 금액(백만원). 시세 갱신 잡이 회차당 시장별 1콜로 덮어쓴다.
 */
export interface StoredInvestorFlows {
  market: MarketIndex;
  /** 최신순, 순매수 금액(백만원) */
  rows: InvestorFlowRow[];
  /** 잡이 KIS에서 받아온 시각 (ISO) */
  fetchedAt: string;
}

/**
 * market:fiRanking:{kospi|kosdaq} — 종목별 수급 순위 스냅샷 (Phase 50).
 * 외국인·기관 × 순매수·순매도 각 상위 30. 시세 갱신 잡이 회차당 시장별 4콜로 덮어쓴다.
 */
export interface StoredFiRanking {
  market: MarketIndex;
  groups: FiFlowRanking;
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

/** 확정 배당 회차 1행 — 배당 일정 화면·지급일 알림용 (Phase 25) */
export interface DividendRound {
  /** 배당 기준일 "YYYY-MM-DD" */
  recordDate: string;
  /** 배당종류 — "분기" | "결산" | "중간" 등 */
  kind: string | null;
  /** 주당배당금(원) — 확정분만 저장 (0원 미확정 회차 제외) */
  amountPerShare: number;
  /** 현금배당 지급일 "YYYY-MM-DD" — 공시로 확정되기 전엔 null ("미정" 표기) */
  payDate: string | null;
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
    /** 확정 회차별 원본 행 — 필드 추가(Phase 25) 이전 스냅샷에는 없으므로 optional */
    rounds?: DividendRound[];
  } | null;
  /** 실적 — 분기 단독값·YoY·QoQ (stockInfo.ts에서 계산) */
  earnings: StockEarningsInfo | null;
  fetchedAt: string;
}

/** market:dailyFluctuation 항목 — 당일 등락률 순위 1행 */
export interface DailyFluctuationItem {
  /** 순위 (1부터) */
  rank: number;
  /** 종목코드 6자리 */
  code: string;
  name: string;
  /** 현재가(원) */
  price: number;
  /** 전일 대비율(%) — 부호 적용 */
  changeRate: number;
  /**
   * 기준 종가(원) — 당일은 전일 종가(전일 대비 금액으로 정확 산출), 주간은
   * 5거래일 전 종가(등락률 역산이라 1원 단위 오차 가능). 필드 추가(§20) 이전에
   * 저장된 스냅샷에는 없으므로 optional.
   */
  basePrice?: number;
}

/**
 * market:dailyFluctuation — 당일 등락률 순위 상위 30 스냅샷 (사용자 무관 공용).
 * 전체시장 상승률순, 시세 갱신 잡이 회차당 1회 덮어쓴다 (누적 없음).
 */
export interface StoredDailyFluctuation {
  items: DailyFluctuationItem[];
  /** 잡이 KIS에서 받아온 시각 (ISO) — staleness 판정용 */
  fetchedAt: string;
}

/**
 * market:weeklyFluctuation 항목 — 주간 등락률 순위 1행.
 * 구조는 당일과 동일하되 changeRate가 5거래일 전 종가 대비율(%)이다 (달력 주 아님).
 */
export type WeeklyFluctuationItem = DailyFluctuationItem;

/**
 * market:weeklyFluctuation — 주간(5거래일 전 대비) 등락률 순위 상위 30 스냅샷.
 * market:dailyFluctuation과 같은 패턴 — 전체시장 상승률순, 잡이 회차당 1회 덮어쓴다.
 */
export type StoredWeeklyFluctuation = StoredDailyFluctuation;

/** market:stockMaster 항목 — 종목 검색용 코드↔종목명 (KIS 종목 마스터 1행) */
export interface StockMasterItem {
  /** 단축코드 — KOSDAQ 신형은 영숫자 6자리일 수 있다 */
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
}

/**
 * market:stockMaster — 종목명 검색용 전체 종목 스냅샷 (사용자 무관 공용).
 * 공개 KIS 종목 마스터를 파싱한 코드↔종목명 목록으로, 하루 1회 갱신한다.
 */
export interface StoredStockMaster {
  items: StockMasterItem[];
  /** 잡이 마스터를 받아온 시각 (ISO) — 1일 1회 갱신 판정용 */
  fetchedAt: string;
}

/** market:lastRefreshAt — 마지막 갱신 잡 실행 기록 (staleness 판단·수동 점검용) */
export interface LastRefreshRecord {
  /** 마지막 성공 완료 시각 (ISO) */
  at: string;
  /**
   * 마지막 실행 "시작" 시각 (성공·실패 무관, ISO) — 잡이 실제로 돌았는지 판별용 (§52 방법2).
   * 선택 필드: 도입 전 저장된 값은 없을 수 있어 리더는 폴백 처리한다.
   */
  attemptedAt?: string;
  /** 실행 주체 — "qstash" | "manual" 등 */
  trigger: string;
  ok: boolean;
}

function detailKey(key: MarketDetailKey): string {
  return `market:detail:${key}`;
}

/** market:investor:{kospi|kosdaq} 키 조립 (Phase 42) */
function investorKey(market: MarketIndex): string {
  return `market:investor:${market === "KOSPI" ? "kospi" : "kosdaq"}`;
}

/** market:fiRanking:{kospi|kosdaq} 키 조립 (Phase 50) */
function fiRankingKey(market: MarketIndex): string {
  return `market:fiRanking:${market === "KOSPI" ? "kospi" : "kosdaq"}`;
}

/** market:stock:{code} 키 조립 — 고아 키 정리 잡(Phase 49)이 접두사 SCAN·삭제에 공유한다 */
export function stockKey(symbolCode: string): string {
  return `market:stock:${symbolCode}`;
}

/** market:stockInfo:{code} 키 조립 — 고아 키 정리 잡(Phase 49)이 동반 삭제에 공유한다 */
export function stockInfoKey(symbolCode: string): string {
  return `market:stockInfo:${symbolCode}`;
}

/** market:stock 키 접두사 — 고아 정리 잡의 SCAN MATCH·코드 추출 기준 (Phase 49) */
export const STOCK_KEY_PREFIX = "market:stock:";

const LAST_REFRESH_KEY = "market:lastRefreshAt";
const DAILY_FLUCTUATION_KEY = "market:dailyFluctuation";
const WEEKLY_FLUCTUATION_KEY = "market:weeklyFluctuation";
const STOCK_MASTER_KEY = "market:stockMaster";

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

export async function getInvestorFlows(
  market: MarketIndex
): Promise<StoredInvestorFlows | null> {
  return getRedis().get<StoredInvestorFlows>(investorKey(market));
}

export async function setInvestorFlows(
  value: StoredInvestorFlows
): Promise<void> {
  await getRedis().set(investorKey(value.market), value);
}

export async function getFiRanking(
  market: MarketIndex
): Promise<StoredFiRanking | null> {
  return getRedis().get<StoredFiRanking>(fiRankingKey(market));
}

export async function setFiRanking(value: StoredFiRanking): Promise<void> {
  await getRedis().set(fiRankingKey(value.market), value);
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

/** 종목별 정보 블록 일괄 조회 (배당 일정 병합용, MGET 1회) — 없는 종목은 맵에서 빠진다 */
export async function getStockInfoBlocksMap(
  symbolCodes: string[]
): Promise<Map<string, StoredStockInfoBlocks>> {
  if (symbolCodes.length === 0) {
    return new Map();
  }

  const rows = await getRedis().mget<Array<StoredStockInfoBlocks | null>>(
    ...symbolCodes.map(stockInfoKey)
  );

  const bySymbol = new Map<string, StoredStockInfoBlocks>();
  rows.forEach((row, i) => {
    if (row !== null) {
      bySymbol.set(symbolCodes[i], row);
    }
  });
  return bySymbol;
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

export async function getDailyFluctuation(): Promise<StoredDailyFluctuation | null> {
  return getRedis().get<StoredDailyFluctuation>(DAILY_FLUCTUATION_KEY);
}

export async function setDailyFluctuation(
  value: StoredDailyFluctuation
): Promise<void> {
  await getRedis().set(DAILY_FLUCTUATION_KEY, value);
}

export async function getWeeklyFluctuation(): Promise<StoredWeeklyFluctuation | null> {
  return getRedis().get<StoredWeeklyFluctuation>(WEEKLY_FLUCTUATION_KEY);
}

export async function setWeeklyFluctuation(
  value: StoredWeeklyFluctuation
): Promise<void> {
  await getRedis().set(WEEKLY_FLUCTUATION_KEY, value);
}

export async function getStockMaster(): Promise<StoredStockMaster | null> {
  return getRedis().get<StoredStockMaster>(STOCK_MASTER_KEY);
}

export async function setStockMaster(value: StoredStockMaster): Promise<void> {
  await getRedis().set(STOCK_MASTER_KEY, value);
}
