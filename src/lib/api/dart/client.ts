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
 * 공시유형 코드 (list.json `pblntf_ty`) — Phase 81 실측 확정.
 * 무필터로 조회하면 대형주는 90일간 800건이 넘어(삼성전자 818건 실측) 실적 공시가
 * 상위 N건 컷에서 밀려난다. 유형을 좁히면 같은 기간이 15건으로 줄어 1페이지에 들어온다.
 */
export const DART_PBLNTF_PERIODIC = "A"; // 정기공시 — 사업·반기·분기보고서
export const DART_PBLNTF_EXCHANGE = "I"; // 거래소공시 — 잠정실적 공정공시·IR 개최 등

/**
 * 공시검색(list.json) — 고유번호·기간으로 접수일 내림차순 최신 공시를 조회한다.
 * status "000"=정상, "013"=조회 결과 없음(빈 배열로 정상 처리), 그 외는 throw.
 * `pblntfTy`를 주면 그 공시유형만 조회한다 (미지정 시 전체).
 */
export async function fetchDartDisclosures(
  corpCode: string,
  options: {
    bgnDe: string;
    endDe: string;
    pageCount: number;
    pblntfTy?: string;
  }
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

  if (options.pblntfTy !== undefined) {
    params.set("pblntf_ty", options.pblntfTy);
  }

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

/**
 * 「현금ㆍ현물배당결정」 공시 원문에서 뽑은 정형 항목.
 * Phase 44에서 폭배 enrichment용으로 3칸만 쓰다가, Phase 83에서 배당 일정 보완을 위해
 * 배당구분·지급예정일자를 더 받는다(같은 원문이라 추가 호출 없음).
 */
export interface DartDividendDetail {
  /** 배당구분 — "분기"·"중간"·"결산" (서식의 "분기배당"에서 접미 "배당"을 뗀 값) */
  kind: string | null;
  /** 1주당 배당금(원, 보통주) */
  perShare: number | null;
  /** 시가배당률(%, 보통주) — DART 공식(KRX 기준가), 앱 산출값과 분모가 다름 */
  officialYield: number | null;
  /** 배당기준일 "YYYY-MM-DD" */
  recordDate: string | null;
  /** 배당금지급 예정일자 "YYYY-MM-DD" — 서식에 "-"로 오면 null */
  payDate: string | null;
}

/** 배당결정 공시 1건 — 정형 항목 + 원문 딥링크용 접수번호 */
export interface DartDividendDecision extends DartDividendDetail {
  /** 접수번호 — 원문 딥링크 (`dart.fss.or.kr/dsaf001/main.do?rcpNo=`) */
  rceptNo: string;
}

/** 보고서명이 (자회사 건이 아닌) 본사 현금·현물배당결정인가 */
export function isDividendDecisionReport(reportNm: string): boolean {
  return (
    reportNm.includes("현금") &&
    reportNm.includes("배당결정") &&
    !reportNm.includes("자회사")
  );
}

function toFiniteNumber(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 배당결정 공시 평문 → 정형 항목. 표준 서식이라 라벨 인접 값으로 뽑는다.
 *
 * ⚠️ 시가배당률 라벨은 **「시가배당률(%)」**이다 — Phase 44의 `시가배당율?`은 "율"만
 * 받아 실서식과 어긋났고, 2026-07-15~30 배당결정 표본 8건에서 **8건 모두 실패**했다
 * (주당배당금·기준일은 정상이라 폭배 툴팁의 공식 시가배당률만 조용히 비어 있었다).
 * 문서 하단 유의사항 문구는 "시가배당율은…"처럼 "(%)"가 붙지 않아 여기 걸리지 않는다.
 */
export function parseDartDividendDetail(text: string): DartDividendDetail {
  const kindRaw = text.match(/배당구분\s*(\S+)/)?.[1] ?? null;

  return {
    // "분기배당"·"중간배당"·"결산배당" → 예탁원(KIS) `divi_kind`와 같은 어휘로 맞춘다
    kind: kindRaw === null ? null : kindRaw.replace(/배당$/, "") || null,
    perShare: toFiniteNumber(
      text.match(/1주당 배당금\(원\)\s*보통주식\s*([\d,]+)/)?.[1]
    ),
    officialYield: toFiniteNumber(
      text.match(/시가배당[율률]\(%\)\s*보통주식\s*([\d.]+)/)?.[1]
    ),
    recordDate: text.match(/배당기준일\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
    payDate:
      text.match(/배당금지급 예정일자\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
  };
}

/** 접수번호를 이미 아는 배당결정 공시의 원문을 받아 파싱한다 (Phase 83) */
export async function fetchDartDividendDetail(
  rceptNo: string
): Promise<DartDividendDetail> {
  return parseDartDividendDetail(await fetchDartDocumentText(rceptNo));
}

/** 공시 원문(document.xml, zip) → 태그 제거 평문. 서식 XML/HTML 혼재라 태그만 걷어낸다. */
export async function fetchDartDocumentText(rceptNo: string): Promise<string> {
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

  const hit = list.find((row) =>
    isDividendDecisionReport(row.report_nm?.trim() ?? "")
  );

  if (!hit?.rcept_no) {
    return null;
  }

  const rceptNo = hit.rcept_no;
  try {
    return { rceptNo, ...(await fetchDartDividendDetail(rceptNo)) };
  } catch {
    // 링크만이라도 유효하게 — 수치 없이 접수번호만 반환
    return {
      rceptNo,
      kind: null,
      perShare: null,
      officialYield: null,
      recordDate: null,
      payDate: null,
    };
  }
}

/** 잠정실적 공시에서 뽑은 계정 1행 — Phase 81, 전기(전분기) 3칸은 Phase 82 */
export interface DartEarningsFigure {
  /** 계정명 ("매출액"·"영업이익"·"당기순이익") */
  label: string;
  /** 당기실적 */
  current: number | null;
  /** 전기(직전 분기)실적 */
  qoqBase: number | null;
  /** 전기대비 증감율(%) — 흑자·적자 전환이면 서식상 비어 있다 */
  qoqPct: number | null;
  /** 전기 대비 "흑자전환"·"적자전환" 등 (해당 없으면 null) */
  qoqTurnaround: string | null;
  /** 전년동기실적 */
  yoyBase: number | null;
  /** 전년동기대비 증감율(%) — 흑자·적자 전환이면 서식상 비어 있다 */
  yoyPct: number | null;
  /** 전년동기 대비 "흑자전환"·"적자전환" 등 (해당 없으면 null) */
  turnaround: string | null;
}

/** 잠정실적 공시 원문 파싱 결과 — Phase 81 */
export interface DartEarningsDetail {
  /** 금액 단위 라벨 ("백만원"·"억원"·"원" 등) — 서식 헤더 실측값 그대로 */
  unit: string;
  /** 당기실적 대상 기간 "2026-01-01 ~ 2026-03-31" (못 찾으면 빈 문자열) */
  period: string;
  /** 값이 하나라도 있는 계정 행만 (전 항목 "-"인 월간 IR 공시는 빈 배열) */
  figures: DartEarningsFigure[];
}

/**
 * 잠정실적 서식의 셀 토큰 → 숫자. 빈칸·"-"는 null.
 * 음수 표기는 서식마다 `-1,234` / `△1,234` / `(1,234)`가 섞여 셋 다 수용한다.
 */
function parseEarningsCell(token: string): number | null {
  const raw = token.trim();
  if (raw === "" || raw === "-" || raw === "－") {
    return null;
  }

  const negative = /^[△▲(]/.test(raw) || raw.startsWith("-");
  const digits = raw.replace(/[^\d.]/g, "");
  if (digits === "" || digits === ".") {
    return null;
  }

  const value = Number(digits);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

/** 잠정실적 서식에서 추출할 계정 — 표시 순서 그대로 */
const EARNINGS_ACCOUNTS = ["매출액", "영업이익", "당기순이익"] as const;

/**
 * 흑자적자전환여부 칸에 올 수 있는 값 — 실측(2026-05 잠정실적 61건 180행)에서
 * "-"·"흑자전환"·"적자전환"만 나왔고, 서식 정의상 "지속" 표기도 가능하다.
 */
const TURNAROUND_LABELS = new Set([
  "흑자전환",
  "적자전환",
  "흑자지속",
  "적자지속",
  "흑전",
  "적전",
]);

/** 금액·증감율 칸으로 허용되는 모양 — 숫자(부호·콤마·소수점) 또는 빈칸 "-" */
function isNumericCell(token: string): boolean {
  return token === "-" || token === "－" || /^[-△▲(]?[\d,]+(\.\d+)?\)?$/.test(token);
}

/** 흑자적자전환 칸으로 허용되는 모양 — 빈칸이거나 정해진 라벨 */
function isTurnaroundCell(token: string): boolean {
  return token === "-" || token === "－" || TURNAROUND_LABELS.has(token);
}

/**
 * 영업(잠정)실적 공정공시 원문 → 매출액·영업이익·당기순이익 (Phase 81).
 *
 * 표준 서식이라 태그 제거 후 `{계정명} 당해실적` 뒤 7개 셀이 고정 순서로 온다
 * (실측 rcpt 20260515801516 한미반도체 26.1Q):
 *   당기실적 · 전기실적 · 전기대비증감율 · 흑자적자전환 · 전년동기실적 ·
 *   전년동기대비증감율 · 흑자적자전환
 * **7칸을 전부 쓴다** (Phase 82 — 전에는 전기 3칸을 받아놓고 버렸다).
 * 수주만 공시하는 월간 IR 건은 전 셀이 "-"라 빈 배열이 된다.
 * "당기순이익"은 "지배기업 소유주지분 순이익" 행과 문자열이 겹치지 않아 오매칭이 없다.
 *
 * **칸 모양 검증이 필수다** — `[기재정정]` 건의 원문은 실적표가 아니라 "정정전/정정후"
 * 나열이라 같은 정규식이 엉뚱한 7칸에 걸린다(실측 서울반도체 20260512900204:
 * `["당기실적(2026.1Q)","235,094",…]`). 7칸이 숫자·전환라벨 모양을 만족하지 않으면
 * 표준 서식이 아니라고 보고 그 행을 버린다.
 */
export function parseDartEarningsDetail(text: string): DartEarningsDetail {
  const unit = text.match(/단위\s*:\s*([가-힣]+)/)?.[1] ?? "";
  const periodMatch = text.match(
    /실적기간\s*당기실적\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/
  );
  const period =
    periodMatch !== null ? `${periodMatch[1]} ~ ${periodMatch[2]}` : "";

  const figures: DartEarningsFigure[] = [];
  for (const label of EARNINGS_ACCOUNTS) {
    // 한 계정명이 여러 번 나올 수 있다 — 정정 공시는 "정정전/정정후" 나열이 실적표보다
    // 앞에 오므로 첫 매치만 보면 안 되고, 칸 모양을 만족하는 첫 후보를 골라야 한다.
    for (const match of text.matchAll(
      new RegExp(`${label}\\s*당해실적((?:\\s+\\S+){7})`, "g")
    )) {
      const cells = match[1].trim().split(/\s+/);

      // 표준 서식 검증 — 금액·증감율 5칸은 숫자 모양, 전환 2칸은 라벨 모양이어야 한다
      const shapeOk =
        [0, 1, 2, 4, 5].every((i) => isNumericCell(cells[i])) &&
        [3, 6].every((i) => isTurnaroundCell(cells[i]));
      if (!shapeOk) {
        continue;
      }

      const current = parseEarningsCell(cells[0]);
      const yoyBase = parseEarningsCell(cells[4]);
      // 값이 아예 없는 행(수주만 공시하는 월간 IR 등)은 표에 넣지 않는다
      if (current === null && yoyBase === null) {
        break;
      }
      figures.push({
        label,
        current,
        qoqBase: parseEarningsCell(cells[1]),
        qoqPct: parseEarningsCell(cells[2]),
        qoqTurnaround: TURNAROUND_LABELS.has(cells[3]) ? cells[3] : null,
        yoyBase,
        yoyPct: parseEarningsCell(cells[5]),
        turnaround: TURNAROUND_LABELS.has(cells[6]) ? cells[6] : null,
      });
      break;
    }
  }

  return { unit, period, figures };
}

/** 접수번호로 잠정실적 원문을 받아 파싱한다. 원문 조회 실패는 호출부로 throw. */
export async function fetchDartEarningsDetail(
  rceptNo: string
): Promise<DartEarningsDetail> {
  return parseDartEarningsDetail(await fetchDartDocumentText(rceptNo));
}

/** 기업설명회(IR) 개최 공시 원문 파싱 결과 — Phase 82 */
export interface DartIrDetail {
  /** 개최 일시 "2026-07-30 10:00" — 시각 미정이면 서식이 "--:--"로 온다 */
  eventAt: string;
  /** 장소 (없으면 "-") */
  place: string;
  /** 개최목적 — "2026년 2분기 경영실적 발표" / "6월 NDR 참석" 등 */
  purpose: string;
  /** 개최방법 — "Conference Call"·"컨퍼런스콜"·"대면 미팅" 등 */
  method: string;
  /** 주요 설명회내용(요약) */
  summary: string;
  /** IR 자료 게재일시 (없으면 "-") */
  materialAt: string;
  /** 관련 웹페이지 URL (없으면 "-") */
  irUrl: string;
}

/**
 * 기업설명회(IR) 개최 공시 원문 → 일시·목적·개최방법·IR 자료 링크 (Phase 82).
 *
 * 잠정실적과 달리 수치표가 아니라 **완전 정형 서식**이라 라벨 사이를 그대로 집으면 된다
 * (실측 2026-01~07 보유·관심 16종목의 IR 공시 48건 전건 파싱 성공).
 *
 * 9개 항목 중 5개만 쓴다 — 참가 대상자·후원기관·결정일자·기타 중요사항은 화면에
 * 실적 정보를 더해주지 않는다. 값이 없는 칸은 서식이 "-"로 채워 오므로 별도 처리가 없다.
 * 시각이 미정인 대면 미팅·NDR 건은 일시가 "2026-06-08 --:--"로 온다.
 *
 * ⚠️ 컨퍼런스콜 **내용**(가이던스 발언·Q&A)은 DART에 없다. 여기서 얻는 건 일정과
 * 회사 공식 IR 페이지 링크까지이고, 발표 내용은 뉴스 탭이 사후에 커버한다.
 */
export function parseDartIrDetail(text: string): DartIrDetail | null {
  const when = text.match(
    /1\.\s*일시 및 장소\s*일시\s*(.+?)\s*장소\s*(.+?)\s*2\.\s*참가 대상자/
  );
  // 일시조차 못 잡으면 표준 서식이 아니다 — 억지로 채우지 않고 제목·링크만 남긴다
  if (when === null) {
    return null;
  }

  const pick = (re: RegExp): string => text.match(re)?.[1]?.trim() ?? "";
  const material = text.match(
    /8\.\s*IR 자료 게재일시\s*(.+?)\s*관련 웹페이지\s*(\S*)\s*9\./
  );

  return {
    eventAt: when[1].trim(),
    place: when[2].trim(),
    purpose: pick(/3\.\s*개최목적\s*(.+?)\s*4\.\s*개최방법/),
    method: pick(/4\.\s*개최방법\s*(.+?)\s*5\.\s*후원기관/),
    summary: pick(/6\.\s*주요 설명회내용\(요약\)\s*(.+?)\s*7\.\s*결정일자/),
    materialAt: material?.[1]?.trim() ?? "",
    irUrl: material?.[2]?.trim() ?? "",
  };
}

/** 접수번호로 IR 개최 공시 원문을 받아 파싱한다. 원문 조회 실패는 호출부로 throw. */
export async function fetchDartIrDetail(
  rceptNo: string
): Promise<DartIrDetail | null> {
  return parseDartIrDetail(await fetchDartDocumentText(rceptNo));
}
