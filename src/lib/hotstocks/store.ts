import { getRedis } from "@/lib/redis/client";
import type { UniverseMarket } from "./universe";

/**
 * 핫종목 Redis 스토어 — Phase 14 (plan.md §14.3).
 * 쓰기는 QStash 잡(refreshHotStocks)만, 읽기는 화면(Server Component)만 수행한다.
 * 공개 시세 기반 랭킹이라 암호화하지 않는다.
 */

export type HotStockWindowKey = "1m" | "3m" | "6m" | "12m";

export const HOT_STOCK_WINDOW_KEYS: HotStockWindowKey[] = [
  "1m",
  "3m",
  "6m",
  "12m",
];

/** 구간 길이(개월) — 기준월 M을 끝점으로 하는 완결 달력 구간 (§14.2) */
export const HOT_STOCK_WINDOW_MONTHS: Record<HotStockWindowKey, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

/** 고정 명칭("1분기"·"상반기") 금지 — "최근 …" 개념으로 통일 (사용자 확정) */
export const HOT_STOCK_WINDOW_LABELS: Record<HotStockWindowKey, string> = {
  "1m": "최근 1개월",
  "3m": "최근 분기",
  "6m": "최근 반기",
  "12m": "최근 연도",
};

export interface HotStockEntry {
  rank: number;
  code: string;
  name: string;
  market: UniverseMarket;
  /** 구간 시작 직전 월말 종가 (수정주가, 원) */
  startPrice: number;
  /** 기준월 M 월말 종가 (수정주가, 원) */
  endPrice: number;
  /** (끝/시작 − 1) × 100, 소수 둘째 자리 */
  returnRate: number;
}

export interface HotStockWindow {
  label: string;
  /** 구간 시작 월 "YYYY-MM" */
  startMonth: string;
  /** 구간 끝 월 (= 기준월 M) "YYYY-MM" */
  endMonth: string;
  /** 수익률 내림차순 TOP 100 (동률 시 코드 오름차순) */
  entries: HotStockEntry[];
}

/** market:hotStocks — 화면이 그대로 읽는 구간 4종 TOP 100 */
export interface StoredHotStocks {
  /** 기준월 M "YYYY-MM" — 실행 시점 KST의 전월 */
  computedFor: string;
  universeCount: number;
  windows: Record<HotStockWindowKey, HotStockWindow>;
  fetchedAt: string;
}

/**
 * market:hotStocks:progress — 시간 예산 소진 시 이어받기용 커서 (§14.4).
 * 전 종목 값을 들고 가지 않고 구간별 상위 100만 유지한다(온라인 선택). 완료 시 삭제.
 */
export interface HotStocksProgress {
  computedFor: string;
  /** 유니버스(코드 오름차순) 다음 처리 인덱스 */
  cursor: number;
  universeCount: number;
  windows: Record<HotStockWindowKey, HotStockWindow>;
}

const HOT_STOCKS_KEY = "market:hotStocks";
const PROGRESS_KEY = "market:hotStocks:progress";

export async function getHotStocks(): Promise<StoredHotStocks | null> {
  return getRedis().get<StoredHotStocks>(HOT_STOCKS_KEY);
}

export async function setHotStocks(value: StoredHotStocks): Promise<void> {
  await getRedis().set(HOT_STOCKS_KEY, value);
}

export async function getHotStocksProgress(): Promise<HotStocksProgress | null> {
  return getRedis().get<HotStocksProgress>(PROGRESS_KEY);
}

export async function setHotStocksProgress(
  value: HotStocksProgress
): Promise<void> {
  await getRedis().set(PROGRESS_KEY, value);
}

export async function deleteHotStocksProgress(): Promise<void> {
  await getRedis().del(PROGRESS_KEY);
}
