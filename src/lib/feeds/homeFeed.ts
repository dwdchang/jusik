import { getRedis } from "@/lib/redis/client";
import { disclosuresKey, type StoredDisclosures } from "@/lib/feeds/store";
import { getHoldings } from "@/lib/holdings/store";
import { getWatchlist } from "@/lib/watchlist/store";

/**
 * 홈 통합 피드 리더 — Phase 17-2 (plan.md §17.7).
 * 로그인 사용자의 보유+관심종목 여러 개에 흩어진 종목별 스냅샷을
 * 시간순으로 병합해 게시판 한 목록으로 만든다. 읽기 전용(Redis만) —
 * 저장/삭제는 하지 않는다.
 *
 * 종목별 원본(`market:disclosures:{code}`)은 수집 잡이 매 회차 최신 N건으로
 * SET 덮어쓰기하므로 누적되지 않는다. 따라서 아래 상위 컷은 조회 시점
 * 계산만으로 충분하며 별도 정리 로직이 필요 없다 (사용자 확인 2026-07-13).
 */

/** 홈 게시판에 노출하는 최대 병합 건수 — 아카이브가 아닌 최신 스냅샷 뷰 (§17.7) */
const HOME_FEED_LIMIT = 40;

const DART_VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do";

/** 게시판 1행 — 공시·(후속)뉴스가 공유하는 통합 표시 모델 */
export interface FeedBoardItem {
  /** 병합·React key용 고유 id */
  id: string;
  symbolCode: string;
  /** 표시용 종목명 (개인 데이터에 이미 존재) */
  stockName: string;
  /** 게시판 제목 (공시=보고서명) */
  title: string;
  /** 정렬 키 — 큰 값이 최신 (공시=접수번호, 날짜 프리픽스 포함해 장중 순서까지 반영) */
  sortKey: string;
  /** 표시용 날짜 "YYYYMMDD" */
  date: string;
  /** 아코디언 메타 (공시=제출인) */
  meta: string;
  /** 부가 표기 (공시=정정·연결 등 rm) */
  remark: string;
  /** 원문 링크 — 새 탭 이동 */
  url: string;
}

/**
 * 로그인 사용자의 보유+관심종목 `{종목코드 → 종목명}` — 중복 코드는 1회만.
 * 종목명은 개인 데이터에 이미 저장돼 있어 별도 조회가 필요 없다.
 * 개별 실패는 빈 배열로 격리 (홈 전체를 막지 않는다).
 */
async function collectOwnedStocks(email: string): Promise<Map<string, string>> {
  const [holdings, watchlist] = await Promise.all([
    getHoldings(email).catch(() => []),
    getWatchlist(email).catch(() => []),
  ]);

  const byCode = new Map<string, string>();
  for (const h of holdings) {
    if (!byCode.has(h.symbolCode)) {
      byCode.set(h.symbolCode, h.name || h.symbolCode);
    }
  }
  for (const w of watchlist) {
    if (!byCode.has(w.symbolCode)) {
      byCode.set(w.symbolCode, w.name || w.symbolCode);
    }
  }
  return byCode;
}

/**
 * 공시 게시판 — 사용자 보유+관심종목의 공시 스냅샷을 MGET 일괄 조회 후
 * 접수 순서 내림차순 병합, 상위 HOME_FEED_LIMIT건으로 컷.
 */
export async function getDisclosureBoard(email: string): Promise<FeedBoardItem[]> {
  const owned = await collectOwnedStocks(email);
  const codes = [...owned.keys()];
  if (codes.length === 0) {
    return [];
  }

  const rows = await getRedis().mget<Array<StoredDisclosures | null>>(
    ...codes.map(disclosuresKey)
  );

  const items: FeedBoardItem[] = [];
  rows.forEach((row, i) => {
    if (row === null) {
      return;
    }
    const symbolCode = codes[i];
    const stockName = owned.get(symbolCode) ?? symbolCode;
    for (const d of row.items) {
      items.push({
        id: d.rceptNo,
        symbolCode,
        stockName,
        title: d.reportNm,
        // 접수번호는 "YYYYMMDD + 일련번호" 14자리라 날짜+장중 순서까지 정렬 가능
        sortKey: d.rceptNo,
        date: d.rceptDt,
        meta: d.flrNm,
        remark: d.rm,
        url: `${DART_VIEWER_URL}?rcptNo=${d.rceptNo}`,
      });
    }
  });

  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  return items.slice(0, HOME_FEED_LIMIT);
}
