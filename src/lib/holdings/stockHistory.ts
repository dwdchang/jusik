import { fetchKisStockDailyChart } from "@/lib/api/kis/client";
import {
  STOCK_DAILY_CHART_PAGE_SIZE,
  STOCK_HISTORY_WINDOW_DAYS,
} from "@/lib/api/kis/constants";
import { todayKstDate } from "@/lib/date/kst";
import { getRedis } from "@/lib/redis/client";
import type { KisStockDailyChartRow } from "@/lib/api/kis/types";

/**
 * 종목별 일별 종가 히스토리 — Redis 공용 키 `stock:{symbolCode}:history`.
 * 사용자 무관 공개 시세 데이터라 모든 사용자가 공유하고 암호화하지 않는다.
 * 저장 범위는 최근 2년으로 제한, 이미 저장된 종목은 재사용하고
 * 처음 추가되는 종목만 신규 백필한다 — plan.md §13.3 (2026-07-10 확정).
 */

export interface StockDailyPrice {
  /** "YYYY-MM-DD" (KST 거래일) */
  date: string;
  /** 종가(원) */
  close: number;
}

/** 백필 페이징 안전 상한 — 2년 ≈ 490거래일 / 100건 ≈ 5회 + 여유 */
const MAX_BACKFILL_CALLS = 8;

function stockHistoryKey(symbolCode: string): string {
  return `stock:${symbolCode}:history`;
}

/** "YYYY-MM-DD" 또는 "YYYYMMDD"에 일수를 더한 "YYYYMMDD" (달력일 기준) */
function addDaysYyyyMmDd(date: string, days: number): string {
  const digits = date.replaceAll("-", "");
  const base = new Date(
    Date.UTC(
      Number(digits.slice(0, 4)),
      Number(digits.slice(4, 6)) - 1,
      Number(digits.slice(6, 8)) + days
    )
  );
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, "0");
  const day = String(base.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** 저장 범위 시작일 "YYYY-MM-DD" (오늘 − 2년) */
function windowStartDate(): string {
  const start = addDaysYyyyMmDd(todayKstDate(), -STOCK_HISTORY_WINDOW_DAYS);
  return `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;
}

/** KIS output2 행 → StockDailyPrice (빈 슬롯·비정상 값 제거) */
function parseChartRows(
  rows: KisStockDailyChartRow[] | undefined
): StockDailyPrice[] {
  return (rows ?? []).flatMap((row) => {
    const digits = row.stck_bsop_date;
    const close = Number(row.stck_clpr);

    if (!digits || !/^\d{8}$/.test(digits) || !Number.isFinite(close) || close <= 0) {
      return [];
    }

    return [
      {
        date: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
        close,
      },
    ];
  });
}

export async function getStockHistory(
  symbolCode: string
): Promise<StockDailyPrice[]> {
  const rows = await getRedis().get<StockDailyPrice[]>(
    stockHistoryKey(symbolCode)
  );
  return rows ?? [];
}

/**
 * 기존 저장분과 병합(날짜 기준 upsert) 후 2년 범위로 잘라 저장.
 * 같은 날짜는 새 값으로 덮어쓴다 (재실행 안전).
 */
export async function upsertStockHistory(
  symbolCode: string,
  incoming: StockDailyPrice[]
): Promise<number> {
  const existing = await getStockHistory(symbolCode);
  const byDate = new Map(existing.map((row) => [row.date, row]));

  for (const row of incoming) {
    byDate.set(row.date, row);
  }

  const cutoff = windowStartDate();
  const merged = [...byDate.values()]
    .filter((row) => row.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  await getRedis().set(stockHistoryKey(symbolCode), merged);
  return merged.length;
}

/**
 * 처음 추가되는 종목만 최근 2년 백필 — 1회 100거래일 응답을 날짜 범위를
 * 뒤로 옮겨가며 이어 붙인다(종목당 약 5회 호출). 이미 저장된 종목은 재사용.
 */
export async function backfillStockHistoryIfMissing(
  symbolCode: string
): Promise<{ skipped: boolean; count: number }> {
  const existing = await getStockHistory(symbolCode);

  if (existing.length > 0) {
    return { skipped: true, count: existing.length };
  }

  const from = windowStartDate().replaceAll("-", "");
  let to = todayKstDate().replaceAll("-", "");
  const collected: StockDailyPrice[] = [];

  for (let call = 0; call < MAX_BACKFILL_CALLS; call++) {
    const response = await fetchKisStockDailyChart(symbolCode, from, to);
    const rows = parseChartRows(response.output2);

    if (rows.length === 0) {
      break;
    }

    collected.push(...rows);

    // 응답이 최대 건수 미만이면 범위 내 데이터를 전부 받은 것
    if (rows.length < STOCK_DAILY_CHART_PAGE_SIZE) {
      break;
    }

    const oldest = rows.reduce((min, row) =>
      row.date < min.date ? row : min
    );
    to = addDaysYyyyMmDd(oldest.date, -1);

    if (to < from) {
      break;
    }
  }

  const count = await upsertStockHistory(symbolCode, collected);
  return { skipped: false, count };
}

/**
 * cron 일별 갱신 — 최신 100거래일 1회 조회 후 병합.
 * 아직 백필되지 않은 종목이면 전체 백필로 대체한다.
 */
export async function refreshStockHistory(
  symbolCode: string
): Promise<{ backfilled: boolean; count: number }> {
  const existing = await getStockHistory(symbolCode);

  if (existing.length === 0) {
    const { count } = await backfillStockHistoryIfMissing(symbolCode);
    return { backfilled: true, count };
  }

  const today = todayKstDate().replaceAll("-", "");
  // 달력일 150일 ≈ 거래일 100일 — 1회 호출로 최근 구간을 덮는다
  const from = addDaysYyyyMmDd(today, -150);
  const response = await fetchKisStockDailyChart(symbolCode, from, today);
  const count = await upsertStockHistory(
    symbolCode,
    parseChartRows(response.output2)
  );
  return { backfilled: false, count };
}
