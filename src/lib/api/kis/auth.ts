import { getRedis } from "@/lib/redis/client";
import { KIS_BASE_URL, KIS_ENDPOINTS } from "./constants";
import type { KisTokenResponse } from "./types";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const TOKEN_KEY = "kis:access_token";
const LOCK_KEY = "kis:access_token:lock";

/** 만료 60초 전이면 갱신한다. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** 락 최대 보유 시간 — 발급 요청이 비정상 종료돼도 이 시간 후 자동 해제된다. */
const LOCK_TTL_MS = 10_000;

/** 락을 점유하지 못했을 때 재시도 간격/횟수 (총 대기 5초). */
const LOCK_WAIT_RETRY_MS = 250;
const LOCK_WAIT_MAX_ATTEMPTS = 20;

/** 동일 인스턴스 내 동시 요청을 하나의 발급 호출로 합류시킨다. */
let inflight: Promise<string> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCredentials(): { appKey: string; appSecret: string } {
  const appKey = process.env.KIS_APP_KEY?.trim();
  const appSecret = process.env.KIS_APP_SECRET?.trim();

  if (!appKey || !appSecret) {
    throw new Error("KIS_APP_KEY / KIS_APP_SECRET is not set");
  }

  return { appKey, appSecret };
}

async function readCachedToken(): Promise<CachedToken | null> {
  const redis = getRedis();
  const cached = await redis.get<CachedToken>(TOKEN_KEY);
  return cached ?? null;
}

function isValid(cached: CachedToken | null, now: number): cached is CachedToken {
  return !!cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > now;
}

async function requestNewToken(): Promise<CachedToken> {
  const { appKey, appSecret } = getCredentials();

  const response = await fetch(`${KIS_BASE_URL}${KIS_ENDPOINTS.TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KIS token HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as KisTokenResponse;

  if (!data.access_token) {
    throw new Error(
      `KIS token issue failed: ${data.error_description ?? "no access_token"}`
    );
  }

  const expiresInMs = (data.expires_in ?? 86_400) * 1000;

  return {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };
}

/** 발급된 토큰을 만료 시각까지의 TTL로 Redis에 저장한다. */
async function writeCachedToken(cached: CachedToken): Promise<void> {
  const redis = getRedis();
  const ttlSeconds = Math.max(1, Math.floor((cached.expiresAt - Date.now()) / 1000));
  await redis.set(TOKEN_KEY, cached, { ex: ttlSeconds });
}

/**
 * 락을 점유하지 못한 인스턴스는 락을 쥔 다른 인스턴스가 Redis에 써준
 * 토큰이 나타날 때까지 짧게 폴링한다.
 */
async function waitForPeerIssuedToken(): Promise<string> {
  for (let attempt = 0; attempt < LOCK_WAIT_MAX_ATTEMPTS; attempt++) {
    await sleep(LOCK_WAIT_RETRY_MS);

    const cached = await readCachedToken();
    if (isValid(cached, Date.now())) {
      console.log("[KIS][auth] cache hit (token issued by peer instance)");
      return cached.token;
    }
  }

  throw new Error("Timed out waiting for KIS token issued by peer instance");
}

/**
 * Redis 락(`SET NX PX`)으로 다중 인스턴스 간 동시 발급을 막는다.
 * 락을 점유한 인스턴스만 실제로 KIS 토큰 발급 API를 호출한다.
 */
async function issueTokenWithLock(): Promise<string> {
  const redis = getRedis();

  const gotLock =
    (await redis.set(LOCK_KEY, "1", { nx: true, px: LOCK_TTL_MS })) === "OK";

  if (!gotLock) {
    console.log("[KIS][auth] lock held by another instance — waiting");
    return waitForPeerIssuedToken();
  }

  try {
    // 락 대기 중 다른 인스턴스가 이미 갱신했을 수 있으므로 한 번 더 확인한다.
    const cached = await readCachedToken();
    if (isValid(cached, Date.now())) {
      console.log("[KIS][auth] cache hit (double-check after acquiring lock)");
      return cached.token;
    }

    console.log("[KIS][auth] cache miss — issuing new token");
    const issued = await requestNewToken();
    await writeCachedToken(issued);
    return issued.token;
  } finally {
    await redis.del(LOCK_KEY);
  }
}

/**
 * 유효한 KIS Access Token을 반환한다.
 * - Redis 캐시가 유효하면 재사용 (다중 인스턴스 공유)
 * - 동일 인스턴스의 동시 요청은 `inflight` 프로미스로 합류
 * - 인스턴스 간 동시 발급은 Redis 락으로 방지
 */
export async function getKisAccessToken(): Promise<string> {
  const cached = await readCachedToken();
  if (isValid(cached, Date.now())) {
    console.log("[KIS][auth] cache hit");
    return cached.token;
  }

  if (inflight) {
    console.log("[KIS][auth] joining in-flight local request");
    return inflight;
  }

  inflight = issueTokenWithLock().finally(() => {
    inflight = null;
  });

  return inflight;
}
