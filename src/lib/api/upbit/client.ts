/**
 * 업비트 공개 시세 API — 비트코인 원화/달러(USDT) 시세 (plan.md §30).
 * 인증·API 키 불필요(공개 quotation API). 호출 주체는 KIS와 동일하게
 * QStash 시세 갱신 잡(refreshMarketData)뿐이며, 화면은 Redis 스냅샷만 읽는다.
 */

const UPBIT_BASE_URL = "https://api.upbit.com/v1";

const UPBIT_FETCH_TIMEOUT_MS = 15_000;

/** 비트코인 조회 마켓 — 원화·USDT(≈달러) 두 마켓을 한 소스로 커버 */
export const UPBIT_BTC_MARKETS = {
  BTCKRW: "KRW-BTC",
  BTCUSD: "USDT-BTC",
} as const;

/** GET /v1/ticker 1행 — 사용하는 필드만 선언 */
export interface UpbitTicker {
  market: string;
  /** 최근 체결 기준일 (KST, "YYYYMMDD") */
  trade_date_kst: string;
  /** 현재가 */
  trade_price: number;
  /** 전일(일봉 경계 KST 09:00 기준) 종가 */
  prev_closing_price: number;
  /** 전일 종가 대비 금액 (부호 포함) */
  signed_change_price: number;
  /** 전일 종가 대비율 (소수, 부호 포함 — 0.0123 = +1.23%) */
  signed_change_rate: number;
}

/** GET /v1/candles/days 1행 — 사용하는 필드만 선언 */
export interface UpbitDayCandle {
  market: string;
  /** 캔들 기준 시각 (KST, "YYYY-MM-DDTHH:mm:ss") */
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  /** 종가 (당일 캔들은 현재가) */
  trade_price: number;
  /** 전일 캔들 종가 */
  prev_closing_price: number;
}

async function fetchUpbitJson<T>(label: string, path: string): Promise<T> {
  const response = await fetch(`${UPBIT_BASE_URL}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(UPBIT_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upbit ${label} HTTP ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function fetchUpbitTicker(market: string): Promise<UpbitTicker> {
  const rows = await fetchUpbitJson<UpbitTicker[]>(
    "ticker",
    `/ticker?markets=${encodeURIComponent(market)}`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Upbit ticker empty response for ${market}`);
  }
  return rows[0];
}

export async function fetchUpbitDayCandles(
  market: string,
  count: number
): Promise<UpbitDayCandle[]> {
  const rows = await fetchUpbitJson<UpbitDayCandle[]>(
    "day candles",
    `/candles/days?market=${encodeURIComponent(market)}&count=${count}`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Upbit day candles empty response for ${market}`);
  }
  return rows;
}
