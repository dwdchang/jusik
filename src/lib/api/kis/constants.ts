/**
 * 한국투자증권(KIS) Open API — 국내업종 지수 시세
 * @see https://apiportal.koreainvestment.com/
 *
 * 인증키(App Key/Secret)는 서버 전용 환경변수에서만 참조한다.
 */

export const KIS_BASE_URL =
  process.env.KIS_BASE_URL?.trim() ||
  "https://openapi.koreainvestment.com:9443";

export const KIS_ENDPOINTS = {
  /** 접근토큰 발급 (1초 1건 제한) */
  TOKEN: "/oauth2/tokenP",
  /** 국내업종 일자별지수 (현재 스냅샷 output1 + 일자별 output2) */
  INDEX_DAILY_PRICE:
    "/uapi/domestic-stock/v1/quotations/inquire-index-daily-price",
  /** 해외지수/환율/금리 기간별시세 (output1 요약 + output2 일자별) */
  OVERSEAS_DAILY_CHART:
    "/uapi/overseas-price/v1/quotations/inquire-daily-chartprice",
  /** 국내주식 현재가 시세 */
  STOCK_PRICE: "/uapi/domestic-stock/v1/quotations/inquire-price",
  /** 주식기본조회 — 종목명 (plan.md §13.2 실측 확정) */
  STOCK_BASIC_INFO: "/uapi/domestic-stock/v1/quotations/search-stock-info",
  /** 국내주식 기간별시세 (일/주/월/년) — 1회 최대 100거래일 (plan.md §13.3 실측) */
  STOCK_DAILY_CHART:
    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
  /** 시가총액 상위 랭킹 — 1회 상위 30건 (plan.md §13.4 실측) */
  MARKET_CAP_RANKING: "/uapi/domestic-stock/v1/ranking/market-cap",
  /** 국내주식 등락률 순위 — 1회 상위 30건, tr_cont 연속조회 미지원 (2026-07-14 실측) */
  FLUCTUATION_RANKING: "/uapi/domestic-stock/v1/ranking/fluctuation",
  /** 예탁원 배당일정 */
  DIVIDEND: "/uapi/domestic-stock/v1/ksdinfo/dividend",
  /** 관심종목(멀티종목) 시세조회 — 1콜 최대 30종목 (Phase 43) */
  MULTI_PRICE: "/uapi/domestic-stock/v1/quotations/intstock-multprice",
  /** 손익계산서 — 분기값은 연중 누적(YTD), 단위 억원 (plan.md §13.4 실측) */
  INCOME_STATEMENT: "/uapi/domestic-stock/v1/finance/income-statement",
  /** 재무비율 — 증가율은 전년 동기 대비 직접 제공 */
  FINANCIAL_RATIO: "/uapi/domestic-stock/v1/finance/financial-ratio",
  /** 시장별 투자자매매동향(일별) — 1콜 최근 300거래일·39필드 (Phase 42, 2026-07-22 실측) */
  INVESTOR_DAILY_BY_MARKET:
    "/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market",
  /** 외국인/기관 매매상위 종목 — 1콜 상위 30종목 (Phase 50, 2026-07-23 실측) */
  FI_TRADE_RANKING:
    "/uapi/domestic-stock/v1/quotations/foreign-institution-total",
} as const;

export const KIS_TR_ID = {
  INDEX_DAILY_PRICE: "FHPUP02120000",
  OVERSEAS_DAILY_CHART: "FHKST03030100",
  STOCK_PRICE: "FHKST01010100",
  STOCK_BASIC_INFO: "CTPF1002R",
  STOCK_DAILY_CHART: "FHKST03010100",
  MARKET_CAP_RANKING: "FHPST01740000",
  FLUCTUATION_RANKING: "FHPST01700000",
  DIVIDEND: "HHKDB669102C0",
  MULTI_PRICE: "FHKST11300006",
  INCOME_STATEMENT: "FHKST66430200",
  FINANCIAL_RATIO: "FHKST66430300",
  INVESTOR_DAILY_BY_MARKET: "FHPTJ04040000",
  FI_TRADE_RANKING: "FHPTJ04400000",
} as const;

