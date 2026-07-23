import type { DividendRankingEntry } from "./store";

/**
 * 배당률 순위 표시 포매터 — Phase 51에서 summary.ts(리더, Redis 의존)에서 분리.
 * 순수 함수만 모아 서버(page.tsx)와 클라이언트(DividendRankRow.tsx)가 함께
 * import해도 Redis 클라이언트가 클라이언트 번들에 딸려오지 않도록 한다.
 */

/** 지급 주기 표기 — 배당 기준일 평균 간격 기반 라벨(월/분기/반기/연), 없으면 "—" (Phase 44) */
export function formatPayoutCycle(entry: DividendRankingEntry): string {
  return entry.payoutCycle ?? "—";
}

/** 연속 배당 연수 표기 — 조회 상한에 걸렸으면 "N년+" (§43) */
export function formatConsecutiveYears(entry: DividendRankingEntry): string {
  if (entry.consecutiveYears === 0) {
    return "—";
  }
  return `${entry.consecutiveYears}년${entry.yearsCapped ? "+" : ""}`;
}

/** 주식배당 병행 표기 — "현+주0.75%", 없으면 null (Phase 44).
    `== null`로 구 스키마(필드 미존재)도 안전하게 null 처리 */
export function formatStockDividend(entry: DividendRankingEntry): string | null {
  if (entry.stockDividendRate == null || entry.stockDividendRate <= 0) {
    return null;
  }
  return `현+주${entry.stockDividendRate}%`;
}

/**
 * 회차별 배당률(연 환산·현재가 기준)과 지급 주기 괄호 라벨 — Phase 53.
 * 분자 = 주당배당금을 지급 주기로 연 환산(월×12·분기×4·반기×2·연/판정불가×1),
 * 분모 = 산출 시점 현재가(`entry.price`). 모든 회차가 같은 분모라 회차끼리 바로
 * 비교돼 폭배 회차만 튀고 정상 배당률 수준이 한눈에 들어온다(사용자 목표).
 * `perShare`는 잡에서 액면분할 보정을 마친 값이라 헤더 배당률과 기준이 일치한다.
 *
 * `label` = 괄호 안 문자열("1/12"·"1/4"·"1/2"), 연·판정불가는 null(괄호 폐기).
 * 특별배당 단독("특배") 표기는 두지 않는다 — 예탁원 `divi_kind`가 분기/결산/반기만
 * 담아(research.md §4.3 실측) 회차 단위로 특별배당을 가려낼 수 없기 때문이다.
 */
export function formatRoundYield(
  entry: DividendRankingEntry,
  perShare: number
): { percent: number; label: string | null } {
  const yield100 = (multiplier: number) =>
    (perShare * multiplier * 100) / entry.price;
  switch (entry.payoutCycle) {
    case "월":
      return { percent: yield100(12), label: "1/12" };
    case "분기":
      return { percent: yield100(4), label: "1/4" };
    case "반기":
      return { percent: yield100(2), label: "1/2" };
    default: // "연" | null(판정 불가는 연과 동일 취급)
      return { percent: yield100(1), label: null };
  }
}

/** DART 공시 원문 딥링크 */
export function dartDisclosureUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}

/** 폭배 툴팁 — DART 배당결정 수치 요약(주당배당금·공식 시가배당율·기준일) */
export function surgeTooltip(entry: DividendRankingEntry): string {
  const parts = ["비경상 급증 — DART 배당결정 공시"];
  const surge = entry.surge;
  if (surge !== null) {
    if (surge.perShare !== null) {
      parts.push(`주당 ${surge.perShare.toLocaleString("ko-KR")}원`);
    }
    if (surge.officialYield !== null) {
      parts.push(`공식 시가배당율 ${surge.officialYield}%`);
    }
    if (surge.recordDate !== null) {
      parts.push(`기준일 ${surge.recordDate}`);
    }
  }
  return parts.join(" · ");
}
