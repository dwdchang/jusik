import { getRedis } from "@/lib/redis/client";

/**
 * 뉴스·공시 피드 Redis 스토어 — Phase 17 (plan.md §17.3).
 * 쓰기는 QStash feeds 갱신 잡(refreshFeeds)만, 읽기는 화면(Server Component)만 수행한다.
 * 전부 사용자 무관 공개 데이터라 암호화하지 않는다.
 */

/** 공시 1건 — DART 뷰어 링크는 rceptNo로 조립한다 */
export interface DisclosureItem {
  /** 보고서명 (예: "주요사항보고서(유상증자결정)") */
  reportNm: string;
  /** 접수번호 — dart.fss.or.kr/dsaf001/main.do?rcpNo={rceptNo} */
  rceptNo: string;
  /** 접수일자 "YYYYMMDD" */
  rceptDt: string;
  /** 제출인 */
  flrNm: string;
  /** 비고 (정정·연결 등 부가 표기) */
  rm: string;
}

/** market:disclosures:{symbolCode} — 최근 공시 스냅샷 (SET 덮어쓰기, 누적 저장 안 함) */
export interface StoredDisclosures {
  symbolCode: string;
  /** 접수일 내림차순 최대 10건 */
  items: DisclosureItem[];
  fetchedAt: string;
}

/** dart:corpCodeMap — 종목코드(6자리)→DART 고유번호(8자리), 30일 주기 저빈도 갱신 */
export interface StoredCorpCodeMap {
  map: Record<string, string>;
  fetchedAt: string;
  /**
   * 마지막 다운로드 **시도** 시각 — 성공·실패 무관하게 갱신한다.
   * fetchedAt(=map이 언제 것인가)과 분리해야 실패가 재시도 간격을 소진한다.
   * 선택 필드 — 이 필드 도입 전에 저장된 값은 fetchedAt으로 폴백한다.
   */
  attemptedAt?: string;
  /**
   * 다운로드에 성공한 map에도 끝내 없던 종목코드 — 우선주처럼 DART가 고유번호를
   * 부여하지 않는 코드가 매번 보정 갱신을 유발하지 않게 막는 네거티브 캐시.
   * 성공 회차마다 재계산하므로 나중에 매핑이 생기면 자동으로 빠진다.
   */
  unmappable?: string[];
}

/** 월별 수출입 실적 1행 — 관세청 수출입총괄 (§17-4), 금액은 모두 USD */
export interface TradeStatMonth {
  /** 기준월 "YYYYMM" */
  yyyymm: string;
  /** 수출액 (USD) */
  expDlr: number;
  /** 수입액 (USD) */
  impDlr: number;
  /** 무역수지 (USD) = expDlr - impDlr */
  balPayments: number;
}

/**
 * market:tradeStats — 월별 수출입 실적 스냅샷 (종목 무관 단일 키, SET 덮어쓰기).
 * 현재 KST 월(부분월)·"총계" 합계행을 제외한 확정월만 담는다.
 */
export interface StoredTradeStats {
  /** 확정월 최신순 내림차순, 최대 13개월 (최신월 + 전년동월 YoY 커버) */
  months: TradeStatMonth[];
  fetchedAt: string;
}

/** 품목(HS 4단위) 1행 — 수출입 상세 (§17.15), 금액은 모두 USD */
export interface TradeDetailItem {
  /** HS 4단위 부호 (예: "8542") */
  hsCd: string;
  /** 품목명 — 관세청 제공값 */
  name: string;
  expDlr: number;
  impDlr: number;
}

/** 국가 1행 — 상위 N개국만 저장 (§17.15) */
export interface TradeDetailCountry {
  /** 국가 코드 (예: "CN") */
  code: string;
  /** 국가명 (예: "중국") */
  name: string;
  expDlr: number;
  impDlr: number;
  /** 그 나라의 교역액 상위 품목 — 클릭 팝업용 (추가 API 호출 없이 같은 조회에서 파생) */
  items: TradeDetailItem[];
}

/**
 * market:tradeDetail:{yyyymm} — 확정월 1개월치 수출입 상세 스냅샷 (SET 덮어쓰기).
 * 97개 류 전수 조회를 집계한 파생 결과만 담아, 원본(13MB)이 아니라 표시분(수 KB)만 굳힌다.
 * 월별 키라 자연 누적된다.
 */
