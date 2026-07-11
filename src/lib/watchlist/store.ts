import {
  decryptJson,
  encryptJson,
  isEncrypted,
} from "@/lib/crypto/secureJson";
import { getRedis } from "@/lib/redis/client";
import type { WatchItem } from "@/types/watchlist";

/**
 * 관심종목 Redis 저장소 — 사용자당 배열 통짜 read/write (plan.md §15.4).
 * 어떤 종목을 언제부터 지켜보는지는 투자 의향을 드러내는 개인 데이터라
 * 보유종목과 동일하게 암호화 저장한다 (§15.3). 신규 키라 레거시 평문 없음.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function watchlistKey(email: string): string {
  return `watchlist:${normalizeEmail(email)}`;
}

export async function getWatchlist(email: string): Promise<WatchItem[]> {
  const stored = await getRedis().get<string>(watchlistKey(email));

  if (stored == null) {
    return [];
  }
  if (isEncrypted(stored)) {
    return decryptJson<WatchItem[]>(stored);
  }

  throw new Error(
    `watchlist store: unexpected value type for ${watchlistKey(email)}`
  );
}

export async function saveWatchlist(
  email: string,
  items: WatchItem[]
): Promise<void> {
  await getRedis().set(watchlistKey(email), encryptJson(items));
}
