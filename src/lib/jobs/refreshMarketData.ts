import {
  evaluatePriceAlerts,
  type PriceAlertsReport,
} from "@/lib/alerts/evaluate";
import {
  fetchKisFluctuationRanking,
  fetchKisIndexDaily,
  fetchKisMarketCapRanking,
  fetchKisOverseasDaily,
  fetchKisStockName,
  fetchKisStockSnapshot,
} from "@/lib/api/kis/client";
import type {
  KisIndexDailyResponse,
  KisMarketCapRankingRow,
} from "@/lib/api/kis/types";
import { todayKstDate } from "@/lib/date/kst";
import { saveHoldings, upsertPortfolioHistory } from "@/lib/holdings/store";
import {
  backfillStockHistoryIfMissing,
  refreshStockHistory,
} from "@/lib/holdings/stockHistory";
import { fetchStockInfoBlocks } from "@/lib/holdings/stockInfo";
import { fetchHotStockUniverse } from "@/lib/hotstocks/universe";
import {
  applyKisSign,
  mapKisDailyRows,
  mapKisHistory,
  mapKisSnapshot,
  parseNum,
} from "@/lib/indices/kisMapper";
import {
  mapKisOverseasDailyRows,
  mapKisOverseasHistory,
  mapKisOverseasSnapshot,
} from "@/lib/indices/kisOverseasMapper";
import {
  computeVolatilityRecords,
  upsertVolatilityRecords,
} from "@/lib/indices/volatility";
import {
  getStockInfoBlocks,
  setDailyFluctuation,
  setLastRefreshRecord,
  setMarketDetail,
  getStockMaster,
  setStockInfoBlocks,
  setStockMaster,
  setStockSnapshot,
  type DailyFluctuationItem,
  type MarketDetailKey,
  type StockMasterItem,
  type StoredStockSnapshot,
} from "@/lib/market/store";
import { getStockHistory } from "@/lib/holdings/stockHistory";
import { saveWatchlist } from "@/lib/watchlist/store";
import type { Holding } from "@/types/holdings";
import type { WatchItem } from "@/types/watchlist";
import {
  collectHoldings,
  collectWatchlists,
  errorMessage,
  unionSymbolCodes,
} from "./collectTargets";

/**
 * 시세 갱신 잡 파이프라인 — Phase 11 (plan.md §11.1).
 * QStash 스케줄 4개(평일 09:00~15:30 10분 / 15:40 / 18:15 KST)가 동일 로직을 재사용한다.
 * KIS를 호출하는 유일한 경로이며, 화면은 이 잡이 저장한 Redis 값만 읽는다.
 * 모든 저장은 멱등(SET 덮어쓰기·날짜 upsert)이라 재시도·중복 실행에 안전하다.
 */

/** KST 15:35 이후 회차 = 확정 회차(15:40·18:15) — 종가 히스토리·정보 블록을 갱신한다 */
function isConfirmedRound(now: Date = new Date()): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes() >= 15 * 60 + 35;
}

export interface RefreshMarketDataReport {
  trigger: string;
  startedAt: string;
  finishedAt: string;
  /** KIS 기준일(basDt) == KST 오늘 — 휴장일이면 false, 알림 판정 skip (§11.10-A5) */
  tradingDay: boolean;
  indices: Array<{ key: MarketDetailKey; ok: boolean; error?: string }>;
  volatility: { ok: boolean; upserted?: number; error?: string };
  /** 당일 등락률 순위 저장 결과 — 부수 데이터라 실패해도 잡 전체 ok에 영향 없음 */
  dailyFluctuation: { ok: boolean; count?: number; error?: string };
  /** 종목 마스터 저장 결과 — 1일 1회, 부수 데이터라 잡 전체 ok에 영향 없음 */
  stockMaster: { ok: boolean; count?: number; skipped?: true; error?: string };
  stocks: Array<{ symbolCode: string; ok: boolean; error?: string }>;
  nameFills: Array<{ symbolCode: string; ok: boolean; error?: string }>;
  portfolios: Array<{
    email: string;
    ok: boolean;
    skipped?: true;
    error?: string;
  }>;
  /** 관심종목 읽기 결과 — 이메일별 실패 격리 (§15.3) */
  watchlists: Array<{ email: string; ok: boolean; error?: string }>;
  /** 관심종목 기준가 확정·잠정→확정 승격 결과 (§15.4) */
  registrationPriceFills: Array<{
    email: string;
    symbolCode: string;
    ok: boolean;
    error?: string;
  }>;
  alerts: { evaluated: boolean; reason?: string; summary?: PriceAlertsReport };
  /** 데이터 갱신 성공 여부 — false면 잡 엔드포인트가 500을 반환(QStash 재시도, §11.10-A6) */
  ok: boolean;
}

