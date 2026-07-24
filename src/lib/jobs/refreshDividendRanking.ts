import {
  fetchKisDividends,
  fetchKisMultiPrice,
  fetchKisStockFaceValue,
} from "@/lib/api/kis/client";
import {
  fetchDartCorpCodeMap,
  fetchDartDividendDecision,
} from "@/lib/api/dart/client";
import {
  DIVIDEND_RANKING_LOOKBACK_YEARS,
  DIVIDEND_RANKING_SIZE,
  KIS_MULTI_PRICE_BATCH_SIZE,
} from "@/lib/api/kis/constants";
import type { KisDividendRow } from "@/lib/api/kis/types";
import { todayKstDate } from "@/lib/date/kst";
import {
  deleteDividendRankingProgress,
  getDividendRanking,
  getDividendRankingProgress,
  setDividendRanking,
  setDividendRankingProgress,
  type DividendRankingEntry,
  type DividendRoundRecord,
  type PayoutCycle,
  type StoredDividendRanking,
} from "@/lib/dividends/ranking/store";
import {
  DIVIDEND_PRODUCT_GROUPS,
  fetchDividendRankingUniverse,
  type UniverseStock,
} from "@/lib/hotstocks/universe";
import { parseNum } from "@/lib/indices/kisMapper";
import {
  computeDividendBasis,
  dayDiff,
  type DividendBasisMode,
} from "@/lib/dividends/basis";

/**
 * 배당률 순위 갱신 잡 파이프라인 — Phase 43 (plan.md §43).
 * 유니버스 약 2,650종목 × 예탁원 배당일정 1콜로 시가배당률을 직접 계산해
 * TOP 100을 만든다. KIS `ranking/dividend-rate`를 쓰지 않는 이유는 §43 조사 결과 1
 * (액면가배당률이라 정렬 기준이 다르고, 전 종목 커버리지도 불확실).
 *
 * 현재가는 스캔 **시작 전에 전 종목분을 멀티시세(30종목/콜, 89콜)로 확보**해
 * progress에 함께 저장한다. 배당률이 현재가의 함수라 스캔 도중 상위 N을 고르려면
 * 그 시점에 이미 현재가가 있어야 하고(주당배당금 순 근사는 고가주에 편향돼 오답),
 * 이어받기 실행이 같은 가격 스냅샷을 써야 순위가 한 세트로 고정되기 때문이다.
 */

/** 배당 조회 스로틀 — 정기 회차와 겹쳐도 합산 20건/초 미만 (§14.4와 동일 정책) */
const CALL_INTERVAL_MS = Math.ceil(1000 / 15);

/** Vercel maxDuration 300초 대비 시간 예산 — 소진 시 progress 저장 후 종료 */
const TIME_BUDGET_MS = 250_000;

/** 연속 실패가 이 횟수에 달하면 종목 문제가 아닌 장애로 보고 중단한다 */
const CONSECUTIVE_FAILURE_LIMIT = 10;

/**
 * 온라인 선택 버퍼 — 최종 TOP N보다 넉넉히 들고 있다가 액면분할 보정으로 상위가
 * 강등돼도 진짜 상위가 남게 한다(보정은 배당률을 낮추기만 하므로 원래 상위 500 안에
 * 진짜 상위 100이 포함된다는 가정). 최종 절단은 finalize에서 DIVIDEND_RANKING_SIZE로.
 */
const RANKING_BUFFER_SIZE = 500;

/** 이 배당률(%) 초과 이상치만 현재 액면가를 조회해 분할 보정한다 (콜 절약) */
const SPLIT_CHECK_YIELD = 12;

/** 폭배 판정 — 최근 1년 배당이 직전 정상연도 중앙값의 이 배수 이상이면 후보 (튜닝 대상) */
const SURGE_RATIO = 3;

/**
 * 지난 배당 기록(종목명 클릭 시 펼침) 보존 창 — 지급 주기별 개월 수 (Phase 51).
 * 연 72(6년)·반기 48(4년)·분기 24(2년)·월 12(1년)로 회차 수를 6~12로 균질화한다.
 * 주기 판정 불가(null)는 연과 동일 취급(폴백). 잡이 이미 받는 10년치 중 이 창만 잘라 저장.
 */
