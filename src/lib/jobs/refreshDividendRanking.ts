import { fetchKisDividends, fetchKisMultiPrice } from "@/lib/api/kis/client";
import {
  DIVIDEND_RANKING_LOOKBACK_YEARS,
  DIVIDEND_RANKING_SIZE,
  KIS_MULTI_PRICE_BATCH_SIZE,
} from "@/lib/api/kis/constants";
import type { KisDividendRow } from "@/lib/api/kis/types";
import { todayKstDate } from "@/lib/date/kst";
import {
  deleteDividendRankingProgress,
  getDividendRanking,
  getDividendRankingProgress,
  setDividendRanking,
  setDividendRankingProgress,
  type DividendPayoutForm,
  type DividendRankingEntry,
  type StoredDividendRanking,
} from "@/lib/dividends/ranking/store";
import {
  fetchHotStockUniverse,
  type UniverseStock,
} from "@/lib/hotstocks/universe";
import { parseNum } from "@/lib/indices/kisMapper";

/**
 * 배당률 순위 갱신 잡 파이프라인 — Phase 43 (plan.md §43).
 * 유니버스 약 2,650종목 × 예탁원 배당일정 1콜로 시가배당률을 직접 계산해
 * TOP 100을 만든다. KIS `ranking/dividend-rate`를 쓰지 않는 이유는 §43 조사 결과 1
 * (액면가배당률이라 정렬 기준이 다르고, 전 종목 커버리지도 불확실).
 *
 * 현재가는 스캔 **시작 전에 전 종목분을 멀티시세(30종목/콜, 89콜)로 확보**해
 * progress에 함께 저장한다. 배당률이 현재가의 함수라 스캔 도중 상위 N을 고르려면
 * 그 시점에 이미 현재가가 있어야 하고(주당배당금 순 근사는 고가주에 편향돼 오답),
 * 이어받기 실행이 같은 가격 스냅샷을 써야 순위가 한 세트로 고정되기 때문이다.
 */

/** 배당 조회 스로틀 — 정기 회차와 겹쳐도 합산 20건/초 미만 (§14.4와 동일 정책) */
const CALL_INTERVAL_MS = Math.ceil(1000 / 15);

/** Vercel maxDuration 300초 대비 시간 예산 — 소진 시 progress 저장 후 종료 */
const TIME_BUDGET_MS = 250_000;

/** 연속 실패가 이 횟수에 달하면 종목 문제가 아닌 장애로 보고 중단한다 */
const CONSECUTIVE_FAILURE_LIMIT = 10;

export interface RefreshDividendRankingReport {
  trigger: string;
  startedAt: string;
  finishedAt: string;
  /** 산출 기준일 "YYYY-MM-DD" (KST) */
  computedFor: string;
  universeCount: number;
  /** 현재가를 확보한 종목 수 — 이 밖의 종목은 배당률 계산 불가라 순위에서 빠진다 */
  pricedCount: number;
  /** 이번 실행에서 처리한 종목 수 */
  processed: number;
  /** 다음 처리 인덱스 — 완료 시 universeCount와 같다 */
  cursor: number;
  /** market:dividendRanking 저장까지 끝났는지 — false면 다음 스케줄이 이어받는다 */
  completed: boolean;
  /** progress 커서에서 이어받아 시작했는지 */
  resumed: boolean;
  /** 재시도 후에도 실패해 랭킹에서 빠진 종목 (다음 회차 자동 복구) */
  failedCodes: string[];
  /** 기준일 계산이 이미 완료돼 건너뛴 경우의 사유 */
  skipped?: string;
  ok: boolean;
}

