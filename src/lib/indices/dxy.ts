import {
  KIS_DXY_BASE,
  KIS_DXY_COMPONENTS,
  KIS_HISTORY_POINT_COUNT,
} from "@/lib/api/kis/constants";
import type { KisOverseasDailyResponse } from "@/lib/api/kis/types";
import {
  INDICATOR_NAMES,
  type IndexDailyRow,
  type IndexSeries,
  type IndexSnapshot,
} from "@/types/indices";
import { formatBasDtLabel, parseNum, resolveDirection } from "./kisMapper";

/**
 * 달러 인덱스(DXY) 계산 — plan.md §28.
 * KIS에 DXY 종목이 없어 환율 6종(KIS_DXY_COMPONENTS)의 일별 종가를
 * ICE 공식(가중 기하평균)으로 합성한다. 통화쌍마다 휴장일이 달라
 * (FX는 토요일 KST 행 존재·일요일 결측) 기준일 교집합에서만 계산한다.
 */

export interface DxyDetail {
  snapshot: IndexSnapshot;
  history: IndexSeries;
  dailyRows: IndexDailyRow[];
}

/** output2 → basDt별 종가 맵 (0·결측 행 제외) */
function dailyCloseMap(raw: KisOverseasDailyResponse): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of raw.output2 ?? []) {
    if (!row.stck_bsop_date || !row.ovrs_nmix_prpr) {
      continue;
    }
    const close = parseNum(row.ovrs_nmix_prpr);
    if (close > 0) {
      map.set(row.stck_bsop_date, close);
    }
  }

  return map;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 통화쌍 6종 원응답 → DXY 스냅샷·차트·일별 리스트 (StoredMarketDetail 동일 폼) */
export function computeDxyDetail(
  rawByCode: ReadonlyMap<string, KisOverseasDailyResponse>
): DxyDetail {
  const closeMaps = KIS_DXY_COMPONENTS.map(({ code }) => {
    const raw = rawByCode.get(code);
    if (raw === undefined) {
      throw new Error(`DXY component response missing: ${code}`);
    }
    return dailyCloseMap(raw);
  });

  // 6종 모두 종가가 있는 기준일만 — 최신순
  const commonBasDts = [...closeMaps[0].keys()]
    .filter((basDt) => closeMaps.every((map) => map.has(basDt)))
    .sort((a, b) => b.localeCompare(a));

  const closes = commonBasDts.map((basDt) => {
    let value = KIS_DXY_BASE;
    KIS_DXY_COMPONENTS.forEach(({ exponent }, i) => {
      value *= (closeMaps[i].get(basDt) as number) ** exponent;
    });
    return { basDt, close: round2(value) };
  });

  if (closes.length === 0) {
    throw new Error("No common FX dates available for DXY");
  }

  const [latest, prev] = closes;
  const changeAmount = prev ? round2(latest.close - prev.close) : 0;
  const changeRate =
    prev && prev.close !== 0 ? (changeAmount / prev.close) * 100 : 0;

  const snapshot: IndexSnapshot = {
    market: "DXY",
    name: INDICATOR_NAMES.DXY,
    basDt: latest.basDt,
    close: latest.close,
    changeAmount,
    changeRate,
    direction: resolveDirection(changeRate),
  };

  const history: IndexSeries = {
    market: "DXY",
    points: closes
      .slice(0, KIS_HISTORY_POINT_COUNT)
      .reverse()
      .map((row) => ({
        basDt: row.basDt,
        date: formatBasDtLabel(row.basDt),
        close: row.close,
      })),
  };

  const dailyRows: IndexDailyRow[] = closes
    .slice(0, KIS_HISTORY_POINT_COUNT)
    .map((row, i) => {
      const prevRow = closes[i + 1];
      const rowChange = prevRow ? round2(row.close - prevRow.close) : 0;
      const rowRate =
        prevRow && prevRow.close !== 0 ? (rowChange / prevRow.close) * 100 : 0;

      return {
        basDt: row.basDt,
        date: formatBasDtLabel(row.basDt),
        close: row.close,
        changeAmount: rowChange,
        changeRate: rowRate,
        direction: resolveDirection(rowRate),
      };
    });

  return { snapshot, history, dailyRows };
}