/**
 * 등락률 순위 1회 응답 건수 — 전체시장 상위 30건이 상한 (2026-07-14 실측).
 * fid_input_cnt_1을 키워도 30건, tr_cont 연속조회도 1페이지로 리셋돼 100위는 불가.
 */
export const KIS_FLUCTUATION_RANKING_SIZE = 30;

/**
 * per-종목 배당 회차 표시 범위 — "내 배당" 일정·지급일 알림이 읽는 rounds를 최근 1년으로
 * 자른다. 시가배당률 분자는 아래 DIVIDEND_BASIS_LOOKBACK_DAYS 창으로 별도 계산한다 (Phase 60).
 */
export const DIVIDEND_LOOKBACK_DAYS = 365;

/**
 * per-종목 시가배당률 분자(사업연도 귀속, Phase 60) 계산용 조회 범위 — 결산 2회를 봐야
 * 사업연도 경계((직전 결산, 이 결산])를 잡을 수 있어 2사업연도+선배당후기준일 이동 버퍼를
 * 준다. 배당 조회는 종목당 1콜이라 날짜 범위만 넓히는 것으로 콜 수는 늘지 않는다.
 */
export const DIVIDEND_BASIS_LOOKBACK_DAYS = 800;

/** 멀티시세 1콜 종목 수 상한 — FID_COND_MRKT_DIV_CODE_1~30 (Phase 43) */
export const KIS_MULTI_PRICE_BATCH_SIZE = 30;

/**
 * 배당률 순위의 연속 배당 연수 판정 범위(년) — Phase 43.
 * 예탁원 배당일정은 F_DT~T_DT 범위 조회라 이 값을 키워도 종목당 콜 수는 1로 불변이다.
 * KIS의 과거 조회 상한이 명세에 없어, 가장 이른 회차가 조회 시작 연도에 닿으면
 * 상한에 걸린 것으로 보고 "N년+"로 표기한다 (yearsCapped).
 */
export const DIVIDEND_RANKING_LOOKBACK_YEARS = 10;

/** 배당률 순위 표시 건수 — 전 종목 스캔 후 상위 N만 저장 (사용자 확정) */
export const DIVIDEND_RANKING_SIZE = 100;

/** 주식기본조회 상품유형코드 — 300: 국내주식 */
export const KIS_STOCK_PRDT_TYPE_CD = "300";

/** 종목별 일별 히스토리 저장 범위 — 최근 2년 (plan.md §13.3 확정) */
export const STOCK_HISTORY_WINDOW_DAYS = 730;

/** 기간별시세 1회 응답 최대 거래일 수 (2026-07-10 실측) */
export const STOCK_DAILY_CHART_PAGE_SIZE = 100;

/** 국내주식(현재가 조회) 시장 분류 코드 */
export const KIS_STOCK_MARKET_DIV_CODE = "J";

/**
 * 해외지수/환율/금리 지표별 조회 코드 — plan.md §9.1 (2026-07-08 실측 검증)
 * marketDivCode: N 해외지수 / X 환율 / I 국채 / S 금선물
 *
 * **`S`(금선물) 카테고리는 절대 쓰지 않는다** — 일자별(output2)이 비는 데서 그치지 않고
 * **값 자체가 2023년에 멈춘 죽은 피드**다 (§88 실측: S/M0401 WTI 105.24가 2026-07-11과
 * 한 자리도 안 변함 · S/M0101 금 1,928.60 vs 정상 N/NYGOLD 4,097.00). 백금·팔라듐·납·
 * 니켈 등 `E`접두 32종이 이 카테고리에만 있어 되살릴 방법이 없다 — 다시 시도하지 말 것.
 */
export const KIS_OVERSEAS_INDICATOR = {
  USDKRW: { marketDivCode: "X", code: "FX@KRW" },
  US10Y: { marketDivCode: "I", code: "Y0202" },
  OIL: { marketDivCode: "N", code: "WTIF" },
  /** LBMA 런던 금 현물 (USD/온스) — N/GOLDLNPM 일자별 정상 (2026-07-19 실측, §30) */
  GOLD: { marketDivCode: "N", code: "GOLDLNPM" },
} as const;