/**
 * Phase 10 알림 판정·발송 연결 지점 (§11.11 그룹 8).
 * 갱신 잡이 방금 저장한 스냅샷으로 조건 3종을 판정해 Web Push를 발송한다.
 * 실패해도 로그만 남기고 응답은 200 (§11.10-A6).
 */
async function evaluateAlertsHook(context: {
  snapshots: Map<string, StoredStockSnapshot>;
  holdingsByEmail: Map<string, Holding[]>;
}): Promise<PriceAlertsReport> {
  return evaluatePriceAlerts(context);
}

/** 지수·환율·금리·유가 5종 조회 → market:detail:* 저장 (지표별 실패 격리) */
async function refreshIndices(fetchedAt: string): Promise<{
  results: RefreshMarketDataReport["indices"];
  kospiRaw: KisIndexDailyResponse | null;
}> {
  let kospiRaw: KisIndexDailyResponse | null = null;

  const tasks: Array<{ key: MarketDetailKey; run: () => Promise<void> }> = [
    {
      key: "kospi",
      run: async () => {
        const raw = await fetchKisIndexDaily("KOSPI");
        kospiRaw = raw;
        await setMarketDetail("kospi", {
          snapshot: mapKisSnapshot(raw, "KOSPI"),
          history: mapKisHistory(raw, "KOSPI"),
          dailyRows: mapKisDailyRows(raw, "KOSPI"),
          fetchedAt,
        });
      },
    },
    {
      key: "kosdaq",
      run: async () => {
        const raw = await fetchKisIndexDaily("KOSDAQ");
        await setMarketDetail("kosdaq", {
          snapshot: mapKisSnapshot(raw, "KOSDAQ"),
          history: mapKisHistory(raw, "KOSDAQ"),
          dailyRows: mapKisDailyRows(raw, "KOSDAQ"),
          fetchedAt,
        });
      },
    },
    {
      key: "usdkrw",
      run: async () => {
        const raw = await fetchKisOverseasDaily("USDKRW");
        await setMarketDetail("usdkrw", {
          snapshot: mapKisOverseasSnapshot(raw, "USDKRW"),
          history: mapKisOverseasHistory(raw, "USDKRW"),
          dailyRows: mapKisOverseasDailyRows(raw, "USDKRW"),
          fetchedAt,
        });
      },
    },
    {
      key: "us10y",
      run: async () => {
        const raw = await fetchKisOverseasDaily("US10Y");
        await setMarketDetail("us10y", {
          snapshot: mapKisOverseasSnapshot(raw, "US10Y"),
          history: mapKisOverseasHistory(raw, "US10Y"),
          dailyRows: mapKisOverseasDailyRows(raw, "US10Y"),
          fetchedAt,
        });
      },
    },
    {
      key: "oil",
      run: async () => {
        const raw = await fetchKisOverseasDaily("OIL");
        await setMarketDetail("oil", {
          snapshot: mapKisOverseasSnapshot(raw, "OIL"),
          history: mapKisOverseasHistory(raw, "OIL"),
          dailyRows: mapKisOverseasDailyRows(raw, "OIL"),
          fetchedAt,
        });
      },
    },
  ];

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const results = tasks.map((task, i) => {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      console.error(`[job] index refresh failed (${task.key}):`, outcome.reason);
      return { key: task.key, ok: false, error: errorMessage(outcome.reason) };
    }
    return { key: task.key, ok: true };
  });

  return { results, kospiRaw };
}

