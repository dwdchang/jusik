import { subtractMonths } from "@/lib/date/kst";
import {
  getTradeDetailMonths,
  getTradeStats,
  type StoredTradeStats,
  type TradeStatMonth,
} from "@/lib/feeds/store";

/**
 * 수출입 통계 뷰 빌더 — Phase 17-4 (plan.md §17-4).
 * `/indices/market` 미니 카드와 `/feeds` 수출입 탭이 공유하는 읽기 전용 파생 모델.
 * 저장 스냅샷(확정월 최신순)에서 최신 확정월 + 전년동월비(YoY)를 계산한다.
 */

/** 최신 확정월 요약 — 미니 카드용 (YoY 없으면 null) */
export interface TradeStatsLatest {
  yyyymm: string;
  expDlr: number;
  impDlr: number;
  balPayments: number;
  /** 수출 전년동월비 % — 전년동월 데이터 없으면 null */
  expYoy: number | null;
  /** 수입 전년동월비 % — 전년동월 데이터 없으면 null */
  impYoy: number | null;
}

/** 수출입 탭·카드 공용 뷰 모델 */
export interface TradeStatsView {
  latest: TradeStatsLatest;
  /** 최근 월 내림차순 (최신월 포함) — 탭 표 표시용 */
  months: TradeStatMonth[];
  /**
   * 상세(`/indices/trade/{yyyymm}`)를 확보한 달 — 탭 표가 링크를 걸 대상 (§17.15).
   * 상세는 갱신 잡이 도는 달부터 쌓이므로 months의 부분집합이고, 초기엔 비어 있을 수 있다.
   */
  detailMonths: string[];
  fetchedAt: string;
}

/** 전년동월비 % — base가 0/음수면 계산 불가로 null */
function yoy(current: number, base: number | undefined): number | null {
  if (base === undefined || base <= 0) {
    return null;
  }
  return ((current - base) / base) * 100;
}

/** 저장 스냅샷 → 뷰 모델 (순수). months가 비면 null. */
export function buildTradeStatsView(
  stored: StoredTradeStats | null,
  detailMonths: string[] = []
): TradeStatsView | null {
  const months = stored?.months ?? [];
  const latest = months[0];
  if (latest === undefined) {
    return null;
  }

  const prevYearYm = subtractMonths(latest.yyyymm, 12);
  const base = months.find((m) => m.yyyymm === prevYearYm);

  return {
    latest: {
      yyyymm: latest.yyyymm,
      expDlr: latest.expDlr,
      impDlr: latest.impDlr,
      balPayments: latest.balPayments,
      expYoy: yoy(latest.expDlr, base?.expDlr),
      impYoy: yoy(latest.impDlr, base?.impDlr),
    },
    months,
    detailMonths,
    fetchedAt: stored?.fetchedAt ?? "",
  };
}

/** Redis에서 읽어 뷰 모델로 — 화면(Server Component) 진입점 */
export async function getTradeStatsView(): Promise<TradeStatsView | null> {
  const [stored, detailMonths] = await Promise.all([
    getTradeStats(),
    // 상세 인덱스는 부가 정보라 실패해도 월별 표는 그대로 보여준다 (링크만 빠진다)
    getTradeDetailMonths().catch((error): string[] => {
      console.error("[tradeStats] getTradeDetailMonths failed:", error);
      return [];
    }),
  ]);
  return buildTradeStatsView(stored, detailMonths);
}