/** 해외 기간별시세 조회 기간(일) — 최근 7거래일 확보용 여유 포함 */
export const KIS_OVERSEAS_LOOKBACK_DAYS = 31;

/**
 * 달러 인덱스(DXY) 계산용 환율 통화쌍 — plan.md §28 (2026-07-19 실측 검증).
 * KIS 마스터에 DXY 종목이 없어 ICE 공식의 가중 기하평균으로 계산한다:
 * DXY = 50.14348112 × EURUSD^-0.576 × USDJPY^0.136 × GBPUSD^-0.119
 *       × USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036
 * 6종 모두 marketDivCode X, 호가 방향은 공식과 일치 확인. ICE 공표값 대비
 * 소수점 수준 오차가 있을 수 있는 근사치다.
 */
export const KIS_DXY_BASE = 50.14348112;

export const KIS_DXY_COMPONENTS = [
  { code: "FX@EUR", exponent: -0.576 },
  { code: "FX@JPY", exponent: 0.136 },
  { code: "FX@GBP", exponent: -0.119 },
  { code: "FX@CAD", exponent: 0.091 },
  { code: "FX@SEK", exponent: 0.042 },
  { code: "FX@CHF", exponent: 0.036 },
] as const;

/** 글로벌 지표 표 항목의 값 출처 — Phase 88 */
export type GlobalTableItemSource =
  /** 해외 기간별시세(FHKST03030100) 1콜 */
  | { kind: "overseas"; marketDivCode: string; code: string }
  /** 달러 인덱스 태스크(KIS_DXY_COMPONENTS)가 이미 받아온 응답 재사용 — 추가 호출 0 */
  | { kind: "dxyPair"; code: string }
  /** 같은 회차에 저장된 market:detail 스냅샷 재사용 — 추가 호출 0 */
  | { kind: "detail"; detailKey: "oil" | "gold" }
  /** 국내주식 현재가(FHKST01010100) — 국내 금 현물이 이 경로로만 온다 */
  | { kind: "domestic"; code: string };

export interface GlobalTableItemDef {
  /** 타일 항목명 */
  label: string;
  /**
   * 항목명 아래 작은 글씨 — 단위·호가 방향.
   * **짧게 유지한다** — 타일 폭이 좁은 화면에서 88px(3열)·62px(4열)뿐이라
   * 긴 문구는 줄바꿈된다(§89). 기준·거래소 설명은 섹션 각주로 보낸다.
   */
  unit?: string;
  /**
   * 항목명 앞 국기 — 환율 전용 (§89 이모지 → **§90 국가 코드**).
   * `public/flags/{flag}.svg`를 가리키는 소문자 2자 코드다("us"·"eu" 등).
   * 이모지를 버린 이유는 Windows 크롬·엣지가 국기 이모지를 「US」 문자로 렌더링하기 때문.
   */
  flag?: string;
  /** 값 표기 소수점 자리 — 실측 응답의 자리 수를 따른다 */
  decimals: number;
  source: GlobalTableItemSource;
}

export interface GlobalTableSectionDef {
  id: string;
  title: string;
  /** 구획 아래 각주 */
  note?: string;
  items: readonly GlobalTableItemDef[];
}