/** 시가배당률 내림차순, 동률 시 종목코드 오름차순 (결정적) */
function compareEntries(
  a: DividendRankingEntry,
  b: DividendRankingEntry
): number {
  if (a.dividendYield !== b.dividendYield) {
    return b.dividendYield - a.dividendYield;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** 상위 N만 유지하는 온라인 선택 — 최종 TOP N은 부분 상위 N의 부분집합 */
function offerEntry(
  entries: DividendRankingEntry[],
  entry: DividendRankingEntry
): void {
  entries.push(entry);
  entries.sort(compareEntries);
  if (entries.length > DIVIDEND_RANKING_SIZE) {
    entries.length = DIVIDEND_RANKING_SIZE;
  }
}

/** "YYYY-MM-DD" → "YYYYMMDD" */
function toKisDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

/** 예탁원 `stk_kind` → 현금/주식 구분. 표기가 흔들려도 문자열 포함으로 판정한다. */
function toPayoutForm(stkKind: string | undefined): DividendPayoutForm {
  const raw = stkKind?.trim() ?? "";
  if (raw === "") {
    return "unknown";
  }
  if (raw.includes("현금")) {
    return "cash";
  }
  if (raw.includes("주식")) {
    return "stock";
  }
  return "unknown";
}

/** 최빈 배당종류 — 동률이면 먼저 나온 값 */
function dominantKind(kinds: string[]): string | null {
  if (kinds.length === 0) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 배당 회차에서 연속 배당 연수를 센다 — 기준 연도부터 역순으로 끊김 없는 햇수.
 * 조회 시작 연도까지 끊기지 않으면 `capped`로 표시해 화면에서 "N년+"로 적는다
 * (KIS 과거 조회 상한이 명세에 없어 실제로는 더 길 수 있다, §43).
 */
function countConsecutiveYears(
  paidYears: Set<number>,
  baseYear: number,
  earliestQueryYear: number
): { consecutiveYears: number; yearsCapped: boolean } {
  // 기준 연도 배당이 아직 없을 수 있으므로 직전 연도부터 시작해도 인정한다
  const startYear = paidYears.has(baseYear) ? baseYear : baseYear - 1;
  if (!paidYears.has(startYear)) {
    return { consecutiveYears: 0, yearsCapped: false };
  }

  let count = 0;
  let year = startYear;
  while (paidYears.has(year)) {
    count += 1;
    year -= 1;
  }

  return { consecutiveYears: count, yearsCapped: year < earliestQueryYear };
}

/**
 * 종목 1건 처리 — 배당 1콜로 시가배당률·지급 주기·연속 배당 연수를 함께 만든다.
 * 최근 1년 확정 주당배당금이 0이면 순위 대상이 아니다(무배당·미확정만 있는 종목).
 */
function buildEntry(
  stock: UniverseStock,
  rows: KisDividendRow[],
  price: number,
  computedFor: string
): DividendRankingEntry | null {
  const baseYear = Number(computedFor.slice(0, 4));
  const earliestQueryYear = baseYear - DIVIDEND_RANKING_LOOKBACK_YEARS + 1;
  // 같은 월·일의 1년 전 — 기존 stockInfo의 최근 1년 집계와 같은 기준
  const oneYearAgo = toKisDate(`${baseYear - 1}${computedFor.slice(4)}`);
  const today = toKisDate(computedFor);

  const paidYears = new Set<number>();
  const recentKinds: string[] = [];
  let annualDividendPerShare = 0;
  let roundsPerYear = 0;
  let payoutForm: DividendPayoutForm = "unknown";

  for (const row of rows) {
    const recordDate = row.record_date?.trim();
    const amount = parseNum(row.per_sto_divi_amt);

    // 미확정 회차는 주당배당금이 0으로 오므로 배당 실적으로 세지 않는다
    if (recordDate === undefined || recordDate.length !== 8 || !(amount > 0)) {
      continue;
    }

    paidYears.add(Number(recordDate.slice(0, 4)));

    if (recordDate > oneYearAgo && recordDate <= today) {
      annualDividendPerShare += amount;
      roundsPerYear += 1;

      const kind = row.divi_kind?.trim();
      if (kind) {
        recentKinds.push(kind);
      }
      if (payoutForm === "unknown") {
        payoutForm = toPayoutForm(row.stk_kind);
      }
    }
  }

  if (annualDividendPerShare <= 0) {
    return null;
  }

  const { consecutiveYears, yearsCapped } = countConsecutiveYears(
    paidYears,
    baseYear,
    earliestQueryYear
  );

  return {
    rank: 0, // 최종 정렬 후 부여
    code: stock.code,
    name: stock.name,
    market: stock.market,
    price,
    dividendYield: Math.round((annualDividendPerShare / price) * 10000) / 100,
    annualDividendPerShare,
    roundsPerYear,
    payoutCycle: dominantKind(recentKinds),
    payoutForm,
    consecutiveYears,
    yearsCapped,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 전 종목 현재가 — 30종목/콜이라 ~2,650종목이 89콜. 실패한 배치의 종목은
 * 가격 없이 남아 순위에서 제외된다(다음 회차 자동 복구).
 */
async function fetchAllPrices(
  universe: UniverseStock[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (let i = 0; i < universe.length; i += KIS_MULTI_PRICE_BATCH_SIZE) {
    const batch = universe.slice(i, i + KIS_MULTI_PRICE_BATCH_SIZE);
    const callStartedAt = Date.now();

    try {
      const rows = await fetchKisMultiPrice(batch.map((stock) => stock.code));
      for (const row of rows) {
        const code = row.inter_shrn_iscd?.trim();
        const price = parseNum(row.inter2_prpr);
        if (code !== undefined && code !== "" && price > 0) {
          prices[code] = price;
        }
      }
    } catch (error) {
      console.error("[job] dividend ranking price batch failed:", error);
    }

    const elapsed = Date.now() - callStartedAt;
    if (elapsed < CALL_INTERVAL_MS) {
      await sleep(CALL_INTERVAL_MS - elapsed);
    }
  }

  return prices;
}

export async function refreshDividendRanking(
  trigger: string
): Promise<RefreshDividendRankingReport> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + TIME_BUDGET_MS;
  const computedFor = todayKstDate();

  const base = { trigger, startedAt, computedFor };

  // 완료 가드 — 같은 기준일 산출이 이미 저장돼 있으면 no-op
  const existing = await getDividendRanking();
  if (existing?.computedFor === computedFor) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      universeCount: existing.universeCount,
      pricedCount: 0,
      processed: 0,
      cursor: existing.universeCount,
      completed: true,
      resumed: false,
      failedCodes: [],
      skipped: `already computed for ${computedFor}`,
      ok: true,
    };
  }

  // 유니버스는 실행마다 새로 받는다(코드 오름차순 — 커서 결정성, §14.1-3)
  const universe = await fetchHotStockUniverse();

  // 이어받기 — 같은 기준일의 progress만 유효. 가격 스냅샷도 함께 물려받아
  // 분할 실행 사이에 배당률 기준이 흔들리지 않게 한다.
  const progress = await getDividendRankingProgress();
  const resumed = progress?.computedFor === computedFor;
  const entries: DividendRankingEntry[] = resumed ? progress!.entries : [];
  let cursor = resumed ? progress!.cursor : 0;
  const prices = resumed ? progress!.prices : await fetchAllPrices(universe);
  const pricedCount = Object.keys(prices).length;

  const fromDate = toKisDate(
    `${Number(computedFor.slice(0, 4)) - DIVIDEND_RANKING_LOOKBACK_YEARS + 1}-01-01`
  );
  const toDate = toKisDate(computedFor);

  const failedCodes: string[] = [];
  let processed = 0;
  let consecutiveFailures = 0;

  while (cursor < universe.length) {
    if (Date.now() >= deadline) {
      await setDividendRankingProgress({
        computedFor,
        cursor,
        universeCount: universe.length,
        entries,
        prices,
      });
      return {
        ...base,
        finishedAt: new Date().toISOString(),
        universeCount: universe.length,
        pricedCount,
        processed,
        cursor,
        completed: false,
        resumed,
        failedCodes,
        ok: true,
      };
    }

    const stock = universe[cursor];
    const price = prices[stock.code];

    // 현재가 없는 종목은 배당률을 계산할 수 없어 배당 조회 자체를 건너뛴다
    // (콜도 아낀다 — 상장폐지·거래정지 등)
    if (price === undefined) {
      cursor += 1;
      continue;
    }

    const callStartedAt = Date.now();

    try {
      let rows: KisDividendRow[];
      try {
        rows = await fetchKisDividends(stock.code, fromDate, toDate);
      } catch {
        // 일시 오류 대비 1회 재시도 — 그래도 실패하면 종목만 건너뛴다
        await sleep(1000);
        rows = await fetchKisDividends(stock.code, fromDate, toDate);
      }

      const entry = buildEntry(stock, rows, price, computedFor);
      if (entry !== null) {
        offerEntry(entries, entry);
      }
      consecutiveFailures = 0;
    } catch (error) {
      console.error(`[job] dividend fetch failed (${stock.code}):`, error);
      failedCodes.push(stock.code);
      consecutiveFailures += 1;

      // 연속 실패는 토큰·네트워크 장애 신호 — progress 저장 후 500으로 넘긴다
      // (QStash 재시도·다음 스케줄이 커서부터 재개)
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        await setDividendRankingProgress({
          computedFor,
          cursor: cursor - (CONSECUTIVE_FAILURE_LIMIT - 1),
          universeCount: universe.length,
          entries,
          prices,
        });
        throw new Error(
          `dividend ranking aborted: ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures at ${stock.code}`
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

  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });

  const result: StoredDividendRanking = {
    computedFor,
    universeCount: universe.length,
    entries,
    fetchedAt: new Date().toISOString(),
  };

  await setDividendRanking(result);
  await deleteDividendRankingProgress();

  return {
    ...base,
    finishedAt: new Date().toISOString(),
    universeCount: universe.length,
    pricedCount,
    processed,
    cursor,
    completed: true,
    resumed,
    failedCodes,
    ok: true,
  };
}
