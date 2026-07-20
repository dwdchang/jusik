import { unzipSync } from "fflate";

/**
 * DART OpenAPI 클라이언트 — Phase 17-1 (plan.md §17.1).
 * 호출 주체는 QStash feeds 갱신 잡뿐이며, 화면은 Redis 스냅샷만 읽는다.
 * KIS와 달리 호출 시간창 제약이 없다 (공시는 장 마감 후·주말에도 발생).
 */

const DART_BASE_URL = "https://opendart.fss.or.kr/api";
const DART_FETCH_TIMEOUT_MS = 15_000;
/** corpCode.xml zip은 수 MB — KIS 마스터 파일과 같은 여유 (universe.ts 참고) */
const DART_CORP_CODE_TIMEOUT_MS = 30_000;

function getDartApiKey(): string {
  const key = process.env.DART_API_KEY?.trim() ?? "";
  if (key === "") {
    throw new Error("DART_API_KEY is not configured");
  }
  return key;
}

/** 공시검색(list.json) 응답 행 — 필드는 전부 optional string (KIS types.ts와 동일 방침) */
export interface DartListRow {
  corp_code?: string;
  corp_name?: string;
  stock_code?: string;
  report_nm?: string;
  rcept_no?: string;
  flr_nm?: string;
  rcept_dt?: string;
  rm?: string;
  [key: string]: unknown;
}

interface DartListResponse {
  status?: string;
  message?: string;
  page_no?: number;
  total_count?: number;
  list?: DartListRow[];
}

/**
 * 고유번호(corpCode.xml) 전체를 내려받아 상장사만 종목코드→고유번호로 매핑한다.
 * 응답은 zip(내부 CORPCODE.xml, UTF-8) — 비상장사는 stock_code가 공백이라 제외.
 * 약 10만 레코드 중 상장사 ~3,600건만 남는다.
 */
export async function fetchDartCorpCodeMap(): Promise<Record<string, string>> {
  const url = `${DART_BASE_URL}/corpCode.xml?crtfc_key=${getDartApiKey()}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(DART_CORP_CODE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`DART corpCode HTTP ${response.status}`);
  }

  const body = new Uint8Array(await response.arrayBuffer());

  // 키 오류 등은 zip이 아니라 XML 에러 본문으로 온다 (zip 매직넘버 PK 확인)
  if (body.length < 2 || body[0] !== 0x50 || body[1] !== 0x4b) {
    const text = new TextDecoder().decode(body.subarray(0, 500));
    throw new Error(`DART corpCode not a zip: ${text}`);
  }

  const unzipped = unzipSync(body);
  const entryName = Object.keys(unzipped).find((name) =>
    name.toLowerCase().endsWith(".xml")
  );

  if (!entryName) {
    throw new Error("DART corpCode zip has no .xml entry");
  }

  const xml = new TextDecoder().decode(unzipped[entryName]);
  const map: Record<string, string> = {};

  for (const block of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const corpCode = block[1].match(/<corp_code>(\d{8})<\/corp_code>/)?.[1];
    const stockCode = block[1]
      .match(/<stock_code>([^<]*)<\/stock_code>/)?.[1]
      ?.trim();

    if (corpCode !== undefined && stockCode !== undefined && /^\d{6}$/.test(stockCode)) {
      map[stockCode] = corpCode;
    }
  }

  if (Object.keys(map).length === 0) {
    throw new Error("DART corpCode map is empty (unexpected XML shape)");
  }

  return map;
}

/**
 * 공시검색(list.json) — 고유번호·기간으로 접수일 내림차순 최신 공시를 조회한다.
 * status "000"=정상, "013"=조회 결과 없음(빈 배열로 정상 처리), 그 외는 throw.
 */
export async function fetchDartDisclosures(
  corpCode: string,
  options: { bgnDe: string; endDe: string; pageCount: number }
): Promise<DartListRow[]> {
  const params = new URLSearchParams({
    crtfc_key: getDartApiKey(),
    corp_code: corpCode,
    bgn_de: options.bgnDe,
    end_de: options.endDe,
    sort: "date",
    sort_mth: "desc",
    page_no: "1",
    page_count: String(options.pageCount),
  });

  const response = await fetch(`${DART_BASE_URL}/list.json?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(DART_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`DART list HTTP ${response.status}`);
  }

  const data = (await response.json()) as DartListResponse;

  if (data.status === "013") {
    return [];
  }

  if (data.status !== "000") {
    throw new Error(
      `DART list error [${data.status ?? "?"}] ${data.message ?? "unknown error"}`
    );
  }

  return data.list ?? [];
}

