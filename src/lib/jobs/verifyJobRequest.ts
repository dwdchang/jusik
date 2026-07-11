import { timingSafeEqual } from "node:crypto";
import { Receiver } from "@upstash/qstash";

/**
 * 잡 엔드포인트 공용 인증 — Phase 14에서 refresh-market-data 라우트에서 추출 (§14.4).
 * ① QStash 서명(Upstash-Signature JWT) 검증 → ② 실패 시 CRON_SECRET Bearer
 * 폴백(로컬 검증·최초 시딩·장애 시 수동 재실행용).
 */

async function isValidQstashSignature(
  request: Request,
  rawBody: string
): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  const signature = request.headers.get("upstash-signature");

  if (!currentSigningKey || !nextSigningKey || !signature) {
    return false;
  }

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    // URL claim은 프록시·도메인 재구성 편차가 있어 서명·본문 해시·만료만 검증한다
    return await receiver.verify({ signature, body: rawBody });
  } catch (error) {
    console.error("[job] QStash signature verify failed:", error);
    return false;
  }
}

function isValidCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return false;
  }

  const authBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(`Bearer ${secret}`);

  if (authBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(authBuffer, expectedBuffer);
}

/** 인증 통과 시 실행 주체("qstash" | "manual"), 실패 시 null */
export async function verifyJobRequest(
  request: Request,
  rawBody: string
): Promise<"qstash" | "manual" | null> {
  if (await isValidQstashSignature(request, rawBody)) {
    return "qstash";
  }
  if (isValidCronSecret(request)) {
    return "manual";
  }
  return null;
}
