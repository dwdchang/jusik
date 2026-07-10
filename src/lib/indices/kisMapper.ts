import { KIS_HISTORY_POINT_COUNT } from "@/lib/api/kis/constants";
import type {
  KisIndexDailyOutput,
  KisIndexDailyResponse,
} from "@/lib/api/kis/types";
import type {
  IndexDailyRow,
  IndexSeries,
  IndexSnapshot,
  MarketIndex,
  PriceDirection,
} from "@/types/indices";

export function parseNum(value: string | number | undefined): number {
  if (value === undefined || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

export function resolveDirection(changeRate: number): PriceDirection {
  if (changeRate > 0) {
    return "rise";
  }
  if (changeRate < 0) {
    return "fall";
  }
  return "flat";
}

/** "20260601" → "06/01" */
export function formatBasDtLabel(basDt: string): string {
  if (basDt.length !== 8) {
    return basDt;
  }
  return `${basDt.slice(4, 6)}/${basDt.slice(6, 8)}`;
}

/**
 * KIS 전일 대비 부호를 부호 있는 숫자로 변환한다.
 * 1 상한 / 2 상승 → +, 4 하한 / 5 하락 → -, 3 보합 → 0
 */
export function applyKisSign(value: number, sign: string | undefined): number {
  const magnitude = Math.abs(value);
  if (sign === "1" || sign === "2") {
    return magnitude;
  }
  if (sign === "4" || sign === "5") {
    return -magnitude;
  }
  if (sign === "3") {
    return 0;
  }
  return value;
}

function indexName(market: MarketIndex): string {
  return market === "KOSPI" ? "코스피" : "코스닥";
}

/** output2(일자별 배열) → 최근 N거래일 차트 시리즈 (오름차순) */
export function mapKisHistory(
  raw: KisIndexDailyResponse,
  market: MarketIndex
): IndexSeries {
  const rows = raw.output2 ?? [];

  const points = rows
    .filter((row) => row.stck_bsop_date && row.bstp_nmix_prpr)
    .map((row) => ({
      basDt: row.stck_bsop_date as string,
      close: parseNum(row.bstp_nmix_prpr),
    }))
    .sort((a, b) => a.basDt.localeCompare(b.basDt))
    .slice(-KIS_HISTORY_POINT_COUNT)
    .map((point) => ({
      basDt: point.basDt,
      date: formatBasDtLabel(point.basDt),
      close: point.close,
    }));

  if (points.length === 0) {
    throw new Error(`No KIS history points available for ${market}`);
  }

  return { market, points };
}

/** output2(일자별 배열) → 상세 페이지 일별 시세 리스트 (최신순) */
export function mapKisDailyRows(
  raw: KisIndexDailyResponse,
  market: MarketIndex
): IndexDailyRow[] {
  const rows = (raw.output2 ?? [])
    .filter((row) => row.stck_bsop_date && row.bstp_nmix_prpr)
    .sort((a, b) =>
      (b.stck_bsop_date as string).localeCompare(a.stck_bsop_date as string)
    )
    .slice(0, KIS_HISTORY_POINT_COUNT)
    .map((row) => {
      const sign = row.prdy_vrss_sign;
      const changeRate = applyKisSign(
        parseNum(row.bstp_nmix_prdy_ctrt),
        sign
      );

      return {
        basDt: row.stck_bsop_date as string,
        date: formatBasDtLabel(row.stck_bsop_date as string),
        close: parseNum(row.bstp_nmix_prpr),
        changeAmount: applyKisSign(parseNum(row.bstp_nmix_prdy_vrss), sign),
        changeRate,
        direction: resolveDirection(changeRate),
      };
    });

  if (rows.length === 0) {
    throw new Error(`No KIS daily rows available for ${market}`);
  }

  return rows;
}

/** output1(요약) 우선, 없으면 output2 최신 행을 스냅샷으로 변환 */
export function mapKisSnapshot(
  raw: KisIndexDailyResponse,
  market: MarketIndex
): IndexSnapshot {
  const latest = (raw.output2 ?? [])
    .filter((row) => row.stck_bsop_date)
    .sort((a, b) =>
      (b.stck_bsop_date as string).localeCompare(a.stck_bsop_date as string)
    )[0];

  const source: KisIndexDailyOutput | undefined = raw.output1 ?? latest;

  if (!source) {
    throw new Error(`No KIS snapshot data available for ${market}`);
  }

  const sign = source.prdy_vrss_sign;
  const close = parseNum(source.bstp_nmix_prpr);
  const changeAmount = applyKisSign(parseNum(source.bstp_nmix_prdy_vrss), sign);
  const changeRate = applyKisSign(parseNum(source.bstp_nmix_prdy_ctrt), sign);

  return {
    market,
    name: indexName(market),
    basDt: latest?.stck_bsop_date ?? source.stck_bsop_date ?? "",
    close,
    changeAmount,
    changeRate,
    direction: resolveDirection(changeRate),
  };
}
