/**
 * 국내 지수 대시보드 — 도메인 타입 (UI · Recharts 공용)
 * @see plan.md §2.4
 */

export type MarketIndex = "KOSPI" | "KOSDAQ";

/** KIS 해외지수/환율/금리/유가/금 계열 지표 — FHKST03030100 단일 조회 가능 4종 */
export type OverseasIndicator = "USDKRW" | "US10Y" | "OIL" | "GOLD";

/**
 * 홈/상세에서 다루는 전체 지표 식별자.
 * DXY는 KIS에 종목이 없어 환율 6종으로 계산하는 파생 지표 (plan.md §28).
 * BTCKRW/BTCUSD는 KIS에 종목이 없어 업비트 공개 API로 수집하는 외부 지표 (plan.md §30).
 */
export type IndicatorId =
  | MarketIndex
  | OverseasIndicator
  | "DXY"
  | "BTCKRW"
  | "BTCUSD";

export const INDICATOR_NAMES: Record<IndicatorId, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  USDKRW: "원/달러 환율",
  US10Y: "미국 10년물 국채금리(%)",
  OIL: "국제유가 WTI(USD/배럴)",
  GOLD: "금 현물(국제, USD/온스)",
  DXY: "달러 인덱스",
  BTCKRW: "비트코인(원)",
  BTCUSD: "비트코인(달러)",
};

export type PriceDirection = "rise" | "fall" | "flat";

export interface IndexSnapshot {
  market: IndicatorId;
  name: string;
  basDt: string;
  close: number;
  changeAmount: number;
  changeRate: number;
  direction: PriceDirection;
}

/** Recharts LineChart `data` 배열 요소 */
export interface IndexChartPoint {
  date: string;
  basDt: string;
  close: number;
  /** 거래량(천주) — 국내 지수만. 해외 지표는 미포함(undefined) (Phase 50) */
  volume?: number;
  /** 거래대금(백만원) — 국내 지수만 (Phase 50) */
  tradingValue?: number;
}

export interface IndexSeries {
  market: IndicatorId;
  points: IndexChartPoint[];
}

export interface IndexDashboardData {
  asOf: string;
  dataNotice: string;
  kospi: IndexSnapshot;
  kosdaq: IndexSnapshot;
  kospiHistory: IndexSeries;
  kosdaqHistory: IndexSeries;
  usdKrw: IndexSnapshot;
  usTreasury10y: IndexSnapshot;
  /** 국제유가 WTI — Phase 15 추가 키라 첫 갱신 회차 전에는 null */
  oil: IndexSnapshot | null;
  /** 금 현물 — Phase 30 추가 키라 첫 갱신 회차 전에는 null (§33 홈 시장 카드 행) */
  gold: IndexSnapshot | null;
  /** 비트코인 달러 — Phase 30 추가 키라 첫 갱신 회차 전에는 null (§33 홈 시장 카드 행) */
  btcUsd: IndexSnapshot | null;
  /**
   * 달러 인덱스 — 원/달러 카드의 보조 한 줄용 (§85). 환율 6종 합성 파생 지표라
   * 실패해도 잡 ok에 영향이 없어(§28) 첫 갱신 전·계산 실패 시 null이 될 수 있다.
   */
  dxy: IndexSnapshot | null;
  /**
   * 코스피·코스닥 카드의 거래대금·수급 보조 블록 (§86). 수급 스냅샷이 아직 없거나
   * 거래대금도 없으면 null — 카드가 보조줄 없이 기존 모습대로 그려진다.
   */
  kospiFlow: HomeIndexFlow | null;
  kosdaqFlow: HomeIndexFlow | null;
}

/** 상세 페이지 일별 시세 리스트 행 */
export interface IndexDailyRow {
  basDt: string;
  date: string;
  close: number;
  changeAmount: number;
  changeRate: number;
  direction: PriceDirection;
  /** 거래량(천주) — 국내 지수만. 해외 지표는 미포함(undefined) (Phase 50) */
  volume?: number;
  /** 거래대금(백만원) — 국내 지수만 (Phase 50) */
  tradingValue?: number;
}

/**
 * 일별 수급 1행 — 시장 전체 투자자 순매수 금액(백만원, 부호 포함). Phase 42.
 * KIS FHPTJ04040000의 각 주체 `_ntby_tr_pbmn`을 그대로 담는다(원값 백만원).
 */
