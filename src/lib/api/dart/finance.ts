/**
 * DART OpenAPI 재무제표·재무지표 클라이언트 — Phase 64 (종목분석).
 *
 * ⚠️ 아키텍처 예외: 원칙적으로 외부 API는 잡 경유만 허용하나(AGENTS.md §3),
 * DART는 호출 시간창 제약이 없고(공시·재무는 확정 데이터) 종목분석은 사용자가
 * 상세화면에 진입해 종목을 열람할 때만 조회한다. 그래서 read-through 캐시
 * (`lib/analysis/financials.ts`)에서 이 클라이언트를 직접 호출하고, 결과는 Redis에
 * 고정 TTL로 저장해 재조회를 없앤다 (plan.md §64).
 *
 * 인증키(DART_API_KEY)는 공시 클라이언트(client.ts)와 공유한다.
 */

const DART_BASE_URL = "https://opendart.fss.or.kr/api";
const DART_FINANCE_TIMEOUT_MS = 15_000;

function getDartApiKey(): string {
  const key = process.env.DART_API_KEY?.trim() ?? "";
  if (key === "") {
    throw new Error("DART_API_KEY is not configured");
  }
  return key;
}

/** 재무제표 연결/별도 구분 — CFS=연결, OFS=별도(재무제표) */
export type DartFsDiv = "CFS" | "OFS";

/** 보고서 코드 — 11011=사업보고서(연간) */
export const DART_REPRT_ANNUAL = "11011";
/** 보고서 코드 — 분기·반기 (Phase 72) */
export const DART_REPRT_Q1 = "11013";
export const DART_REPRT_HALF = "11012";
export const DART_REPRT_Q3 = "11014";

/**
 * 한 사업연도를 이루는 보고서 4종 (Phase 72).
 * 손익·현금흐름의 분기값은 보고서마다 기준이 달라 호출부에서 분기 번호로 환산한다
 * (2026-07-28 실측: 손익 `thstrm_amount`=당분기 3개월·`thstrm_add_amount`=누적,
 * 현금흐름은 `add_amount`가 없고 `thstrm_amount` 자체가 누적).
 */
export const DART_QUARTER_REPRTS: ReadonlyArray<{
  code: string;
  quarter: 1 | 2 | 3 | 4;
}> = [
  { code: DART_REPRT_Q1, quarter: 1 },
  { code: DART_REPRT_HALF, quarter: 2 },
  { code: DART_REPRT_Q3, quarter: 3 },
  { code: DART_REPRT_ANNUAL, quarter: 4 },
];

/** 재무지표 분류 코드 — 수익성·안정성·성장성·활동성 */
export const DART_INDEX_CATEGORIES: ReadonlyArray<{
  code: string;
  label: string;
}> = [
  { code: "M210000", label: "수익성지표" },
  { code: "M220000", label: "안정성지표" },
  { code: "M230000", label: "성장성지표" },
  { code: "M240000", label: "활동성지표" },
];

/** 단일회사 전체 재무제표(fnlttSinglAcntAll) 1행 — 필드는 전부 optional string */
export interface DartFinanceRow {
  /** 재무제표 구분: BS(재무상태표)·IS(손익)·CIS(포괄손익)·CF(현금흐름)·SCE(자본변동) */
  sj_div?: string;
  /** 재무제표명 */
  sj_nm?: string;
  /** 계정명 (예: "매출액") */
  account_nm?: string;
  /** 표준 계정 코드 (예: "ifrs-full_Revenue") — 계정명은 회사마다 달라 매칭은 이쪽이 안전 */
  account_id?: string;
  /**
   * 당기 금액(원). 분기보고서에서는 재무제표별로 기준이 다르다 (2026-07-28 실측)
   * — 손익(IS/CIS)=당분기 3개월, 재무상태표(BS)=기말 잔액, 현금흐름(CF)=연초부터 누적.
   */
  thstrm_amount?: string;
  /** 당기 누적 금액(원) — 분기 손익계산서에만 있다(연간·BS·CF는 빈 값) */
  thstrm_add_amount?: string;
  /** 정렬 순서 */
  ord?: string;
  currency?: string;
  [key: string]: unknown;
}

/**
 * 배당에 관한 사항(alotMatter) 1행 — Phase 72.
 * `se`(구분)로 항목이 갈리고 한 응답에 **당기·전기·전전기 3개년**이 함께 온다.
 * 분기보고서로 부르면 값이 **연초부터 누적**이라 분기 배당은 차분해야 한다
 * (2026-07-28 실측 005930: 1Q 365 → 반기 732 → 3Q 1,102 → 연간 1,668).
 */
export interface DartDividendRow {
  /** 구분 — "주당 현금배당금(원)"·"(연결)현금배당성향(%)"·"현금배당수익률(%)" 등 */
  se?: string;
  /** 주식 종류 — "보통주"·"우선주"·"-" */
  stock_knd?: string;
  /** 당기 값 (콤마 포함 문자열, 없으면 "-") */
  thstrm?: string;
  /** 전기 값 */
  frmtrm?: string;
  /** 전전기 값 */
  lwfr?: string;
  /** 결산기준일 "YYYY-MM-DD" */
  stlm_dt?: string;
  [key: string]: unknown;
}

