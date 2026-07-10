import {
  fetchKisDividends,
  fetchKisFinancialRatio,
  fetchKisIncomeStatement,
  fetchKisMarketCapRanking,
  fetchKisStockSnapshot,
} from "@/lib/api/kis/client";
import { DIVIDEND_LOOKBACK_DAYS } from "@/lib/api/kis/constants";
import type {
  KisDividendRow,
  KisFinancialRatioRow,
  KisIncomeStatementRow,
  KisMarketCapRankingRow,
  KisStockPriceOutput,
} from "@/lib/api/kis/types";

/**
 * 종목 상세 페이지 정보 블록 4종 집계 — plan.md §13.4 (2026-07-10 실측·사용자 승인).
 * KIS 호출은 병렬로 수행하고, 블록별로 실패해도 나머지는 표시한다(null 강등).
 */

export interface StockMarketCapInfo {
  /** 시가총액(억원) */
  marketCapEokwon: number;
  /** 시총 순위 — "3위" | "30위권 밖" | 랭킹 조회 실패 시 null */
  rankLabel: string | null;
}

export interface StockDividendInfo {
  /** 최근 확정 배당의 종류 — "분기" | "결산" | "중간" 등 */
  kindLabel: string | null;
  /** 최근 1년 확정 주당배당금 합계(원) — 확정 배당이 없으면 0 */
  annualDividendPerShare: number;
  /** 시가배당률(%) = 최근 1년 주당배당금 합계 ÷ 현재가 — 현재가 없으면 null */
  yieldRate: number | null;
  /** 최근 현금배당 지급일 "YYYY-MM-DD" — 미정이면 null */
  lastPayDate: string | null;
}

export interface StockEarningsInfo {
  /** 최근 분기 결산 연월 — "YYYY.MM" */
  quarterLabel: string;
  /** 분기 단독 매출액(억원) — YTD 차감 계산 (plan.md §13.4) */
  revenueEokwon: number | null;
  /** 분기 단독 영업이익(억원) */
  operatingProfitEokwon: number | null;
  /** 매출 전년 동기 대비(%) — 재무비율 직접 제공값 */
  revenueYoyRate: number | null;
  /** 영업이익 전년 동기 대비(%) */
  operatingProfitYoyRate: number | null;
  /** 매출 직전 분기 대비(%) — 분기 단독값으로 계산 */
  revenueQoqRate: number | null;
  /** 영업이익 직전 분기 대비(%) */
  operatingProfitQoqRate: number | null;
}

export interface StockIndicatorsInfo {
  per: number | null;
  pbr: number | null;
  eps: number | null;
  bps: number | null;
  /** 52주 최고가 / 일자 */
  w52High: number | null;
  w52HighDate: string | null;
  /** 52주 최저가 / 일자 */
  w52Low: number | null;
  w52LowDate: string | null;
}

export interface StockInfo {
  /** 현재가(원) — 조회 실패 시 null (평가·시가배당률 계산 불가) */
  currentPrice: number | null;
  /** 전일 대비율(%) */
  changeRate: number | null;
  marketCap: StockMarketCapInfo | null;
  dividend: StockDividendInfo | null;
  earnings: StockEarningsInfo | null;
  indicators: StockIndicatorsInfo | null;
}

