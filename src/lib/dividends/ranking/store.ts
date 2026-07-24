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

/** 종목 유형 — 일반종목(주권) / 배당상품(ETF·리츠·인프라펀드) (Phase 46) */
export type DividendInstrumentType = "stock" | "fund";

/** 지난 배당 회차 1건 — 순위 종목명 클릭 시 펼침용 (Phase 51) */
export interface DividendRoundRecord {
  /** 배당 기준일 "YYYY-MM-DD" */
  recordDate: string;
  /** 주당배당금(원) — 확정 회차만 담으므로 항상 >0 */
  perShare: number;
  /** 현금 지급일 "YYYY-MM-DD" — 미정이면 null */
  payDate: string | null;
  /** 배당종류 — "분기"/"결산"/"중간" 등, 없으면 null */
  kind: string | null;
  /**
   * 헤더 시가배당률에 산입된 회차인지 — 사업연도 귀속 basis 창에 든 회차만 true (Phase 59).
   * 펼침 표에서 이 회차들을 강조해 "헤더 배당률 = 강조 행 합"임을 드러낸다. 구 스키마엔 없음.
   */
  inBasis?: boolean;
}

export interface DividendRankingEntry {
  rank: number;
  code: string;
  name: string;
  market: UniverseMarket;
  /**
   * 종목 유형 — "stock"=일반종목(ST), "fund"=배당상품(ETF/리츠/인프라펀드) (Phase 46).
   * 구 스키마 엔트리에는 없어 리더에서 탭 분류 시 목록 소속으로 판단한다.
   */
  instrumentType: DividendInstrumentType;
  /** 산출 시점 현재가(원) — 배당률의 분모, 순위와 한 세트로 고정 */
  price: number;
  /**
   * 시가배당률(%) = 배당 basis 주당배당금 합 ÷ 현재가 × 100, 소수 둘째 자리 (Phase 59).
   * basis = 직전 사업연도 확정 배당 합(결산 회차 없거나 오래되면·배당상품이면 최근 1년 롤링).
   */
  dividendYield: number;
  /** 배당 basis 주당배당금 합계(원) — 직전 사업연도 합(폴백 시 최근 1년), 분할 보정 시 신주 기준 */
  annualDividendPerShare: number;
  /** 배당 basis 회차 수 (직전 사업연도, 폴백 시 최근 1년) */
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
  /**
   * 지난 배당 기록 — 종목명 클릭 시 펼침용, 최신순 (Phase 51). 지급 주기별 보존
   * 창(연 6년·반기 4년·분기 2년·월 12개월, 판정불가는 연과 동일)으로 잘라 담는다.
   * 구 스키마 엔트리에는 없어 화면에서 `?? []`로 폴백한다.
   */
  history?: DividendRoundRecord[];
  /**
   * 배당률 basis가 귀속된 사업연도 "YYYY" — 결산 회차로 사업연도를 구분한 경우만 (Phase 59).
   * null(또는 필드 없음)이면 폴백(최근 1년 롤링): 결산 회차가 없거나 최신 결산이 오래됐거나
   * 배당상품인 경우. 펼침 캡션·헤더 툴팁에서 "N 사업연도 기준" 표기에 쓴다.
   */
  dividendBasisYear?: string | null;
}

/** market:dividendRanking — 화면이 그대로 읽는 시가배당률 TOP N */
export interface StoredDividendRanking {
  /** 산출 기준일 "YYYY-MM-DD" (KST) — 완료 가드의 키 */
  computedFor: string;
  /** 일반종목(ST) 스캔 대상 수 */
  universeCount: number;
  /** 일반종목(ST) — 시가배당률 내림차순 (동률 시 코드 오름차순) */
  entries: DividendRankingEntry[];
  /**
   * 배당상품(ETF/리츠/인프라펀드) 스캔 대상 수 (Phase 46).
   * 구 스키마에는 없어 리더에서 `?? 0`으로 폴백한다.
   */
  productUniverseCount?: number;
  /**
   * 배당상품(ETF/리츠/인프라펀드) 시가배당률 내림차순 (Phase 46).
   * 구 스키마에는 없어 리더에서 `?? []`로 폴백한다.
   */
  productEntries?: DividendRankingEntry[];
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
  /** 일반종목(ST) 상위 버퍼 */
  entries: DividendRankingEntry[];
  /** 배당상품(EF/RT/IF) 상위 버퍼 (Phase 46) */
  productEntries: DividendRankingEntry[];
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
