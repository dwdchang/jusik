import { KIS_HISTORY_POINT_COUNT } from "@/lib/api/kis/constants";
import type { UpbitDayCandle, UpbitTicker } from "@/lib/api/upbit/client";
import type { StoredMarketDetail } from "@/lib/market/store";
import {
  INDICATOR_NAMES,
  type IndexDailyRow,
  type IndexSeries,
  type IndexSnapshot,
} from "@/types/indices";
import { formatBasDtLabel, resolveDirection } from "./kisMapper";

/**
 * 업비트 티커·일봉 → StoredMarketDetail 폼 (plan.md §30).
 * 일봉 경계는 KST 09:00 — 전일 대비는 캔들의 prev_closing_price를 그대로 쓴다
 * (KIS 해외 기간별시세와 달리 행별 전일 종가가 직접 제공돼 차분 역산 불필요).
 */

type BtcIndicator = "BTCKRW" | "BTCUSD";

/** "2026-07-19T00:00:00" → "20260719" */
function candleBasDt(candle: UpbitDayCandle): string {
  return candle.candle_date_time_kst.slice(0, 10).replaceAll("-", "");
}

/** 최신순 정렬 일봉 (API도 최신순이지만 순서에 의존하지 않는다) */
function sortedCandles(candles: UpbitDayCandle[]): UpbitDayCandle[] {
  return [...candles].sort((a, b) =>
    b.candle_date_time_kst.localeCompare(a.candle_date_time_kst)
  );
}

export function mapUpbitDetail(
  indicator: BtcIndicator,
  ticker: UpbitTicker,
  candles: UpbitDayCandle[]
): Omit<StoredMarketDetail, "fetchedAt"> {
  const sorted = sortedCandles(candles);

  if (sorted.length === 0 || !(ticker.trade_price > 0)) {
    throw new Error(`No Upbit data available for ${indicator}`);
  }

  const snapshot: IndexSnapshot = {
    market: indicator,
    name: INDICATOR_NAMES[indicator],
    basDt: ticker.trade_date_kst,
    close: ticker.trade_price,
    changeAmount: ticker.signed_change_price,
    changeRate: ticker.signed_change_rate * 100,
    direction: resolveDirection(ticker.signed_change_rate),
  };

  const history: IndexSeries = {
    market: indicator,
    points: sorted
      .slice(0, KIS_HISTORY_POINT_COUNT)
      .reverse()
      .map((candle) => ({
        basDt: candleBasDt(candle),
        date: formatBasDtLabel(candleBasDt(candle)),
        close: candle.trade_price,
      })),
  };

  const dailyRows: IndexDailyRow[] = sorted
    .slice(0, KIS_HISTORY_POINT_COUNT)
    .map((candle) => {
      const changeAmount = candle.trade_price - candle.prev_closing_price;
      const changeRate =
        candle.prev_closing_price > 0
          ? (changeAmount / candle.prev_closing_price) * 100
          : 0;

      return {
        basDt: candleBasDt(candle),
        date: formatBasDtLabel(candleBasDt(candle)),
        close: candle.trade_price,
        changeAmount,
        changeRate,
        direction: resolveDirection(changeRate),
      };
    });

  return { snapshot, history, dailyRows };
}