/**
 * 당일 등락률 순위 상위 30 → market:dailyFluctuation 저장 (§17.10).
 * 전체시장 상승률순 1콜, 부수 데이터라 실패해도 잡 전체 ok에 영향 없이 로그만 남긴다.
 * KIS 응답 순서에 의존하지 않고 changeRate(전일 대비율) 내림차순으로 재정렬·재순위해
 * 저장한다 — 화면 정렬 기준과 저장 순서가 항상 일치하도록 보장.
 */
async function refreshDailyFluctuation(
  fetchedAt: string
): Promise<RefreshMarketDataReport["dailyFluctuation"]> {
  try {
    const rows = await fetchKisFluctuationRanking("0");

    const items: DailyFluctuationItem[] = rows
      .filter((row) => row.stck_shrn_iscd && row.hts_kor_isnm)
      .map((row) => ({
        rank: 0,
        code: row.stck_shrn_iscd as string,
        name: row.hts_kor_isnm as string,
        price: parseNum(row.stck_prpr),
        changeRate: applyKisSign(parseNum(row.prdy_ctrt), row.prdy_vrss_sign),
      }))
      .sort((a, b) => b.changeRate - a.changeRate)
      .map((item, i) => ({ ...item, rank: i + 1 }));

    await setDailyFluctuation({ items, fetchedAt });
    return { ok: true, count: items.length };
  } catch (error) {
    console.error("[job] daily fluctuation refresh failed:", error);
    return { ok: false, error: errorMessage(error) };
  }
}

