import {
  getDailyFluctuation,
  type DailyFluctuationItem,
} from "@/lib/market/store";

/**
 * 홈 "핫종목" 카드 요약 — 당일 등락률 상위 4종목 (§17.12, §33에서 4행 통일).
 * 월간 랭킹 대신 장중 시세 갱신 잡이 저장한 당일 등락률 스냅샷을 읽는다.
 * 데이터 미존재 시 null (카드는 placeholder 표시).
 */

export interface DailyHotCardSummary {
  /** 당일 등락률 상위 4종목 */
  top4: DailyFluctuationItem[];
  /** 잡이 KIS에서 받아온 시각 (ISO) — staleness 판정·표기용 */
  fetchedAt: string;
}

export async function getDailyHotCardSummary(): Promise<DailyHotCardSummary | null> {
  const stored = await getDailyFluctuation();
  if (stored === null || stored.items.length === 0) {
    return null;
  }

  return {
    top4: stored.items.slice(0, 4),
    fetchedAt: stored.fetchedAt,
  };
}