/** 배당결정 공시에서 추출한 정형 수치 — Phase 44 폭배 enrichment */
export interface DartDividendDecision {
  /** 접수번호 — 원문 딥링크 (`dart.fss.or.kr/dsaf001/main.do?rcpNo=`) */
  rceptNo: string;
  /** 1주당 배당금(원, 보통주) */
  perShare: number | null;
  /** 시가배당율(%, 보통주) — DART 공식(KRX 기준가), 앱 산출값과 분모가 다름 */
  officialYield: number | null;
  /** 배당기준일 "YYYY-MM-DD" */
  recordDate: string | null;
}

/** 공시 원문(document.xml, zip) → 태그 제거 평문. 서식 XML/HTML 혼재라 태그만 걷어낸다. */
async function fetchDartDocumentText(rceptNo: string): Promise<string> {
  const url = `${DART_BASE_URL}/document.xml?crtfc_key=${getDartApiKey()}&rcept_no=${rceptNo}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(DART_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`DART document HTTP ${response.status}`);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  // 키 오류 등은 zip이 아닌 XML 에러 본문으로 온다 (PK 매직넘버 확인)
  if (body.length < 2 || body[0] !== 0x50 || body[1] !== 0x4b) {
    throw new Error("DART document not a zip");
  }

  const unzipped = unzipSync(body);
  const entryName = Object.keys(unzipped).find((name) =>
    name.toLowerCase().endsWith(".xml")
  );
  if (!entryName) {
    throw new Error("DART document zip has no .xml entry");
  }

  return new TextDecoder("utf-8")
    .decode(unzipped[entryName])
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 현금·현물배당결정 공시를 찾아 정형 수치를 파싱한다 — Phase 44 폭배 enrichment.
 * 자회사(주요경영사항) 건은 제외하고 본사 결정을 우선한다. 못 찾거나 파싱 실패면 null.
 * 표준 서식이라 태그 제거 후 라벨 인접 값으로 추출한다(실측: rcpt 20260220900866).
 */
export async function fetchDartDividendDecision(
  corpCode: string,
  options: { bgnDe: string; endDe: string }
): Promise<DartDividendDecision | null> {
  const list = await fetchDartDisclosures(corpCode, {
    bgnDe: options.bgnDe,
    endDe: options.endDe,
    pageCount: 100,
  });

  const hit = list.find((row) => {
    const nm = row.report_nm ?? "";
    return (
      nm.includes("현금") && nm.includes("배당결정") && !nm.includes("자회사")
    );
  });

  if (!hit?.rcept_no) {
    return null;
  }

  const rceptNo = hit.rcept_no;
  let text: string;
  try {
    text = await fetchDartDocumentText(rceptNo);
  } catch {
    // 링크만이라도 유효하게 — 수치 없이 접수번호만 반환
    return { rceptNo, perShare: null, officialYield: null, recordDate: null };
  }

  const perShareRaw = text.match(
    /1주당 배당금\(원\)\s*보통주식\s*([\d,]+)/
  )?.[1];
  const yieldRaw = text.match(/시가배당율?\(%\)\s*보통주식\s*([\d.]+)/)?.[1];
  const recordDate = text.match(/배당기준일\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  const perShare =
    perShareRaw !== undefined ? Number(perShareRaw.replace(/,/g, "")) : null;
  const officialYield = yieldRaw !== undefined ? Number(yieldRaw) : null;

  return {
    rceptNo,
    perShare: perShare !== null && Number.isFinite(perShare) ? perShare : null,
    officialYield:
      officialYield !== null && Number.isFinite(officialYield)
        ? officialYield
        : null,
    recordDate,
  };
}
