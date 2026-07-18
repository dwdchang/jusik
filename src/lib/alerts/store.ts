import {
  decryptJson,
  encryptJson,
  isEncrypted,
} from "@/lib/crypto/secureJson";
import { getRedis } from "@/lib/redis/client";

/**
 * 시세 알림 Redis 저장소 — Phase 10 2단계 (plan.md §10.2~10.3).
 * 신고가·음소거 목록은 보유종목을 드러내는 개인 데이터라 secureJson 암호화,
 * 쿨다운 키는 TTL(EX 7200) 기반 평문 유지 (§10.6 재검증 결정).
 */

/** 종목별 신고가 — 갱신 시점의 코스피/코스닥 지수를 함께 기록 (단일 값 덮어쓰기) */
export interface StockPeak {
  /** 신고가(원) */
  peakPrice: number;
  /** 신고가 갱신 시점 코스피 */
  kospi: number;
  /** 신고가 갱신 시점 코스닥 */
  kosdaq: number;
  /** ISO */
  updatedAt: string;
}

export type StockPeakMap = Record<string, StockPeak>;

/** 쿨다운 2시간 — 만료는 Redis TTL이 자동 처리 (§10.2) */
const COOLDOWN_TTL_SECONDS = 7200;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function peaksKey(email: string): string {
  return `alerts:${normalizeEmail(email)}:peaks`;
}

function mutedKey(email: string): string {
  return `alerts:${normalizeEmail(email)}:muted`;
}

function cooldownKey(email: string, symbolCode: string): string {
  return `alerts:${normalizeEmail(email)}:cooldown:${symbolCode}`;
}

export async function getStockPeaks(email: string): Promise<StockPeakMap> {
  const stored = await getRedis().get<string>(peaksKey(email));

  if (stored == null) {
    return {};
  }
  if (isEncrypted(stored)) {
    return decryptJson<StockPeakMap>(stored);
  }

  // 이 키는 도입 시점부터 암호화 저장이므로 평문 하위호환이 없다
  throw new Error(`alerts store: unexpected value type for ${peaksKey(email)}`);
}

export async function saveStockPeaks(
  email: string,
  peaks: StockPeakMap
): Promise<void> {
  const redis = getRedis();
  if (Object.keys(peaks).length === 0) {
    await redis.del(peaksKey(email));
    return;
  }
  await redis.set(peaksKey(email), encryptJson(peaks));
}

/** 알림 끈 종목코드 목록 — 시세(2단계)·공시(3단계) 알림이 공유한다 */
export async function getMutedSymbols(email: string): Promise<string[]> {
  const stored = await getRedis().get<string>(mutedKey(email));

  if (stored == null) {
    return [];
  }
  if (isEncrypted(stored)) {
    return decryptJson<string[]>(stored);
  }

  throw new Error(`alerts store: unexpected value type for ${mutedKey(email)}`);
}

export async function saveMutedSymbols(
  email: string,
  symbolCodes: string[]
): Promise<void> {
  const redis = getRedis();
  if (symbolCodes.length === 0) {
    await redis.del(mutedKey(email));
    return;
  }
  await redis.set(mutedKey(email), encryptJson(symbolCodes));
}

/** 쿨다운 중이면 true — 발송 후 2시간 동안 같은 종목 재알림 금지 */
export async function isInCooldown(
  email: string,
  symbolCode: string
): Promise<boolean> {
  return (await getRedis().exists(cooldownKey(email, symbolCode))) > 0;
}

export async function setCooldown(
  email: string,
  symbolCode: string
): Promise<void> {
  await getRedis().set(cooldownKey(email, symbolCode), new Date().toISOString(), {
    ex: COOLDOWN_TTL_SECONDS,
  });
}
