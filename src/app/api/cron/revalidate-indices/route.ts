import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { fetchKisIndexDaily } from "@/lib/api/kis/client";
import { KIS_CACHE_TAGS } from "@/lib/api/kis/constants";
import { getAllowedEmails } from "@/lib/auth/allowedEmails";
import { todayKstDate } from "@/lib/date/kst";
import { getHoldings, upsertPortfolioHistory } from "@/lib/holdings/store";
import { getPortfolioValuation } from "@/lib/holdings/valuation";
import {
  computeVolatilityRecords,
  upsertVolatilityRecords,
} from "@/lib/indices/volatility";

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 코스피 일자별 응답 → kospiVolatility:history upsert (있는 거래일 전부 백필) */
async function recordVolatility(): Promise<
  { ok: true; upserted: number } | { ok: false; error: string }
> {
  try {
    const records = computeVolatilityRecords(await fetchKisIndexDaily("KOSPI"));
    await upsertVolatilityRecords(records);
    return { ok: true, upserted: records.length };
  } catch (error) {
    console.error("[cron] volatility upsert failed:", error);
    return { ok: false, error: errorMessage(error) };
  }
}

/** 허용 이메일별 보유종목 평가 → holdings:{email}:history에 오늘 기록 upsert */
async function recordHoldingsHistory(): Promise<
  Array<{ email: string; ok: boolean; skipped?: true; error?: string }>
> {
  const date = todayKstDate();

  return Promise.all(
    getAllowedEmails().map(async (email) => {
      try {
        const holdings = await getHoldings(email);

        if (holdings.length === 0) {
          return { email, ok: true, skipped: true as const };
        }

        const { totalCost, totalValue } = await getPortfolioValuation(holdings);
        await upsertPortfolioHistory(email, { date, totalCost, totalValue });
        return { email, ok: true };
      } catch (error) {
        console.error(`[cron] holdings upsert failed for ${email}:`, error);
        return { email, ok: false, error: errorMessage(error) };
      }
    })
  );
}

/**
 * Vercel Cron — 평일 18:15 KST 단일 실행:
 * 지수 캐시 무효화 → 코스피 변동성 히스토리 upsert → 보유종목 일별 기록 upsert
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

  // 캐시를 먼저 비워 이후 KIS 호출(변동성·보유종목 현재가)이 확정치를 새로 받아오게 한다
  for (const tag of KIS_CACHE_TAGS) {
    revalidateTag(tag, { expire: 0 });
  }

  const [volatility, holdings] = await Promise.all([
    recordVolatility(),
    recordHoldingsHistory(),
  ]);

  const ok = volatility.ok && holdings.every((result) => result.ok);

  return Response.json(
    {
      ok,
      revalidatedAt,
      tags: [...KIS_CACHE_TAGS],
      volatility,
      holdings,
    },
    { status: ok ? 200 : 500 }
  );
}
