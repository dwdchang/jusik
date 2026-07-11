import { fetchKisStockMonthlyChart } from "@/lib/api/kis/client";
import {
  deleteHotStocksProgress,
  getHotStocks,
  getHotStocksProgress,
  setHotStocks,
  setHotStocksProgress,
  HOT_STOCK_WINDOW_KEYS,
  HOT_STOCK_WINDOW_LABELS,
  HOT_STOCK_WINDOW_MONTHS,
  type HotStockEntry,
  type HotStockWindow,
  type HotStockWindowKey,
  type StoredHotStocks,
} from "@/lib/hotstocks/store";
import {
  addMonths,
  baseMonthKst,
  monthEndYyyyMmDd,
  monthStartYyyyMmDd,
} from "@/lib/hotstocks/months";
import {
  fetchHotStockUniverse,
  type UniverseStock,
} from "@/lib/hotstocks/universe";
import { parseNum } from "@/lib/indices/kisMapper";

/**
 * 핫종목 갱신 잡 파이프라인 — Phase 14 (plan.md §14.4).
 * 매월 1~7일 스케줄이 호출하지만 실제 계산은 기준월당 1회만 수행한다
 * (완료 가드 + progress 커서 이어받기 — 재시도·중복 실행에 멱등).
 * 유니버스 약 2,650종목 × 월봉 1콜, 초당 15건 스로틀로 약 3분.
 */

/** 월봉 조회 스로틀 — 정기 회차와 겹쳐도 합산 20건/초 미만 (§14.4) */
const CALL_INTERVAL_MS = Math.ceil(1000 / 15);

/** Vercel maxDuration 300초 대비 시간 예산 — 소진 시 progress 저장 후 종료 */
const TIME_BUDGET_MS = 250_000;

/** 연속 실패가 이 횟수에 달하면 종목 문제가 아닌 장애로 보고 중단한다 */
const CONSECUTIVE_FAILURE_LIMIT = 10;

export interface RefreshHotStocksReport {
  trigger: string;
  startedAt: string;
  finishedAt: string;
  /** 기준월 M "YYYY-MM" */
  computedFor: string;
  universeCount: number;
  /** 이번 실행에서 처리한 종목 수 */
  processed: number;
  /** 다음 처리 인덱스 — 완료 시 universeCount와 같다 */
  cursor: number;
  /** market:hotStocks 저장까지 끝났는지 — false면 다음 스케줄이 이어받는다 */
  completed: boolean;
  /** progress 커서에서 이어받아 시작했는지 */
  resumed: boolean;
  /** 재시도 후에도 실패해 랭킹에서 빠진 종목 (다음 달 자동 복구) */
  failedCodes: string[];
  /** 기준월 계산이 이미 완료돼 건너뛴 경우의 사유 */
  skipped?: string;
  ok: boolean;
}