/** KIS 문자열 숫자 → number, 비정상이면 null */
function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "YYYYMMDD" → "YYYY-MM-DD", 형식이 다르면 null */
function toIsoDate(digits: string | undefined): string | null {
  if (!digits || !/^\d{8}$/.test(digits)) {
    return null;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** KST 기준 n일 전 "YYYYMMDD" */
function kstYyyyMmDd(daysAgo: number): string {
  const kst = new Date(
    Date.now() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000
  );
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function buildMarketCap(
  snapshot: KisStockPriceOutput | null,
  ranking: KisMarketCapRankingRow[] | null,
  symbolCode: string
): StockMarketCapInfo | null {
  const marketCapEokwon = toNumber(snapshot?.hts_avls);

  if (marketCapEokwon === null || marketCapEokwon <= 0) {
    return null;
  }

  let rankLabel: string | null = null;
  if (ranking !== null) {
    const matched = ranking.find((row) => row.mksc_shrn_iscd === symbolCode);
    const rank = toNumber(matched?.data_rank);
    rankLabel = rank !== null ? `${rank}위` : "30위권 밖";
  }

  return { marketCapEokwon, rankLabel };
}

function buildDividend(
  rows: KisDividendRow[] | null,
  currentPrice: number | null
): StockDividendInfo | null {
  if (rows === null) {
    return null;
  }

  // 주당배당금 0원은 미확정 회차 — 확정분만 집계 (plan.md §13.4 실측)
  const confirmed = rows.filter(
    (row) => (toNumber(row.per_sto_divi_amt) ?? 0) > 0
  );

  const annualDividendPerShare = confirmed.reduce(
    (sum, row) => sum + (toNumber(row.per_sto_divi_amt) ?? 0),
    0
  );

  const latest = [...confirmed].sort((a, b) =>
    (b.record_date ?? "").localeCompare(a.record_date ?? "")
  )[0];

  const lastPayDate = confirmed
    .map((row) => row.divi_pay_dt ?? "")
    .filter((date) => /^\d{8}$/.test(date))
    .sort()
    .at(-1);

  return {
    kindLabel: latest?.divi_kind?.trim() || null,
    annualDividendPerShare,
    yieldRate:
      currentPrice !== null && currentPrice > 0 && annualDividendPerShare > 0
        ? (annualDividendPerShare / currentPrice) * 100
        : null,
    lastPayDate: toIsoDate(lastPayDate),
  };
}

/** 직전 분기 결산 연월 — "202603" → "202512" */
function previousQuarterYymm(yymm: string): string {
  const year = Number(yymm.slice(0, 4));
  const month = yymm.slice(4, 6);

  if (month === "03") {
    return `${year - 1}12`;
  }
  const prevMonth = String(Number(month) - 3).padStart(2, "0");
  return `${year}${prevMonth}`;
}

/**
 * 분기 단독값 — 손익계산서 값은 연중 누적(YTD)이라 1분기는 그대로,
 * 이후 분기는 같은 해 직전 분기 누적값을 차감한다 (12월 결산 가정, plan.md §13.4).
 */
function standaloneQuarterValue(
  byYymm: Map<string, KisIncomeStatementRow>,
  yymm: string,
  field: "sale_account" | "bsop_prti"
): number | null {
  const ytd = toNumber(byYymm.get(yymm)?.[field]);

  if (ytd === null) {
    return null;
  }
  if (yymm.slice(4, 6) === "03") {
    return ytd;
  }

  const prevYtd = toNumber(byYymm.get(previousQuarterYymm(yymm))?.[field]);
  return prevYtd === null ? null : ytd - prevYtd;
}

/** 직전 분기 대비 증가율(%) — 기준값이 없거나 0이면 null */
function qoqRate(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildEarnings(
  incomeRows: KisIncomeStatementRow[] | null,
  ratioRows: KisFinancialRatioRow[] | null
): StockEarningsInfo | null {
  if (incomeRows === null || incomeRows.length === 0) {
    return null;
  }

  const byYymm = new Map(
    incomeRows
      .filter((row) => row.stac_yymm && /^\d{6}$/.test(row.stac_yymm))
      .map((row) => [row.stac_yymm as string, row])
  );

  const latestYymm = [...byYymm.keys()].sort().at(-1);

  if (!latestYymm) {
    return null;
  }

  const prevYymm = previousQuarterYymm(latestYymm);
  const revenue = standaloneQuarterValue(byYymm, latestYymm, "sale_account");
  const operatingProfit = standaloneQuarterValue(byYymm, latestYymm, "bsop_prti");
  const prevRevenue = standaloneQuarterValue(byYymm, prevYymm, "sale_account");
  const prevOperatingProfit = standaloneQuarterValue(byYymm, prevYymm, "bsop_prti");

  const latestRatio = (ratioRows ?? []).find(
    (row) => row.stac_yymm === latestYymm
  );

  return {
    quarterLabel: `${latestYymm.slice(0, 4)}.${latestYymm.slice(4, 6)}`,
    revenueEokwon: revenue,
    operatingProfitEokwon: operatingProfit,
    revenueYoyRate: toNumber(latestRatio?.grs),
    operatingProfitYoyRate: toNumber(latestRatio?.bsop_prfi_inrt),
    revenueQoqRate: qoqRate(revenue, prevRevenue),
    operatingProfitQoqRate: qoqRate(operatingProfit, prevOperatingProfit),
  };
}

function buildIndicators(
  snapshot: KisStockPriceOutput | null
): StockIndicatorsInfo | null {
  if (snapshot === null) {
    return null;
  }

  return {
    per: toNumber(snapshot.per),
    pbr: toNumber(snapshot.pbr),
    eps: toNumber(snapshot.eps),
    bps: toNumber(snapshot.bps),
    w52High: toNumber(snapshot.w52_hgpr),
    w52HighDate: toIsoDate(snapshot.w52_hgpr_date),
    w52Low: toNumber(snapshot.w52_lwpr),
    w52LowDate: toIsoDate(snapshot.w52_lwpr_date),
  };
}

/** allSettled 결과 → 값 또는 null (실패는 로그만 남기고 블록 강등) */
function settledOrNull<T>(
  result: PromiseSettledResult<T>,
  label: string,
  symbolCode: string
): T | null {
  if (result.status === "fulfilled") {
    return result.value;
  }
  console.error(`[stockInfo] ${label} failed (${symbolCode}):`, result.reason);
  return null;
}

export async function getStockInfo(symbolCode: string): Promise<StockInfo> {
  const [snapshotResult, rankingResult, dividendResult, incomeResult, ratioResult] =
    await Promise.allSettled([
      fetchKisStockSnapshot(symbolCode),
      fetchKisMarketCapRanking(),
      fetchKisDividends(
        symbolCode,
        kstYyyyMmDd(DIVIDEND_LOOKBACK_DAYS),
        kstYyyyMmDd(0)
      ),
      fetchKisIncomeStatement(symbolCode),
      fetchKisFinancialRatio(symbolCode),
    ]);

  const snapshot = settledOrNull(snapshotResult, "snapshot", symbolCode);
  const ranking = settledOrNull(rankingResult, "market cap ranking", symbolCode);
  const dividends = settledOrNull(dividendResult, "dividends", symbolCode);
  const income = settledOrNull(incomeResult, "income statement", symbolCode);
  const ratio = settledOrNull(ratioResult, "financial ratio", symbolCode);

  const currentPrice = toNumber(snapshot?.stck_prpr);

  return {
    currentPrice: currentPrice !== null && currentPrice > 0 ? currentPrice : null,
    changeRate: toNumber(snapshot?.prdy_ctrt),
    marketCap: buildMarketCap(snapshot, ranking, symbolCode),
    dividend: buildDividend(dividends, currentPrice),
    earnings: buildEarnings(income, ratio),
    indicators: buildIndicators(snapshot),
  };
}