/**
 * 글로벌 지표 카탈로그 — Phase 88 신설 / §89에서 5구획 27종으로 재편 / **§90에서 28종**.
 * 구획마다 타일 그리드 하나로 그린다(§89 — 값 큼직 + 등락률 아래 작게).
 * 회차당 23콜 — dxyPair 3(EUR·JPY·GBP)·detail 2(WTI·국제 금)는 재사용이라 0콜이고,
 * 아래 overseas 22 + domestic 1이 실제 호출이다.
 *
 * **여기에 없는 화면 항목이 셋 있다** — 미국 10년물·비트코인(주요 지표)과 코스피(세계 증시)는
 * 10분 주기 `market:detail`이라 화면이 직접 읽는다. 카탈로그에 넣으면 콜은 0이지만 하루
 * 3회차 스냅샷에 갇혀 10분 갱신이 퇴화한다 (§89·§90).
 *
 * **§89에서 뺀 5종 중 다우존스 `.DJI`는 §90에서 되살렸다**(세계 증시 4열 2행을 채우는 자리).
 * 아직 빠져 있는 4종 — VIX `VIX` · 독일 DAX `GR#DAX` · 영국 FTSE `GB#FTSE` · 대만 가권 `TW#WT`.
 * 코드는 전부 실측으로 검증된 정상 코드이며(§88), 화면에서 항목을 추리자는 사용자 결정에 따라
 * 수집까지 중단했다 — 되살리려면 아래 `worldIndices`에 되돌리면 된다.
 *
 * 애초에 넣을 수 없어 뺀 항목 — 백금·팔라듐·납·니켈·주석·설탕·대두·대두유·소맥(S 카테고리
 * 죽은 값 또는 NYMEX/CBOT 시세 미신청) · 쌀·TOPIX·러셀2000(마스터에 코드 없음) ·
 * 국내 휘발유·경유·LPG(KIS 전 경로 부재, 오피넷 키 필요) · 천연가스·난방유(NYMEX) ·
 * 에너지 선물 섹션 전체. 근거는 plan.md §88 / summary.md.
 */