const HISTORY_WINDOW_MONTHS: Record<Exclude<PayoutCycle, null>, number> = {
  연: 72,
  반기: 48,
  분기: 24,
  월: 12,
};

export interface RefreshDividendRankingReport {
  trigger: string;
  startedAt: string;
  finishedAt: string;
  /** 산출 기준일 "YYYY-MM-DD" (KST) */
  computedFor: string;
  universeCount: number;
  /** 현재가를 확보한 종목 수 — 이 밖의 종목은 배당률 계산 불가라 순위에서 빠진다 */
  pricedCount: number;
  /** 이번 실행에서 처리한 종목 수 */
  processed: number;
  /** 다음 처리 인덱스 — 완료 시 universeCount와 같다 */
  cursor: number;
  /** market:dividendRanking 저장까지 끝났는지 — false면 다음 스케줄이 이어받는다 */
  completed: boolean;
  /** progress 커서에서 이어받아 시작했는지 */
  resumed: boolean;
  /** 재시도 후에도 실패해 랭킹에서 빠진 종목 (다음 회차 자동 복구) */
  failedCodes: string[];
  /** 기준일 계산이 이미 완료돼 건너뛴 경우의 사유 */
  skipped?: string;
  ok: boolean;
}

/** 시가배당률 내림차순, 동률 시 종목코드 오름차순 (결정적) */
function compareEntries(
  a: DividendRankingEntry,
  b: DividendRankingEntry
): number {
  if (a.dividendYield !== b.dividendYield) {
    return b.dividendYield - a.dividendYield;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** 상위 버퍼만 유지하는 온라인 선택 — finalize에서 보정·재정렬 후 TOP N 절단 */
function offerEntry(
  entries: DividendRankingEntry[],
  entry: DividendRankingEntry
): void {
  entries.push(entry);
  entries.sort(compareEntries);
  if (entries.length > RANKING_BUFFER_SIZE) {
    entries.length = RANKING_BUFFER_SIZE;
  }
}

/** "YYYY-MM-DD" → "YYYYMMDD" */
function toKisDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

/** "YYYY-MM-DD"에서 months개월 전 → "YYYYMMDD" (말일 오버플로우는 Date가 보정) */
function ymdMonthsBefore(isoDate: string, months: number): string {
  const base = new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10))
    )
  );
  base.setUTCMonth(base.getUTCMonth() - months);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * 예탁원 날짜("YYYYMMDD" 또는 "YYYY/MM/DD", 미정이면 빈 문자열) → "YYYY-MM-DD".
 * 구분자를 걷어낸 뒤 8자리 판정 — 같은 응답에서 record_date="20260331"·
 * divi_pay_dt="2026/05/29"로 포맷이 섞여 오는 예탁원 특성 대응 (Phase 47 실측과 동일 규칙).
 */
function toIsoDate(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** 배열의 중앙값 (빈 배열은 0) */
function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** 예탁원 `stk_kind === "우선"` → 우선주 (Phase 44 실측: 보통/우선). 최근값 기준 */
function detectPreferred(rows: KisDividendRow[]): boolean {
  for (const row of rows) {
    const kind = row.stk_kind?.trim();
    if (kind) {
      return kind.includes("우선");
    }
  }
  return false;
}

/**
 * 배당 기준일 간격의 중앙값으로 지급 주기를 판정한다 (Phase 44).
 * `divi_kind`는 분기/결산 혼재라 주기를 못 가려(실측) 간격을 쓴다. 회차 수가 아닌
 * 중앙값 간격이라 12개월 롤링 경계에 회차가 ±1 흔들려도 견딘다.
 * 날짜가 2개 미만이면 판정 불가 → 최근 1년 배당이 있으면 "연"으로 폴백.
 */
function derivePayoutCycle(
  recentDates: string[],
  hasAnnualDividend: boolean
): PayoutCycle {
  const sorted = [...new Set(recentDates)].sort(); // "YYYYMMDD" 오름차순
  if (sorted.length < 2) {
    return hasAnnualDividend ? "연" : null;
  }
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(dayDiff(sorted[i - 1], sorted[i]));
  }
  const gap = median(gaps);
  if (gap <= 45) {
    return "월";
  }
  if (gap <= 135) {
    return "분기";
  }
  if (gap <= 270) {
    return "반기";
  }
  return "연";
}

