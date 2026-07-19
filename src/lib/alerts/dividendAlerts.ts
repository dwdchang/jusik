import { todayKstDate } from "@/lib/date/kst";
import { formatKrw } from "@/lib/format/krw";
import { getStockInfoBlocksMap } from "@/lib/market/store";
import { sendPushToEmail } from "@/lib/push/send";
import type { Holding } from "@/types/holdings";
import {
  getMutedSymbols,
  markDividendAlertSent,
  wasDividendAlertSent,
} from "./store";

/**
 * 배당 지급일 당일 알림 — Phase 25 (plan.md §25). feeds 갱신 잡(refreshFeeds)의
 * 알림 훅에서만 호출된다 (매일 08~22시 매시 실행 — 첫 회차 08시에 당일 발송).
 * 대상은 보유 사용자만(관심종목 제외 — 사용자 확정). KIS 추가 호출 없이
 * 저장된 `market:stockInfo:{code}`의 확정 회차(rounds)에서 지급일이 KST 오늘인
 * 종목을 찾아 발송한다. 중복 방지는 종목×지급일 전역 마커(EX 2일)로, 공시·시장경보
 * 훅의 "중복 방지 우선" 관례대로 발송 결과와 무관하게 먼저 기록한다.
 */

export interface DividendAlertsReport {
  /** 오늘이 지급일인 종목 수 (마커로 걸러지기 전) */
  dueSymbols: number;
  /** 마커가 있어 건너뛴 종목 수 (같은 날 이전 회차에 이미 발송) */
  alreadySent: number;
  /** 발송 성공(도달 기기 ≥1) 건수 — 이메일×종목 단위 */
  sent: number;
  /** 음소거로 건너뛴 건수 */
  mutedSkipped: number;
}

interface DueDividend {
  symbolCode: string;
  payDate: string;
  kind: string | null;
  /** 같은 지급일 회차가 여럿이면 주당배당금 합산 */
  amountPerShare: number;
}

export async function evaluateDividendAlerts(context: {
  holdingsByEmail: Map<string, Holding[]>;
  /** 종목코드→종목명 — 없으면 코드로 표기 */
  names: Map<string, string>;
}): Promise<DividendAlertsReport> {
  const report: DividendAlertsReport = {
    dueSymbols: 0,
    alreadySent: 0,
    sent: 0,
    mutedSkipped: 0,
  };

  // 1. 보유종목 union(관심종목 제외)에서 지급일이 오늘인 확정 회차 추출
  const heldCodes = [
    ...new Set(
      [...context.holdingsByEmail.values()]
        .flat()
        .map((holding) => holding.symbolCode)
    ),
  ];
  if (heldCodes.length === 0) {
    return report;
  }

  const today = todayKstDate();
  const blocksBySymbol = await getStockInfoBlocksMap(heldCodes);

  const dueBySymbol = new Map<string, DueDividend>();
  for (const [symbolCode, blocks] of blocksBySymbol) {
    const todayRounds = (blocks.dividend?.rounds ?? []).filter(
      (round) => round.payDate === today && round.amountPerShare > 0
    );
    if (todayRounds.length === 0) {
      continue;
    }
    dueBySymbol.set(symbolCode, {
      symbolCode,
      payDate: today,
      kind: todayRounds[0].kind,
      amountPerShare: todayRounds.reduce(
        (sum, round) => sum + round.amountPerShare,
        0
      ),
    });
  }
  report.dueSymbols = dueBySymbol.size;
  if (dueBySymbol.size === 0) {
    return report;
  }

  // 2. 종목×지급일 마커로 이미 발송한 종목 제외 → 남은 종목은 발송 전에 마커 기록
  const dueList: DueDividend[] = [];
  for (const due of dueBySymbol.values()) {
    if (await wasDividendAlertSent(due.symbolCode, due.payDate)) {
      report.alreadySent += 1;
      continue;
    }
    await markDividendAlertSent(due.symbolCode, due.payDate);
    dueList.push(due);
  }
  if (dueList.length === 0) {
    return report;
  }

  // 3. 보유 사용자에게만 발송 — 음소거 공유, 이메일 단위 실패 격리
  for (const [email, holdings] of context.holdingsByEmail) {
    const quantityByCode = new Map(
      holdings.map((holding) => [holding.symbolCode, holding.quantity])
    );
    const myDue = dueList.filter((due) => quantityByCode.has(due.symbolCode));
    if (myDue.length === 0) {
      continue;
    }

    try {
      const mutedSet = new Set(await getMutedSymbols(email));

      for (const due of myDue) {
        if (mutedSet.has(due.symbolCode)) {
          report.mutedSkipped += 1;
          continue;
        }

        const name =
          context.names.get(due.symbolCode)?.trim() || due.symbolCode;
        const quantity = quantityByCode.get(due.symbolCode) ?? 0;
        const expected = due.amountPerShare * quantity;

        const sendReport = await sendPushToEmail(email, {
          title: `배당 지급일 — ${name}`,
          body: `오늘은 ${due.kind !== null ? `${due.kind} ` : ""}배당 지급일입니다. 주당 ${formatKrw(
            due.amountPerShare
          )} × ${quantity}주 = 예상 ${formatKrw(expected)} (세전)`,
          url: "/dividends",
          tag: `dividend-${due.symbolCode}-${due.payDate}`,
        });
        if (sendReport.sent > 0) {
          report.sent += 1;
        }
      }
    } catch (error) {
      console.error(`[alerts] dividend alert failed (${email}):`, error);
    }
  }

  return report;
}
