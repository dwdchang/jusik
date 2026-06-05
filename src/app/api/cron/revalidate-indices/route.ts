import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/api/data-go-kr/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return false;
  }

  const expected = `Bearer ${secret}`;
  const authBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);

  if (authBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(authBuffer, expectedBuffer);
}

/**
 * Vercel Cron — 평일 14:00 KST (05:00 UTC) 지수 캐시 무효화
 * @see vercel.json crons
 */
export async function GET(request: Request) {
  if (!isValidCronSecret(request)) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const revalidatedAt = new Date().toISOString();

  for (const tag of CACHE_TAGS) {
    revalidateTag(tag, "max");
  }

  return Response.json({
    ok: true,
    revalidatedAt,
    tags: [...CACHE_TAGS],
    message:
      "Cache tags marked stale (profile=max). Fresh data loads on next visit.",
  });
}
