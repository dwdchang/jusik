import {
  DART_QUARTER_REPRTS,
  DART_REPRT_ANNUAL,
  fetchDartDividendMatters,
  fetchDartFinancialStatements,
  fetchDartStockTotalQty,
  type DartDividendRow,
  type DartFinanceRow,
  type DartFsDiv,
  type DartStockTotalRow,
} from "@/lib/api/dart/finance";
import { getCorpCodeMap } from "@/lib/feeds/store";
import { getRedis } from "@/lib/redis/client";
import { currentKstYear, DART_CONCURRENCY, mapLimit } from "./financials";

/**
 * 종목분석 통합지표 read-through 캐시 — Phase 72 (plan.md §72).
 *
 * 「주요 재무지표 표 + 차트 6종」이 쓰는 **기간 시계열**을 만든다. 재무제표 전문
 * (`financials.ts`)과 달리 계정 전체가 아니라 지표에 필요한 계정만 뽑아 연간·분기·
 * 연환산(TTM) 세 벌로 환산해 둔다.
 *
 * ⚠️ `financials.ts`와 같은 아키텍처 예외를 공유한다 — 화면이 DART를 직접 호출하고
 * `analysis:*` 네임스페이스에 직접 쓴다(시세 키 `market:*`와 무충돌). 재무는 확정 후
 * 불변이라 **TTL 30일**이고, 만료돼도 다음 열람 때 다시 받으면 그만이다.
 *
 * 시세가 필요한 지표(PER·PBR·시가배당률의 TTM분)는 여기 없다 — 갱신 주기가 완전히
 * 달라 `quote.ts`(TTL 6시간)가 따로 맡고, `view.ts`에서 합친다.
 */

const OVERVIEW_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일
const OVERVIEW_KEY_PREFIX = "analysis:overview:v1:";

/** 표시 연수 — 사용자 확정(2026-07-28). 금융위 시세 제공 시작(2020)과도 맞물린다 */
export const OVERVIEW_ANNUAL_YEARS = 6;
/** 분기·연환산 시계열을 만들 연수 — 6개년 전부 받으면 콜이 24개라 최근 3년만 */
const OVERVIEW_QUARTER_YEARS = 3;

// ── 표준 계정 코드 ───────────────────────────────────────
// 계정명(account_nm)은 회사마다 "매출액"/"영업수익"/"수익(매출액)"으로 갈려서
// 표준 계정 코드로 잡는다 (2026-07-28 실측).

/** 재무제표 구분 묶음 — 같은 계정명이 여러 표에 나와 오탐을 부른다(§ `pickAmount`) */
const DIV_INCOME = ["IS", "CIS"];
const DIV_BALANCE = ["BS"];
const DIV_CASHFLOW = ["CF"];

/**
 * 지표별 계정 후보. **표준 계정 코드 우선, 계정명은 폴백**이다.
 *
 * 코드만으로는 못 잡는 회사가 실제로 있다 — 카카오(035720)는 영업수익을
 * `ifrs-full_GrossProfit`(매출총이익) 코드로 태깅해, 2020~2022 매출이 통째로 비었다
 * (2026-07-28 실측). 반대로 계정명만 보면 "지배기업 소유주지분"처럼 손익·포괄손익·
 * 재무상태표에 모두 나오는 이름에서 엉뚱한 값을 집는다. 그래서 코드 → 이름 순서로
 * 찾되 **재무제표 구분(sj_div)으로 범위를 좁힌다**.
 */
