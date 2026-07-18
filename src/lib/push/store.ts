import {
  decryptJson,
  encryptJson,
  isEncrypted,
} from "@/lib/crypto/secureJson";
import { getRedis } from "@/lib/redis/client";

/**
 * 웹 푸시 구독 Redis 저장소 — 사용자당 배열 통짜 read/write (holdings store와 동일 패턴).
 * 구독 endpoint URL은 소지자가 곧 발송 권한이므로 개인 데이터와 같은 기준으로
 * 저장 전 암호화·조회 시 복호화한다 (plan.md §12).
 */

/** 브라우저 PushSubscription.toJSON()에서 저장하는 부분 */
export interface StoredPushSubscription {
  /** 푸시 서비스 발송 주소 — 구독의 고유 식별자로도 사용 */
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  /** 등록 시각 ISO */
  createdAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function subsKey(email: string): string {
  return `push:subs:${normalizeEmail(email)}`;
}

export async function getPushSubscriptions(
  email: string
): Promise<StoredPushSubscription[]> {
  const stored = await getRedis().get<string>(subsKey(email));

  if (stored == null) {
    return [];
  }
  if (isEncrypted(stored)) {
    return decryptJson<StoredPushSubscription[]>(stored);
  }

  // 이 키는 도입 시점부터 암호화 저장이므로 평문 하위호환이 없다
  throw new Error(`push store: unexpected value type for ${subsKey(email)}`);
}

async function savePushSubscriptions(
  email: string,
  subscriptions: StoredPushSubscription[]
): Promise<void> {
  const redis = getRedis();
  if (subscriptions.length === 0) {
    await redis.del(subsKey(email));
    return;
  }
  await redis.set(subsKey(email), encryptJson(subscriptions));
}

/** 같은 endpoint가 이미 있으면 키만 갱신한다(브라우저 재구독 시 endpoint 유지 가능) */
export async function addPushSubscription(
  email: string,
  subscription: Omit<StoredPushSubscription, "createdAt">
): Promise<void> {
  const existing = await getPushSubscriptions(email);
  const next = existing.filter(
    (item) => item.endpoint !== subscription.endpoint
  );
  next.push({ ...subscription, createdAt: new Date().toISOString() });
  await savePushSubscriptions(email, next);
}

export async function removePushSubscription(
  email: string,
  endpoint: string
): Promise<void> {
  const existing = await getPushSubscriptions(email);
  const next = existing.filter((item) => item.endpoint !== endpoint);
  if (next.length !== existing.length) {
    await savePushSubscriptions(email, next);
  }
}

/** 발송 실패(410/404)로 무효가 된 구독 정리 — 발송 경로(send.ts)에서만 호출 */
export async function prunePushSubscriptions(
  email: string,
  invalidEndpoints: string[]
): Promise<void> {
  if (invalidEndpoints.length === 0) {
    return;
  }
  const invalid = new Set(invalidEndpoints);
  const existing = await getPushSubscriptions(email);
  const next = existing.filter((item) => !invalid.has(item.endpoint));
  if (next.length !== existing.length) {
    await savePushSubscriptions(email, next);
  }
}
