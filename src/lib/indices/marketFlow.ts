import { kstHhmm } from "@/lib/date/kst";
import type {
  HomeIndexFlow,
  IndexDailyRow,
  IntradayFlowSlot,
  InvestorFlowRow,
} from "@/types/indices";

/** 홈 카드 3열 구성 — 상세 「거래대금 · 수급」과 같은 순서, 라벨만 1자로 줄인다 (§86) */
const HOME_INVESTOR_COLUMNS: Array<{
  key: "individual" | "foreign" | "institution";
  label: string;
}> = [
  { key: "individual", label: "개" },
  { key: "foreign", label: "외" },
  { key: "institution", label: "기" },
];

/**
 * 전일 슬롯 중 **현재 시각 이하의 마지막 것**을 고른다 (§70).
 * 표시 중인 값이 "이 시각까지의 누적"이므로 같은 시각 슬롯과 견줘야 사과-사과 비교가 된다.
 * 현재보다 이른 슬롯이 하나도 없으면(개장 직후 등) 가장 이른 슬롯을 쓴다.
 *
 * 상세 화면(`MarketFlowSummary`)과 홈 카드(§86)가 **같은 기준**을 쓰도록 공용화했다.
 */
export function pickBaselineSlot(
  slots: IntradayFlowSlot[],
  hhmm: string
): IntradayFlowSlot | undefined {
  let picked: IntradayFlowSlot | undefined;
  for (const slot of slots) {
    if (slot.hhmm <= hhmm) {
      picked = slot;
    }
  }
  return picked ?? slots[0];
}

/**
 * 같은 부호(순매수/순매도)가 며칠째 이어지는지 (§86). 저장된 일별 수급
 * 최근 20거래일(`market:investor:{market}`)만 보므로 **KIS 추가 호출이 없다**.
 *
 * 당일 행부터 세기 때문에 장중에는 확정값이 아니다 — 당일 누적 부호가 마감까지
 * 뒤집히면 연속일수도 바뀐다(상세 3열이 당일 값을 쓰는 것과 같은 성질).
 * 창(20거래일)을 다 소진하면 `capped`로 알려 화면이 "20일+"로 표기하게 한다.
 * 당일 값이 정확히 0이면 순매수도 순매도도 아니라 `null`(표기 생략).
 */
export function computeFlowStreak(
  rows: InvestorFlowRow[],
  key: "individual" | "foreign" | "institution"
): { days: number; capped: boolean } | null {
  const today = rows[0];
  if (today === undefined || today[key] === 0) {
    return null;
  }

  const positive = today[key] > 0;
  let days = 0;
  for (const row of rows) {
    if (row[key] > 0 !== positive || row[key] === 0) {
      break;
    }
    days += 1;
  }

  return { days, capped: days === rows.length };
}

/**
 * 홈 코스피/코스닥 카드의 거래대금·수급 보조 블록 데이터 (§86).
 *
 * 상세 화면 「거래대금 · 수급」(§69·§70)과 **같은 스냅샷·같은 비교 기준**을 쓴다 —
 * 거래대금은 `dailyRows`, 3열은 `investorRows`의 순매수 금액, 전일 대비는
 * `intradayBaseline`의 같은 시각 슬롯(없으면 전일 종일로 폴백). KIS 호출 0.
 *
 * 거래대금도 수급도 없으면(초기 시딩 전) `null` — 카드가 보조줄을 아예 그리지 않는다.
 */
export function buildHomeIndexFlow({
  dailyRows,
  investorRows,
  intradayBaseline,
  asOf,
}: {
  dailyRows: IndexDailyRow[];
  investorRows: InvestorFlowRow[] | null;
  intradayBaseline: { tradingDate: string; slots: IntradayFlowSlot[] } | null;
  /** 스냅샷을 받아온 시각(ISO) — 표시 값이 "몇 시 기준 누적"인지의 근거 */
  asOf: string;
}): HomeIndexFlow | null {
  const today = dailyRows[0];
  const investorToday = investorRows?.[0];

  if (today?.tradingValue === undefined && investorToday === undefined) {
    return null;
  }

  const asOfHhmm = kstHhmm(new Date(asOf).getTime());
  const baselineSlot =
    intradayBaseline !== null && intradayBaseline.slots.length > 0
      ? pickBaselineSlot(intradayBaseline.slots, asOfHhmm)
      : undefined;

  // 거래대금 — 전일 같은 시각 슬롯 우선, 없으면 전일 종일(dailyRows[1])
  const tradingValue = today?.tradingValue;
  const tradingBasis =
    baselineSlot?.tradingValue ?? dailyRows[1]?.tradingValue ?? null;

  // 3열 — 같은 기준으로 전일 슬롯 우선, 없으면 전일 종일(investorRows[1])
  const investorBasis = baselineSlot ?? investorRows?.[1];

  return {
    asOfHhmm,
    // 슬롯이 있으면 그 시각까지의 누적끼리 비교한 것임을 라벨로 밝힌다 (§70)
    basisLabel:
      baselineSlot !== undefined
        ? `전일 ${baselineSlot.hhmm.slice(0, 2)}:${baselineSlot.hhmm.slice(2)}`
        : "전일 종일",
    trading:
      tradingValue !== undefined
        ? {
            value: tradingValue,
            change: tradingBasis !== null ? tradingValue - tradingBasis : null,
          }
        : null,
    investors:
      investorToday !== undefined && investorRows !== null
        ? HOME_INVESTOR_COLUMNS.map((col) => ({
            label: col.label,
            value: investorToday[col.key],
            change:
              investorBasis !== undefined
                ? investorToday[col.key] - investorBasis[col.key]
                : null,
            streak: computeFlowStreak(investorRows, col.key),
          }))
        : null,
  };
}
