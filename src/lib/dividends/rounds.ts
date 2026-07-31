import {
  getDividendDecisionSnapshots,
  type DividendDecisionItem,
} from "@/lib/feeds/store";
import { getStockInfoBlocksMap, type DividendRound } from "@/lib/market/store";

/**
 * 배당 회차 병합 — 예탁원(KIS) + 배당결정 공시(DART) (Phase 83, plan.md §83.2).
 *
 * 「내 배당」·홈 배당 카드·지급일 알림이 읽는 회차는 원래 KIS 예탁원 배당일정
 * (`market:stockInfo:{code}`의 `dividend.rounds`) 하나였다. 그런데 예탁원은 이사회
 * 결의를 며칠 늦게 반영한다 — 2026-07-30 실측에서 삼성전자 26.2Q 분기배당(주당 374원,
 * 기준일 2026-06-30, 지급 2026-08-28)이 DART엔 그날 접수됐는데 예탁원은 같은 회차를
 * `per_sto_divi_amt=0`(미확정)으로 줬고, 확정분만 담는 `rounds`에서 통째로 빠졌다.
 *
 * 그래서 **예탁원을 본 소스로 두고, 예탁원에 없는 값만 공시로 메운다.**
 * 예탁원이 나중에 채우면 다음 갱신 회차부터 자연히 예탁원 값이 이긴다(정정도 그쪽이
 * 반영한다). 병합은 순수 함수라 읽기 경로 어디서든 같은 결과를 준다.
 *
 * **Phase 94 — 보완 단위를 회차에서 필드로 낮췄다.** 예탁원은 한 회차를 한 번에
 * 확정하지 않는다. 2026-07-31 실측에서 위 삼성전자 26.2Q가 `per_sto_divi_amt=374`로는
 * 채워졌는데 `divi_pay_dt`는 여전히 공란이었다. 회차 단위로 우선순위를 매기던 규칙에선
 * 그 기준일이 "예탁원에 있음"으로 잡혀 공시가 이미 알던 지급일(2026-08-28)까지 버려졌고,
 * 지급일로 거르는 홈 배당 카드에서 회차가 **나왔다 사라졌다**. 그래서 같은 기준일이면
 * 예탁원 회차를 살리되 **비어 있는 지급일만** 공시 값으로 채우고 `source`를 `mixed`로
 * 남긴다(금액·종류는 정정 경로인 예탁원 값을 그대로 둔다).
 *
 * **한계**: 배당결정 공시는 보통주 법인 명의로만 접수되고 우선주(005935 등)는 DART
 * 고유번호가 없어 수집 대상에서 빠진다 — 우선주 보유분은 예탁원이 채울 때까지 기다린다.
 */

/** 병합된 배당 회차 1건 — 화면·알림이 공통으로 쓰는 모양 */
export interface ScheduledDividendRound {
  /** 배당 기준일 "YYYY-MM-DD" */
  recordDate: string;
  /** 배당종류 — "분기" | "결산" | "중간" 등 */
  kind: string | null;
  /** 주당배당금(원) */
  amountPerShare: number;
  /** 현금배당 지급일 "YYYY-MM-DD" — 확정 전이면 null ("미정" 표기) */
  payDate: string | null;
  /**
   * 값의 출처 — 예탁원(기본) / 배당결정 공시(회차 통째로 예탁원 미반영) /
   * 혼합(예탁원 회차에 공시 지급일만 채움, Phase 94)
   */
  source: "ksd" | "dart" | "mixed";
}

/**
 * 배당결정 공시 → 회차 후보. 기준일·주당배당금이 없으면(현물배당만·파싱 실패) 버린다.
 * 같은 기준일이 여러 건이면(원본 + `[기재정정]`) **접수번호가 큰 쪽**, 즉 나중에
 * 접수된 정정본을 남긴다 — 실적 스냅샷의 정정본 처리와 같은 규칙이다.
 */
function decisionRounds(
  items: DividendDecisionItem[]
): Map<string, ScheduledDividendRound> {
  const byRecordDate = new Map<
    string,
    { round: ScheduledDividendRound; rceptNo: string }
  >();

  for (const item of items) {
    if (
      item.recordDate === null ||
      item.perShare === null ||
      item.perShare <= 0
    ) {
      continue;
    }

    const existing = byRecordDate.get(item.recordDate);
    if (existing !== undefined && existing.rceptNo >= item.rceptNo) {
      continue;
    }

    byRecordDate.set(item.recordDate, {
      rceptNo: item.rceptNo,
      round: {
        recordDate: item.recordDate,
        kind: item.kind,
        amountPerShare: item.perShare,
        payDate: item.payDate,
        source: "dart",
      },
    });
  }

  return new Map(
    [...byRecordDate].map(([recordDate, entry]) => [recordDate, entry.round])
  );
}

/**
 * 예탁원 회차(빈 지급일은 공시로 보완) + 예탁원에 없는 공시 회차 → 기준일 오름차순.
 * 보완 대상이 지급일뿐인 것은 나머지 필드엔 메울 구멍이 없기 때문이다 — 기준일은 대조
 * 키고, 금액은 0원(미확정)이면 예탁원 회차 자체가 만들어지지 않으며, 종류는 예탁원이
 * 항상 준다.
 */
export function mergeDividendRounds(
  ksdRounds: DividendRound[] | undefined,
  decisions: DividendDecisionItem[] | undefined
): ScheduledDividendRound[] {
  const fromDecisions = decisionRounds(decisions ?? []);

  const merged: ScheduledDividendRound[] = (ksdRounds ?? []).map((round) => {
    const decision = fromDecisions.get(round.recordDate);
    if (
      round.payDate === null &&
      decision !== undefined &&
      decision.payDate !== null
    ) {
      return { ...round, payDate: decision.payDate, source: "mixed" };
    }
    return { ...round, source: "ksd" };
  });

  const covered = new Set(merged.map((round) => round.recordDate));
  for (const [recordDate, round] of fromDecisions) {
    if (!covered.has(recordDate)) {
      merged.push(round);
    }
  }

  return merged.sort((a, b) => a.recordDate.localeCompare(b.recordDate));
}

/**
 * 종목별 병합 회차 일괄 조회 — 두 스냅샷을 병렬 MGET(각 1회)한다.
 * 회차가 하나도 없는 종목은 맵에서 빠진다.
 */
export async function getDividendRoundsMap(
  symbolCodes: string[]
): Promise<Map<string, ScheduledDividendRound[]>> {
  if (symbolCodes.length === 0) {
    return new Map();
  }

  const [blocksBySymbol, decisionsBySymbol] = await Promise.all([
    getStockInfoBlocksMap(symbolCodes),
    // 공시 보완은 부가 정보라 실패해도 예탁원 회차만으로 계속 간다
    getDividendDecisionSnapshots(symbolCodes).catch((error: unknown) => {
      console.error("[dividends] decision snapshot read failed:", error);
      return new Map<string, { items: DividendDecisionItem[] }>();
    }),
  ]);

  const byCode = new Map<string, ScheduledDividendRound[]>();
  for (const symbolCode of symbolCodes) {
    const rounds = mergeDividendRounds(
      blocksBySymbol.get(symbolCode)?.dividend?.rounds,
      decisionsBySymbol.get(symbolCode)?.items
    );
    if (rounds.length > 0) {
      byCode.set(symbolCode, rounds);
    }
  }
  return byCode;
}
