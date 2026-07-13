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
  /** 접수번호 — dart.fss.or.kr/dsaf001/main.do?rcptNo={rceptNo} */
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
}

/** market:disclosures:{code} 키 조립 — 종목별 리더(homeFeed MGET)와 라이터가 공유 */
export function disclosuresKey(symbolCode: string): string {
  return `market:disclosures:${symbolCode}`;
}

const CORP_CODE_MAP_KEY = "dart:corpCodeMap";

export async function setDisclosures(value: StoredDisclosures): Promise<void> {
  await getRedis().set(disclosuresKey(value.symbolCode), value);
}

export async function getCorpCodeMap(): Promise<StoredCorpCodeMap | null> {
  return getRedis().get<StoredCorpCodeMap>(CORP_CODE_MAP_KEY);
}

export async function setCorpCodeMap(value: StoredCorpCodeMap): Promise<void> {
  await getRedis().set(CORP_CODE_MAP_KEY, value);
}
