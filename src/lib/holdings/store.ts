import {
  decryptJson,
  encryptJson,
  isEncrypted,
} from "@/lib/crypto/secureJson";
import { getRedis } from "@/lib/redis/client";
import type { Holding, PortfolioDailyRecord } from "@/types/holdings";

/**
 * 보유종목 Redis 저장소 — 사용자당 배열 통짜 read/write.
 * ALLOWED_EMAILS 소수 인원 화이트리스트 전제라 개별 자료구조는 과설계.
 * 개인 자산 정보이므로 저장 전 암호화·조회 시 복호화한다 (plan.md §12).
 * @see plan.md §9.4.3, §12.3
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

/**
 * 읽기 하위호환 — `enc:v1:` 문자열이면 복호화, 배열이면 레거시 평문 그대로.
 * 쓰기는 항상 암호화하므로 레거시 값은 다음 저장 시 자연 마이그레이션된다 (plan.md §12.4).
 */
async function readStoredArray<T>(key: string): Promise<T[]> {
  const stored = await getRedis().get<T[] | string>(key);

  if (stored == null) {
    return [];
  }
  if (isEncrypted(stored)) {
    return decryptJson<T[]>(stored);
  }
  if (Array.isArray(stored)) {
    return stored;
  }

  throw new Error(`holdings store: unexpected value type for ${key}`);
}

export async function getHoldings(email: string): Promise<Holding[]> {
  return readStoredArray<Holding>(holdingsKey(email));
}

export async function saveHoldings(
  email: string,
  holdings: Holding[]
): Promise<void> {
  await getRedis().set(holdingsKey(email), encryptJson(holdings));
}

/** 일별 기록 전체 (날짜 오름차순) */
export async function getPortfolioHistory(
  email: string
): Promise<PortfolioDailyRecord[]> {
  const records = await readStoredArray<PortfolioDailyRecord>(
    historyKey(email)
  );
  return records.sort((a, b) => a.date.localeCompare(b.date));
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
  await getRedis().set(historyKey(email), encryptJson(next));
}
