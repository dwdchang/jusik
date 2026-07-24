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
  account_id?: string;
  /** 당기 금액(원) */
  thstrm_amount?: string;
  /** 정렬 순서 */
  ord?: string;
  currency?: string;
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
 * 단일회사 전체 재무제표 — 한 사업연도의 재무상태표·손익계산서·현금흐름표 등
 * 전 계정을 반환한다(당기 금액만 사용). 해당 연도 미제출이면 빈 배열.
 */
export async function fetchDartFinancialStatements(
  corpCode: string,
  bsnsYear: string,
  fsDiv: DartFsDiv
): Promise<DartFinanceRow[]> {
  return fetchDartFinanceJson<DartFinanceRow>(
    "fnlttSinglAcntAll.json",
    {
      corp_code: corpCode,
      bsns_year: bsnsYear,
      reprt_code: DART_REPRT_ANNUAL,
      fs_div: fsDiv,
    },
    "financial statement"
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