export const KIS_GLOBAL_TABLE_SECTIONS: readonly GlobalTableSectionDef[] = [
  {
    // 화면 맨 위 6타일 중 뒤 4개 — 앞 2개(미국 10년물·비트코인)는 10분 주기 market:detail이라
    // 카탈로그에 넣지 않는다. 넣으면 콜은 0이지만 하루 3회차 스냅샷에 갇힌다 (§89)
    id: "highlights",
    title: "주요 지표",
    note: "반도체는 필라델피아 SOX 지수이며 미국 지수라 갱신 창(평일 09:00~18:40 KST)이 현지 장 마감 전에 닫혀 항상 전일 종가입니다. 유가 3종은 근월물 선물 기준(WTI는 서부텍사스산)입니다. 국내 휘발유·경유·LPG는 KIS가 제공하지 않아 빠져 있습니다(오피넷 API 키가 있으면 추가 가능).",
    items: [
      { label: "반도체", unit: "SOX", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "SOX" } },
      { label: "두바이유", unit: "USD/배럴", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "DUBAIF" } },
      { label: "브렌트유", unit: "USD/배럴", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "BRENTF" } },
      { label: "WTI", unit: "USD/배럴", decimals: 2, source: { kind: "detail", detailKey: "oil" } },
    ],
  },
  {
    // 4열 2행 8타일 중 앞 1개(코스피)는 10분 주기 market:detail이라 카탈로그에 없다 —
    // 화면이 앞에 끼워 넣는다. 아래 7종이 그 뒤를 미국 → 유럽 → 아시아 순으로 채운다 (§90)
    id: "worldIndices",
    title: "세계 증시",
    note: "코스피는 10분 간격으로, 나머지 7종은 하루 3회차로 갱신됩니다. 미국·유럽 지수(다우존스·나스닥·S&P 500·유로 STOXX 50)는 갱신 창(평일 09:00~18:40 KST)이 현지 장 마감 전에 닫혀 항상 전일 종가입니다. 아시아 3종은 당일 종가입니다.",
    items: [
      { label: "다우존스", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: ".DJI" } },
      { label: "나스닥 종합", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "COMP" } },
      { label: "S&P 500", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "SPX" } },
      { label: "유로 STOXX 50", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "SX5E" } },
      { label: "상해 종합", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "SHANG" } },
      { label: "항셍", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "HK#HS" } },
      { label: "니케이 225", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "JP#NI225" } },
    ],
  },
  {
    id: "fx",
    title: "전세계 환율",
    note: "KIS 제공 원값입니다 — 미국을 뺀 7종은 원화가 아니라 달러 기준이고, 유로·영국·호주는 호가 방향이 반대(달러/통화)입니다. KIS 마스터는 인도네시아 루피아를 FX@INR로, 인도 루피를 FX@IDR로 알파벳이 뒤바뀌게 담고 있어 한글명 기준으로 맞췄습니다.",
    items: [
      { label: "미국", flag: "us", unit: "원/달러", decimals: 2, source: { kind: "overseas", marketDivCode: "X", code: "FX@KRW" } },
      { label: "중국", flag: "cn", unit: "위엔/달러", decimals: 4, source: { kind: "overseas", marketDivCode: "X", code: "FX@CNY" } },
      { label: "유로", flag: "eu", unit: "달러/유로", decimals: 4, source: { kind: "dxyPair", code: "FX@EUR" } },
      { label: "일본", flag: "jp", unit: "엔/달러", decimals: 2, source: { kind: "dxyPair", code: "FX@JPY" } },
      // 4열 타일(360px에서 62px)에 5자 라벨은 들어가지 않아 두 줄이 된다 — 「인니」로 줄이지
      // 않고 줄바꿈을 허용한다. 그리드 행 높이는 그 행에서 가장 높은 타일이 정하므로 어긋나지 않는다
      { label: "인도네시아", flag: "id", unit: "루피아/달러", decimals: 0, source: { kind: "overseas", marketDivCode: "X", code: "FX@INR" } },
      { label: "영국", flag: "gb", unit: "달러/파운드", decimals: 4, source: { kind: "dxyPair", code: "FX@GBP" } },
      { label: "브라질", flag: "br", unit: "레알/달러", decimals: 4, source: { kind: "overseas", marketDivCode: "X", code: "FX@BRL" } },
      { label: "호주", flag: "au", unit: "달러/호주달러", decimals: 4, source: { kind: "overseas", marketDivCode: "X", code: "FX@AUD" } },
    ],
  },
  {
    // §88의 「귀금속」·「비철금속」 두 섹션을 3열 2행 하나로 병합 (§89)
    id: "metals",
    title: "귀금속 · 비철금속",
    note: "국내 금은 KRX 금시장 「금 99.99_1kg」 실시간 현재가(원/g)이고, 국제 금은 LBMA 런던·은은 런던 현물(USD/온스)입니다. 구리·아연·알루미늄은 LME 현물(USD/톤)이며 알루미늄은 primary(합금 NASAAC 아님)입니다. 백금·팔라듐·납·니켈·주석은 KIS가 쓸 수 있는 시세를 주지 않아 빠져 있습니다.",
    items: [
      { label: "국내 금", unit: "원/g", decimals: 0, source: { kind: "domestic", code: "M04020000" } },
      { label: "국제 금", unit: "USD/온스", decimals: 2, source: { kind: "detail", detailKey: "gold" } },
      { label: "은", unit: "USD/온스", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "SLVRLN" } },
      { label: "구리", unit: "USD/톤", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "LMECOC" } },
      { label: "아연", unit: "USD/톤", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "LMEZINC" } },
      { label: "알루미늄", unit: "USD/톤", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "LMEALC" } },
    ],
  },
  {
    id: "agriculture",
    title: "농산물",
    note: "근월물 선물 기준이며 옥수수는 시카고(CBOT) 시세입니다. 설탕·대두·대두유·소맥·쌀은 KIS가 쓸 수 있는 시세를 주지 않아 빠져 있습니다.",
    items: [
      { label: "옥수수", unit: "센트/부셸", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "CHICORN" } },
      { label: "커피", unit: "센트/파운드", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "COFFE" } },
      { label: "면화", unit: "센트/파운드", decimals: 2, source: { kind: "overseas", marketDivCode: "N", code: "COTTON" } },
    ],
  },
] as const;

/**
 * 글로벌 지표 표 갱신 회차 (KST 자정 기준 분) — Phase 88 사용자 확정.
 * 해외 지수·상품은 전일 종가가 하루 한 번 바뀔 뿐이라 10분 주기 42회차에 26콜을 태우면
 * +1,092콜/일이 된다. 09:00·15:40·18:15 세 회차만 갱신해 +78콜/일로 묶는다.
 * 신규 잡 라우트를 만들지 않고 refreshMarketData 안에서 게이트만 둔다 (AGENTS.md §2 잡 6종 유지).
 *
 * 세 값은 모두 실제 QStash 슬롯이어야 한다 — `market/staleness.ts`의 `SCHEDULE_MINUTES`
 * (09:00~15:30 10분 + 15:40 + 18:15)에 있는 시각만 고를 수 있고, 스케줄을 바꾸면 여기도
 * 함께 고친다 (research.md §9.4 스케줄 동기화 결합점).
 */
