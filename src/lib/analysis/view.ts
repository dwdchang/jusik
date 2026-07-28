import type { AnalysisPeriodPoint, AnalysisOverview } from "./overview";
import type { AnalysisQuote } from "./quote";

/**
 * 종목분석 화면 조립 — Phase 72 (plan.md §72).
 *
 * 재무(`overview.ts`, TTL 30일)와 시세(`quote.ts`, TTL 6시간)는 갱신 주기가 달라
 * 따로 캐시한다. 둘을 합쳐야 나오는 지표(PER·PBR·연환산 시가배당률)와 투자지표 카드
 * 15칸을 여기서 순수 함수로 만든다 — 페이지는 렌더만 한다.
 */

/** 시세를 주입해 PER·PBR·연환산 시가배당률까지 채운 기간 포인트 */
export interface AnalysisViewPoint extends AnalysisPeriodPoint {
  per: number | null;
  pbr: number | null;
}

function ratio(price: number | null, perShare: number | null): number | null {
  if (price === null || perShare === null || perShare <= 0) {
    return null;
  }
  return price / perShare;
}

/**
 * 연간 포인트에 그 해 **연말 종가** 기준 PER·PBR을 붙인다.
 * 금융위 시세가 2020년부터라 그 이전 연도는 null로 남는다(표에 "-"로 표시).
 */
export function withAnnualValuation(
  points: AnalysisPeriodPoint[],
  quote: AnalysisQuote | null
): AnalysisViewPoint[] {
  return points.map((point) => {
    const close = quote?.yearEndCloses[point.key] ?? null;
    return {
      ...point,
      per: ratio(close, point.eps),
      pbr: ratio(close, point.bps),
    };
  });
}

/**
 * 연환산(TTM) 포인트에 **그 분기말 종가** 기준 PER·PBR·시가배당률을 붙인다.
 *
 * 과거 지점에까지 현재 주가를 적용하면 배수·수익률이 통째로 왜곡된다(2026-07-28
 * 실측: 삼성전자 TTM 시가배당률이 전 구간 0.57%로 눌려 연간 탭의 1.8~4.0%와 어긋났다).
 * 분기말 종가를 못 구한 지점은 값을 비운다 — 틀린 값보다 빈 값이 낫다.
 */
export function withTtmValuation(
  points: AnalysisPeriodPoint[],
  quote: AnalysisQuote | null
): AnalysisViewPoint[] {
  return points.map((point) => {
    // TTM 키는 "2025Q4TTM" 꼴이라 뒤의 접미사를 떼면 분기 키가 된다
    const quarterKey = point.key.replace(/TTM$/, "");
    const close = quote?.quarterEndCloses[quarterKey] ?? null;
    return {
      ...point,
      per: ratio(close, point.eps),
      pbr: ratio(close, point.bps),
      dividendYield:
        point.dps !== null && close !== null ? (point.dps / close) * 100 : null,
    };
  });
}

/**
 * 분기 포인트 — PER·PBR을 **매기지 않는다**. 분기 EPS는 3개월치라 연 단위 배수와
 * 섞이면 4배 부풀려진 값으로 읽힌다. 배수는 연간·연환산 탭에서 본다.
 */
export function withQuarterValuation(
  points: AnalysisPeriodPoint[]
): AnalysisViewPoint[] {
  return points.map((point) => ({ ...point, per: null, pbr: null }));
}

/** 투자지표 카드 한 칸 */
export interface InvestmentIndicator {
  label: string;
  /** 이미 포맷된 표시 문자열 ("374,500원", "17.8배", "-") */
  value: string;
  /** 보조 설명 (기준 연도·날짜 등) */
  note?: string;
}

