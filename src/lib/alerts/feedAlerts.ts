import type { DisclosureItem } from "@/lib/feeds/store";
import { getStockSnapshots, type StoredStockSnapshot } from "@/lib/market/store";
import { sendPushToEmail } from "@/lib/push/send";
import type { Holding } from "@/types/holdings";
import type { WatchItem } from "@/types/watchlist";
import {
  getDisclosureCursors,
  getMarketWarnStates,
  getMutedSymbols,
  setDisclosureCursor,
  setMarketWarnState,
  type MarketWarnState,
} from "./store";

/**
 * 공시·시장경보 알림 판정·발송 — Phase 10 3단계 (plan.md §10.6).
 * feeds 갱신 잡(refreshFeeds)의 알림 훅에서만 호출된다. 시세 알림(evaluate.ts)과 달리
 * 쿨다운이 없고, 종목별 전역 커서(마지막 통지 접수번호·경보 상태)로 중복을 차단한다.
 * 대상 종목은 피드 수집 범위와 동일한 보유+관심종목이며, 음소거 목록은 시세 알림과 공유.
 */

interface DisclosureCategory {
  /** 알림 본문에 붙일 유형 라벨 */
  label: string;
  /** 보고서명 부분 문자열 — 하나라도 포함되면 매칭 (§10.6 실측 확정 키워드) */
  keywords: string[];
  /** 포함 시 이 유형에서 제외할 부분 문자열 (증권사 ELB/DLB 등 노이즈) */
  excludes?: string[];
}

/**
 * 공시 알림 8유형 — 최근 60일 전체 상장사 21,135건 실스캔으로 확정한 키워드 (§10.6).
 * DART list.json 응답엔 공시유형 필드가 없어 보고서명 키워드 매칭으로 분류한다.
 */
const DISCLOSURE_CATEGORIES: DisclosureCategory[] = [
  { label: "상장폐지", keywords: ["상장폐지", "상장적격성"] },
  { label: "회계·감사", keywords: ["감사보고서", "감사의견", "회계처리"] },
  { label: "관리종목·환기", keywords: ["관리종목", "환기"] },
  { label: "배당", keywords: ["배당"] },
  { label: "무상증자", keywords: ["무상증자"] },
  { label: "유상증자", keywords: ["유상증자", "일반공모증자"] },
  // 파생결합사채(ELB/DLB)는 증권사 상품 발행이라 회사 신용 이벤트가 아니다
  { label: "회사채", keywords: ["사채", "채무증권"], excludes: ["파생결합"] },
  {
    label: "대출·채무보증",
    keywords: ["채무보증", "담보제공", "대여", "차입", "대출"],
  },
];

/** 보고서명 → 매칭된 알림 유형 라벨 (없으면 빈 배열 = 알림 대상 아님) */
export function matchDisclosureCategories(reportNm: string): string[] {
  return DISCLOSURE_CATEGORIES.filter(
    (category) =>
      category.keywords.some((keyword) => reportNm.includes(keyword)) &&
      !(category.excludes ?? []).some((keyword) => reportNm.includes(keyword))
  ).map((category) => category.label);
}

/**
 * KIS 현재가 스냅샷 raw → 시장경보 상태 (§10.6 프로덕션 실측 필드 6종).
 * 필드 결측은 "경보 없음"으로 정규화 — 양쪽 다 결측이면 diff가 안 나 오탐이 없다.
 */
export function extractMarketWarnState(
  raw: StoredStockSnapshot["raw"]
): MarketWarnState {
  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;

  return {
    warnCode: str(raw.mrkt_warn_cls_code, "00"),
    cautionYn: str(raw.invt_caful_yn, "N"),
    managedYn: str(raw.mang_issu_cls_code, "N"),
    shortOverYn: str(raw.short_over_yn, "N"),
    tempStopYn: str(raw.temp_stop_yn, "N"),
    liquidationYn: str(raw.sltr_yn, "N"),
  };
}

const MARKET_WARN_LABELS: Record<string, string> = {
  "01": "투자주의",
  "02": "투자경고",
  "03": "투자위험",
};

/** "지정" 상태 판정 — Y/N 필드와 코드형 필드("00"=없음)를 함께 수용한다 */
function isFlagOn(value: string): boolean {
  return value !== "N" && value !== "00";
}

