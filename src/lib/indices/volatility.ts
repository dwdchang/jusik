import type { KisIndexDailyResponse } from "@/lib/api/kis/types";
import { todayKstDate } from "@/lib/date/kst";
import { getRedis } from "@/lib/redis/client";
import type {
  KospiVolatilityRecord,
  VolatilityCardSummary,
  VolatilityMonthlyPoint,
} from "@/types/indices";
import { parseNum } from "./kisMapper";

/**
 * 코스피 변동성 지수 — 일일 (고가 − 저가) / 저가 × 100 시계열.
 * 평일 18:15 KST cron 시점에 KIS 일자별 응답으로 upsert된다.
 * @see plan.md §9.4.4
 */

const VOLATILITY_HISTORY_KEY = "kospiVolatility:history";

/** 상세 차트에 표시할 월 수 (당월 포함) */
export const VOLATILITY_MONTH_COUNT = 6;

/** 일별 기록 전체 (날짜 오름차순) */
export async function getVolatilityHistory(): Promise<
  KospiVolatilityRecord[]
> {
  const records = await getRedis().get<KospiVolatilityRecord[]>(
    VOLATILITY_HISTORY_KEY
  );
  return (records ?? []).sort((a, b) => a.date.localeCompare(b.date));
}

/** 같은 날짜 기록은 덮어쓴다 (재실행 안전) */
export async function upsertVolatilityRecords(
  records: KospiVolatilityRecord[]
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const merged = new Map(
    (await getVolatilityHistory()).map((record) => [record.date, record])
  );
  for (const record of records) {
    merged.set(record.date, record);
  }

  const next = [...merged.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  await getRedis().set(VOLATILITY_HISTORY_KEY, next);
}

/** "20260709" → "2026-07-09" */
function toIsoDate(basDt: string): string {
  return `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`;
}

/** KIS 코스피 일자별 응답(output2) → 일일 변동성 기록 (고가·저가 있는 행만) */
export function computeVolatilityRecords(
  raw: KisIndexDailyResponse
): KospiVolatilityRecord[] {
  return (raw.output2 ?? [])
    .filter((row) => row.stck_bsop_date?.length === 8)
    .map((row) => {
      const high = parseNum(row.bstp_nmix_hgpr);
      const low = parseNum(row.bstp_nmix_lwpr);

      if (low <= 0 || high < low) {
        return null;
      }

      return {
        date: toIsoDate(row.stck_bsop_date as string),
        dailyGapPercent: ((high - low) / low) * 100,
      };
    })
    .filter((record): record is KospiVolatilityRecord => record !== null);
}

/** 월별 평균 변동성 — 기록이 있는 최근 monthCount개월 (오름차순) */
export function aggregateMonthlyAverages(
  records: KospiVolatilityRecord[],
  monthCount: number = VOLATILITY_MONTH_COUNT
): VolatilityMonthlyPoint[] {
  const byMonth = new Map<string, number[]>();

  for (const record of records) {
    const month = record.date.slice(0, 7);
    const values = byMonth.get(month) ?? [];
    values.push(record.dailyGapPercent);
    byMonth.set(month, values);
  }

  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-monthCount)
    .map(([month, values]) => ({
      month,
      label: `${Number(month.slice(5))}월`,
      avgGapPercent:
        values.reduce((sum, value) => sum + value, 0) / values.length,
    }));
}

/** "2026-01" → "2025-12" */
function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));

  if (monthNumber === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

/** 홈 카드 요약 — 당월 기록이 없거나 조회 실패 시 null (placeholder 표시) */
export async function getVolatilityCardSummary(): Promise<VolatilityCardSummary | null> {
  try {
    const monthly = aggregateMonthlyAverages(await getVolatilityHistory());
    const currentMonth = todayKstDate().slice(0, 7);
    const current = monthly.find((point) => point.month === currentMonth);

    if (!current) {
      return null;
    }

    const prev = monthly.find(
      (point) => point.month === previousMonth(currentMonth)
    );

    return {
      currentMonthAvg: current.avgGapPercent,
      monthOverMonthDiff:
        prev !== undefined ? current.avgGapPercent - prev.avgGapPercent : null,
    };
  } catch (error) {
    console.error("[getVolatilityCardSummary] failed:", error);
    return null;
  }
}
