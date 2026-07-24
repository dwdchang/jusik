/**
 * 배당 basis(시가배당률 분자) 산출 — 사업연도 귀속 공용 로직 (Phase 59·60).
 *
 * 배당률 순위 잡(`refreshDividendRanking.ts`)과 per-종목 배당 블록(`holdings/stockInfo.ts`)이
 * 같은 규칙을 공유하도록 순수 함수로 뽑았다(Redis·KIS 의존 없음 — 서버 어디서든 안전).
 *
 * 12개월 롤링(TTM)은 사업연도 경계를 모르므로, 중간배당 기준일이 해마다 며칠씩
 * 움직이면 같은 성격의 배당을 두 번 계상하거나(조선내화·CR홀딩스 실측) 서로 다른
 * 사업연도(작년 말 결산 + 올해 초 분기)를 섞었다. 대신 결산(연배당) 회차를 각
 * 사업연도의 종점으로 보고 (직전 결산, 이 결산] 창의 회차를 그 사업연도로 묶는다.
 */

/**
 * 사업연도 귀속 — 최신 결산 기준일이 오늘로부터 이 일수 이내여야 사업연도 기준을 쓴다.
 * 넘으면 최근 배당이 끊긴 것으로 보고 12개월 롤링(폴백)으로 넘긴다.
 */
export const FISCAL_YEAR_RECENCY_DAYS = 400;

/**
 * 결산 회차가 하나뿐일 때 그 결산 이전 중간·분기 배당을 담을 창 폭(직전 결산 대용).
 * 12개월보다 넉넉히 잡아 기준일이 며칠 움직여도 같은 사업연도 회차를 놓치지 않는다.
 */
export const FISCAL_YEAR_WINDOW_DAYS = 400;

/** "YYYYMMDD" 두 날짜의 일수 차 (to - from) */
export function dayDiff(fromYmd: string, toYmd: string): number {
  const ms = (s: string) =>
    Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8))
    );
  return Math.round((ms(toYmd) - ms(fromYmd)) / 86_400_000);
}

/** "YYYYMMDD"에서 days일 전 → "YYYYMMDD" */
export function ymdDaysBefore(ymd: string, days: number): string {
  const base = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8))
  );
  const d = new Date(base - days * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * 결산(연배당) 기준일 → 귀속 사업연도 라벨 "YYYY".
 * 선배당후기준일로 결산 기준일이 이듬해 1~6월로 옮겨간 12월 결산 법인이 다수라,
 * 상반기(1~6월) 기준일은 전년도로 귀속한다. 3·6월 결산 등 비12월 법인은 소수라
 * 오귀속 가능성을 감수한다(Phase 59 조사: 결산 기준일 월 분포에서 상반기는 대부분
 * 12월 결산의 이동분으로 확인).
 */
export function fiscalYearLabel(settlementYmd: string): string {
  const year = Number(settlementYmd.slice(0, 4));
  const month = Number(settlementYmd.slice(4, 6));
  return String(month <= 6 ? year - 1 : year);
}

/** basis 산출에 필요한 최소 회차 형태 — 호출부의 확장 필드는 제네릭으로 보존된다 */
export interface BasisRound {
  /** 배당 기준일 "YYYYMMDD" */
  ymd: string;
  /** 주당배당금(원) — 확정 회차만(>0) */
  perShare: number;
  /** 배당종류 — "결산"이면 사업연도 종점(연배당) */
  kind: string | null;
}

export interface DividendBasis<T extends BasisRound> {
  /** basis(시가배당률 분자)에 산입되는 회차 — 입력 회차 부분집합(확장 필드 보존) */
  basisRounds: T[];
  /** 귀속 사업연도 "YYYY" — 사업연도 기준일 때만, 폴백(TTM)이면 null */
  basisYear: string | null;
  /** 직전 사업연도 총액들 — 폭배 판정 대조용(폴백이면 빈 배열) */
  priorFyTotals: number[];
}

/**
 * 배당 basis 산출 — 사업연도 귀속(폴백 시 최근 12개월 롤링).
 * 결산(`kind==="결산"`) 회차를 각 사업연도의 종점으로 보고 (직전 결산, 이 결산] 창의
 * 회차(중간·분기 포함)를 합쳐 그 사업연도 배당으로 삼는다. basis = 가장 최근 완결
 * 사업연도.
 *
 * 폴백(TTM, `basisYear=null`): ⓐ 결산 회차가 없는 종목(중간·분기 배당만) ⓑ 최신 결산이
 * 오늘로부터 FISCAL_YEAR_RECENCY_DAYS 초과(최근 배당 끊김) ⓒ `fund=true`(배당상품 —
 * 월·분기 분배금이라 사업연도 개념이 약함). 폴백 창은 [oneYearAgo, today].
 *
 * @param rounds     확정 회차(YYYYMMDD 오름차순일 필요 없음 — 내부에서 창으로 거른다)
 * @param fund       배당상품 여부(true면 항상 TTM 폴백)
 * @param oneYearAgo 폴백 창 시작 "YYYYMMDD"
 * @param today      기준일(오늘) "YYYYMMDD"
 */
export function computeDividendBasis<T extends BasisRound>(
  rounds: T[],
  fund: boolean,
  oneYearAgo: string,
  today: string
): DividendBasis<T> {
  const settlementYmds = rounds
    .filter((r) => r.kind === "결산")
    .map((r) => r.ymd)
    .sort();
  const latestSettlement = settlementYmds[settlementYmds.length - 1];
  const useFiscal =
    !fund &&
    latestSettlement !== undefined &&
    dayDiff(latestSettlement, today) <= FISCAL_YEAR_RECENCY_DAYS;

  if (!useFiscal) {
    return {
      basisRounds: rounds.filter((r) => r.ymd > oneYearAgo && r.ymd <= today),
      basisYear: null,
      priorFyTotals: [],
    };
  }

  // 결산 i를 종점으로 하는 사업연도 창 (직전 결산, 이 결산]. 첫 결산은 직전이 없어
  // FISCAL_YEAR_WINDOW_DAYS 전을 대용으로 쓴다.
  const fyWindow = (endIdx: number): { start: string; end: string } => {
    const end = settlementYmds[endIdx];
    const start =
      endIdx > 0
        ? settlementYmds[endIdx - 1]
        : ymdDaysBefore(end, FISCAL_YEAR_WINDOW_DAYS);
    return { start, end };
  };
  const sumWindow = (start: string, end: string): number =>
    rounds
      .filter((r) => r.ymd > start && r.ymd <= end)
      .reduce((sum, r) => sum + r.perShare, 0);

  const priorFyTotals: number[] = [];
  for (let i = 0; i < settlementYmds.length - 1; i++) {
    const { start, end } = fyWindow(i);
    priorFyTotals.push(sumWindow(start, end));
  }

  const { start, end } = fyWindow(settlementYmds.length - 1);
  return {
    basisRounds: rounds.filter((r) => r.ymd > start && r.ymd <= end),
    basisYear: fiscalYearLabel(end),
    priorFyTotals,
  };
}
