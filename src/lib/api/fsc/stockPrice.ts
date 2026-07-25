/**
 * 금융위원회 주식시세정보(data.go.kr 15094808) 클라이언트 — Phase 63.
 *
 * KIS·DART와 별개의 KRX 원천 EOD(마감) 시세로, **호출 시간창 제약이 없다**
 * (영업일+1 오후 1시 이후 확정 종가 반영). KIS는 09:00~18:40 시간창 밖이면
 * 못 부르는데, 이 API는 밤·주말·새벽에도 조회 가능해 「비갱신 시간대 종목 추가 시
 * 기준가 확보」에 쓴다 (plan.md §63).
 *
 * ⚠️ 아키텍처 예외: 원칙적으로 외부 API는 잡 경유만 허용하나(AGENTS.md §3),
 * 이 API는 시간창이 없고 사용자 등록 시점의 기준가를 즉시 확정하기 위한 것이라
 * Server Action(`stocks/actions.ts`)에서 직접 호출한다. 실패는 null로 격리하고
 * 기준가는 다음 갱신 회차에 잡이 재확정하므로 동작에 지장이 없다.
 *
 * 인증키(DATA_GO_KR_SERVICE_KEY)는 서버 전용 — NEXT_PUBLIC_ 금지. 관세청(customs)
 * 클라이언트와 같은 키를 재사용한다.
 */

const FSC_STOCK_PRICE_URL =
  "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo";
const FSC_FETCH_TIMEOUT_MS = 10_000;
/** 기준일 이전 최근 종가를 찾기 위해 되짚는 창(달력일) — 연휴·주말 여유 */
const FSC_LOOKBACK_DAYS = 12;

function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim() ?? "";
  if (key === "") {
    throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");
  }
  return key;
}

/** getStockPriceInfo item 1행 — 필드는 전부 optional string (KIS types.ts와 동일 방침) */
interface FscStockPriceItem {
  /** 기준일자 "YYYYMMDD" */
  basDt?: string;
  /** 단축코드 6자리 */
  srtnCd?: string;
  /** 종목명 */
  itmsNm?: string;
  /** 종가(원) */
  clpr?: string;
  /** 전일 대비 등락률(%) — 예 "9.34", 하락은 "-3.21" */
  fltRt?: string;
  [key: string]: unknown;
}

interface FscStockPriceResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      totalCount?: number;
      // 결과 0건이면 items가 빈 문자열("")로 오기도 한다
      items?: { item?: FscStockPriceItem[] } | "";
    };
  };
}

/** "YYYYMMDD" n일 전 (달력일) — UTC 기준 산술이라 시차 무관 */
function yyyymmddDaysBefore(yyyymmdd: string, days: number): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10).replace(/-/g, "");
}

export interface FscClose {
  /** 종가(원) */
  close: number;
  /** 그 종가의 기준일 "YYYY-MM-DD" */
  basisDate: string;
  /** 그 종가일의 전일 대비 등락률(%) — 응답에 없거나 파싱 불가면 null */
  changeRate: number | null;
}

/**
 * 종목의 기준일(asOf) 이하 가장 최근 확정 종가를 조회한다.
 * 못 얻으면(미상장·데이터 없음·API 오류·타임아웃) null — 호출부에서 폴백한다.
 *
 * @param symbolCode 6자리 단축코드
 * @param asOfYyyymmdd 기준일 "YYYYMMDD" (이 날짜 이하의 최신 종가를 찾는다)
 */
export async function fetchStockCloseAsOf(
  symbolCode: string,
  asOfYyyymmdd: string
): Promise<FscClose | null> {
  const beginBasDt = yyyymmddDaysBefore(asOfYyyymmdd, FSC_LOOKBACK_DAYS);

  const params = new URLSearchParams({
    serviceKey: getServiceKey(),
    resultType: "json",
    numOfRows: "30",
    pageNo: "1",
    likeSrtnCd: symbolCode,
    beginBasDt,
    endBasDt: asOfYyyymmdd,
  });

  let response: Response;
  try {
    response = await fetch(`${FSC_STOCK_PRICE_URL}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FSC_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[fsc] fetch failed for ${symbolCode}:`, err);
    return null;
  }

  if (!response.ok) {
    console.error(`[fsc] HTTP ${response.status} for ${symbolCode}`);
    return null;
  }

  // 인증 오류 등은 resultType=json이어도 XML 에러 봉투로 오기도 해, 먼저 text로 받아
  // 파싱 실패·비정상 resultCode를 로그로 남긴다(무슨 이유로 종가가 비는지 진단용).
  const text = await response.text();
  let data: FscStockPriceResponse;
  try {
    data = JSON.parse(text) as FscStockPriceResponse;
  } catch {
    console.error(
      `[fsc] non-JSON response for ${symbolCode}: ${text.slice(0, 300)}`
    );
    return null;
  }

  const header = data.response?.header;
  const body = data.response?.body;
  if (header?.resultCode !== "00" || !body) {
    console.error(
      `[fsc] resultCode ${header?.resultCode ?? "?"} (${
        header?.resultMsg ?? "no msg"
      }) for ${symbolCode}`
    );
    return null;
  }

  // 결과 0건이면 items가 빈 문자열("", falsy)로 오기도 한다
  const items = body.items ? body.items.item ?? [] : [];

  // likeSrtnCd는 부분일치라 정확히 일치하는 종목만 남기고 기준일 내림차순 최신을 고른다
  let best: FscClose | null = null;
  for (const item of items) {
    if (item.srtnCd?.trim() !== symbolCode) {
      continue;
    }
    const basDt = item.basDt?.trim() ?? "";
    if (!/^\d{8}$/.test(basDt)) {
      continue;
    }
    const close = Number(item.clpr?.replace(/,/g, ""));
    if (!Number.isFinite(close) || close <= 0) {
      continue;
    }
    if (best === null || basDt > best.basisDate.replace(/-/g, "")) {
      // 등락률은 부가 정보라 파싱 실패해도 종가는 살린다 (Phase 65 폴백 표시용).
      // 빈 문자열은 Number("")===0이라 0%로 오인되므로 먼저 걸러낸다.
      const rawRate = item.fltRt?.replace(/,/g, "").trim() ?? "";
      const rate = rawRate === "" ? Number.NaN : Number(rawRate);
      best = {
        close,
        basisDate: `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`,
        changeRate: Number.isFinite(rate) ? rate : null,
      };
    }
  }

  if (best === null) {
    console.error(
      `[fsc] no matching close for ${symbolCode} (items=${items.length})`
    );
  }

  return best;
}
