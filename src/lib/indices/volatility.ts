import type { KisIndexDailyResponse } from "@/lib/api/kis/types";
import { kstHhmm, todayKstDate } from "@/lib/date/kst";
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

/** "2026-07" → "7월" */
export function monthLabel(month: string): string {
  return `${Number(month.slice(5))}월`;
}

/**
 * 월 지표(카드 월평균·상세 일별 목록)의 기준월 — 당월 기록이 있으면 당월,
 * 없으면 기록이 있는 마지막 달 (§95).
 *
 * 달이 바뀐 뒤 당월 첫 거래일 전에는 당월 기록이 0건이라, 당월로 고정하면
 * 월평균 줄과 일별 목록이 통째로 사라진다. 기록이 아예 없을 때만 당월을 낸다.
 *
 * @param records 날짜 오름차순 기록
 */
export function resolveVolatilityBaseMonth(
  records: KospiVolatilityRecord[],
  today: string = todayKstDate()
): string {
  const currentMonth = today.slice(0, 7);

  if (records.some((record) => record.date.startsWith(currentMonth))) {
    return currentMonth;
  }
  return records.at(-1)?.date.slice(0, 7) ?? currentMonth;
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
      label: monthLabel(month),
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

/** 정규장 마감 KST 15:30 — 이 시각 전의 당일 기록은 아직 벌어지는 중인 진행 값 (§71) */
const MARKET_CLOSE_HHMM = "1530";

/**
 * 홈 카드 요약 — 대표값은 **최신 거래일의 일중 변동폭**, 보조로 기준월 평균·전월 대비 (§71).
 * 기록이 하나도 없거나 조회 실패 시 null (placeholder 표시).
 * 월 지표의 기준월은 당월 첫 거래일 전이면 직전 기록 월로 폴백한다 (§95).
 */
export async function getVolatilityCardSummary(): Promise<VolatilityCardSummary | null> {
  try {
    const records = await getVolatilityHistory();
    const latest = records.at(-1);

    if (latest === undefined) {
      return null;
    }

    // 전일 = 기록 배열의 직전 항목 — 휴장일·월 경계와 무관하게 직전 거래일이 잡힌다
    const previous = records.at(-2);

    const today = todayKstDate();
    const monthly = aggregateMonthlyAverages(records);
    const baseMonth = resolveVolatilityBaseMonth(records, today);
    const base = monthly.find((point) => point.month === baseMonth);

    if (base === undefined) {
      return null;
    }

    const prevMonth = monthly.find(
      (point) => point.month === previousMonth(baseMonth)
    );

    return {
      latestGapPercent: latest.dailyGapPercent,
      latestDate: latest.date,
      dayOverDayDiff:
        previous !== undefined
          ? latest.dailyGapPercent - previous.dailyGapPercent
          : null,
      latestIntraday:
        latest.date === today && kstHhmm(Date.now()) < MARKET_CLOSE_HHMM,
      baseMonth,
      baseMonthAvg: base.avgGapPercent,
      monthOverMonthDiff:
        prevMonth !== undefined
          ? base.avgGapPercent - prevMonth.avgGapPercent
          : null,
    };
  } catch (error) {
    console.error("[getVolatilityCardSummary] failed:", error);
    return null;
  }
}
