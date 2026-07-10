import { KIS_HISTORY_POINT_COUNT } from "@/lib/api/kis/constants";
import type { KisOverseasDailyResponse } from "@/lib/api/kis/types";
import {
  INDICATOR_NAMES,
  type IndexDailyRow,
  type IndexSeries,
  type IndexSnapshot,
  type OverseasIndicator,
} from "@/types/indices";
import {
  applyKisSign,
  formatBasDtLabel,
  parseNum,
  resolveDirection,
} from "./kisMapper";

/** output2를 최신순으로 정리한 {basDt, close} 배열 */
function sortedDailyCloses(
  raw: KisOverseasDailyResponse
): Array<{ basDt: string; close: number }> {
  return (raw.output2 ?? [])
    .filter((row) => row.stck_bsop_date && row.ovrs_nmix_prpr)
    .map((row) => ({
      basDt: row.stck_bsop_date as string,
      close: parseNum(row.ovrs_nmix_prpr),
    }))
    .sort((a, b) => b.basDt.localeCompare(a.basDt));
}

/** output1(요약) → 스냅샷. 기준일은 output2 최신 행에서 가져온다. */
export function mapKisOverseasSnapshot(
  raw: KisOverseasDailyResponse,
  indicator: OverseasIndicator
): IndexSnapshot {
  const output1 = raw.output1;
  const latest = sortedDailyCloses(raw)[0];

  if (!output1?.ovrs_nmix_prpr && !latest) {
    throw new Error(`No KIS overseas snapshot data available for ${indicator}`);
  }

  const sign = output1?.prdy_vrss_sign;
  const close = output1?.ovrs_nmix_prpr
    ? parseNum(output1.ovrs_nmix_prpr)
    : (latest?.close ?? 0);
  const changeAmount = applyKisSign(
    parseNum(output1?.ovrs_nmix_prdy_vrss),
    sign
  );
  const changeRate = applyKisSign(parseNum(output1?.prdy_ctrt), sign);

  return {
    market: indicator,
    name: INDICATOR_NAMES[indicator],
    basDt: latest?.basDt ?? "",
    close,
    changeAmount,
    changeRate,
    direction: resolveDirection(changeRate),
  };
}

/** output2 → 최근 N거래일 차트 시리즈 (오름차순) */
export function mapKisOverseasHistory(
  raw: KisOverseasDailyResponse,
  indicator: OverseasIndicator
): IndexSeries {
  const points = sortedDailyCloses(raw)
    .slice(0, KIS_HISTORY_POINT_COUNT)
    .reverse()
    .map((row) => ({
      basDt: row.basDt,
      date: formatBasDtLabel(row.basDt),
      close: row.close,
    }));

  if (points.length === 0) {
    throw new Error(`No KIS overseas history points available for ${indicator}`);
  }

  return { market: indicator, points };
}

/**
 * output2 → 일별 시세 리스트 (최신순).
 * 해외 기간별시세 output2에는 행별 전일 대비가 없어 인접 종가 차분으로 계산한다.
 */
export function mapKisOverseasDailyRows(
  raw: KisOverseasDailyResponse,
  indicator: OverseasIndicator
): IndexDailyRow[] {
  const closes = sortedDailyCloses(raw);

  const rows = closes.slice(0, KIS_HISTORY_POINT_COUNT).map((row, i) => {
    const prev = closes[i + 1];
    const changeAmount = prev ? row.close - prev.close : 0;
    const changeRate =
      prev && prev.close !== 0 ? (changeAmount / prev.close) * 100 : 0;

    return {
      basDt: row.basDt,
      date: formatBasDtLabel(row.basDt),
      close: row.close,
      changeAmount,
      changeRate,
      direction: resolveDirection(changeRate),
    };
  });

  if (rows.length === 0) {
    throw new Error(`No KIS overseas daily rows available for ${indicator}`);
  }

  return rows;
}