/** 수익률 내림차순, 동률 시 종목코드 오름차순 (결정적, §14.2) */
function compareEntries(a: HotStockEntry, b: HotStockEntry): number {
  if (a.returnRate !== b.returnRate) {
    return b.returnRate - a.returnRate;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function emptyWindows(
  computedFor: string
): Record<HotStockWindowKey, HotStockWindow> {
  const windows = {} as Record<HotStockWindowKey, HotStockWindow>;
  for (const key of HOT_STOCK_WINDOW_KEYS) {
    windows[key] = {
      label: HOT_STOCK_WINDOW_LABELS[key],
      // n개월 구간의 시작 월 — 예: M=2026-06, 12m → 2025-07 (완결 달력 구간)
      startMonth: addMonths(computedFor, -(HOT_STOCK_WINDOW_MONTHS[key] - 1)),
      endMonth: computedFor,
      entries: [],
    };
  }
  return windows;
}

/** 구간별 상위 100만 유지하는 온라인 선택 — 최종 TOP 100은 부분 상위 100의 부분집합 */
function offerEntry(window: HotStockWindow, entry: HotStockEntry): void {
  window.entries.push(entry);
  window.entries.sort(compareEntries);
  if (window.entries.length > 100) {
    window.entries.length = 100;
  }
}

function assignRanks(
  windows: Record<HotStockWindowKey, HotStockWindow>
): void {
  for (const key of HOT_STOCK_WINDOW_KEYS) {
    windows[key].entries.forEach((entry, i) => {
      entry.rank = i + 1;
    });
  }
}

/**
 * 종목 1건 처리 — 월봉 1콜로 월말 종가 맵을 만들고 구간 4종에 후보를 제출한다.
 * 기준월 종가 없음 → 전 구간 제외, 구간 시작 종가 없음 → 그 구간만 제외 (§14.2).
 */
async function processStock(
  stock: UniverseStock,
  computedFor: string,
  windows: Record<HotStockWindowKey, HotStockWindow>
): Promise<void> {
  // 범위를 M−13월초부터 잡아 가장 이른 기준가(M−12 월말)까지 확보한다
  const raw = await fetchKisStockMonthlyChart(
    stock.code,
    monthStartYyyyMmDd(addMonths(computedFor, -13)),
    monthEndYyyyMmDd(computedFor)
  );

  const closeByMonth = new Map<string, number>();
  for (const row of raw.output2 ?? []) {
    const date = row.stck_bsop_date;
    const close = parseNum(row.stck_clpr);
    if (typeof date === "string" && date.length === 8 && close > 0) {
      closeByMonth.set(`${date.slice(0, 4)}-${date.slice(4, 6)}`, close);
    }
  }

  const endPrice = closeByMonth.get(computedFor);
  if (endPrice === undefined) {
    return;
  }

  for (const key of HOT_STOCK_WINDOW_KEYS) {
    const startPrice = closeByMonth.get(
      addMonths(computedFor, -HOT_STOCK_WINDOW_MONTHS[key])
    );
    if (startPrice === undefined) {
      continue;
    }

    offerEntry(windows[key], {
      rank: 0, // 최종 정렬 후 assignRanks에서 부여
      code: stock.code,
      name: stock.name,
      market: stock.market,
      startPrice,
      endPrice,
      returnRate: Math.round((endPrice / startPrice - 1) * 10000) / 100,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshHotStocks(
  trigger: string
): Promise<RefreshHotStocksReport> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + TIME_BUDGET_MS;
  const computedFor = baseMonthKst();

  const base = {
    trigger,
    startedAt,
    computedFor,
  };

  // 완료 가드 — 기준월 계산이 이미 저장돼 있으면 no-op (매월 첫 실행만 통과)
  const existing = await getHotStocks();
  if (existing?.computedFor === computedFor) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      universeCount: existing.universeCount,
      processed: 0,
      cursor: existing.universeCount,
      completed: true,
      resumed: false,
      failedCodes: [],
      skipped: `already computed for ${computedFor}`,
      ok: true,
    };
  }

  // 유니버스는 실행마다 새로 받는다(코드 오름차순 정렬 — 커서 결정성, §14.1-3)
  const universe = await fetchHotStockUniverse();

  // 이어받기 — 같은 기준월의 progress만 유효, 월이 바뀌었으면 처음부터
  const progress = await getHotStocksProgress();
  const resumed = progress?.computedFor === computedFor;
  const windows = resumed ? progress!.windows : emptyWindows(computedFor);
  let cursor = resumed ? progress!.cursor : 0;

  const failedCodes: string[] = [];
  let processed = 0;
  let consecutiveFailures = 0;

  while (cursor < universe.length) {
    if (Date.now() >= deadline) {
      assignRanks(windows);
      await setHotStocksProgress({
        computedFor,
        cursor,
        universeCount: universe.length,
        windows,
      });
      return {
        ...base,
        finishedAt: new Date().toISOString(),
        universeCount: universe.length,
        processed,
        cursor,
        completed: false,
        resumed,
        failedCodes,
        ok: true,
      };
    }

    const stock = universe[cursor];
    const callStartedAt = Date.now();

    try {
      try {
        await processStock(stock, computedFor, windows);
      } catch {
        // 일시 오류 대비 1회 재시도 — 그래도 실패하면 종목만 건너뛴다
        await sleep(1000);
        await processStock(stock, computedFor, windows);
      }
      consecutiveFailures = 0;
    } catch (error) {
      console.error(`[job] hot stock fetch failed (${stock.code}):`, error);
      failedCodes.push(stock.code);
      consecutiveFailures += 1;

      // 연속 실패는 토큰·네트워크 장애 신호 — progress 저장 후 500으로 넘긴다
      // (QStash 재시도·다음 날 스케줄이 커서부터 재개, §14.4)
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        assignRanks(windows);
        await setHotStocksProgress({
          computedFor,
          cursor: cursor - (CONSECUTIVE_FAILURE_LIMIT - 1),
          universeCount: universe.length,
          windows,
        });
        throw new Error(
          `hot stocks aborted: ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures at ${stock.code}`
        );
      }
    }

    cursor += 1;
    processed += 1;

    const elapsed = Date.now() - callStartedAt;
    if (elapsed < CALL_INTERVAL_MS) {
      await sleep(CALL_INTERVAL_MS - elapsed);
    }
  }

  assignRanks(windows);

  const result: StoredHotStocks = {
    computedFor,
    universeCount: universe.length,
    windows,
    fetchedAt: new Date().toISOString(),
  };

  await setHotStocks(result);
  await deleteHotStocksProgress();

  return {
    ...base,
    finishedAt: new Date().toISOString(),
    universeCount: universe.length,
    processed,
    cursor,
    completed: true,
    resumed,
    failedCodes,
    ok: true,
  };
}
