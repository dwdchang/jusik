import {
  fetchKisDividends,
  fetchKisFinancialRatio,
  fetchKisIncomeStatement,
} from "@/lib/api/kis/client";
import { DIVIDEND_LOOKBACK_DAYS } from "@/lib/api/kis/constants";
import type {
  KisDividendRow,
  KisFinancialRatioRow,
  KisIncomeStatementRow,
  KisMarketCapRankingRow,
  KisStockPriceOutput,
} from "@/lib/api/kis/types";
import {
  getStockInfoBlocks,
  getStockSnapshot,
  type DividendRound,
  type StoredStockInfoBlocks,
} from "@/lib/market/store";

/**
 * 종목 상세 페이지 정보 블록 4종 — plan.md §13.4 + Phase 11 전환.
 * KIS 조회·계산(쓰기)은 QStash 갱신 잡이 수행해 `market:stockInfo:{code}`에 저장하고,
 * 화면(읽기)은 저장된 블록과 `market:stock:{code}` 스냅샷을 조합만 한다 — KIS 호출 0건.
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
  /** 현재가(원) — 저장된 스냅샷이 없으면 null (평가·시가배당률 계산 불가) */
  currentPrice: number | null;
  /** 전일 대비율(%) */
  changeRate: number | null;
  /** 스냅샷을 잡이 KIS에서 받아온 시각 (ISO) — 「마지막 갱신」 표기용 */
  fetchedAt: string | null;
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

/**
 * KIS 날짜 → "YYYY-MM-DD". 예탁원 배당일정은 같은 응답 안에서도 필드마다 포맷이
 * 달라(`record_date`="20260331" vs `divi_pay_dt`="2026/05/29", 2026-07-20 실측)
 * 구분자를 걷어낸 뒤 8자리 숫자로 판정한다 — 옛 8자리·슬래시 포맷 둘 다 처리.
 * 슬래시 포맷을 놓치면 확정된 지급일까지 전부 "미정"으로 떨어지는 버그가 있었다.
 */