/** 회차 간 상태 변화 → 알림 문구 목록 (변화 없으면 빈 배열) */
export function diffMarketWarnStates(
  prev: MarketWarnState,
  next: MarketWarnState
): string[] {
  const changes: string[] = [];

  if (prev.warnCode !== next.warnCode) {
    const label = MARKET_WARN_LABELS[next.warnCode];
    changes.push(label !== undefined ? `${label} 지정` : "시장경보 해제");
  }
  if (prev.cautionYn !== next.cautionYn) {
    changes.push(
      isFlagOn(next.cautionYn) ? "투자주의환기종목 지정" : "투자주의환기종목 해제"
    );
  }
  if (prev.managedYn !== next.managedYn) {
    changes.push(isFlagOn(next.managedYn) ? "관리종목 지정" : "관리종목 해제");
  }
  if (prev.shortOverYn !== next.shortOverYn) {
    changes.push(
      isFlagOn(next.shortOverYn) ? "단기과열종목 지정" : "단기과열종목 해제"
    );
  }
  if (prev.tempStopYn !== next.tempStopYn) {
    changes.push(isFlagOn(next.tempStopYn) ? "거래정지" : "거래정지 해제");
  }
  if (prev.liquidationYn !== next.liquidationYn) {
    changes.push(
      isFlagOn(next.liquidationYn) ? "정리매매 개시" : "정리매매 종료"
    );
  }

  return changes;
}

export interface FeedAlertsReport {
  disclosures: {
    /** 커서가 없어 기준점만 저장한 종목 수 (첫 회차 — 발송 안 함) */
    baselined: number;
    /** 새 공시 중 유형 매칭된 건수 */
    matched: number;
    /** 발송 성공(도달 기기 ≥1) 건수 — 이메일×공시 단위 */
    sent: number;
    /** 음소거로 건너뛴 건수 */
    mutedSkipped: number;
  };
  marketWarnings: {
    baselined: number;
    /** 경보 상태 변화를 감지한 종목 수 */
    changed: number;
    sent: number;
    mutedSkipped: number;
  };
}

interface DisclosureEvent {
  symbolCode: string;
  item: DisclosureItem;
  categories: string[];
}

interface MarketWarnEvent {
  symbolCode: string;
  changes: string[];
}

/**
 * 공시·시장경보 알림 파이프라인.
 * 커서·경보 상태는 발송 결과와 무관하게 전진시킨다 — 일시 발송 실패로 다음 회차에
 * 같은 알림이 중복 발송되는 것보다 한 번 놓치는 쪽을 택한 설계 (§10.6 3단계).
 * 이메일 단위 실패 격리 — 한 사용자 오류가 다른 사용자 발송을 막지 않는다.
 */
