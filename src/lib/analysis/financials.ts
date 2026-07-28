import {
  DART_INDEX_CATEGORIES,
  fetchDartFinancialIndices,
  fetchDartFinancialStatements,
  type DartFinanceRow,
  type DartFsDiv,
} from "@/lib/api/dart/finance";
import { getCorpCodeMap } from "@/lib/feeds/store";
import { getRedis } from "@/lib/redis/client";

/**
 * 종목분석 — DART 재무제표·재무지표 read-through 캐시 (Phase 64, plan.md §64).
 *
 * 사용자가 종목분석 상세화면에 진입할 때만 DART를 조회하고(평소 호출·갱신 0),
 * 결과를 Redis에 **고정 TTL 30일**로 저장해 재조회를 없앤다. 재무제표는 (연도·보고서)
 * 단위로 확정되면 불변이라 만료돼 삭제돼도 다음 열람 때 다시 받으면 그만이다.
 *
 * ⚠️ 아키텍처 예외 2건(§64): ① 화면(리더)이 DART를 직접 호출 ② 화면이 Redis에
 * 쓰기. 단 쓰기는 `analysis:*` 별도 네임스페이스라 잡이 소유한 `market:*` 시세 키와
 * 충돌하지 않는다.
 */

const ANALYSIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일
/** v2 = 조회 연수를 5→6으로 넓힌 판 (Phase 72). 구 키는 손대지 않고 자연 만료시킨다 */
const ANALYSIS_KEY_PREFIX = "analysis:financials:v2:";
/** 조회할 최근 사업연도 수 — 통합지표(`overview.ts`)와 동일하게 6개년 (Phase 72) */
const ANALYSIS_YEARS = 6;
/** DART 동시 호출 상한 — 첫 열람 응답을 앞당기되 과도한 동시성은 피한다 */
export const DART_CONCURRENCY = 5;

// ── 뷰 모델 ──────────────────────────────────────────────

export interface FinancialAccountRow {
  /** 계정명 (예: "매출액") */
  name: string;
  /** 연도별 금액(원) — 값 없는 연도는 키 없음 */
  values: Record<string, number>;
}

export interface FinancialStatement {
  /** 재무제표 구분 코드 (BS/IS/CIS/CF/SCE) */
  division: string;
  /** 재무제표명 (예: "재무상태표") */
  title: string;
  rows: FinancialAccountRow[];
}

export interface FinancialIndexGroup {
  /** 지표 분류명 (예: "수익성지표") */
  category: string;
  rows: FinancialAccountRow[];
}

export interface FinancialAnalysis {
  corpCode: string;
  /** 조회된 사업연도 라벨 — 최신 → 과거 순 (예: ["2025","2024",…]) */
  years: string[];
  /** 재무제표(재무상태표·손익계산서·현금흐름표 등) */
  statements: FinancialStatement[];
  /** 재무지표(수익성·안정성·성장성·활동성) */
  indices: FinancialIndexGroup[];
  /** 재무제표 기준 — 연결(CFS) 우선, 없으면 별도(OFS) */
  basis: "연결" | "별도";
  /** DART에서 받아온 시각 (ISO) */
  fetchedAt: string;
}

// ── 파싱 유틸 ────────────────────────────────────────────

