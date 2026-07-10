import { getRedis } from "@/lib/redis/client";
import type { Holding, PortfolioDailyRecord } from "@/types/holdings";

/**
 * 보유종목 Redis 저장소 — 사용자당 배열 통짜 read/write.
 * ALLOWED_EMAILS 소수 인원 화이트리스트 전제라 개별 자료구조는 과설계.
 * @see plan.md §9.4.3
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function holdingsKey(email: string): string {
  return `holdings:${normalizeEmail(email)}`;
}

function historyKey(email: string): string {
  return `holdings:${normalizeEmail(email)}:history`;
}

export { todayKstDate } from "@/lib/date/kst";

export async function getHoldings(email: string): Promise<Holding[]> {
  const holdings = await getRedis().get<Holding[]>(holdingsKey(email));
  return holdings ?? [];
}

export async function saveHoldings(
  email: string,
  holdings: Holding[]
): Promise<void> {
  await getRedis().set(holdingsKey(email), holdings);
}

/** 일별 기록 전체 (날짜 오름차순) */
export async function getPortfolioHistory(
  email: string
): Promise<PortfolioDailyRecord[]> {
  const records = await getRedis().get<PortfolioDailyRecord[]>(
    historyKey(email)
  );
  return (records ?? []).sort((a, b) => a.date.localeCompare(b.date));
}

/** 같은 날짜 기록이 있으면 덮어쓴다 (재실행 안전) */
export async function upsertPortfolioHistory(
  email: string,
  record: PortfolioDailyRecord
): Promise<void> {
  const records = await getPortfolioHistory(email);
  const next = records.filter((row) => row.date !== record.date);
  next.push(record);
  next.sort((a, b) => a.date.localeCompare(b.date));
  await getRedis().set(historyKey(email), next);
}
