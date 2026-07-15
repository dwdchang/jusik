import { parseNum } from "@/lib/indices/kisMapper";

/**
 * 관세청 수출입 통계(GW) API 클라이언트 — Phase 17-4·17-5 (plan.md §17-4·§17.15).
 * 호출 주체는 QStash 갱신 잡(refreshTradeStats·refreshTradeDetail)뿐이며,
 * 화면은 Redis 스냅샷만 읽는다. KIS와 달리 호출 시간창 제약이 없다 (월간 확정 통계).
 * 인증키(DATA_GO_KR_SERVICE_KEY)는 서버 전용 — NEXT_PUBLIC_ 금지.
 *
 * 실측 확정(2026-07): 응답은 XML, `<resultCode>00</resultCode>`=정상.
 * `<item>`의 year는 문자열 "YYYY.MM"이고 매 응답 끝에 `<year>총계</year>` 합계행이 붙어
 * 파싱 시 제외해야 한다. expDlr·impDlr·balPayments는 모두 USD 달러 원값
 * (balPayments = expDlr - impDlr 산술 검증 완료). 응답에 XML 엔티티는 쓰이지 않아
 * `[^<]*` 정규식 파싱으로 충분하다 (7개 류 표본 실측).
 */

const CUSTOMS_BASE_URL = "https://apis.data.go.kr/1220000/Newtrade";
/** 품목별 국가별 수출입실적(GW) — 수출입총괄과 다른 서비스라 베이스 URL이 따로다 */
const NITEMTRADE_URL =
  "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList";
const CUSTOMS_FETCH_TIMEOUT_MS = 15_000;
/** 품목별은 류 하나가 최대 수 MB(85류 3,704행)라 총괄보다 넉넉히 준다 */
const NITEMTRADE_FETCH_TIMEOUT_MS = 30_000;

function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim() ?? "";
  if (key === "") {
    throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");
  }
  return key;
}

/** 수출입 실적 1행 — "총계" 합계행 제외 후 year "YYYY.MM"→"YYYYMM" 정규화 완료 */
export interface TradeStatRow {
  /** 기준월 "YYYYMM" */
  yyyymm: string;
  /** 수출액 (USD) */
  expDlr: number;
  /** 수입액 (USD) */
  impDlr: number;
  /** 무역수지 (USD) = expDlr - impDlr */
  balPayments: number;
}

function pickTag(block: string, tag: string): string | undefined {
  return block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
}

/** resultCode가 00이 아니면 throw — 두 서비스가 같은 오류 봉투를 쓴다 */
function assertOk(xml: string, label: string): void {
  const resultCode = pickTag(xml, "resultCode")?.trim();
  if (resultCode !== undefined && resultCode !== "00") {
    const msg = pickTag(xml, "resultMsg")?.trim() ?? "unknown error";
    throw new Error(`${label} 오류 [${resultCode}] ${msg}`);
  }
}

/**
 * 기간(strtYymm~endYymm, YYYYMM) 월별 수출입 실적을 조회한다.
 * "총계" 합계행과 year가 "YYYY.MM" 형식이 아닌 비정형 행은 제외한다.
 * 현재 월(부분월) 필터링은 호출부(잡)가 KST 기준으로 판단한다.
 */
export async function fetchTradeStats(
  strtYymm: string,
  endYymm: string
): Promise<TradeStatRow[]> {
  const params = new URLSearchParams({
    serviceKey: getServiceKey(),
    strtYymm,
    endYymm,
  });

  const response = await fetch(
    `${CUSTOMS_BASE_URL}/getNewtradeList?${params}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(CUSTOMS_FETCH_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`관세청 수출입 HTTP ${response.status}`);
  }

  const xml = await response.text();
  assertOk(xml, "관세청 수출입");

  const rows: TradeStatRow[] = [];
  for (const block of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = block[1];
    const yearRaw = pickTag(body, "year")?.trim() ?? "";
    const matched = yearRaw.match(/^(\d{4})\.(\d{2})$/);
    if (matched === null) {
      // "총계" 합계행·기타 비정형 행 제외
      continue;
    }

    rows.push({
      yyyymm: `${matched[1]}${matched[2]}`,
      expDlr: parseNum(pickTag(body, "expDlr")),
      impDlr: parseNum(pickTag(body, "impDlr")),
      balPayments: parseNum(pickTag(body, "balPayments")),
    });
  }

  return rows;
}

/**
 * 품목별 국가별 수출입실적 1행 — (국가 × HS 4단위) 교차 실적.
 * 류 단위 조회 1회가 그 류에 속한 모든 국가 × 4단위 품목 행을 돌려준다.
 */
export interface NitemTradeRow {
  /** HS 4단위 부호 (예: "8542") */
  hsCd: string;
  /** HS 4단위 품목명 — API 제공값(정적 매핑 불필요) */
  hsName: string;
  /** 국가 코드 (예: "CN") */
  countryCode: string;
  /** 국가명 (예: "중국") */
  countryName: string;
  /** 수출액 (USD) */
  expDlr: number;
  /** 수입액 (USD) */
  impDlr: number;
}

/**
 * 류(HS 2단위) 한 개의 월간 수출입 실적을 국가 × 4단위 품목으로 조회한다 (§17.15).
 *
 * 실측 확정(2026-07): 이 API는 `hsSgn`·`cntyCd` 중 최소 하나를 요구하며(둘 다 없으면
 * code 99), `hsSgn`은 2·4·6·10자리만 받는다. `numOfRows`/`pageNo`는 무시되고 조건에
 * 해당하는 전 행이 통째로 온다. 류 단위로 부르면 응답이 (국가 × 4단위 품목) 행렬이라
 * 97개 류를 돌면 국가별 집계까지 이 데이터에서 파생된다 — 국가별 추가 호출이 필요 없다.
 * `총계` 합계행은 item행 합과 정확히 일치함을 검증해 여기서는 제외한다.
 */
export async function fetchNitemTradeChapter(
  hsSgn: string,
  yyyymm: string
): Promise<NitemTradeRow[]> {
  const params = new URLSearchParams({
    serviceKey: getServiceKey(),
    strtYymm: yyyymm,
    endYymm: yyyymm,
    hsSgn,
  });

  const response = await fetch(`${NITEMTRADE_URL}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(NITEMTRADE_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`관세청 품목별 HTTP ${response.status}`);
  }

  const xml = await response.text();
  assertOk(xml, "관세청 품목별");

  const rows: NitemTradeRow[] = [];
  for (const block of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = block[1];
    // "총계" 합계행·비정형 행 제외 (item행 합과 일치하므로 버려도 정보 손실 없음)
    if (!/^\d{4}\.\d{2}$/.test(pickTag(body, "year")?.trim() ?? "")) {
      continue;
    }

    const hsCd = pickTag(body, "hsCd")?.trim() ?? "";
    const countryCode = pickTag(body, "statCd")?.trim() ?? "";
    if (hsCd === "" || countryCode === "") {
      continue;
    }

    rows.push({
      hsCd,
      hsName: pickTag(body, "statKor")?.trim() ?? "",
      countryCode,
      countryName: pickTag(body, "statCdCntnKor1")?.trim() ?? "",
      expDlr: parseNum(pickTag(body, "expDlr")),
      impDlr: parseNum(pickTag(body, "impDlr")),
    });
  }

  return rows;
}