/** 주식의 총수 현황(stockTotqySttus) 1행 — Phase 72 (자사주 비중·주당 지표 분모) */
export interface DartStockTotalRow {
  /** 구분 — "보통주"·"우선주"·"합계"·"비고" */
  se?: string;
  /** 발행주식의 총수(주) — 자기주식 포함 */
  istc_totqy?: string;
  /** 자기주식수(주) */
  tesstk_co?: string;
  /** 유통주식수(주) = 발행주식총수 − 자기주식 */
  distb_stock_co?: string;
  [key: string]: unknown;
}

/** 단일회사 주요 재무지표(fnlttSinglIndx) 1행 */
export interface DartIndexRow {
  idx_cl_code?: string;
  /** 지표 분류명 (예: "수익성지표") */
  idx_cl_nm?: string;
  idx_code?: string;
  /** 지표명 (예: "ROE") */
  idx_nm?: string;
  /** 지표값 — 비율/배수 문자열 */
  idx_val?: string;
  [key: string]: unknown;
}

interface DartFinanceResponse<T> {
  status?: string;
  message?: string;
  list?: T[];
}

async function fetchDartFinanceJson<T>(
  path: string,
  params: Record<string, string>,
  label: string
): Promise<T[]> {
  const search = new URLSearchParams({
    crtfc_key: getDartApiKey(),
    ...params,
  });

  const response = await fetch(`${DART_BASE_URL}/${path}?${search}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(DART_FINANCE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`DART ${label} HTTP ${response.status}`);
  }

  const data = (await response.json()) as DartFinanceResponse<T>;

  // 013=조회 결과 없음(해당 연도 미제출 등) → 빈 배열로 정상 처리
  if (data.status === "013") {
    return [];
  }

  if (data.status !== "000") {
    throw new Error(
      `DART ${label} error [${data.status ?? "?"}] ${data.message ?? "unknown"}`
    );
  }

  return data.list ?? [];
}

/**
 * 단일회사 전체 재무제표 — 한 사업연도·한 보고서의 재무상태표·손익계산서·현금흐름표 등
 * 전 계정을 반환한다. 해당 연도·보고서 미제출이면 빈 배열.
 *
 * `reprtCode`를 생략하면 사업보고서(연간)다. 분기 보고서를 주면 같은 스키마로
 * 분기 재무제표가 오되 금액 기준이 달라진다(`DartFinanceRow.thstrm_amount` 주석 참고).
 */
export async function fetchDartFinancialStatements(
  corpCode: string,
  bsnsYear: string,
  fsDiv: DartFsDiv,
  reprtCode: string = DART_REPRT_ANNUAL
): Promise<DartFinanceRow[]> {
  return fetchDartFinanceJson<DartFinanceRow>(
    "fnlttSinglAcntAll.json",
    {
      corp_code: corpCode,
      bsns_year: bsnsYear,
      reprt_code: reprtCode,
      fs_div: fsDiv,
    },
    "financial statement"
  );
}

/**
 * 배당에 관한 사항 — 주당배당금·배당성향·시가배당률 등. 한 콜에 3개년이 온다.
 * DART가 재무지표(fnlttSinglIndx)를 2023년부터만 주는 것과 달리 **2015년부터** 제공된다
 * (2026-07-28 실측: 2012년은 status 013).
 */
export async function fetchDartDividendMatters(
  corpCode: string,
  bsnsYear: string,
  reprtCode: string = DART_REPRT_ANNUAL
): Promise<DartDividendRow[]> {
  return fetchDartFinanceJson<DartDividendRow>(
    "alotMatter.json",
    {
      corp_code: corpCode,
      bsns_year: bsnsYear,
      reprt_code: reprtCode,
    },
    "dividend matters"
  );
}

/** 주식의 총수 현황 — 발행주식총수·자기주식수(자사주 비중·주당 지표 분모용) */
export async function fetchDartStockTotalQty(
  corpCode: string,
  bsnsYear: string,
  reprtCode: string = DART_REPRT_ANNUAL
): Promise<DartStockTotalRow[]> {
  return fetchDartFinanceJson<DartStockTotalRow>(
    "stockTotqySttus.json",
    {
      corp_code: corpCode,
      bsns_year: bsnsYear,
      reprt_code: reprtCode,
    },
    "stock total qty"
  );
}

/**
 * 단일회사 주요 재무지표 — 한 사업연도·한 분류(수익성/안정성/성장성/활동성)의
 * 지표 목록을 반환한다. 해당 연도·분류 미제공이면 빈 배열.
 */
export async function fetchDartFinancialIndices(
  corpCode: string,
  bsnsYear: string,
  idxClCode: string
): Promise<DartIndexRow[]> {
  return fetchDartFinanceJson<DartIndexRow>(
    "fnlttSinglIndx.json",
    {
      corp_code: corpCode,
      bsns_year: bsnsYear,
      reprt_code: DART_REPRT_ANNUAL,
      idx_cl_code: idxClCode,
    },
    "financial index"
  );
}