/**
 * 폭배(비경상 급증) 후보 — 최근 1년 배당이 직전 정상연도들의 중앙값 대비
 * SURGE_RATIO배 이상이면 true. 직전 연도가 2개 미만이면 판정 안 함(신규 배당·데이터
 * 부족). 원인(특별배당/결산기 변경/영구증배)은 못 가려 감지만 하고 DART로 넘긴다.
 */
function isSurge(trailingDps: number, priorYearDps: number[]): boolean {
  const priors = priorYearDps.filter((v) => v > 0);
  if (priors.length < 2) {
    return false;
  }
  const mid = median(priors);
  return mid > 0 && trailingDps >= SURGE_RATIO * mid;
}

/**
 * 배당 회차에서 연속 배당 연수를 센다 — 기준 연도부터 역순으로 끊김 없는 햇수.
 * 조회 시작 연도까지 끊기지 않으면 `capped`로 표시해 화면에서 "N년+"로 적는다
 * (KIS 과거 조회 상한이 명세에 없어 실제로는 더 길 수 있다, §43).
 */
function countConsecutiveYears(
  paidYears: Set<number>,
  baseYear: number,
  earliestQueryYear: number
): { consecutiveYears: number; yearsCapped: boolean } {
  // 기준 연도 배당이 아직 없을 수 있으므로 직전 연도부터 시작해도 인정한다
  const startYear = paidYears.has(baseYear) ? baseYear : baseYear - 1;
  if (!paidYears.has(startYear)) {
    return { consecutiveYears: 0, yearsCapped: false };
  }

  let count = 0;
  let year = startYear;
  while (paidYears.has(year)) {
    count += 1;
    year -= 1;
  }

  return { consecutiveYears: count, yearsCapped: year < earliestQueryYear };
}

/** 배당상품(ETF·리츠·인프라펀드) 여부 — 우선주·폭배·액면분할 판정을 건너뛴다 (Phase 46) */
function isFundStock(stock: UniverseStock): boolean {
  return DIVIDEND_PRODUCT_GROUPS.has(stock.group);
}

/** buildEntry 내부에서 다루는 확정 배당 회차(액면가·주식배당률 포함) */
interface ConfirmedRound {
  ymd: string;
  perShare: number;
  payDate: string | null;
  kind: string | null;
  /** 배당락 시점 액면가(원) — 분할 보정 대조용 */
  face: number;
  /** 주식배당률(%) — >0이면 현금+주식 병행 */
  stkRate: number;
}

/**
 * 종목 1건 처리 — 배당 1콜로 시가배당률·지급 주기·연속 배당 연수를 함께 만든다.
 * 배당률 분자는 직전 사업연도 확정 배당 합(폴백 시 최근 1년) — computeDividendBasis 참고.
 * 그 합이 0이면 순위 대상이 아니다(무배당·미확정만 있는 종목).
 */