export async function evaluateFeedAlerts(context: {
  /** 이번 회차에 방금 받아온 종목별 공시 (조회 실패 종목은 없음) */
  disclosuresBySymbol: Map<string, DisclosureItem[]>;
  holdingsByEmail: Map<string, Holding[]>;
  watchlistsByEmail: Map<string, WatchItem[]>;
  /** 종목코드→종목명 — 없으면 코드로 표기 */
  names: Map<string, string>;
}): Promise<FeedAlertsReport> {
  const report: FeedAlertsReport = {
    disclosures: { baselined: 0, matched: 0, sent: 0, mutedSkipped: 0 },
    marketWarnings: { baselined: 0, changed: 0, sent: 0, mutedSkipped: 0 },
  };

  // 1. 공시 — 종목별 커서(마지막 통지 접수번호) 이후의 새 공시만 유형 매칭
  const disclosureEvents: DisclosureEvent[] = [];
  const disclosureCodes = [...context.disclosuresBySymbol.keys()];
  const cursors = await getDisclosureCursors(disclosureCodes);

  for (const [symbolCode, items] of context.disclosuresBySymbol) {
    const numbered = items.filter((item) => item.rceptNo !== "");
    if (numbered.length === 0) {
      continue;
    }

    // 접수번호는 "YYYYMMDD+일련" 14자리 고정이라 문자열 비교가 곧 시간순이다
    const latest = numbered.reduce((max, item) =>
      item.rceptNo > max.rceptNo ? item : max
    ).rceptNo;
    const cursor = cursors.get(symbolCode);

    if (cursor === undefined) {
      // 첫 회차 — 과거 공시로 알림이 쏟아지지 않게 기준점만 저장
      await setDisclosureCursor(symbolCode, latest);
      report.disclosures.baselined += 1;
      continue;
    }

    for (const item of numbered) {
      if (item.rceptNo <= cursor) {
        continue;
      }
      const categories = matchDisclosureCategories(item.reportNm);
      if (categories.length > 0) {
        disclosureEvents.push({ symbolCode, item, categories });
        report.disclosures.matched += 1;
      }
    }

    if (latest > cursor) {
      await setDisclosureCursor(symbolCode, latest);
    }
  }

  // 2. 시장경보 — 저장된 KIS 스냅샷(새 API 호출 없음)의 경보 필드 회차 간 비교
  const warnEvents: MarketWarnEvent[] = [];
  const warnCodes = [
    ...new Set([
      ...[...context.holdingsByEmail.values()]
        .flat()
        .map((holding) => holding.symbolCode),
      ...[...context.watchlistsByEmail.values()]
        .flat()
        .map((item) => item.symbolCode),
    ]),
  ];
  const [snapshots, prevStates] = await Promise.all([
    getStockSnapshots(warnCodes),
    getMarketWarnStates(warnCodes),
  ]);

  for (const symbolCode of warnCodes) {
    const snapshot = snapshots.get(symbolCode);
    if (snapshot === undefined) {
      continue;
    }

    const nextState = extractMarketWarnState(snapshot.raw ?? {});
    const prevState = prevStates.get(symbolCode);

    if (prevState === undefined) {
      await setMarketWarnState(symbolCode, nextState);
      report.marketWarnings.baselined += 1;
      continue;
    }

    const changes = diffMarketWarnStates(prevState, nextState);
    if (changes.length > 0) {
      warnEvents.push({ symbolCode, changes });
      report.marketWarnings.changed += 1;
      await setMarketWarnState(symbolCode, nextState);
    }
  }

  if (disclosureEvents.length === 0 && warnEvents.length === 0) {
    return report;
  }

  // 3. 발송 — 사용자별 보유+관심종목에 해당하는 이벤트만, 음소거 공유 적용
  const emails = new Set([
    ...context.holdingsByEmail.keys(),
    ...context.watchlistsByEmail.keys(),
  ]);

  for (const email of emails) {
    const held = new Set(
      (context.holdingsByEmail.get(email) ?? []).map(
        (holding) => holding.symbolCode
      )
    );
    const owned = new Set([
      ...held,
      ...(context.watchlistsByEmail.get(email) ?? []).map(
        (item) => item.symbolCode
      ),
    ]);

    const myDisclosures = disclosureEvents.filter((event) =>
      owned.has(event.symbolCode)
    );
    const myWarnings = warnEvents.filter((event) =>
      owned.has(event.symbolCode)
    );
    if (myDisclosures.length === 0 && myWarnings.length === 0) {
      continue;
    }

    try {
      const mutedSet = new Set(await getMutedSymbols(email));
      const nameOf = (symbolCode: string): string => {
        const name = context.names.get(symbolCode)?.trim() ?? "";
        return name === "" ? symbolCode : name;
      };

      for (const event of myDisclosures) {
        if (mutedSet.has(event.symbolCode)) {
          report.disclosures.mutedSkipped += 1;
          continue;
        }
        const sendReport = await sendPushToEmail(email, {
          title: `공시 알림 — ${nameOf(event.symbolCode)}`,
          body: `[${event.categories.join("·")}] ${event.item.reportNm}`,
          url: "/feeds",
          tag: `disclosure-${event.symbolCode}-${event.item.rceptNo}`,
        });
        if (sendReport.sent > 0) {
          report.disclosures.sent += 1;
        }
      }

      for (const event of myWarnings) {
        if (mutedSet.has(event.symbolCode)) {
          report.marketWarnings.mutedSkipped += 1;
          continue;
        }
        const sendReport = await sendPushToEmail(email, {
          title: `시장경보 — ${nameOf(event.symbolCode)}`,
          body: event.changes.join(" · "),
          url: held.has(event.symbolCode)
            ? `/stocks/${event.symbolCode}?kind=holding`
            : `/stocks/${event.symbolCode}?kind=watch`,
          tag: `marketwarn-${event.symbolCode}`,
        });
        if (sendReport.sent > 0) {
          report.marketWarnings.sent += 1;
        }
      }
    } catch (error) {
      console.error(`[alerts] feed alert failed (${email}):`, error);
    }
  }

  return report;
}