export interface StoredTradeDetail {
  /** 기준 확정월 "YYYYMM" */
  yyyymm: string;
  /** 전체 합계 (97개 류 총합) — "기타" 행을 빼기로 구하는 기준 */
  totalExpDlr: number;
  totalImpDlr: number;
  /** 국가 무관 품목별 교역액 상위 — 내림차순 */
  items: TradeDetailItem[];
  /** 교역액 상위 국가 — 내림차순 */
  countries: TradeDetailCountry[];
  fetchedAt: string;
}

/** 뉴스 1건 — 네이버 검색 API 기사 (§17.13) */
export interface NewsItem {
  /** 기사 제목 (HTML 태그 제거 완료) */
  title: string;
  /** 원문 링크 */
  link: string;
  /** 발행 시각 ms (정렬용) */
  pubDateMs: number;
  /** 발행일 KST "YYYYMMDD" — 오늘 판정·표시용(저장 시점에 굳힘) */
  pubDateKst: string;
}

/** market:news:{symbolCode} — 최신 뉴스 스냅샷 (SET 덮어쓰기, 누적 저장 안 함) */
export interface StoredNews {
  symbolCode: string;
  /** 발행 최신순 최대 10건 */
  items: NewsItem[];
  fetchedAt: string;
}

/** market:disclosures:{code} 키 조립 — 종목별 리더(homeFeed MGET)와 라이터가 공유 */
export function disclosuresKey(symbolCode: string): string {
  return `market:disclosures:${symbolCode}`;
}

/** market:news:{code} 키 조립 — 종목별 리더(homeFeed MGET)와 라이터가 공유 */
export function newsKey(symbolCode: string): string {
  return `market:news:${symbolCode}`;
}

const CORP_CODE_MAP_KEY = "dart:corpCodeMap";

/** market:tradeStats — 종목 무관 단일 키 (수출입은 시장 전체 지표) */
const TRADE_STATS_KEY = "market:tradeStats";

/** market:tradeDetail:{yyyymm} 키 조립 — 확정월별 상세 (§17.15) */
function tradeDetailKey(yyyymm: string): string {
  return `market:tradeDetail:${yyyymm}`;
}

/**
 * market:tradeDetail:months — 상세를 확보한 확정월 목록(최신순).
 * 상세는 갱신 시점 이후의 달만 쌓이므로, 어느 달에 상세 링크를 걸 수 있는지
 * 알려면 목록이 필요하다. 월별 키를 SCAN 하지 않으려고 인덱스로 둔다.
 */
const TRADE_DETAIL_MONTHS_KEY = "market:tradeDetail:months";

export async function setDisclosures(value: StoredDisclosures): Promise<void> {
  await getRedis().set(disclosuresKey(value.symbolCode), value);
}

export async function setNews(value: StoredNews): Promise<void> {
  await getRedis().set(newsKey(value.symbolCode), value);
}

export async function getCorpCodeMap(): Promise<StoredCorpCodeMap | null> {
  return getRedis().get<StoredCorpCodeMap>(CORP_CODE_MAP_KEY);
}

export async function setCorpCodeMap(value: StoredCorpCodeMap): Promise<void> {
  await getRedis().set(CORP_CODE_MAP_KEY, value);
}

export async function getTradeStats(): Promise<StoredTradeStats | null> {
  return getRedis().get<StoredTradeStats>(TRADE_STATS_KEY);
}

export async function setTradeStats(value: StoredTradeStats): Promise<void> {
  await getRedis().set(TRADE_STATS_KEY, value);
}

export async function getTradeDetail(
  yyyymm: string
): Promise<StoredTradeDetail | null> {
  return getRedis().get<StoredTradeDetail>(tradeDetailKey(yyyymm));
}

export async function setTradeDetail(value: StoredTradeDetail): Promise<void> {
  await getRedis().set(tradeDetailKey(value.yyyymm), value);
}

export async function getTradeDetailMonths(): Promise<string[]> {
  return (await getRedis().get<string[]>(TRADE_DETAIL_MONTHS_KEY)) ?? [];
}

export async function setTradeDetailMonths(months: string[]): Promise<void> {
  await getRedis().set(TRADE_DETAIL_MONTHS_KEY, months);
}