/** ISO 시각의 KST 날짜 "YYYY-MM-DD" — 마스터 1일 1회 갱신 판정용 */
function kstDateOf(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 종목 마스터 → market:stockMaster 저장 (종목명 검색용, §17.11).
 * 공개 KIS 종목 마스터를 파싱한 코드↔종목명 목록. 마스터는 거의 안 변하므로
 * 이미 오늘 갱신됐으면 다운로드를 건너뛴다(1일 1회). 부수 데이터라 실패해도
 * 잡 전체 ok에 영향 없이 로그만 남긴다.
 */
async function refreshStockMaster(
  fetchedAt: string
): Promise<RefreshMarketDataReport["stockMaster"]> {
  try {
    const existing = await getStockMaster();
    if (existing !== null && kstDateOf(existing.fetchedAt) === todayKstDate()) {
      return { ok: true, skipped: true, count: existing.items.length };
    }

    const universe = await fetchHotStockUniverse();
    const items: StockMasterItem[] = universe.map((stock) => ({
      code: stock.code,
      name: stock.name,
      market: stock.market,
    }));

    await setStockMaster({ items, fetchedAt });
    return { ok: true, count: items.length };
  } catch (error) {
    console.error("[job] stock master refresh failed:", error);
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * 관심종목 기준가 확정 — KIS 직접 호출 없이 stock:{code}:history에서
 * registeredAt 이하 마지막 종가를 사용한다 (§15.4). 잠정 확정
 * (priceBasisDate < registeredAt — 기준일 당일 종가가 아직 없던 상태)은
 * 이후 회차에서 당일 종가가 생겼는지 재확인해 승격한다. 멱등.
 * KIS 호출이 없어 단독 실행 안전 — export는 로컬 실측용.
 */
export async function fillRegistrationPrices(
  watchlistsByEmail: Map<string, WatchItem[]>
): Promise<RefreshMarketDataReport["registrationPriceFills"]> {
  const results: RefreshMarketDataReport["registrationPriceFills"] = [];
  const historyCache = new Map<
    string,
    Awaited<ReturnType<typeof getStockHistory>>
  >();

  for (const [email, items] of watchlistsByEmail) {
    let changed = false;

    for (const item of items) {
      const needsFill =
        item.priceAtRegistration === null ||
        (item.priceBasisDate !== null &&
          item.priceBasisDate < item.registeredAt);

      if (!needsFill) {
        continue;
      }

      try {
        let history = historyCache.get(item.symbolCode);
        if (history === undefined) {
          history = await getStockHistory(item.symbolCode);
          historyCache.set(item.symbolCode, history);
        }

        // 히스토리는 날짜 오름차순 — 기준일 이하 마지막 종가가 기준가
        const basis = [...history]
          .reverse()
          .find((row) => row.date <= item.registeredAt);

        if (basis === undefined) {
          // 히스토리 미백필(다음 회차에 채워짐) 또는 상장 전 날짜 — 이번 회차는 보류
          continue;
        }

        if (
          item.priceAtRegistration !== basis.close ||
          item.priceBasisDate !== basis.date
        ) {
          item.priceAtRegistration = basis.close;
          item.priceBasisDate = basis.date;
          item.updatedAt = new Date().toISOString();
          changed = true;
          results.push({ email, symbolCode: item.symbolCode, ok: true });
        }
      } catch (error) {
        console.error(
          `[job] registration price fill failed (${email}/${item.symbolCode}):`,
          error
        );
        results.push({
          email,
          symbolCode: item.symbolCode,
          ok: false,
          error: errorMessage(error),
        });
      }
    }

    if (changed) {
      try {
        await saveWatchlist(email, items);
      } catch (error) {
        console.error(`[job] watchlist price save failed (${email}):`, error);
      }
    }
  }

  return results;
}

/**
 * 종목코드 중복 제거 후 종목별 1회 조회 → market:stock:{code} 저장.
 * 확정 회차(15:40·18:15)에는 종가 히스토리·정보 블록도 갱신한다.
 * KIS 유량 제한을 고려해 종목 단위로 순차 실행 (§11.8).
 */
async function refreshStocks(
  symbolCodes: string[],
  fetchedAt: string,
  confirmedRound: boolean
): Promise<{
  results: RefreshMarketDataReport["stocks"];
  snapshots: Map<string, StoredStockSnapshot>;
}> {
  const results: RefreshMarketDataReport["stocks"] = [];
  const snapshots = new Map<string, StoredStockSnapshot>();

  // 시총 랭킹은 회차당 1회 — 정보 블록 갱신이 필요할 때만 지연 조회
  let ranking: KisMarketCapRankingRow[] | null | undefined;
  const loadRanking = async (): Promise<KisMarketCapRankingRow[] | null> => {
    if (ranking === undefined) {
      try {
        ranking = await fetchKisMarketCapRanking();
      } catch (error) {
        console.error("[job] market cap ranking failed:", error);
        ranking = null;
      }
    }
    return ranking;
  };

  for (const symbolCode of symbolCodes) {
    try {
      const raw = await fetchKisStockSnapshot(symbolCode);
      const price = parseNum(raw.stck_prpr);

      if (price <= 0) {
        throw new Error(`invalid price for ${symbolCode}`);
      }

      const marketName = raw.rprs_mrkt_kor_name;
      const snapshot: StoredStockSnapshot = {
        symbolCode,
        price,
        changeRate: applyKisSign(parseNum(raw.prdy_ctrt), raw.prdy_vrss_sign),
        marketName: typeof marketName === "string" ? marketName : null,
        raw,
        fetchedAt,
      };

      await setStockSnapshot(snapshot);
      snapshots.set(symbolCode, snapshot);

      // 종가 히스토리 — 신규 종목은 즉시 백필, 기존 종목은 확정 회차에만 갱신
      if (confirmedRound) {
        await refreshStockHistory(symbolCode);
      } else {
        await backfillStockHistoryIfMissing(symbolCode);
      }

      // 정보 블록(배당·실적·순위) — 신규 종목이거나 확정 회차면 갱신
      if (confirmedRound || (await getStockInfoBlocks(symbolCode)) === null) {
        await setStockInfoBlocks(
          await fetchStockInfoBlocks(symbolCode, await loadRanking())
        );
      }

      results.push({ symbolCode, ok: true });
    } catch (error) {
      console.error(`[job] stock refresh failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }
  }

  return { results, snapshots };
}

/**
 * 종목명 미확정(빈 문자열) 보유종목·관심종목 채움 — §11.10-A4, §15.3 확장.
 * 등록 액션은 형식 검증만 하므로, 종목명은 다음 갱신 회차에서 여기로 채워진다.
 */
async function fillMissingNames(
  holdingsByEmail: Map<string, Holding[]>,
  watchlistsByEmail: Map<string, WatchItem[]>
): Promise<RefreshMarketDataReport["nameFills"]> {
  const allItems = [
    ...[...holdingsByEmail.values()].flat(),
    ...[...watchlistsByEmail.values()].flat(),
  ];
  const missingCodes = [
    ...new Set(
      allItems
        .filter((item) => item.name.trim() === "")
        .map((item) => item.symbolCode)
    ),
  ];

  const results: RefreshMarketDataReport["nameFills"] = [];
  const names = new Map<string, string>();

  for (const symbolCode of missingCodes) {
    try {
      names.set(symbolCode, await fetchKisStockName(symbolCode));
      results.push({ symbolCode, ok: true });
    } catch (error) {
      console.error(`[job] stock name fill failed (${symbolCode}):`, error);
      results.push({ symbolCode, ok: false, error: errorMessage(error) });
    }
  }

  if (names.size === 0) {
    return results;
  }

  const applyNames = (items: Array<Holding | WatchItem>): boolean => {
    let changed = false;
    for (const item of items) {
      const name = names.get(item.symbolCode);
      if (item.name.trim() === "" && name !== undefined) {
        item.name = name;
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    return changed;
  };

  for (const [email, holdings] of holdingsByEmail) {
    if (applyNames(holdings)) {
      try {
        await saveHoldings(email, holdings);
      } catch (error) {
        console.error(`[job] holdings name save failed (${email}):`, error);
      }
    }
  }

  for (const [email, items] of watchlistsByEmail) {
    if (applyNames(items)) {
      try {
        await saveWatchlist(email, items);
      } catch (error) {
        console.error(`[job] watchlist name save failed (${email}):`, error);
      }
    }
  }

  return results;
}

/**
 * 사용자별 포트폴리오 평가 → holdings history 오늘 기록 upsert.
 * 방금 저장한 스냅샷 가격만 사용 — 가격이 하나라도 없으면 과소 집계 방지를 위해 skip.
 */
async function refreshPortfolios(
  holdingsByEmail: Map<string, Holding[]>,
  snapshots: Map<string, StoredStockSnapshot>
): Promise<RefreshMarketDataReport["portfolios"]> {
  const date = todayKstDate();

  return Promise.all(
    [...holdingsByEmail.entries()].map(async ([email, holdings]) => {
      if (holdings.length === 0) {
        return { email, ok: true, skipped: true as const };
      }

      const missing = holdings.filter(
        (holding) => !snapshots.has(holding.symbolCode)
      );

      if (missing.length > 0) {
        return {
          email,
          ok: false,
          error: `price missing: ${missing
            .map((holding) => holding.symbolCode)
            .join(", ")}`,
        };
      }

      try {
        const totalCost = holdings.reduce(
          (sum, holding) => sum + holding.totalCost,
          0
        );
        const totalValue = holdings.reduce(
          (sum, holding) =>
            sum +
            (snapshots.get(holding.symbolCode)?.price ?? 0) * holding.quantity,
          0
        );

        await upsertPortfolioHistory(email, { date, totalCost, totalValue });
        return { email, ok: true };
      } catch (error) {
        console.error(`[job] portfolio upsert failed (${email}):`, error);
        return { email, ok: false, error: errorMessage(error) };
      }
    })
  );
}

export async function refreshMarketData(
  trigger: string
): Promise<RefreshMarketDataReport> {
  const startedAt = new Date().toISOString();
  const confirmedRound = isConfirmedRound();

  // 1. 지수·환율·금리·유가 5종 → market:detail:*
  const { results: indices, kospiRaw } = await refreshIndices(startedAt);

  // 1b. 당일 등락률 순위 상위 30 → market:dailyFluctuation (부수 데이터, 실패 격리)
  const dailyFluctuation = await refreshDailyFluctuation(startedAt);

  // 1c. 종목 마스터 → market:stockMaster (종목명 검색용, 1일 1회, 실패 격리)
  const stockMaster = await refreshStockMaster(startedAt);

  // 4. 코스피 변동성 upsert (1의 KOSPI 응답 재사용)
  let volatility: RefreshMarketDataReport["volatility"];
  if (kospiRaw !== null) {
    try {
      const records = computeVolatilityRecords(kospiRaw);
      await upsertVolatilityRecords(records);
      volatility = { ok: true, upserted: records.length };
    } catch (error) {
      console.error("[job] volatility upsert failed:", error);
      volatility = { ok: false, error: errorMessage(error) };
    }
  } else {
    volatility = { ok: false, error: "KOSPI response unavailable" };
  }

  // 2. 전체 사용자 보유종목+관심종목 union → 종목코드 중복 제거 (§15.3 —
  //    겹치는 종목은 스냅샷·히스토리·정보 블록 공유, 추가 호출 0)
  const [holdingsByEmail, { byEmail: watchlistsByEmail, results: watchlists }] =
    await Promise.all([collectHoldings(), collectWatchlists()]);
  const symbolCodes = unionSymbolCodes(holdingsByEmail, watchlistsByEmail);

  // 3. 종목별 1회 조회 → market:stock:* (+확정 회차: 히스토리·정보 블록)
  const { results: stocks, snapshots } = await refreshStocks(
    symbolCodes,
    startedAt,
    confirmedRound
  );

  // 종목명 미확정 보유종목·관심종목 채움 (§11.10-A4)
  const nameFills = await fillMissingNames(holdingsByEmail, watchlistsByEmail);

  // 관심종목 기준가 확정 — 신규 종목 백필(refreshStocks)이 먼저 실행된 상태 (§15.4)
  const registrationPriceFills =
    await fillRegistrationPrices(watchlistsByEmail);

  // 5. 사용자별 포트폴리오 평가 → holdings history upsert
  const portfolios = await refreshPortfolios(holdingsByEmail, snapshots);

  // 거래일 판단 — KIS 기준일(basDt)이 KST 오늘과 다르면 휴장 (§11.10-A5)
  const kospiBasDt = indices.find((row) => row.key === "kospi")?.ok
    ? ((kospiRaw as KisIndexDailyResponse | null)?.output2 ?? [])
        .map((row) => row.stck_bsop_date)
        .filter((basDt): basDt is string => typeof basDt === "string")
        .sort()
        .at(-1)
    : undefined;
  const tradingDay = kospiBasDt === todayKstDate().replaceAll("-", "");

  // 6. 알림 판정·발송 (Phase 10 연결 지점) — 휴장일이면 skip, 실패해도 200 (§11.10-A6)
  let alerts: RefreshMarketDataReport["alerts"];
  if (!tradingDay) {
    alerts = { evaluated: false, reason: "not a trading day (basDt mismatch)" };
  } else {
    try {
      const summary = await evaluateAlertsHook({ snapshots, holdingsByEmail });
      alerts = { evaluated: true, summary };
    } catch (error) {
      console.error("[job] alert evaluation failed:", error);
      alerts = { evaluated: false, reason: errorMessage(error) };
    }
  }

  const ok =
    indices.every((row) => row.ok) &&
    volatility.ok &&
    stocks.every((row) => row.ok) &&
    portfolios.every((row) => row.ok);

  const finishedAt = new Date().toISOString();

  // 마지막 갱신 성공 시각 — staleness 배지·수동 점검용 (§11.2)
  if (ok) {
    try {
      await setLastRefreshRecord({ at: finishedAt, trigger, ok });
    } catch (error) {
      console.error("[job] lastRefreshAt save failed:", error);
    }
  }

  return {
    trigger,
    startedAt,
    finishedAt,
    tradingDay,
    indices,
    volatility,
    dailyFluctuation,
    stockMaster,
    stocks,
    nameFills,
    portfolios,
    watchlists,
    registrationPriceFills,
    alerts,
    ok,
  };
}
