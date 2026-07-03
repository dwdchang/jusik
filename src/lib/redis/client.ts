import { Redis } from "@upstash/redis";

/**
 * Upstash Redis REST 클라이언트.
 * 서버 전용 — URL/TOKEN은 NEXT_PUBLIC_ 접두사 없이 서버에서만 참조한다.
 */
let redisSingleton: Redis | null = null;

export function getRedis(): Redis {
  if (redisSingleton) {
    return redisSingleton;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN is not set"
    );
  }

  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}