const ACCOUNT = {
  revenue: {
    ids: ["ifrs-full_Revenue"],
    names: ["매출액", "영업수익", "수익(매출액)", "매출", "영업수익(매출액)"],
    // 매출총이익 코드를 매출로 쓰는 회사 대비 — 이름으로도 못 찾았을 때만
    fallbackIds: ["ifrs-full_GrossProfit"],
    divisions: DIV_INCOME,
  },
  operatingProfit: {
    ids: ["dart_OperatingIncomeLoss", "ifrs-full_ProfitLossFromOperatingActivities"],
    names: ["영업이익", "영업이익(손실)", "영업손익"],
    divisions: DIV_INCOME,
  },
  netProfit: {
    ids: [
      "ifrs-full_ProfitLossAttributableToOwnersOfParent",
      "ifrs-full_ProfitLoss",
    ],
    // ⚠️ 이름 폴백에 "지배기업 소유주지분"을 넣으면 안 된다 — 포괄손익계산서에도 같은
    // 이름이 있어 **총포괄손익의 지배지분**을 순이익으로 착각한다(2026-07-28 실측).
    // 손익계산서를 따로 내지 않고 포괄손익계산서만 제출하는 회사(카카오·SK하이닉스)가
    // 있어 구분은 IS/CIS 둘 다 허용하되, 이름은 순이익 전용 표기만 남긴다.
    names: ["당기순이익", "분기순이익", "당기순이익(손실)"],
    divisions: DIV_INCOME,
  },
  eps: {
    ids: ["ifrs-full_BasicEarningsLossPerShare"],
    names: ["기본주당이익", "기본주당이익(손실)", "기본주당순이익"],
    divisions: DIV_INCOME,
  },
  equity: {
    ids: [
      "ifrs-full_EquityAttributableToOwnersOfParent",
      "ifrs-full_Equity",
    ],
    names: ["지배기업의 소유주에게 귀속되는 자본", "자본총계"],
    divisions: DIV_BALANCE,
  },
  cfo: {
    ids: ["ifrs-full_CashFlowsFromUsedInOperatingActivities"],
    names: ["영업활동현금흐름", "영업활동으로 인한 현금흐름"],
    divisions: DIV_CASHFLOW,
  },
  cfi: {
    ids: ["ifrs-full_CashFlowsFromUsedInInvestingActivities"],
    names: ["투자활동현금흐름", "투자활동으로 인한 현금흐름"],
    divisions: DIV_CASHFLOW,
  },
  cff: {
    ids: ["ifrs-full_CashFlowsFromUsedInFinancingActivities"],
    names: ["재무활동현금흐름", "재무활동으로 인한 현금흐름"],
    divisions: DIV_CASHFLOW,
  },
} as const;

/** 한 지표의 계정 후보 정의 */
interface AccountSpec {
  readonly ids: readonly string[];
  readonly names: readonly string[];
  readonly fallbackIds?: readonly string[];
  readonly divisions: readonly string[];
}

/** 배당 구분(alotMatter `se`) — 표기가 "(연결)현금배당성향(%)"처럼 접두를 달고 온다 */
const DIVIDEND_SE = {
  dps: "주당 현금배당금",
  payout: "현금배당성향",
  yield: "현금배당수익률",
} as const;

// ── 뷰 모델 ──────────────────────────────────────────────

/** 기간 모드 — 연환산(TTM)·연간·분기 */
export type AnalysisPeriodMode = "ttm" | "annual" | "quarter";

/**
 * 한 기간의 지표 묶음. 금액은 **억원**, 주당 값은 **원**, 비율은 **%**.
 * 값이 없으면 null이며 차트·표는 그 점을 건너뛴다.
 */
export interface AnalysisPeriodPoint {
  /** 정렬·병합 키 — "2025" 또는 "2025Q3" */
  key: string;
  /** 표시 라벨 — "2025.12" 또는 "25.3Q" */
  label: string;
  /** 손익 (억원) */
  revenue: number | null;
  operatingProfit: number | null;
  /** 지배주주 순이익 (억원) */
  netProfit: number | null;
  /** 영업이익률 (%) */
  operatingMargin: number | null;
  /** 주당 지표 (원) */
  eps: number | null;
  /** 개별(별도)재무제표 기준 EPS (원) — 연간에만 채운다 */
  epsSeparate: number | null;
  bps: number | null;
  /** ROE (%) — 지배주주 순이익 ÷ 지배주주 자본 */
  roe: number | null;
  /** 지배주주 자본 (억원) */
  equity: number | null;
  /** 주당배당금 (원) */
  dps: number | null;
  /** 시가배당률 (%) — DART 공시값(연간·분기 누적). TTM은 `view.ts`가 종가로 채운다 */
  dividendYield: number | null;
  /** 배당성향 (%) */
  payoutRatio: number | null;
  /** 현금흐름 (억원) */
  cfo: number | null;
  cfi: number | null;
  cff: number | null;
  /** 주당 영업활동현금흐름 (원) */
  cfps: number | null;
  /** 발행주식총수(주) — 주당 지표 분모 */
  shares: number | null;
}