function toIsoDate(raw: string | undefined): string | null {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (!/^\d{8}$/.test(digits)) {
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

// ---------- 쓰기 경로 (갱신 잡 전용 — KIS 호출 포함) ----------

function buildDividendBlock(
  rows: KisDividendRow[]
): StoredStockInfoBlocks["dividend"] {
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

  // 지급일도 toIsoDate로 정규화(슬래시 포맷 포함) 후 ISO 문자열 사전순=시간순 정렬
  const lastPayDate =
    confirmed
      .map((row) => toIsoDate(row.divi_pay_dt))
      .filter((iso): iso is string => iso !== null)
      .sort()
      .at(-1) ?? null;

  // 확정 회차 원본 행 — 배당 일정 화면·지급일 알림이 읽는다 (Phase 25).
  // 지급일 미정(빈 문자열)은 null로 저장했다가 예탁원 데이터가 공시를 반영하면
  // 이후 갱신 회차의 SET 덮어쓰기로 자연히 채워진다.
  const rounds: DividendRound[] = confirmed
    .map((row) => ({
      recordDate: toIsoDate(row.record_date),
      kind: row.divi_kind?.trim() || null,
      amountPerShare: toNumber(row.per_sto_divi_amt) ?? 0,
      payDate: toIsoDate(row.divi_pay_dt),
    }))
    .filter((round): round is DividendRound => round.recordDate !== null)
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate));

  return {
    kindLabel: latest?.divi_kind?.trim() || null,
    annualDividendPerShare,
    lastPayDate,
    rounds,
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

function buildEarningsBlock(
  incomeRows: KisIncomeStatementRow[],
  ratioRows: KisFinancialRatioRow[]
): StockEarningsInfo | null {
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

  const latestRatio = ratioRows.find((row) => row.stac_yymm === latestYymm);

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

/** 시총 랭킹(상위 30)에서 순위 라벨 — 랭킹 데이터 자체가 없으면 null */
export function resolveRankLabel(
  ranking: KisMarketCapRankingRow[] | null,
  symbolCode: string
): string | null {
  if (ranking === null) {
    return null;
  }
  const matched = ranking.find((row) => row.mksc_shrn_iscd === symbolCode);
  const rank = toNumber(matched?.data_rank);
  return rank !== null ? `${rank}위` : "30위권 밖";
}

/**
 * 갱신 잡 전용 — 가격 무관 정보 블록(배당·실적·순위)을 KIS에서 조회해 계산한다.
 * 랭킹은 회차당 1회만 조회해 인자로 받는다.
 */
export async function fetchStockInfoBlocks(
  symbolCode: string,
  ranking: KisMarketCapRankingRow[] | null
): Promise<StoredStockInfoBlocks> {
  const [dividendResult, incomeResult, ratioResult] = await Promise.allSettled([
    fetchKisDividends(
      symbolCode,
      kstYyyyMmDd(DIVIDEND_LOOKBACK_DAYS),
      kstYyyyMmDd(0)
    ),
    fetchKisIncomeStatement(symbolCode),
    fetchKisFinancialRatio(symbolCode),
  ]);

  if (dividendResult.status === "rejected") {
    console.error(
      `[stockInfo] dividends failed (${symbolCode}):`,
      dividendResult.reason
    );
  }
  if (incomeResult.status === "rejected") {
    console.error(
      `[stockInfo] income statement failed (${symbolCode}):`,
      incomeResult.reason
    );
  }
  if (ratioResult.status === "rejected") {
    console.error(
      `[stockInfo] financial ratio failed (${symbolCode}):`,
      ratioResult.reason
    );
  }

  return {
    symbolCode,
    rankLabel: resolveRankLabel(ranking, symbolCode),
    dividend:
      dividendResult.status === "fulfilled"
        ? buildDividendBlock(dividendResult.value)
        : null,
    earnings:
      incomeResult.status === "fulfilled"
        ? buildEarningsBlock(
            incomeResult.value,
            ratioResult.status === "fulfilled" ? ratioResult.value : []
          )
        : null,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- 읽기 경로 (화면 전용 — Redis만 읽음) ----------

/**
 * 현재가 스냅샷 원본 → 투자지표(PER/PBR/EPS/BPS·52주 최고·최저).
 * 종목 상세(getStockInfo)와 종목 목록 펼침(app/watchlist/rows.ts) 공용 —
 * KIS 문자열 숫자 파싱을 한 곳에만 두기 위해 export한다 (§56).
 */
export function buildStockIndicators(
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

/** 저장된 스냅샷 + 정보 블록 조합 — KIS 호출 없음 (Phase 11 §11.6) */
export async function getStockInfo(symbolCode: string): Promise<StockInfo> {
  const [snap, blocks] = await Promise.all([
    getStockSnapshot(symbolCode),
    getStockInfoBlocks(symbolCode),
  ]);

  const raw = snap?.raw ?? null;
  const currentPrice = snap !== null && snap.price > 0 ? snap.price : null;
  const marketCapEokwon = toNumber(raw?.hts_avls ?? undefined);

  return {
    currentPrice,
    changeRate: snap?.changeRate ?? null,
    fetchedAt: snap?.fetchedAt ?? null,
    marketCap:
      marketCapEokwon !== null && marketCapEokwon > 0
        ? { marketCapEokwon, rankLabel: blocks?.rankLabel ?? null }
        : null,
    dividend:
      blocks?.dividend != null
        ? {
            ...blocks.dividend,
            yieldRate:
              currentPrice !== null &&
              blocks.dividend.annualDividendPerShare > 0
                ? (blocks.dividend.annualDividendPerShare / currentPrice) * 100
                : null,
          }
        : null,
    earnings: blocks?.earnings ?? null,
    indicators: buildStockIndicators(raw),
  };
}
