import {
  getDividendRanking,
  type DividendRankingEntry,
} from "./store";

/**
 * 배당률 순위 리더 — Phase 43 (plan.md §43).
 * 갱신 잡이 저장한 `market:dividendRanking`을 화면이 그대로 읽는다 — KIS 호출 0건.
 */

/** 순위 탭 — 일반종목(주권) / 배당상품(ETF·리츠·인프라펀드) (Phase 46) */
export type DividendRankingCategory = "stock" | "product";

export interface DividendRankingView {
  /** 산출 기준일 "YYYY-MM-DD" */
  computedFor: string;
  /** 해당 탭의 스캔 대상 종목 수 — "전 종목 N개 중" 표기용 */
  universeCount: number;
  entries: DividendRankingEntry[];
}

/**
 * 탭별 저장 순위를 읽는다 (Phase 46). 해당 탭 목록이 비어 있으면 null —
 * 화면은 emptyNotice로 대체한다. 배당상품 필드는 구 스키마에 없어 폴백한다.
 */
export async function getDividendRankingView(
  category: DividendRankingCategory = "stock"
): Promise<DividendRankingView | null> {
  const stored = await getDividendRanking();

  if (stored === null) {
    return null;
  }

  const entries =
    category === "product" ? stored.productEntries ?? [] : stored.entries;
  const universeCount =
    category === "product"
      ? stored.productUniverseCount ?? 0
      : stored.universeCount;

  if (entries.length === 0) {
    return null;
  }

  return {
    computedFor: stored.computedFor,
    universeCount,
    entries,
  };
}

// 표시 포매터(formatPayoutCycle·formatConsecutiveYears·formatStockDividend·
// dartDisclosureUrl·surgeTooltip)는 클라이언트 안전 모듈 `./format`로 이관됐다
// (Phase 51) — 이 리더는 Redis 클라이언트를 import하므로 클라이언트 컴포넌트가
// 포매터만 쓰려고 이 파일을 import하면 번들이 오염된다.