export interface InvestorFlowRow {
  /** "YYYYMMDD" */
  basDt: string;
  /** "MM/DD" */
  date: string;
  /** 개인 */
  individual: number;
  /** 외국인 */
  foreign: number;
  /** 기관계 */
  institution: number;
  /** 금융투자 */
  finInvest: number;
  /** 투신 */
  trust: number;
  /** 사모 */
  privateFund: number;
  /** 은행 */
  bank: number;
  /** 보험 */
  insurance: number;
  /** 종금 */
  merchantBank: number;
  /** 연기금 */
  pension: number;
}

/**
 * 장중 시각 슬롯 1개 (Phase 70) — **그 시각까지의 당일 누적**(백만원).
 *
 * KIS `FHPTJ04040000`의 당일 행은 조회 시점까지의 누적이라(2026-07-28 실측:
 * 15:00 개인 3,652,442 → 15:27 3,895,491), 전일 *종일* 합계와 비교하면 장 초반에
 * 갭이 커진다. 갱신 잡이 10분마다 이 값을 이미 받아오므로 회차마다 슬롯으로
 * 적재해 두고, 다음 거래일에 **같은 시각 슬롯끼리** 비교한다.
 * KIS는 과거 거래일의 시간대별 수급을 제공하지 않아(§70 실측) 자체 축적이 유일한 경로다.
 */
export interface IntradayFlowSlot {
  /** KST "HHMM" (갱신 잡 회차 시각) */
  hhmm: string;
  /** 개인 누적 순매수(백만원) */
  individual: number;
  /** 외국인 누적 순매수(백만원) */
  foreign: number;
  /** 기관계 누적 순매수(백만원) */
  institution: number;
  /** 시장 전체 누적 거래대금(백만원) — 지수 스냅샷이 없던 회차는 생략 */
  tradingValue?: number;
  /**
   * 기관 세부 7종 누적 순매수(백만원) — Phase 93에서 추가. **옵셔널인 것은
   * 스키마 확장 전에 쌓인 슬롯(2026-07-31분)에 이 필드가 없기 때문**이고,
   * 지나간 거래일은 KIS로 복구할 수 없어(§70) 영구히 3주체로 남는다.
   * 잡이 이미 받아둔 `InvestorFlowRow`에서 그대로 복사하므로 **KIS 호출은 0**이다.
   */
  finInvest?: number;
  trust?: number;
  privateFund?: number;
  bank?: number;
  insurance?: number;
  merchantBank?: number;
  pension?: number;
}

/**
 * 홈 지수 카드(코스피·코스닥)의 거래대금·수급 보조 블록 (Phase 86).
 * 상세 「거래대금 · 수급」(§69·§70)과 같은 스냅샷을 홈 카드 폭에 맞춰 압축한 것.
 * 금액은 전부 **백만원**(원값) — 표기 변환은 화면에서 `formatFlowCompact`로 한다.
 */
export interface HomeIndexFlow {
  /** 스냅샷 시각 KST "HHMM" — 표시 값이 "몇 시 기준 누적"인지 */
  asOfHhmm: string;
  /** 전일 대비의 기준 — "전일 14:00"(같은 시각 슬롯) 또는 "전일 종일"(폴백) */
  basisLabel: string;
  /** 시장 전체 거래대금 — 스냅샷에 거래대금이 없으면 null */
  trading: { value: number; change: number | null } | null;
  /** 개·외·기 3열 — 수급 스냅샷이 아직 없으면 null */
  investors: HomeIndexFlowInvestor[] | null;
}

/** 홈 카드 수급 3열 중 한 열 (Phase 86) — 라벨은 「개」·「외」·「기」 1자 축약 */
export interface HomeIndexFlowInvestor {
  label: string;
  /** 당일 누적 순매수 금액(백만원, + 순매수 / − 순매도) */
  value: number;
  /** 전일 같은 시각 대비 증감 — 기준 슬롯도 전일 행도 없으면 null */
  change: number | null;
  /** 같은 부호가 이어진 거래일 수 — capped면 20거래일 창을 소진해 "20일+" */
  streak: { days: number; capped: boolean } | null;
}

/**
 * 종목별 수급 순위 1종목 — 외국인/기관 순매수(또는 순매도) 상위 (Phase 50).
 * netBuyQty(주)·netBuyAmount(백만원)는 조회한 투자자 그룹 기준이며, 순매도상위는 음수.
 */