export interface AnalysisOverview {
  corpCode: string;
  /** 재무제표 기준 — 연결(CFS) 우선, 없으면 별도(OFS) */
  basis: "연결" | "별도";
  /** 과거 → 최신 순 */
  annual: AnalysisPeriodPoint[];
  quarter: AnalysisPeriodPoint[];
  /** 연환산(최근 4개 분기 롤링 합) */
  ttm: AnalysisPeriodPoint[];
  /** 자사주 비중(%) — 최근 사업연도 말 기준 */
  treasuryRatio: number | null;
  /** 자사주 비중의 기준 연도 라벨 (예: "2025") */
  treasuryYear: string | null;
  fetchedAt: string;
}

export type AnalysisOverviewResult =
  | { status: "ok"; overview: AnalysisOverview }
  | { status: "not_listed" }
  | { status: "no_data" }
  | { status: "error" };

// ── 파싱 유틸 ────────────────────────────────────────────

/** 콤마·공백 제거 후 수치화. 빈값·"-"·비수치는 null (0은 유효값) */
function parseNumeric(raw: string | undefined): number | null {
  const cleaned = raw?.replace(/,/g, "").trim() ?? "";
  if (cleaned === "" || cleaned === "-") {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 원 → 억원 */
function toEokwon(won: number | null): number | null {
  return won === null ? null : won / 1e8;
}

/** a − b (한쪽이라도 없으면 null) */
function subtract(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

/** 분자/분모 백분율 (분모 0·null 방어) */
function percent(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

/** 값 배열 합 — 하나라도 없으면 null(부분 합은 오해를 부른다) */
function sumAll(values: Array<number | null>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) {
      return null;
    }
    total += value;
  }
  return total;
}

/** 계정명 비교용 정규화 — 공백·괄호 앞뒤 차이를 흡수한다 */
function normalizeName(name: string | undefined): string {
  return (name ?? "").replace(/\s+/g, "");
}

/**
 * 지표 하나의 금액을 뽑는다. 후보를 **표준 계정 코드 → 계정명 → 예비 코드** 순으로
 * 훑고, 매번 재무제표 구분으로 범위를 좁힌다. 전부 못 찾으면 null.
 */
function pickAmount(
  rows: DartFinanceRow[],
  spec: AccountSpec,
  field: "thstrm_amount" | "thstrm_add_amount"
): number | null {
  const scoped = rows.filter((row) =>
    spec.divisions.includes((row.sj_div ?? "").trim())
  );

  const read = (row: DartFinanceRow | undefined): number | null =>
    parseNumeric(row?.[field] as string | undefined);

  for (const id of spec.ids) {
    const value = read(scoped.find((row) => row.account_id === id));
    if (value !== null) {
      return value;
    }
  }

  for (const name of spec.names) {
    const target = normalizeName(name);
    const value = read(
      scoped.find((row) => normalizeName(row.account_nm) === target)
    );
    if (value !== null) {
      return value;
    }
  }

  for (const id of spec.fallbackIds ?? []) {
    const value = read(scoped.find((row) => row.account_id === id));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

// ── 원자료 → 기간 조립 ───────────────────────────────────

/** 한 보고서에서 뽑은 누적 기준 원자료 */
interface ReportFacts {
  /** 연초부터의 누적 손익 (원) */
  revenue: number | null;
  operatingProfit: number | null;
  netProfit: number | null;
  /** 누적 EPS (원) */
  eps: number | null;
  /** 기말 자본 — 스톡이라 누적 개념 없음 (원) */
  equity: number | null;
  /** 연초부터의 누적 현금흐름 (원) */
  cfo: number | null;
  cfi: number | null;
  cff: number | null;
}

/**
 * 보고서 응답을 **누적 기준**으로 정규화한다.
 *
 * 분기보고서의 손익은 `thstrm_amount`가 당분기 3개월·`thstrm_add_amount`가 누적인데,
 * 현금흐름표는 `add_amount`가 아예 없고 `thstrm_amount`가 이미 누적이다(2026-07-28
 * 실측). 그래서 **모든 항목을 누적으로 모은 뒤 인접 분기끼리 차분**하는 한 가지 규칙만
 * 쓴다 — 재무제표별 예외를 분기 계산에 끌고 들어가지 않는다.
 */
function extractFacts(rows: DartFinanceRow[], isAnnual: boolean): ReportFacts {
  // 사업보고서는 애초에 연간 누적이라 thstrm_amount가 곧 누적이다.
  const cumulative = (spec: AccountSpec): number | null =>
    isAnnual
      ? pickAmount(rows, spec, "thstrm_amount")
      : pickAmount(rows, spec, "thstrm_add_amount") ??
        pickAmount(rows, spec, "thstrm_amount");

  return {
    revenue: cumulative(ACCOUNT.revenue),
    operatingProfit: cumulative(ACCOUNT.operatingProfit),
    netProfit: cumulative(ACCOUNT.netProfit),
    eps: cumulative(ACCOUNT.eps),
    // 자본·현금흐름은 add_amount가 없어 항상 thstrm_amount를 본다
    equity: pickAmount(rows, ACCOUNT.equity, "thstrm_amount"),
    cfo: pickAmount(rows, ACCOUNT.cfo, "thstrm_amount"),
    cfi: pickAmount(rows, ACCOUNT.cfi, "thstrm_amount"),
    cff: pickAmount(rows, ACCOUNT.cff, "thstrm_amount"),
  };
}

/** alotMatter 행에서 보통주 기준 값 하나 뽑기 (`term`=당기/전기/전전기) */
function pickDividend(
  rows: DartDividendRow[],
  seKeyword: string,
  term: "thstrm" | "frmtrm" | "lwfr"
): number | null {
  const matches = rows.filter((row) => (row.se ?? "").includes(seKeyword));
  if (matches.length === 0) {
    return null;
  }
  // 종류별로 나뉘어 오면 보통주를 쓴다(우선주는 배당이 조금 더 높아 대표값이 못 된다)
  const target =
    matches.find((row) => (row.stock_knd ?? "").includes("보통")) ?? matches[0];
  return parseNumeric(target[term] as string | undefined);
}

/** 배당 3종 세트 */
interface DividendFacts {
  dps: number | null;
  payoutRatio: number | null;
  dividendYield: number | null;
}

function extractDividends(
  rows: DartDividendRow[],
  term: "thstrm" | "frmtrm" | "lwfr"
): DividendFacts {
  return {
    dps: pickDividend(rows, DIVIDEND_SE.dps, term),
    payoutRatio: pickDividend(rows, DIVIDEND_SE.payout, term),
    dividendYield: pickDividend(rows, DIVIDEND_SE.yield, term),
  };
}

/** stockTotqySttus에서 발행주식총수·자기주식수 — "합계" 행 우선, 없으면 종류별 합산 */
function extractShares(rows: DartStockTotalRow[]): {
  shares: number | null;
  treasury: number | null;
} {
  const total = rows.find((row) => (row.se ?? "").includes("합계"));
  if (total) {
    return {
      shares: parseNumeric(total.istc_totqy),
      treasury: parseNumeric(total.tesstk_co),
    };
  }

  const kinds = rows.filter((row) => (row.se ?? "").includes("주"));
  if (kinds.length === 0) {
    return { shares: null, treasury: null };
  }
  const shares = sumAll(kinds.map((row) => parseNumeric(row.istc_totqy)));
  const treasury = sumAll(kinds.map((row) => parseNumeric(row.tesstk_co)));
  return { shares, treasury };
}

// ── 연간 시계열 ──────────────────────────────────────────

interface AnnualRaw {
  year: string;
  facts: ReportFacts;
  /** 별도재무제표 EPS — 사용자 표의 "EPS(개별)" */
  epsSeparate: number | null;
  shares: number | null;
  treasury: number | null;
  dividends: DividendFacts;
}

function buildAnnualPoints(raws: AnnualRaw[]): AnalysisPeriodPoint[] {
  return raws.map((raw) => {
    const revenue = toEokwon(raw.facts.revenue);
    const operatingProfit = toEokwon(raw.facts.operatingProfit);
    const netProfit = toEokwon(raw.facts.netProfit);
    const equity = toEokwon(raw.facts.equity);
    const cfo = toEokwon(raw.facts.cfo);

    return {
      key: raw.year,
      label: `${raw.year}.12`,
      revenue,
      operatingProfit,
      netProfit,
      operatingMargin: percent(operatingProfit, revenue),
      eps: raw.facts.eps,
      epsSeparate: raw.epsSeparate,
      bps:
        raw.facts.equity !== null && raw.shares
          ? raw.facts.equity / raw.shares
          : null,
      // ROE 분모는 **기말** 지배주주 자본. 기초·기말 평균이 교과서적이지만, 국내
      // 증권사 화면(사용자 제시 표)이 기말 기준이라 맞췄다 — 연환산 ROE도 같은 규칙이라
      // 탭을 바꿔도 값이 튀지 않는다 (2026-07-28 실측: 005930 2023~2025 3개년 일치).
      roe: percent(netProfit, equity),
      equity,
      dps: raw.dividends.dps,
      dividendYield: raw.dividends.dividendYield,
      payoutRatio: raw.dividends.payoutRatio,
      cfo,
      cfi: toEokwon(raw.facts.cfi),
      cff: toEokwon(raw.facts.cff),
      cfps:
        raw.facts.cfo !== null && raw.shares ? raw.facts.cfo / raw.shares : null,
      shares: raw.shares,
    };
  });
}

// ── 분기 시계열 ──────────────────────────────────────────

interface QuarterRaw {
  year: string;
  quarter: 1 | 2 | 3 | 4;
  facts: ReportFacts;
  /** 누적 주당배당금 (원) */
  cumulativeDps: number | null;
  payoutRatio: number | null;
  dividendYield: number | null;
  shares: number | null;
}

/**
 * 누적 원자료를 분기값으로 차분한다. 1분기는 누적이 곧 분기값이고, 그 외는
 * 직전 분기 누적을 뺀다 — **같은 연도 안에서만** 뺀다(연초에 누적이 리셋되므로).
 * 직전 분기 보고서가 없으면 그 분기는 null로 남긴다(엉뚱한 값을 만드느니 비운다).
 */
function buildQuarterPoints(raws: QuarterRaw[]): AnalysisPeriodPoint[] {
  const byKey = new Map(raws.map((raw) => [`${raw.year}Q${raw.quarter}`, raw]));

  return raws.map((raw) => {
    const isFirstQuarter = raw.quarter === 1;
    const prior = isFirstQuarter
      ? undefined
      : byKey.get(`${raw.year}Q${raw.quarter - 1}`);

    const flow = (
      current: number | null,
      priorValue: number | null
    ): number | null => {
      if (isFirstQuarter) {
        return current;
      }
      // 직전 분기 보고서 자체가 없으면 차분이 불가능하다(누적을 분기값으로 오인하면 안 됨)
      return prior === undefined ? null : subtract(current, priorValue);
    };

    const revenue = toEokwon(flow(raw.facts.revenue, prior?.facts.revenue ?? null));
    const operatingProfit = toEokwon(
      flow(raw.facts.operatingProfit, prior?.facts.operatingProfit ?? null)
    );
    const netProfit = toEokwon(
      flow(raw.facts.netProfit, prior?.facts.netProfit ?? null)
    );
    const cfoWon = flow(raw.facts.cfo, prior?.facts.cfo ?? null);

    return {
      key: `${raw.year}Q${raw.quarter}`,
      label: `${raw.year.slice(2)}.${raw.quarter}Q`,
      revenue,
      operatingProfit,
      netProfit,
      operatingMargin: percent(operatingProfit, revenue),
      eps: flow(raw.facts.eps, prior?.facts.eps ?? null),
      epsSeparate: null, // 분기 별도재무제표까지 받으면 콜이 2배라 연간만 제공
      bps:
        raw.facts.equity !== null && raw.shares
          ? raw.facts.equity / raw.shares
          : null,
      // 분기 ROE는 그 분기 이익만 쓰면 연율과 헷갈린다 — 연환산(TTM) 모드가 담당
      roe: null,
      equity: toEokwon(raw.facts.equity),
      dps: flow(raw.cumulativeDps, prior?.cumulativeDps ?? null),
      // 배당성향·시가배당률은 DART가 누적 기준으로만 주므로 그대로 싣는다
      dividendYield: raw.dividendYield,
      payoutRatio: raw.payoutRatio,
      cfo: toEokwon(cfoWon),
      cfi: toEokwon(flow(raw.facts.cfi, prior?.facts.cfi ?? null)),
      cff: toEokwon(flow(raw.facts.cff, prior?.facts.cff ?? null)),
      cfps: cfoWon !== null && raw.shares ? cfoWon / raw.shares : null,
      shares: raw.shares,
    };
  });
}

/**
 * 분기 시계열에서 롤링 4분기 합(연환산)을 만든다. 스톡 항목(자본·BPS·주식수)은
 * 합산하지 않고 **해당 분기말 값**을 그대로 쓴다.
 */
function buildTtmPoints(quarters: AnalysisPeriodPoint[]): AnalysisPeriodPoint[] {
  const points: AnalysisPeriodPoint[] = [];

  for (let i = 3; i < quarters.length; i += 1) {
    const window = quarters.slice(i - 3, i + 1);
    const last = quarters[i];

    const revenue = sumAll(window.map((p) => p.revenue));
    const operatingProfit = sumAll(window.map((p) => p.operatingProfit));
    const netProfit = sumAll(window.map((p) => p.netProfit));
    const eps = sumAll(window.map((p) => p.eps));
    const dps = sumAll(window.map((p) => p.dps));
    const cfo = sumAll(window.map((p) => p.cfo));

    points.push({
      key: `${last.key}TTM`,
      label: last.label,
      revenue,
      operatingProfit,
      netProfit,
      operatingMargin: percent(operatingProfit, revenue),
      eps,
      epsSeparate: null,
      bps: last.bps,
      roe: percent(netProfit, last.equity),
      equity: last.equity,
      dps,
      // TTM 시가배당률은 종가가 있어야 계산된다 → `view.ts`에서 주입
      dividendYield: null,
      payoutRatio: percent(dps, eps),
      cfo,
      cfi: sumAll(window.map((p) => p.cfi)),
      cff: sumAll(window.map((p) => p.cff)),
      cfps: cfo !== null && last.shares ? (cfo * 1e8) / last.shares : null,
      shares: last.shares,
    });
  }

  return points;
}

// ── 빌더 ─────────────────────────────────────────────────

/** 연간 원자료 수집 — 연도당 CFS·OFS 재무제표 + 주식총수 */
async function collectAnnual(
  corpCode: string,
  years: string[],
  basisDiv: DartFsDiv
): Promise<AnnualRaw[]> {
  // 배당은 한 콜에 3개년(당기·전기·전전기)이 실려 와 3년마다 한 번만 부르면 된다
  const dividendAnchors = years.filter((_, index) => index % 3 === 0);
  const dividendByYear = new Map<string, DividendFacts>();

  const [statements, separates, shareRows, dividendResults] = await Promise.all([
    mapLimit(years, DART_CONCURRENCY, async (year) => ({
      year,
      rows: await fetchDartFinancialStatements(
        corpCode,
        year,
        basisDiv,
        DART_REPRT_ANNUAL
      ).catch(() => [] as DartFinanceRow[]),
    })),
    mapLimit(years, DART_CONCURRENCY, async (year) => ({
      year,
      rows: await fetchDartFinancialStatements(
        corpCode,
        year,
        "OFS",
        DART_REPRT_ANNUAL
      ).catch(() => [] as DartFinanceRow[]),
    })),
    mapLimit(years, DART_CONCURRENCY, async (year) => ({
      year,
      rows: await fetchDartStockTotalQty(corpCode, year).catch(
        () => [] as DartStockTotalRow[]
      ),
    })),
    mapLimit(dividendAnchors, DART_CONCURRENCY, async (year) => ({
      year,
      rows: await fetchDartDividendMatters(corpCode, year).catch(
        () => [] as DartDividendRow[]
      ),
    })),
  ]);

  for (const { year, rows } of dividendResults) {
    const anchor = Number(year);
    dividendByYear.set(String(anchor), extractDividends(rows, "thstrm"));
    dividendByYear.set(String(anchor - 1), extractDividends(rows, "frmtrm"));
    dividendByYear.set(String(anchor - 2), extractDividends(rows, "lwfr"));
  }

  const statementByYear = new Map(statements.map((s) => [s.year, s.rows]));
  const separateByYear = new Map(separates.map((s) => [s.year, s.rows]));
  const shareByYear = new Map(shareRows.map((s) => [s.year, s.rows]));

  // 과거 → 최신 (ROE 기초자본·차트 x축 모두 이 방향을 전제한다)
  return [...years]
    .sort((a, b) => a.localeCompare(b))
    .map((year) => {
      const { shares, treasury } = extractShares(shareByYear.get(year) ?? []);
      return {
        year,
        facts: extractFacts(statementByYear.get(year) ?? [], true),
        epsSeparate: pickAmount(
          separateByYear.get(year) ?? [],
          ACCOUNT.eps,
          "thstrm_amount"
        ),
        shares,
        treasury,
        dividends:
          dividendByYear.get(year) ??
          { dps: null, payoutRatio: null, dividendYield: null },
      };
    });
}

/** 분기 원자료 수집 — (연도 × 보고서 4종) 재무제표 + 배당 */
async function collectQuarterly(
  corpCode: string,
  years: string[],
  basisDiv: DartFsDiv,
  sharesByYear: Map<string, number | null>
): Promise<QuarterRaw[]> {
  const jobs = years.flatMap((year) =>
    DART_QUARTER_REPRTS.map((reprt) => ({ year, ...reprt }))
  );

  const [statements, dividends] = await Promise.all([
    mapLimit(jobs, DART_CONCURRENCY, async (job) => ({
      ...job,
      rows: await fetchDartFinancialStatements(
        corpCode,
        job.year,
        basisDiv,
        job.code
      ).catch(() => [] as DartFinanceRow[]),
    })),
    mapLimit(jobs, DART_CONCURRENCY, async (job) => ({
      ...job,
      rows: await fetchDartDividendMatters(corpCode, job.year, job.code).catch(
        () => [] as DartDividendRow[]
      ),
    })),
  ]);

  const dividendByKey = new Map(
    dividends.map((d) => [`${d.year}Q${d.quarter}`, d.rows])
  );

  return statements
    .filter(({ rows }) => rows.length > 0)
    .map(({ year, quarter, code, rows }) => {
      const dividendRows = dividendByKey.get(`${year}Q${quarter}`) ?? [];
      const dividends = extractDividends(dividendRows, "thstrm");
      return {
        year,
        quarter,
        facts: extractFacts(rows, code === DART_REPRT_ANNUAL),
        cumulativeDps: dividends.dps,
        payoutRatio: dividends.payoutRatio,
        dividendYield: dividends.dividendYield,
        shares: sharesByYear.get(year) ?? null,
      };
    })
    .sort((a, b) =>
      a.year === b.year ? a.quarter - b.quarter : a.year.localeCompare(b.year)
    );
}

async function buildOverview(corpCode: string): Promise<AnalysisOverview> {
  // 올해 사업보고서는 내년 제출이라 직전연도가 최신
  const latest = currentKstYear() - 1;
  const annualYears = Array.from({ length: OVERVIEW_ANNUAL_YEARS }, (_, i) =>
    String(latest - i)
  );

  // 기준(연결/별도) 판정 — 최신 연도를 CFS로 시험 조회
  let basisDiv: DartFsDiv = "CFS";
  const probe = await fetchDartFinancialStatements(
    corpCode,
    annualYears[0],
    "CFS"
  ).catch(() => [] as DartFinanceRow[]);
  if (probe.length === 0) {
    const probeOfs = await fetchDartFinancialStatements(
      corpCode,
      annualYears[0],
      "OFS"
    ).catch(() => [] as DartFinanceRow[]);
    if (probeOfs.length > 0) {
      basisDiv = "OFS";
    }
  }

  const annualRaws = await collectAnnual(corpCode, annualYears, basisDiv);
  const sharesByYear = new Map(
    annualRaws.map((raw) => [raw.year, raw.shares] as const)
  );

  const quarterYears = annualYears.slice(0, OVERVIEW_QUARTER_YEARS);
  const quarterRaws = await collectQuarterly(
    corpCode,
    quarterYears,
    basisDiv,
    sharesByYear
  );

  const annual = buildAnnualPoints(annualRaws);
  const quarter = buildQuarterPoints(quarterRaws);
  const ttm = buildTtmPoints(quarter);

  // 자사주 비중은 자료가 있는 가장 최근 연도 기준
  const treasurySource = [...annualRaws]
    .reverse()
    .find((raw) => raw.treasury !== null && raw.shares !== null && raw.shares > 0);

  return {
    corpCode,
    basis: basisDiv === "CFS" ? "연결" : "별도",
    annual,
    quarter,
    ttm,
    treasuryRatio: treasurySource
      ? percent(treasurySource.treasury, treasurySource.shares)
      : null,
    treasuryYear: treasurySource?.year ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/** 지표가 하나라도 채워졌는지 — 전부 비면 화면에 빈 축만 남는다 */
function hasAnyValue(overview: AnalysisOverview): boolean {
  return overview.annual.some(
    (point) =>
      point.revenue !== null || point.netProfit !== null || point.eps !== null
  );
}

// ── 리더(read-through) ──────────────────────────────────

/**
 * 종목코드로 통합지표를 조회한다(read-through). Redis 히트면 즉시 반환,
 * 미스면 DART에서 받아 TTL 30일로 저장한다. corpCode 매핑이 없거나 DART에 자료가
 * 없으면 상태로 알린다(화면이 안내 문구로 분기).
 */
export async function getAnalysisOverview(
  symbolCode: string
): Promise<AnalysisOverviewResult> {
  let corpCode: string | undefined;
  try {
    const corpMap = await getCorpCodeMap();
    corpCode = corpMap?.map[symbolCode];
  } catch (err) {
    console.error("[analysis] corpCode map read failed:", err);
    return { status: "error" };
  }

  if (!corpCode) {
    return { status: "not_listed" };
  }

  const redis = getRedis();
  const key = `${OVERVIEW_KEY_PREFIX}${corpCode}`;

  const cached = await redis.get<AnalysisOverview>(key).catch(() => null);
  if (cached) {
    return { status: "ok", overview: cached };
  }

  let overview: AnalysisOverview;
  try {
    overview = await buildOverview(corpCode);
  } catch (err) {
    console.error("[analysis] overview build failed:", err);
    return { status: "error" };
  }

  if (!hasAnyValue(overview)) {
    return { status: "no_data" };
  }

  await redis
    .set(key, overview, { ex: OVERVIEW_TTL_SECONDS })
    .catch((err) =>
      console.error("[analysis] overview cache write failed:", err)
    );

  return { status: "ok", overview };
}