function buildEntry(
  stock: UniverseStock,
  rows: KisDividendRow[],
  price: number,
  computedFor: string
): DividendRankingEntry | null {
  const fund = isFundStock(stock);
  const baseYear = Number(computedFor.slice(0, 4));
  const earliestQueryYear = baseYear - DIVIDEND_RANKING_LOOKBACK_YEARS + 1;
  // 같은 월·일의 1년 전 — basis 폴백(TTM) 창의 시작
  const oneYearAgo = toKisDate(`${baseYear - 1}${computedFor.slice(4)}`);
  const today = toKisDate(computedFor);

  // 지급 주기 판정용 — 최근 2년 배당 기준일
  const twoYearsAgo = toKisDate(`${baseYear - 2}${computedFor.slice(4)}`);

  const paidYears = new Set<number>();
  const recentCycleDates: string[] = [];
  // 지난 배당 기록(Phase 51) — 확정 회차만 모아 뒤에서 주기별 창으로 잘라 붙인다
  const confirmedRounds: ConfirmedRound[] = [];

  for (const row of rows) {
    const recordDate = row.record_date?.trim();
    const amount = parseNum(row.per_sto_divi_amt);

    // 미확정 회차는 주당배당금이 0으로 오므로 배당 실적으로 세지 않는다
    if (recordDate === undefined || recordDate.length !== 8 || !(amount > 0)) {
      continue;
    }

    paidYears.add(Number(recordDate.slice(0, 4)));

    confirmedRounds.push({
      ymd: recordDate,
      perShare: amount,
      payDate: toIsoDate(row.divi_pay_dt),
      kind: row.divi_kind?.trim() || null,
      face: parseNum(row.face_val),
      stkRate: parseNum(row.stk_divi_rate),
    });

    if (recordDate > twoYearsAgo && recordDate <= today) {
      recentCycleDates.push(recordDate);
    }
  }

  // 배당 basis 방식 — 그룹별 (Phase 62). 일반종목(ST)=사업연도, 리츠·인프라(RT·IF)=직전
  // 캘린더 연도(반기 결산이 전부 "결산"이라 사업연도 종점 로직이 반기만 잡는 문제 회피),
  // 월배당 ETF(EF)=TTM(결산 회차 없음·신규 상품 완전성). fund 폴백은 각 모드 내부에서.
  const basisMode: DividendBasisMode =
    stock.group === "ST" ? "fiscal" : stock.group === "EF" ? "ttm" : "calendar";
  const { basisRounds, basisYear, priorFyTotals } = computeDividendBasis(
    confirmedRounds,
    basisMode,
    oneYearAgo,
    today
  );

  const annualDividendPerShare = basisRounds.reduce(
    (sum, r) => sum + r.perShare,
    0
  );
  if (annualDividendPerShare <= 0) {
    return null;
  }

  const roundsPerYear = basisRounds.length;
  // 액면가·주식배당률은 basis 회차 기준 — 분할 보정·"현+주N%" 표기가 basis와 일치
  let dividendFaceValue = 0;
  let stockDividendRate: number | null = null;
  for (const r of basisRounds) {
    if (r.face > 0) {
      dividendFaceValue = r.face;
    }
    if (r.stkRate > 0) {
      stockDividendRate = Math.max(stockDividendRate ?? 0, r.stkRate);
    }
  }

  const { consecutiveYears, yearsCapped } = countConsecutiveYears(
    paidYears,
    baseYear,
    earliestQueryYear
  );

  // 지난 배당 기록 — 지급 주기별 보존 창으로 잘라 최신순 (Phase 51).
  // basis 산입 회차는 inBasis로 표식해 펼침 표에서 강조한다 (Phase 59).
  const payoutCycle = derivePayoutCycle(recentCycleDates, true);
  const historyCutoff = ymdMonthsBefore(
    computedFor,
    HISTORY_WINDOW_MONTHS[payoutCycle ?? "연"]
  );
  const basisYmds = new Set(basisRounds.map((r) => r.ymd));
  const history: DividendRoundRecord[] = confirmedRounds
    .filter((round) => round.ymd >= historyCutoff)
    .sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0))
    .map((round) => ({
      recordDate: toIsoDate(round.ymd) ?? round.ymd,
      perShare: round.perShare,
      payDate: round.payDate,
      kind: round.kind,
      inBasis: basisYmds.has(round.ymd),
    }));

  return {
    rank: 0, // finalize에서 부여
    code: stock.code,
    name: stock.name,
    market: stock.market,
    instrumentType: fund ? "fund" : "stock",
    price,
    dividendYield: Math.round((annualDividendPerShare / price) * 10000) / 100,
    annualDividendPerShare,
    roundsPerYear,
    payoutCycle,
    consecutiveYears,
    yearsCapped,
    // 배당상품은 우선주·주식배당·폭배(DART 배당결정) 개념이 없어 판정을 건너뛴다
    preferred: fund ? false : detectPreferred(rows),
    stockDividendRate: fund ? null : stockDividendRate,
    splitAdjusted: false,
    // 폭배 — basis(직전 사업연도) 대 그 이전 사업연도 총액들 (Phase 59)
    surgeCandidate: fund ? false : isSurge(annualDividendPerShare, priorFyTotals),
    surge: null,
    dividendFaceValue,
    dividendBasisYear: basisYear,
    history,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 전 종목 현재가 — 30종목/콜이라 ~2,650종목이 89콜. 실패한 배치의 종목은
 * 가격 없이 남아 순위에서 제외된다(다음 회차 자동 복구).
 */
async function fetchAllPrices(
  universe: UniverseStock[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (let i = 0; i < universe.length; i += KIS_MULTI_PRICE_BATCH_SIZE) {
    const batch = universe.slice(i, i + KIS_MULTI_PRICE_BATCH_SIZE);
    const callStartedAt = Date.now();

    try {
      const rows = await fetchKisMultiPrice(batch.map((stock) => stock.code));
      for (const row of rows) {
        const code = row.inter_shrn_iscd?.trim();
        const price = parseNum(row.inter2_prpr);
        if (code !== undefined && code !== "" && price > 0) {
          prices[code] = price;
        }
      }
    } catch (error) {
      console.error("[job] dividend ranking price batch failed:", error);
    }

    const elapsed = Date.now() - callStartedAt;
    if (elapsed < CALL_INTERVAL_MS) {
      await sleep(CALL_INTERVAL_MS - elapsed);
    }
  }

  return prices;
}

/**
 * 완료 시 마무리 — Phase 44. ① 배당률 이상치(>SPLIT_CHECK_YIELD)만 현재 액면가를
 * 조회해 액면분할 보정 → ② 보정 후 재정렬·TOP N 절단 → ③ 폭배 종목만 DART
 * 배당결정 공시 조회로 수치·링크 채움 → ④ 순위 부여. 이상치·폭배가 소수라 콜이 적다.
 *
 * 배당상품(isFund=true, Phase 46)은 ①③을 건너뛴다 — ETF/리츠/인프라펀드는
 * 액면가·주식배당 개념이 없고(분배금은 NAV 기준) DART 배당결정 공시 대상도 아니다.
 */
async function finalizeEntries(
  entries: DividendRankingEntry[],
  computedFor: string,
  isFund: boolean
): Promise<void> {
  // ① 액면분할 보정 — 배당 당시 액면가 ÷ 현재 액면가 = 분할비율로 주당배당금 환산
  for (const entry of isFund ? [] : entries) {
    if (entry.dividendYield <= SPLIT_CHECK_YIELD || entry.dividendFaceValue <= 0) {
      continue;
    }

    const callStartedAt = Date.now();
    try {
      const currentFace = await fetchKisStockFaceValue(entry.code);
      if (currentFace > 0) {
        const ratio = entry.dividendFaceValue / currentFace;
        // 분할(비율↑)·병합(비율↓) 모두 보정 — 1에 가까우면 변동 없음으로 무시
        if (ratio > 1.5 || ratio < 0.67) {
          entry.annualDividendPerShare =
            Math.round((entry.annualDividendPerShare / ratio) * 100) / 100;
          entry.dividendYield =
            Math.round((entry.annualDividendPerShare / entry.price) * 10000) /
            100;
          entry.splitAdjusted = true;
          // 지난 배당 기록 회차도 같은 비율로 보정 — 펼침 표의 주당배당금·회차
          // 배당률(Phase 53)이 신주 기준(헤더와 동일)으로 표시되게 한다.
          // 창 안에서 분할 전후가 섞일 수 있으나 헤더 연간합과 같은 단순화를 따른다.
          if (entry.history !== undefined) {
            entry.history = entry.history.map((round) => ({
              ...round,
              perShare: Math.round((round.perShare / ratio) * 100) / 100,
            }));
          }
        }
      }
    } catch (error) {
      console.error(`[job] face value fetch failed (${entry.code}):`, error);
    }

    const elapsed = Date.now() - callStartedAt;
    if (elapsed < CALL_INTERVAL_MS) {
      await sleep(CALL_INTERVAL_MS - elapsed);
    }
  }

  // ② 보정 후 재정렬 → TOP N 절단
  entries.sort(compareEntries);
  if (entries.length > DIVIDEND_RANKING_SIZE) {
    entries.length = DIVIDEND_RANKING_SIZE;
  }

  // ③ 폭배 DART enrichment — 최종 TOP N 중 폭배 후보만 (배당상품은 후보가 없어 빈 배열)
  const surged = entries.filter((entry) => entry.surgeCandidate);
  if (surged.length > 0) {
    let corpMap: Record<string, string> | null = null;
    try {
      corpMap = await fetchDartCorpCodeMap();
    } catch (error) {
      console.error("[job] DART corp code map failed:", error);
    }

    if (corpMap !== null) {
      const bgnDe = toKisDate(
        `${Number(computedFor.slice(0, 4)) - 1}${computedFor.slice(4)}`
      );
      const endDe = toKisDate(computedFor);

      for (const entry of surged) {
        const corpCode = corpMap[entry.code];
        if (corpCode === undefined) {
          continue;
        }

        const callStartedAt = Date.now();
        try {
          const decision = await fetchDartDividendDecision(corpCode, {
            bgnDe,
            endDe,
          });
          if (decision !== null) {
            entry.surge = {
              rceptNo: decision.rceptNo,
              perShare: decision.perShare,
              officialYield: decision.officialYield,
              recordDate: decision.recordDate,
            };
          }
        } catch (error) {
          console.error(
            `[job] DART dividend decision failed (${entry.code}):`,
            error
          );
        }

        const elapsed = Date.now() - callStartedAt;
        if (elapsed < CALL_INTERVAL_MS) {
          await sleep(CALL_INTERVAL_MS - elapsed);
        }
      }
    }
  }

  // ④ 순위 부여
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
  });
}

