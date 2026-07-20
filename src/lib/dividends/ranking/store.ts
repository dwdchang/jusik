import { getRedis } from "@/lib/redis/client";
import type { UniverseMarket } from "@/lib/hotstocks/universe";

/**
 * 배당률 순위 Redis 스토어 — Phase 43 (plan.md §43).
 * 쓰기는 QStash 잡(refreshDividendRanking)만, 읽기는 화면(Server Component)만 수행한다.
 * 공개 시세·공시 기반 랭킹이라 암호화하지 않는다(핫종목과 동일 정책).
 */

/** 지급 주기 — 배당 기준일 평균 간격 기반 (Phase 44). `divi_kind`로는 불가(실측) */
export type PayoutCycle = "월" | "분기" | "반기" | "연" | null;

/** 폭배(비경상 급증) DART 배당결정 공시 수치 — Phase 44 (B안 enrichment) */
export interface DividendSurgeDart {
  /** DART 접수번호 — 원문 딥링크용 */
  rceptNo: string;
  /** 1주당 배당금(원, 보통주) */
  perShare: number | null;
  /** DART 공식 시가배당율(%) — KRX 기준가 기반, 앱 배당률과 분모가 다름 */
  officialYield: number | null;
  /** 배당기준일 "YYYY-MM-DD" */
  recordDate: string | null;
}

export interface DividendRankingEntry {
  rank: number;
  code: string;
  name: string;
  market: UniverseMarket;
  /** 산출 시점 현재가(원) — 배당률의 분모, 순위와 한 세트로 고정 */
  price: number;
  /** 시가배당률(%) = 최근 1년 주당배당금 합 ÷ 현재가 × 100, 소수 둘째 자리 */
  dividendYield: number;
  /** 최근 1년 주당배당금 합계(원) — 분할 보정 시 신주 기준으로 조정됨 */
  annualDividendPerShare: number;
  /** 최근 1년 배당 회차 수 */
  roundsPerYear: number;
  /** 지급 주기 — 배당 기준일 평균 간격 기반 (월/분기/반기/연) */
  payoutCycle: PayoutCycle;
  /** 연속 배당 연수 — 기준 연도부터 끊김 없이 배당한 햇수 */
  consecutiveYears: number;
  /**
   * 조회 범위 상한에 걸렸는지 — true면 실제 연속 연수가 더 길 수 있어
   * 화면에서 "N년"이 아닌 "N년+"로 표기한다 (§43 미확정 항목의 방어 처리).
   */
  yearsCapped: boolean;
  /** 우선주 여부 — 예탁원 `stk_kind === "우선"` (비고 "우") */
  preferred: boolean;
  /** 최근 1년 주식배당률(%) — >0이면 현금+주식 병행(비고 "현+주N%"), 없으면 null */
  stockDividendRate: number | null;
  /** 액면분할 보정 적용 여부 — 배당 당시 액면가≠현재 액면가라 주당배당금을 조정함 */
  splitAdjusted: boolean;
  /** 폭배(비경상 급증) 후보 — 전년 대비 급증 감지 (DART 조회 실패해도 "폭배" 표기) */
  surgeCandidate: boolean;
  /** 폭배 DART 배당결정 수치 — 최종 TOP N 폭배 종목만 채워짐, 아니면 null */
  surge: DividendSurgeDart | null;
  /** [스캔 전용] 최근 1년 배당 회차의 액면가(원) — 분할 보정 대조용(화면 미사용) */
  dividendFaceValue: number;
}

/** market:dividendRanking — 화면이 그대로 읽는 시가배당률 TOP N */
export interface StoredDividendRanking {
  /** 산출 기준일 "YYYY-MM-DD" (KST) — 완료 가드의 키 */
  computedFor: string;
  universeCount: number;
  /** 시가배당률 내림차순 (동률 시 코드 오름차순) */
  entries: DividendRankingEntry[];
  fetchedAt: string;
}

/**
 * market:dividendRanking:progress — 시간 예산 소진 시 이어받기용 커서.
 * 전 종목 값을 들고 가지 않고 상위 N만 유지한다(온라인 선택). 완료 시 삭제.
 */
export interface DividendRankingProgress {
  computedFor: string;
  /** 유니버스(코드 오름차순) 다음 처리 인덱스 */
  cursor: number;
  universeCount: number;
  entries: DividendRankingEntry[];
  /**
   * 종목코드 → 현재가(원) 스냅샷. 분할 실행이 같은 가격 기준을 쓰도록 첫 실행에서
   * 한 번만 받아 물려준다 — 이어받기마다 새로 받으면 앞뒤 회차의 배당률 기준이
   * 달라져 한 순위표 안에서 정렬이 어긋난다. ~2,650종목 ≈ 50KB.
   */
  prices: Record<string, number>;
}

const RANKING_KEY = "market:dividendRanking";
const PROGRESS_KEY = "market:dividendRanking:progress";

export async function getDividendRanking(): Promise<StoredDividendRanking | null> {
  return getRedis().get<StoredDividendRanking>(RANKING_KEY);
}

export async function setDividendRanking(
  value: StoredDividendRanking
): Promise<void> {
  await getRedis().set(RANKING_KEY, value);
}

export async function getDividendRankingProgress(): Promise<DividendRankingProgress | null> {
  return getRedis().get<DividendRankingProgress>(PROGRESS_KEY);
}

export async function setDividendRankingProgress(
  value: DividendRankingProgress
): Promise<void> {
  await getRedis().set(PROGRESS_KEY, value);
}

export async function deleteDividendRankingProgress(): Promise<void> {
  await getRedis().del(PROGRESS_KEY);
}
