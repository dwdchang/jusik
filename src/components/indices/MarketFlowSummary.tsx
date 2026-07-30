import { kstHhmm } from "@/lib/date/kst";
import { formatEokFromMillion, formatEokwon } from "@/lib/format/krw";
import { pickBaselineSlot } from "@/lib/indices/marketFlow";
import type {
  IndexDailyRow,
  IntradayFlowSlot,
  InvestorFlowRow,
} from "@/types/indices";
import styles from "./MarketFlowSummary.module.css";

/** 순매수 3열 구성 — 일별 수급 탭(InvestorFlowTable)의 앞 3주체와 동일 순서 */
const INVESTOR_COLUMNS: Array<{
  key: "individual" | "foreign" | "institution";
  label: string;
}> = [
  { key: "individual", label: "개인" },
  { key: "foreign", label: "외국인" },
  { key: "institution", label: "기관계" },
];

/**
 * 3열 셀용 표기 — 폭이 480px 레이아웃에서 셀당 약 133px뿐이라 만원 단위까지 적는
 * `formatEokFromMillion`("8,507억 5,400만원")은 넘친다. 억원으로 반올림해 단을
 * 하나 줄인다(백만원 → 억원은 ÷100). 거래대금 줄은 폭이 넉넉해 원래 표기를 쓴다.
 */
function formatCell(millionWon: number): string {
  return formatEokwon(millionWon / 100, true);
}

function toneClass(value: number): string {
  if (value > 0) {
    return styles.rise;
  }
  if (value < 0) {
    return styles.fall;
  }
  return styles.flat;
}

/** "0920" → "09:20" */
function formatHhmm(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

/**
 * 국내 지수 상세의 「거래대금·수급」 요약 (Phase 69, §70에서 비교 기준 변경,
 * §87에서 차트 아래로 내려가며 접힘 기본이 됨).
 *
 * 값은 전부 저장된 스냅샷에서 오고 **KIS 추가 호출이 없다**.
 * - 거래대금: `market:detail:{kospi|kosdaq}`의 dailyRows(백만원)
 * - 개인·외국인·기관계: `market:investor:{market}`의 **순매수 금액**(백만원)
 *
 * 두 값 모두 장중에는 "그 시각까지의 누적"이라, 전일 *종일* 합계와 비교하면 장 초반
 * 갭이 커진다. 그래서 전일 같은 시각 슬롯(`intradayBaseline`, §70)과 비교하고,
 * 슬롯이 아직 없는 첫 거래일에만 전일 종일 대비로 폴백한다(라벨로 구분).
 *
 * 투자자별 *거래대금*(매수+매도)은 KIS가 시장 단위로 제공하지 않아
 * (FHPTJ04040000은 순매수 39필드뿐, FHPTJ04030000은 전 조합 0 — plan.md §69 실측)
 * 3열은 순매수 기준임을 주석 문구로 명시한다.
 */
export function MarketFlowSummary({
  dailyRows,
  investorRows,
  intradayBaseline,
  asOf,
}: {
  dailyRows: IndexDailyRow[];
  investorRows?: InvestorFlowRow[];
  intradayBaseline?: { tradingDate: string; slots: IntradayFlowSlot[] };
  /** 스냅샷을 받아온 시각(ISO) — 표시 값이 "몇 시 기준 누적"인지의 근거 */
  asOf: string;
}) {
  const today = dailyRows[0];
  const investorToday = investorRows?.[0];

  // 거래대금도 수급도 없으면 카드 자체를 그리지 않는다 (초기 시딩 전).
  if (today?.tradingValue === undefined && investorToday === undefined) {
    return null;
  }

  const asOfHhmm = kstHhmm(new Date(asOf).getTime());
  const baselineSlot =
    intradayBaseline !== undefined
      ? pickBaselineSlot(intradayBaseline.slots, asOfHhmm)
      : undefined;
  const slotLabel =
    baselineSlot !== undefined
      ? `전일 ${formatHhmm(baselineSlot.hhmm)} 대비`
      : null;

  // 거래대금 — 전일 같은 시각 슬롯 우선, 없으면 전일 종일(dailyRows[1])
  const tradingValue = today?.tradingValue;
  const tradingBasis =
    baselineSlot?.tradingValue !== undefined
      ? { value: baselineSlot.tradingValue, label: slotLabel as string }
      : dailyRows[1]?.tradingValue !== undefined
        ? { value: dailyRows[1].tradingValue, label: "전일 종일 대비" }
        : null;
  const tradingChange =
    tradingValue !== undefined && tradingBasis !== null
      ? tradingValue - tradingBasis.value
      : null;

  // 3열 — 같은 기준으로 전일 슬롯 우선, 없으면 전일 종일(investorRows[1])
  const investorBasis: { row: Pick<InvestorFlowRow, "individual" | "foreign" | "institution">; label: string } | null =
    baselineSlot !== undefined
      ? { row: baselineSlot, label: slotLabel as string }
      : investorRows?.[1] !== undefined
        ? { row: investorRows[1], label: "전일 종일 대비" }
        : null;

  return (
    <details className={styles.card}>
      {/* 접힘이 기본 (§87) — 차트가 화면 첫 블록 자리를 갖고, 이 요약은 필요할 때만
          편다. 다만 접힌 채로도 거래대금 값은 보이게 `summary`에 함께 둔다.
          네이티브 `<details>`라 JS 없이 동작하고 서버 컴포넌트로 남는다
          (holdings/DailyHistoryList와 같은 패턴). */}
      <summary className={styles.summary}>
        <span className={styles.title}>거래대금 · 수급</span>
        {tradingValue !== undefined ? (
          <span className={`${styles.summaryValue} numeric`}>
            {formatEokFromMillion(tradingValue)}
          </span>
        ) : null}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </summary>

      {tradingValue !== undefined ? (
        <div className={styles.tradingRow}>
          <span className={styles.tradingLabel}>
            거래대금
            {/* tradingValue가 있으면 today도 반드시 있다 (같은 행에서 뽑은 값) */}
            <span className={styles.date}> {today.date} {formatHhmm(asOfHhmm)}</span>
          </span>
          <span className={styles.tradingValues}>
            <span className={`${styles.tradingValue} numeric`}>
              {formatEokFromMillion(tradingValue)}
            </span>
            <span
              className={`${styles.tradingChange} numeric ${
                tradingChange === null ? styles.flat : toneClass(tradingChange)
              }`}
            >
              {tradingChange === null || tradingBasis === null
                ? "전일 대비 —"
                : `${tradingBasis.label} ${formatEokFromMillion(tradingChange, true)}`}
            </span>
          </span>
        </div>
      ) : null}

      {investorToday !== undefined ? (
        <>
          <div className={styles.grid}>
            {INVESTOR_COLUMNS.map((col) => {
              const value = investorToday[col.key];
              const change =
                investorBasis !== null ? value - investorBasis.row[col.key] : null;

              return (
                <div key={col.key} className={styles.cell}>
                  <span className={styles.cellLabel}>{col.label}</span>
                  <span
                    className={`${styles.cellValue} numeric ${toneClass(value)}`}
                  >
                    {formatCell(value)}
                  </span>
                  <span
                    className={`${styles.cellChange} numeric ${
                      change === null ? styles.flat : toneClass(change)
                    }`}
                  >
                    {change === null ? "—" : `(${formatCell(change)})`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className={styles.note}>
            3열은 <strong>순매수 금액</strong> (+ 순매수 / − 순매도) · 괄호는{" "}
            {investorBasis?.label ?? "전일 대비"} 증감
          </p>
        </>
      ) : null}
    </details>
  );
}
