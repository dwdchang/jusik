import { todayKstDate } from "@/lib/date/kst";
import { getHoldings } from "@/lib/holdings/store";
import { getStockInfoBlocksMap } from "@/lib/market/store";

/**
 * 배당 일정 리더 — Phase 25 (plan.md §25).
 * 대상은 보유종목만(관심종목 제외 — 사용자 확정). 시세 잡이 저장한
 * `market:stockInfo:{code}`의 확정 회차(rounds)를 보유수량과 합류해
 * 상세 목록(/dividends)과 홈 카드 요약을 만든다 — KIS 호출 0건.
 * 예상 지급액은 읽기 시 곱셈만(주당배당금 × 현재 보유수량) — 공용 rounds에
 * 개인 수량을 섞지 않는다 (쓰기/읽기 분리 유지).
 */

/** /dividends 상세 목록 1행 — 보유종목의 확정 배당 회차 */
export interface DividendScheduleRow {
  symbolCode: string;
  /** 종목명 — 미확정이면 종목코드 */
  name: string;
  /** 배당종류 — "분기" | "결산" 등, 없으면 null */
  kind: string | null;
  /** 배당 기준일 "YYYY-MM-DD" */
  recordDate: string;
  /** 현금배당 지급일 "YYYY-MM-DD" — 공시 확정 전이면 null ("미정" 표기) */
  payDate: string | null;
  /** 주당배당금(원) */
  amountPerShare: number;
  /** 현재 보유수량(주) */
  quantity: number;
  /** 예상 지급액(원, 세전) = 주당배당금 × 현재 보유수량 */
  expectedAmount: number;
}

/** 홈 "배당 일정" 카드 1행 — 다가오는 지급일 */
export interface DividendCardEntry {
  symbolCode: string;
  name: string;
  /** 지급일 "YYYY-MM-DD" (오늘 이후 확정분만) */
  payDate: string;
  /** 주당배당금(원) */
  amountPerShare: number;
}

export interface DividendCardSummary {
  /** 지급일이 오늘 이후인 행 오름차순 상위 3 — 없으면 빈 배열 (placeholder) */
  upcoming: DividendCardEntry[];
}

/**
 * 보유종목의 배당 회차를 병합한 상세 목록 — 지급일 미정 → 미래 → 과거 순.
 * 보유종목이 없거나 저장된 회차가 없으면 빈 배열 (화면에 emptyNotice).
 */
export async function getDividendSchedule(
  email: string
): Promise<DividendScheduleRow[]> {
  const holdings = await getHoldings(email);

  if (holdings.length === 0) {
    return [];
  }

  const blocksBySymbol = await getStockInfoBlocksMap(
    [...new Set(holdings.map((holding) => holding.symbolCode))]
  );

  const rows: DividendScheduleRow[] = [];
  for (const holding of holdings) {
    const rounds = blocksBySymbol.get(holding.symbolCode)?.dividend?.rounds;
    if (rounds === undefined) {
      continue;
    }
    for (const round of rounds) {
      rows.push({
        symbolCode: holding.symbolCode,
        name: holding.name || holding.symbolCode,
        kind: round.kind,
        recordDate: round.recordDate,
        payDate: round.payDate,
        amountPerShare: round.amountPerShare,
        quantity: holding.quantity,
        expectedAmount: round.amountPerShare * holding.quantity,
      });
    }
  }

  // 미정(지급일 확정 대기 — 대개 최신 회차)이 맨 위, 이어 미래→과거 지급일 내림차순
  rows.sort((a, b) =>
    (b.payDate ?? "9999-12-31").localeCompare(a.payDate ?? "9999-12-31")
  );
  return rows;
}

/**
 * 홈 "배당 일정" 카드 요약 — 지급일이 오늘(KST) 이후인 행 오름차순 상위 3.
 * 실패 시 null — 홈 전체를 막지 않는다 (카드 요약 격리 관례).
 */
export async function getDividendCardSummary(
  email: string
): Promise<DividendCardSummary | null> {
  try {
    const rows = await getDividendSchedule(email);
    const today = todayKstDate();

    const upcoming = rows
      .filter(
        (row): row is DividendScheduleRow & { payDate: string } =>
          row.payDate !== null && row.payDate >= today
      )
      .sort((a, b) => a.payDate.localeCompare(b.payDate))
      .slice(0, 3)
      .map((row) => ({
        symbolCode: row.symbolCode,
        name: row.name,
        payDate: row.payDate,
        amountPerShare: row.amountPerShare,
      }));

    return { upcoming };
  } catch (error) {
    console.error("[getDividendCardSummary] failed:", error);
    return null;
  }
}
