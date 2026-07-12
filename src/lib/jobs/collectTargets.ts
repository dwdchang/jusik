import { getAllowedEmails } from "@/lib/auth/allowedEmails";
import { getHoldings } from "@/lib/holdings/store";
import { getWatchlist } from "@/lib/watchlist/store";
import type { Holding } from "@/types/holdings";
import type { WatchItem } from "@/types/watchlist";

/**
 * 갱신 잡 공용 — 수집 대상(허용 이메일 전체의 보유·관심종목) 조회.
 * refreshMarketData(시세)·refreshFeeds(공시)가 공유한다 (plan.md §17.2 —
 * refreshMarketData의 로컬 함수를 동작 불변으로 추출한 것).
 */

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface EmailReadResult {
  email: string;
  ok: boolean;
  error?: string;
}

/** 허용 이메일 전체의 보유종목 조회 (이메일별 실패 격리) */
export async function collectHoldings(): Promise<Map<string, Holding[]>> {
  const byEmail = new Map<string, Holding[]>();

  await Promise.all(
    getAllowedEmails().map(async (email) => {
      try {
        byEmail.set(email, await getHoldings(email));
      } catch (error) {
        console.error(`[job] holdings read failed (${email}):`, error);
      }
    })
  );

  return byEmail;
}

/** 허용 이메일 전체의 관심종목 조회 (이메일별 실패 격리, §15.3) */
export async function collectWatchlists(): Promise<{
  byEmail: Map<string, WatchItem[]>;
  results: EmailReadResult[];
}> {
  const byEmail = new Map<string, WatchItem[]>();

  const results = await Promise.all(
    getAllowedEmails().map(async (email) => {
      try {
        byEmail.set(email, await getWatchlist(email));
        return { email, ok: true };
      } catch (error) {
        console.error(`[job] watchlist read failed (${email}):`, error);
        return { email, ok: false, error: errorMessage(error) };
      }
    })
  );

  return { byEmail, results };
}

/** 보유+관심종목의 종목코드 union — 중복 제거 (§15.3, 겹치는 종목은 조회 1회 공유) */
export function unionSymbolCodes(
  holdingsByEmail: Map<string, Holding[]>,
  watchlistsByEmail: Map<string, WatchItem[]>
): string[] {
  return [
    ...new Set([
      ...[...holdingsByEmail.values()]
        .flat()
        .map((holding) => holding.symbolCode),
      ...[...watchlistsByEmail.values()].flat().map((item) => item.symbolCode),
    ]),
  ];
}