export async function refreshDividendRanking(
  trigger: string,
  options: { force?: boolean } = {}
): Promise<RefreshDividendRankingReport> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + TIME_BUDGET_MS;
  const computedFor = todayKstDate();

  const base = { trigger, startedAt, computedFor };

  // 완료 가드 — 같은 기준일 산출이 이미 저장돼 있으면 no-op.
  // force(수동 재시딩)면 이 가드를 건너뛰고 재계산한다. 진행 중 progress는
  // 그대로 이어받으므로, 여러 번 호출하면 커서부터 완주한다 (§43·Phase 46).
  const existing = await getDividendRanking();
  if (!options.force && existing?.computedFor === computedFor) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      universeCount: existing.universeCount,
      pricedCount: 0,
      processed: 0,
      cursor: existing.universeCount,
      completed: true,
      resumed: false,
      failedCodes: [],
      skipped: `already computed for ${computedFor}`,
      ok: true,
    };
  }

  // 유니버스는 실행마다 새로 받는다(코드 오름차순 — 커서 결정성, §14.1-3).
  // 일반종목(ST)과 배당상품(EF/RT/IF)을 한 번에 받아 group으로 분류한다 (Phase 46).
  const universe = await fetchDividendRankingUniverse();
  const productUniverseCount = universe.filter(isFundStock).length;
  const stockUniverseCount = universe.length - productUniverseCount;

  // 이어받기 — 같은 기준일의 progress만 유효. 가격 스냅샷도 함께 물려받아
  // 분할 실행 사이에 배당률 기준이 흔들리지 않게 한다. Phase 46에서 두 버퍼
  // 구조로 바뀌었으므로 productEntries가 없는 구 progress는 무효로 보고 처음부터.
  const progress = await getDividendRankingProgress();
  const resumed =
    progress?.computedFor === computedFor &&
    Array.isArray(progress.productEntries);
  const entries: DividendRankingEntry[] = resumed ? progress!.entries : [];
  const productEntries: DividendRankingEntry[] = resumed
    ? progress!.productEntries
    : [];
  let cursor = resumed ? progress!.cursor : 0;
  const prices = resumed ? progress!.prices : await fetchAllPrices(universe);
  const pricedCount = Object.keys(prices).length;

  const fromDate = toKisDate(
    `${Number(computedFor.slice(0, 4)) - DIVIDEND_RANKING_LOOKBACK_YEARS + 1}-01-01`
  );
  const toDate = toKisDate(computedFor);

  const failedCodes: string[] = [];
  let processed = 0;
  let consecutiveFailures = 0;

  while (cursor < universe.length) {
    if (Date.now() >= deadline) {
      await setDividendRankingProgress({
        computedFor,
        cursor,
        universeCount: universe.length,
        entries,
        productEntries,
        prices,
      });
      return {
        ...base,
        finishedAt: new Date().toISOString(),
        universeCount: stockUniverseCount,
        pricedCount,
        processed,
        cursor,
        completed: false,
        resumed,
        failedCodes,
        ok: true,
      };
    }

    const stock = universe[cursor];
    const price = prices[stock.code];

    // 현재가 없는 종목은 배당률을 계산할 수 없어 배당 조회 자체를 건너뛴다
    // (콜도 아낀다 — 상장폐지·거래정지 등)
    if (price === undefined) {
      cursor += 1;
      continue;
    }

    const callStartedAt = Date.now();

    try {
      let rows: KisDividendRow[];
      try {
        rows = await fetchKisDividends(stock.code, fromDate, toDate);
      } catch {
        // 일시 오류 대비 1회 재시도 — 그래도 실패하면 종목만 건너뛴다
        await sleep(1000);
        rows = await fetchKisDividends(stock.code, fromDate, toDate);
      }

      const entry = buildEntry(stock, rows, price, computedFor);
      if (entry !== null) {
        // 일반종목/배당상품 각각 독립 TOP N 버퍼로 분류 (Phase 46)
        offerEntry(isFundStock(stock) ? productEntries : entries, entry);
      }
      consecutiveFailures = 0;
    } catch (error) {
      console.error(`[job] dividend fetch failed (${stock.code}):`, error);
      failedCodes.push(stock.code);
      consecutiveFailures += 1;

      // 연속 실패는 토큰·네트워크 장애 신호 — progress 저장 후 500으로 넘긴다
      // (QStash 재시도·다음 스케줄이 커서부터 재개)
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        await setDividendRankingProgress({
          computedFor,
          cursor: cursor - (CONSECUTIVE_FAILURE_LIMIT - 1),
          universeCount: universe.length,
          entries,
          productEntries,
          prices,
        });
        throw new Error(
          `dividend ranking aborted: ${CONSECUTIVE_FAILURE_LIMIT} consecutive failures at ${stock.code}`
        );
      }
    }

    cursor += 1;
    processed += 1;

    const elapsed = Date.now() - callStartedAt;
    if (elapsed < CALL_INTERVAL_MS) {
      await sleep(CALL_INTERVAL_MS - elapsed);
    }
  }

  // 두 순위를 각각 마무리 — 배당상품은 액면분할·폭배 단계를 건너뛴다 (Phase 46)
  await finalizeEntries(entries, computedFor, false);
  await finalizeEntries(productEntries, computedFor, true);

  const result: StoredDividendRanking = {
    computedFor,
    universeCount: stockUniverseCount,
    entries,
    productUniverseCount,
    productEntries,
    fetchedAt: new Date().toISOString(),
  };

  await setDividendRanking(result);
  await deleteDividendRankingProgress();

  return {
    ...base,
    finishedAt: new Date().toISOString(),
    universeCount: stockUniverseCount,
    pricedCount,
    processed,
    cursor,
    completed: true,
    resumed,
    failedCodes,
    ok: true,
  };
}