export const GLOBAL_TABLE_ROUND_MINUTES = [
  9 * 60,
  15 * 60 + 40,
  18 * 60 + 15,
] as const;

/**
 * 회차 판정 창(분) — QStash 발화가 늦어도 그 회차로 인정한다.
 * 10분 주기보다 좁게 잡아 인접 회차가 같은 창에 겹쳐 들어오지 않게 한다.
 */
export const GLOBAL_TABLE_ROUND_WINDOW_MINUTES = 9;

/** 업종(지수) 시장 분류 코드 */
export const KIS_MARKET_DIV_CODE = "U";

/** 업종 코드 — 가이드와 불일치 시 이 파일만 수정 */
export const KIS_INDEX_CODE = {
  KOSPI: "0001",
  KOSDAQ: "1001",
} as const;

/** 차트에 표시할 최근 거래일 수 */
export const KIS_HISTORY_POINT_COUNT = 7;

/**
 * 시장별 투자자매매동향 정합 파라미터 (Phase 42) — FID_INPUT_ISCD_2가 시장 지수코드와
 * 일치해야 수급 필드가 채워진다. 어긋나면 rt_cd=0이면서 전 필드 0 (2026-07-22 실측).
 */
export const KIS_INVESTOR_MARKET_PARAMS = {
  KOSPI: { iscd: "0001", iscd1: "KSP", iscd2: "0001" },
  KOSDAQ: { iscd: "1001", iscd1: "KSQ", iscd2: "1001" },
} as const;

/** 일별 수급 리스트 표시 거래일 수 — 응답 300행 중 최신 N행만 저장 (Phase 42) */
export const KIS_INVESTOR_ROW_COUNT = 20;

/**
 * 외국인/기관 매매상위 조회 파라미터 (Phase 50, 2026-07-23 실측).
 * FID_INPUT_ISCD로 시장을 고르고, FID_ETC_CLS_CODE로 투자자 그룹("1" 외국인/"2" 기관계),
 * FID_RANK_SORT_CLS_CODE로 정렬("0" 순매수상위/"1" 순매도상위)을 지정한다.
 * 1콜 상위 30종목이 상한(다른 순위 API와 동일). 순매수 수량은 주(股), 금액은 백만원.
 */
export const KIS_FI_RANKING_ISCD = {
  KOSPI: "0001",
  KOSDAQ: "1001",
} as const;

/** 외국인/기관 매매상위 1콜 응답 종목 수 — 상위 30건이 상한 (2026-07-23 실측) */
export const KIS_FI_RANKING_SIZE = 30;

/**
 * 시가총액 상위 랭킹 조회 시장 코드 (Phase 68, 2026-07-28 실측).
 * ALL은 종목 정보블록의 「시총 순위」 라벨용(기존 동작), KOSPI/KOSDAQ은 상세 화면
 * 「시총 순위」 탭용이다. **전체시장 1콜로는 코스닥을 덮을 수 없다** — 코스닥 1위
 * (알테오젠 15.6조)가 코스피 30위(우리금융지주 23.0조)에 못 미쳐 전체 30위에 코스닥이
 * 한 종목도 들어오지 않으므로, 시장별로 따로 호출해야 한다.
 */
export const KIS_MARKET_CAP_ISCD = {
  ALL: "0000",
  KOSPI: "0001",
  KOSDAQ: "1001",
} as const;

/**
 * 시가총액 상위 1콜 응답 종목 수 — 상위 30건이 상한 (2026-07-28 실측).
 * 응답에 `ctx_area_fk/nk`가 없고 `tr_cont: "N"` 재호출도 같은 1~30위를 반복해
 * **연속조회로 31위 이하를 받을 수 없다.**
 */
export const KIS_MARKET_CAP_RANKING_SIZE = 30;

export const KIS_FETCH_TIMEOUT_MS = 15_000;