/** DART 금액 문자열 → number(원). 빈값·"-"·비정상은 null */
function parseAmount(raw: string | undefined): number | null {
  const cleaned = raw?.replace(/,/g, "").trim() ?? "";
  if (cleaned === "" || cleaned === "-") {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 재무제표 표시 순서 — 재무상태표 → 손익 → 포괄손익 → 현금흐름 → 자본변동 */
const SJ_ORDER: Record<string, number> = {
  BS: 0,
  IS: 1,
  CIS: 2,
  CF: 3,
  SCE: 4,
};

/** KST 기준 올해 연도 (통합지표 리더 `overview.ts`와 공용) */
export function currentKstYear(): number {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

/** 동시성 제한 map — items를 limit개씩 병렬 처리 (통합지표 리더 `overview.ts`와 공용) */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// ── 빌더 ─────────────────────────────────────────────────

/**
 * 재무제표를 계정 × 연도 행렬로 병합한다. 연도별 응답에서 당기 금액만 취해
 * 해당 연도 값으로 채운다. 계정 순서는 최신 연도의 `ord`를 우선한다.
 */
function buildStatements(
  perYear: Array<{ year: string; rows: DartFinanceRow[] }>
): FinancialStatement[] {
  interface AccMeta {
    name: string;
    ord: number;
    values: Record<string, number>;
  }
  const sections = new Map<
    string,
    { title: string; accounts: Map<string, AccMeta> }
  >();

  // 최신 연도부터 순회해 ord·title을 최신 것으로 확정
  for (const { year, rows } of perYear) {
    for (const row of rows) {
      const div = row.sj_div?.trim();
      const name = row.account_nm?.trim();
      if (!div || !name) {
        continue;
      }
      let section = sections.get(div);
      if (!section) {
        section = { title: row.sj_nm?.trim() || div, accounts: new Map() };
        sections.set(div, section);
      }
      let acc = section.accounts.get(name);
      if (!acc) {
        acc = { name, ord: Number(row.ord) || 0, values: {} };
        section.accounts.set(name, acc);
      }
      const amount = parseAmount(row.thstrm_amount);
      if (amount !== null) {
        acc.values[year] = amount;
      }
    }
  }

  return Array.from(sections.entries())
    .sort(
      ([a], [b]) => (SJ_ORDER[a] ?? 99) - (SJ_ORDER[b] ?? 99)
    )
    .map(([division, section]) => ({
      division,
      title: section.title,
      rows: Array.from(section.accounts.values())
        .sort((a, b) => a.ord - b.ord)
        .map(({ name, values }) => ({ name, values })),
    }));
}

/** 재무제표 계정이 하나라도 채워졌는지 */
function hasStatementData(statements: FinancialStatement[]): boolean {
  return statements.some((s) =>
    s.rows.some((r) => Object.keys(r.values).length > 0)
  );
}

/**
 * corpCode의 최근 5개년 재무제표·재무지표를 DART에서 조회해 뷰 모델로 조립한다.
 * 연결(CFS) 우선, 최신 후보연도가 연결이 비면 별도(OFS)로 전환한다.
 */
async function buildAnalysis(corpCode: string): Promise<FinancialAnalysis> {
  const latest = currentKstYear() - 1; // 올해 사업보고서는 내년 제출이라 직전연도가 최신
  const candidateYears = Array.from({ length: ANALYSIS_YEARS }, (_, i) =>
    String(latest - i)
  );

  // 기준(연결/별도) 결정 — 최신 후보연도를 CFS로 시험 조회
  let basisDiv: DartFsDiv = "CFS";
  const probe = await fetchDartFinancialStatements(
    corpCode,
    candidateYears[0],
    "CFS"
  ).catch(() => []);
  const probeRows = probe.length > 0 ? probe : null;
  if (probeRows === null) {
    const probeOfs = await fetchDartFinancialStatements(
      corpCode,
      candidateYears[0],
      "OFS"
    ).catch(() => []);
    if (probeOfs.length > 0) {
      basisDiv = "OFS";
    }
  }

  // 연도별 재무제표 — 최신 후보연도는 이미 받았으면 재사용
  const statementResults = await mapLimit(
    candidateYears,
    DART_CONCURRENCY,
    async (year) => {
      if (year === candidateYears[0] && basisDiv === "CFS" && probeRows) {
        return { year, rows: probeRows };
      }
      const rows = await fetchDartFinancialStatements(
        corpCode,
        year,
        basisDiv
      ).catch(() => []);
      return { year, rows };
    }
  );

  const statements = buildStatements(statementResults);
  // 실제 데이터가 있는 연도만 라벨로 남긴다(최신 → 과거)
  const years = statementResults
    .filter(({ rows }) => rows.length > 0)
    .map(({ year }) => year);

  // 재무지표 — (연도 × 분류) 병렬 조회
  const indexJobs = years.flatMap((year) =>
    DART_INDEX_CATEGORIES.map((cat) => ({ year, cat }))
  );
  const indexResults = await mapLimit(indexJobs, DART_CONCURRENCY, async (job) => {
    const rows = await fetchDartFinancialIndices(
      corpCode,
      job.year,
      job.cat.code
    ).catch(() => []);
    return { year: job.year, category: job.cat.label, rows };
  });

  const indexSections = new Map<string, Map<string, FinancialAccountRow>>();
  for (const { year, category, rows } of indexResults) {
    let section = indexSections.get(category);
    if (!section) {
      section = new Map();
      indexSections.set(category, section);
    }
    for (const row of rows) {
      const name = row.idx_nm?.trim();
      const value = parseAmount(row.idx_val);
      if (!name || value === null) {
        continue;
      }
      let acc = section.get(name);
      if (!acc) {
        acc = { name, values: {} };
        section.set(name, acc);
      }
      acc.values[year] = value;
    }
  }

  const indices: FinancialIndexGroup[] = DART_INDEX_CATEGORIES.map((cat) => ({
    category: cat.label,
    rows: Array.from(indexSections.get(cat.label)?.values() ?? []),
  })).filter((group) => group.rows.length > 0);

  return {
    corpCode,
    years,
    statements,
    indices,
    basis: basisDiv === "CFS" ? "연결" : "별도",
    fetchedAt: new Date().toISOString(),
  };
}

// ── 리더(read-through) ──────────────────────────────────

export type FinancialAnalysisResult =
  | { status: "ok"; analysis: FinancialAnalysis }
  | { status: "not_listed" } // corpCode 매핑 없음(비상장·미등재)
  | { status: "no_data" } // DART에 재무제표 없음
  | { status: "error" }; // corpCode 맵 조회 실패 등

/**
 * 종목코드로 재무분석을 조회한다(read-through). Redis 캐시 히트면 즉시 반환,
 * 미스면 DART에서 받아 캐시에 고정 TTL로 저장 후 반환한다. corpCode 매핑이 없거나
 * DART에 데이터가 없으면 그에 맞는 상태를 돌려준다(화면이 안내 문구로 분기).
 */
export async function getFinancialAnalysis(
  symbolCode: string
): Promise<FinancialAnalysisResult> {
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
  const key = `${ANALYSIS_KEY_PREFIX}${corpCode}`;

  const cached = await redis
    .get<FinancialAnalysis>(key)
    .catch(() => null);
  if (cached) {
    return { status: "ok", analysis: cached };
  }

  let analysis: FinancialAnalysis;
  try {
    analysis = await buildAnalysis(corpCode);
  } catch (err) {
    console.error("[analysis] DART build failed:", err);
    return { status: "error" };
  }

  if (!hasStatementData(analysis.statements)) {
    return { status: "no_data" };
  }

  await redis
    .set(key, analysis, { ex: ANALYSIS_TTL_SECONDS })
    .catch((err) => console.error("[analysis] cache write failed:", err));

  return { status: "ok", analysis };
}