export interface FiFlowStock {
  /** 순위 (1부터) */
  rank: number;
  /** 종목코드 6자리 */
  code: string;
  name: string;
  /** 현재가(원) */
  price: number;
  /** 전일 대비율(%) — 부호 적용 */
  changeRate: number;
  direction: PriceDirection;
  /** 순매수 수량(주, 부호 포함) */
  netBuyQty: number;
  /** 순매수 금액(백만원, 부호 포함) */
  netBuyAmount: number;
}

/** 한 투자자 그룹의 순매수/순매도 상위 목록 (각 상위 30) */
export interface FiFlowDirectionLists {
  /** 순매수 상위 */
  buy: FiFlowStock[];
  /** 순매도 상위 */
  sell: FiFlowStock[];
}

/** 종목별 수급 순위 — 외국인·기관 × 순매수·순매도 (Phase 50) */
export interface FiFlowRanking {
  foreign: FiFlowDirectionLists;
  institution: FiFlowDirectionLists;
}

/**
 * 시가총액 순위 1종목 (Phase 68) — KIS 시총 상위 30(FHPST01740000).
 * 시총은 장중 실시간 현재가 × 상장주식수라 회차마다 순위가 실제로 바뀐다.
 */
export interface MarketCapStock {
  /** 순위 (1부터, 30이 상한) */
  rank: number;
  /** 종목코드 6자리 */
  code: string;
  name: string;
  /** 현재가(원) */
  price: number;
  /** 전일 대비율(%) — 부호 적용 */
  changeRate: number;
  direction: PriceDirection;
  /** 시가총액(억원) */
  marketCapEok: number;
  /** 전일 대비 시가총액 증감(억원, 부호 포함) */
  capChangeEok: number;
  /**
   * 전일 확정 회차(18:15) 대비 순위 변동 — 양수면 순위 상승(예: 31위→30위는 +1).
   * 기준 스냅샷이 없거나(첫 거래일) 전일 30위권 밖이었으면 null.
   */
  rankChange: number | null;
  /** 전일 30위권 밖에서 진입 — 기준 스냅샷은 있으나 그 목록에 없던 종목 */
  isNew: boolean;
}

/** 시가총액 순위 (KOSPI/KOSDAQ 각 상위 30, Phase 68) */
export interface MarketCapRanking {
  rows: MarketCapStock[];
  /**
   * 순위 변동·시총 증감의 기준이 된 직전 거래일 ("YYYY-MM-DD").
   * 기준 스냅샷이 아직 없으면 null(그 회차는 변동 열이 "—").
   */
  baseDate: string | null;
}

/** 지수 상세 페이지 데이터 (차트 + 일별 리스트) */
export interface IndexDetailData {
  asOf: string;
  dataNotice: string;
  snapshot: IndexSnapshot;
  history: IndexSeries;
  /** 최신순 정렬 */
  dailyRows: IndexDailyRow[];
  /**
   * 일별 수급 (KOSPI/KOSDAQ만) — 최신순, 순매수 금액(백만원). 스냅샷이 아직
   * 없으면 생략된다(화면에서 "준비 중" 표시). 해외 지표는 항상 미포함.
   */
  investorRows?: InvestorFlowRow[];
  /**
   * 종목별 수급 순위 (KOSPI/KOSDAQ만) — 외국인·기관 × 순매수·순매도 각 상위 30.
   * 스냅샷이 아직 없으면 생략된다(화면에서 "준비 중" 표시). 해외 지표는 항상 미포함.
   */
  fiRanking?: FiFlowRanking;
  /**
   * 시가총액 순위 (KOSPI/KOSDAQ만) — 실시간 시총 상위 30.
   * 스냅샷이 아직 없으면 생략된다(화면에서 "준비 중" 표시). 해외 지표는 항상 미포함.
   */
  marketCapRanking?: MarketCapRanking;
  /**
   * 직전 거래일의 장중 시각 슬롯 (KOSPI/KOSDAQ만, §70) — 「거래대금 · 수급」 요약이
   * **전일 같은 시각**과 비교하는 기준. 배포 첫 거래일에는 없어(생략) 화면이
   * 전일 종일 대비로 폴백한다.
   */
  intradayBaseline?: {
    /** 기준이 된 거래일 "YYYY-MM-DD" (KST) */
    tradingDate: string;
    /** 시각 오름차순 */
    slots: IntradayFlowSlot[];
  };
}

