"use server";

import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getStockMaster, type StockMasterItem } from "@/lib/market/store";

/**
 * 종목명 검색 Server Action — 등록 폼(보유·관심종목)의 코드 직접 입력을 대체 (§17.11).
 * KIS를 직접 호출하지 않고, 잡이 저장한 market:stockMaster 스냅샷만 읽어
 * 종목명 부분일치(또는 코드 부분일치)로 상위 20건을 돌려준다.
 */

export interface StockSearchResult {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
}

const MAX_RESULTS = 20;

/** 접두 일치 > 부분 일치 순으로 정렬하기 위한 점수 (낮을수록 우선) */
function matchScore(item: StockMasterItem, lowerQuery: string): number {
  const lowerName = item.name.toLowerCase();
  if (lowerName === lowerQuery) return 0;
  if (lowerName.startsWith(lowerQuery)) return 1;
  if (item.code.startsWith(lowerQuery)) return 2;
  return 3;
}

export async function searchStocks(
  query: string
): Promise<StockSearchResult[]> {
  // 로그인·허용 사용자만 — 마스터 자체는 공개 데이터지만 앱 접근 정책과 일관되게 막는다
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isEmailAllowed(email)) {
    return [];
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const master = await getStockMaster();
  if (master === null) {
    return [];
  }

  const lowerQuery = trimmed.toLowerCase();
  const isCodeLike = /^[0-9a-z]{2,6}$/i.test(trimmed);

  const matched = master.items.filter(
    (item) =>
      item.name.toLowerCase().includes(lowerQuery) ||
      (isCodeLike && item.code.toLowerCase().includes(lowerQuery))
  );

  matched.sort((a, b) => {
    const scoreDiff = matchScore(a, lowerQuery) - matchScore(b, lowerQuery);
    if (scoreDiff !== 0) return scoreDiff;
    // 동점이면 종목명 가나다순으로 안정 정렬
    return a.name.localeCompare(b.name, "ko");
  });

  return matched.slice(0, MAX_RESULTS).map((item) => ({
    code: item.code,
    name: item.name,
    market: item.market,
  }));
}
