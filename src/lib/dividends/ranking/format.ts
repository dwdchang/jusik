import type { DividendRankingEntry, DividendRoundRecord } from "./store";

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
 * 회차별 배당률(연 환산·현재가 기준) — Phase 53.
 * 분자 = 주당배당금을 지급 주기로 연 환산(월×12·분기×4·반기×2·연/판정불가×1),
 * 분모 = 산출 시점 현재가(`entry.price`). 모든 회차가 같은 분모라 회차끼리 바로
 * 비교돼 폭배 회차만 튀고 정상 배당률 수준이 한눈에 들어온다(사용자 목표).
 * `perShare`는 잡에서 액면분할 보정을 마친 값이라 헤더 배당률과 기준이 일치한다.
 * 괄호 순번 라벨은 Phase 54에서 `roundYearOrdinals`로 분리(연 환산 배수와 무관).
 */
export function formatRoundYield(
  entry: DividendRankingEntry,
  perShare: number
): number {
  const yield100 = (multiplier: number) =>
    (perShare * multiplier * 100) / entry.price;
  switch (entry.payoutCycle) {
    case "월":
      return yield100(12);
    case "분기":
      return yield100(4);
    case "반기":
      return yield100(2);
    default: // "연" | null(판정 불가는 연과 동일 취급)
      return yield100(1);
  }
}

/**
 * 회차별 "그해 순번" 괄호 라벨 — Phase 54(B안). `recordDate`의 연도(앞 4자)로 묶어
 * 그해 관측된 배당을 기준일 오름차순으로 세어 `순번/그해개수`("1/2"·"2/2")를 만든다.
 * 지급 주기와 무관하게 실제 관측 회차만 세므로(B안), 그해 1회뿐이면 순번이 무의미해
 * 라벨을 두지 않는다(연·비정기 배당은 자연히 괄호 없음). 예탁원이 중간 회차를 놓친
 * 해는 분모가 실제보다 작을 수 있으나 사용자가 자체 판단하기로 확정(B안).
 *
 * 반환은 `recordDate` → 라벨 맵 — 펼침 표가 회차 key로 recordDate를 쓰므로(고유) 안전.
 * history의 저장 순서(최신순)와 무관하게 연도별로 오름차순 정렬해 순번을 매긴다.
 */
export function roundYearOrdinals(
  history: DividendRoundRecord[]
): Map<string, string> {
  const byYear = new Map<string, DividendRoundRecord[]>();
  for (const round of history) {
    const year = round.recordDate.slice(0, 4);
    const bucket = byYear.get(year);
    if (bucket) {
      bucket.push(round);
    } else {
      byYear.set(year, [round]);
    }
  }

  const labels = new Map<string, string>();
  for (const rounds of byYear.values()) {
    if (rounds.length <= 1) {
      continue; // 그해 1회 → 순번 무의미(괄호 폐기)
    }
    const ascending = [...rounds].sort((a, b) =>
      a.recordDate < b.recordDate ? -1 : a.recordDate > b.recordDate ? 1 : 0
    );
    ascending.forEach((round, index) => {
      labels.set(round.recordDate, `${index + 1}/${ascending.length}`);
    });
  }
  return labels;
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