function formatWon(value: number | null): string {
  return value === null ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatPercent(value: number | null, digits = 1): string {
  return value === null ? "-" : `${value.toFixed(digits)}%`;
}

function formatMultiple(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}배`;
}

/** 시가총액처럼 큰 금액(원) — 좁은 칸에 들어가게 조/억으로 접는다 */
function formatLargeWon(won: number | null): string {
  if (won === null) {
    return "-";
  }
  if (Math.abs(won) >= 1e12) {
    return `${(won / 1e12).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}조원`;
  }
  return `${Math.round(won / 1e8).toLocaleString("ko-KR")}억원`;
}

/** 최근값 우선으로 시계열에서 값 하나 집기 */
function latestOf(
  points: AnalysisPeriodPoint[],
  pick: (point: AnalysisPeriodPoint) => number | null
): { value: number | null; label: string | null } {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const value = pick(points[i]);
    if (value !== null) {
      return { value, label: points[i].key };
    }
  }
  return { value: null, label: null };
}

/**
 * n년 연평균 성장률(CAGR, %) — 시작·끝 값이 모두 양수일 때만 계산한다.
 * 적자 전환처럼 부호가 바뀌면 성장률이 의미를 잃어 null로 둔다.
 */
function cagr(points: AnalysisPeriodPoint[], pick: (p: AnalysisPeriodPoint) => number | null, years: number): number | null {
  const values = points
    .map((point) => pick(point))
    .filter((value): value is number => value !== null);
  if (values.length < 2) {
    return null;
  }
  const window = values.slice(-(years + 1));
  const first = window[0];
  const last = window.at(-1) ?? null;
  const span = window.length - 1;
  if (last === null || first <= 0 || last <= 0 || span < 1) {
    return null;
  }
  return ((last / first) ** (1 / span) - 1) * 100;
}

/** 최근 n개 값의 단순 평균 */
function averageOf(
  points: AnalysisPeriodPoint[],
  pick: (point: AnalysisPeriodPoint) => number | null,
  count: number
): number | null {
  const values = points
    .map((point) => pick(point))
    .filter((value): value is number => value !== null)
    .slice(-count);
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 투자지표 15칸(3열 × 5행)을 만든다. 순서는 사용자 지정 화면 그대로다 —
 * 52주 최고/최저·자사주 비중 → PER·주당배당금·배당성향 → 배당수익률·성장률 3종.
 */
export function buildInvestmentIndicators(
  overview: AnalysisOverview,
  quote: AnalysisQuote | null
): InvestmentIndicator[] {
  const annual = overview.annual;
  const latestDps = latestOf(annual, (p) => p.dps);
  const latestPayout = latestOf(annual, (p) => p.payoutRatio);
  const latestYield = latestOf(annual, (p) => p.dividendYield);
  const latestEps = latestOf(annual, (p) => p.eps);
  const latestBps = latestOf(annual, (p) => p.bps);
  const latestRoe = latestOf(annual, (p) => p.roe);

  const per = ratio(quote?.close ?? null, latestEps.value);
  const pbr = ratio(quote?.close ?? null, latestBps.value);

  return [
    { label: "52주 최고가", value: formatWon(quote?.high52w ?? null) },
    { label: "52주 최저가", value: formatWon(quote?.low52w ?? null) },
    {
      label: "자사주 비중",
      value: formatPercent(overview.treasuryRatio),
      note: overview.treasuryYear ? `${overview.treasuryYear}년 말` : undefined,
    },
    {
      label: "PER",
      value: formatMultiple(per),
      note: latestEps.label ? `${latestEps.label}년 EPS 기준` : undefined,
    },
    {
      label: "PBR",
      value: formatMultiple(pbr),
      note: latestBps.label ? `${latestBps.label}년 BPS 기준` : undefined,
    },
    {
      label: "주당배당금",
      value: formatWon(latestDps.value),
      note: latestDps.label ? `${latestDps.label}년` : undefined,
    },
    {
      label: "배당성향",
      value: formatPercent(latestPayout.value),
      note: latestPayout.label ? `${latestPayout.label}년` : undefined,
    },
    {
      label: "배당수익률",
      value: formatPercent(latestYield.value),
      note: latestYield.label ? `${latestYield.label}년` : undefined,
    },
    {
      label: "5년 배당수익률",
      value: formatPercent(averageOf(annual, (p) => p.dividendYield, 5)),
      note: "5개년 평균",
    },
    {
      label: "5년 EPS성장률",
      value: formatPercent(cagr(annual, (p) => p.eps, 5)),
      note: "연평균",
    },
    {
      label: "5년 BPS성장률",
      value: formatPercent(cagr(annual, (p) => p.bps, 5)),
      note: "연평균",
    },
    {
      label: "5년 매출성장률",
      value: formatPercent(cagr(annual, (p) => p.revenue, 5)),
      note: "연평균",
    },
    {
      label: "ROE",
      value: formatPercent(latestRoe.value),
      note: latestRoe.label ? `${latestRoe.label}년` : undefined,
    },
    {
      label: "시가총액",
      value: formatLargeWon(quote?.marketCap ?? null),
    },
    {
      label: "상장주식수",
      value:
        quote?.listedShares == null
          ? "-"
          : `${(quote.listedShares / 1e8).toLocaleString("ko-KR", {
              maximumFractionDigits: 2,
            })}억주`,
    },
  ];
}
