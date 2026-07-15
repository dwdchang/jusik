import { parseNum } from "@/lib/indices/kisMapper";

/**
 * 관세청 수출입총괄(GW) API 클라이언트 — Phase 17-4 (plan.md §17-4).
 * 호출 주체는 QStash feeds 갱신 잡(refreshTradeStats)뿐이며, 화면은 Redis 스냅샷만 읽는다.
 * KIS와 달리 호출 시간창 제약이 없다 (월간 확정 통계).
 * 인증키(DATA_GO_KR_SERVICE_KEY)는 서버 전용 — NEXT_PUBLIC_ 금지.
 *
 * 실측 확정(2026-07): 응답은 XML, `<resultCode>00</resultCode>`=정상.
 * `<item>`의 year는 문자열 "YYYY.MM"이고 매 응답 끝에 `<year>총계</year>` 합계행이 붙어
 * 파싱 시 제외해야 한다. expDlr·impDlr·balPayments는 모두 USD 달러 원값
 * (balPayments = expDlr - impDlr 산술 검증 완료).
 */

const CUSTOMS_BASE_URL = "https://apis.data.go.kr/1220000/Newtrade";
const CUSTOMS_FETCH_TIMEOUT_MS = 15_000;

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

  const resultCode = pickTag(xml, "resultCode")?.trim();
  if (resultCode !== undefined && resultCode !== "00") {
    const msg = pickTag(xml, "resultMsg")?.trim() ?? "unknown error";
    throw new Error(`관세청 수출입 오류 [${resultCode}] ${msg}`);
  }

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
