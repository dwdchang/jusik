"use server";

import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getIntradayArchive } from "@/lib/market/store";
import {
  INTRADAY_ARCHIVE_SINCE,
  type IntradayFlowSlot,
  type MarketIndex,
} from "@/types/indices";

/**
 * 지수 상세(`/indices/*`) Server Actions (§93).
 * **Redis 스냅샷만 읽고 KIS는 호출하지 않는다** (AGENTS.md §2).
 */

const TRADING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 일별 수급 표에서 펼친 하루의 장중 시각 슬롯 (§93).
 *
 * 상세 진입 시 20일치를 미리 내려보내면 대부분 펼치지 않을 215KB(raw)가 매번
 * 페이로드에 실린다. 그래서 **클릭한 날짜만** `:archive:{날짜}` GET 1회로 가져온다.
 * 받은 날짜는 화면이 상태에 남겨 다시 펼칠 때 재요청하지 않는다.
 *
 * 수동 트리거 슬롯(`:manual:{날짜}`)은 읽지 않는다 — 정규 회차 사이 비정형 시각이라
 * 시계열에 섞으면 간격이 어긋나 보인다(§92의 격리 이유와 같다).
 *
 * 슬롯이 없는 날(잡 실패·축적 이전)은 빈 배열이다. 화면은 이를 "기록 없음"으로 쓰고,
 * Redis 자체가 실패하면 예외가 그대로 올라가 "불러오지 못했습니다"가 된다.
 */
export async function fetchIntradayFlowSlots(
  market: MarketIndex,
  tradingDate: string
): Promise<IntradayFlowSlot[]> {
  // Server Action은 UI를 거치지 않고도 POST할 수 있는 엔드포인트라 렌더 시점의
  // 페이지 게이트(`ensureAllowedSession`)와 별개로 여기서 다시 막는다.
  const session = await auth();
  if (!isEmailAllowed(session?.user?.email)) {
    return [];
  }

  if (market !== "KOSPI" && market !== "KOSDAQ") {
    return [];
  }

  // 형식·범위 검증 — 키 조립에 그대로 들어가는 값이라 패턴을 벗어나면 조회하지 않는다.
  if (
    !TRADING_DATE_PATTERN.test(tradingDate) ||
    tradingDate < INTRADAY_ARCHIVE_SINCE
  ) {
    return [];
  }

  const archive = await getIntradayArchive(market, tradingDate);
  return archive?.slots ?? [];
}