export const KIS_DATA_NOTICE =
  "지수 데이터는 10분 간격으로 갱신됩니다. (장중 시세 지연 가능)";

/**
 * 장중 슬롯 아카이브(§92)가 시작된 거래일 "YYYY-MM-DD" — 일별 수급 표가 **어느
 * 날짜 행에 펼침을 열어줄지** 판정하는 기준 (§93).
 *
 * 이 날 이전은 KIS가 시간대별 수급을 주지 않아 어떤 방법으로도 채울 수 없으므로
 * 펼침 표시를 아예 그리지 않는다. 키 20개의 존재를 확인하는 대신 상수로 가르는 것은,
 * 그 확인이 결국 **펼치지도 않을 20일치를 미리 읽는 일**이 되기 때문이다.
 * 잡이 실패해 빠진 날만 펼쳤을 때 "기록 없음"이 된다.
 *
 * 클라이언트 컴포넌트가 읽으므로 `market/store.ts`(Redis 클라이언트를 물고 있다)가
 * 아니라 여기 둔다.
 */
export const INTRADAY_ARCHIVE_SINCE = "2026-07-31";

/**
 * 글로벌 지표 타일 하나 — Phase 88 신설 / Phase 89에서 표 행 → 타일로 재편.
 * 차트·일별 시계열 없이 값·등락률·기준일만 담는다(구획마다 그리드 1개, 27종).
 * 기준일은 화면에서 빼기로 했지만(§89) 이어받은 값 판정에 쓰이므로 데이터에는 남긴다.
 */
export interface GlobalTableRow {
  label: string;
  /** 라벨 아래 작은 글씨 — 단위·호가 방향(달러/유로처럼 뒤바뀐 통화쌍) */
  unit?: string;
  /** 라벨 앞 국기 — `public/flags/{flag}.svg`의 소문자 2자 코드, 환율 전용 (§89 이모지 → §90 코드) */
  flag?: string;
  /** 값 표기 소수점 자리 */
  decimals: number;
  close: number;
  /** 전일 대비율(%) — 부호 적용 */
  changeRate: number;
  direction: PriceDirection;
  /** 항목별 기준일 "YYYYMMDD" — 권역마다 달라(미국은 전일) 행 단위로 갖는다 */
  basDt: string;
  /** 이 회차 조회가 실패해 직전 회차 값을 그대로 이어받은 행이면 그 값의 수집 시각(ISO) */
  staleAt?: string;
}

export interface GlobalTableSection {
  id: string;
  title: string;
  /** 표 아래 각주 — 단위 기준·제외 항목 사유 */
  note?: string;
  rows: GlobalTableRow[];
}

/** kospiVolatility:history 일별 기록 — 코스피 일중 변동성 */
export interface KospiVolatilityRecord {
  /** "YYYY-MM-DD" (KST 기준) */
  date: string;
  /** (고가 − 저가) / 저가 × 100 (%) */
  dailyGapPercent: number;
}

/** 변동성 상세 차트 — 월별 평균 점 */
export interface VolatilityMonthlyPoint {
  /** "YYYY-MM" */
  month: string;
  /** x축 라벨, 예: "7월" */
  label: string;
  /** 해당 월 일일 변동성 평균(%) */
  avgGapPercent: number;
}

/** 홈 화면 코스피 변동성 카드 요약 */
export interface VolatilityCardSummary {
  /** 최신 기록의 일중 변동폭(%) — 카드 대표값 (§71) */
  latestGapPercent: number;
  /** 최신 기록 날짜 "YYYY-MM-DD" */
  latestDate: string;
  /** 직전 거래일 대비 증감(%p), 직전 기록이 없으면 null */
  dayOverDayDiff: number | null;
  /**
   * 최신 기록이 아직 확정 전인 당일치인지 — 장중(KST 15:30 이전)에는 고가·저가 폭이
   * 계속 벌어지는 진행 값이라 전일 대비가 낮게 나온다. 표기로 구분한다 (§71).
   */
  latestIntraday: boolean;
  /** 당월 평균 변동성(%) — 오늘까지의 진행분 평균. 당월 기록이 없으면 null */
  currentMonthAvg: number | null;
  /** 전월 대비 증감(%p), 당월·전월 기록이 없으면 null */
  monthOverMonthDiff: number | null;
}
