import { getAnalysisOverview } from "@/lib/analysis/overview";
import { todayKstDate } from "@/lib/date/kst";
import { formatBriefingWhen, isBlankDartCell } from "@/lib/feeds/earnings";
import { visibleEarningsNews } from "@/lib/feeds/earningsNews";
import {
  getCorpCodeMap,
  getEarningsNews,
  getEarningsSnapshots,
  type EarningsItem,
  type EarningsNewsItem,
  type StoredEarnings,
} from "@/lib/feeds/store";
import { getHoldings } from "@/lib/holdings/store";
import { getWatchlist } from "@/lib/watchlist/store";

/**
 * 실적 탭 종목별 블록 — Phase 82 (plan.md §82).
 *
 * **잠정실적(빠름) + 확정실적(정확함)을 한 시계열로 잇는다.** 둘을 나눠 보면 둘 다
 * 반쪽이다 — 종목분석(`/analysis`)이 쓰는 확정 재무제표는 감사·검토를 거쳐 정확하지만
 * 오늘(2026-07-30) 기준 최신이 26.1Q인 반면, 삼성전자 26.2Q 잠정실적은 이미 7월 7일에
 * 나와 있다(약 5주 빠르다). 그래서 확정 분기 시계열 뒤에 **확정에 아직 없는 분기만**
 * 잠정으로 이어 붙이고, 이어 붙인 지점은 화면에서 「잠정」으로 표시한다.
 *
 * 확정분은 `analysis/overview.ts`(TTL 30일 read-through)를 **그대로 재사용**한다 —
 * 같은 DART 재무제표를 두 번 캐시하지 않는다. 첫 조회는 DART를 실제로 부르므로 느려서
 * 화면은 이 블록만 `<Suspense>`로 감싼다(Phase 78 패턴).
 * 잠정분은 갱신 잡이 이미 적재해 둔 `market:earnings:{code}` 스냅샷만 읽는다.
 */

/** 결합 시계열의 분기 1점 — 금액은 전부 **억원**으로 정규화 */
export interface EarningsQuarterPoint {
  /** 정렬·병합 키 "2026Q2" */
  key: string;
  /** 표시 라벨 "26.2Q" */
  label: string;
  revenue: number | null;
  operatingProfit: number | null;
  netProfit: number | null;
  /** 영업이익률 (%) */
  operatingMargin: number | null;
  /** 확정(정기보고서)이 아니라 잠정실적 공정공시에서 온 점인가 */
  provisional: boolean;
}

/** 증감 한 칸 — 증감율이 없으면(흑자·적자 전환) 라벨로 대신한다 */
export interface EarningsChange {
  pct: number | null;
  turnaround: string | null;
}

/** 최신 분기 요약 카드 1칸 */
export interface EarningsHighlight {
  label: string;
  /** 억원 */
  value: number | null;
  qoq: EarningsChange;
  yoy: EarningsChange;
}

/** 잠정 시계열의 출처 공시 — 표 아래 각주·원문 링크용 */
export interface EarningsProvisionalSource {
  reportNm: string;
  rceptNo: string;
  rceptDt: string;
  /** 원문 헤더의 금액 단위 라벨 ("백만원" 등) */
  unit: string;
  /** 당기실적 대상 기간 "2026-04-01 ~ 2026-06-30" */
  period: string;
}

/**
 * 실적발표 안내 (Phase 84) — 잠정실적 공시 「2. 정보제공내역」에서 온다.
 *
 * **IR 개최 공시를 따로 내지 않는 회사도 여기엔 컨퍼런스콜 일정을 적는다** — Phase 82의
 * IR 일정 카드가 비는 종목을 메우는 자리다. 값은 원문 문자열 그대로이므로
 * "-"·"공정공시 후 수시제공" 같은 무의미 값을 화면에 내보내지 않도록 여기서 걸러 둔다.
 */
export interface EarningsBriefingNotice {
  rceptNo: string;
  /** 공시 접수일 "YYYYMMDD" */
  rceptDt: string;
  /** 행사명 — 이 값이 의미 있을 때만 안내를 만든다 */
  event: string;
  /** 일시 한 줄 — 일자/시간이 같은 문구로 중복되면 하나만 남긴다. 없으면 빈 문자열 */
  when: string;
  /** 회사 IR 홈페이지 (없으면 null) */
  irUrl: string | null;
}

/** IR 개최 일정 1건 (화면 표시용 — 스냅샷 항목 + 링크) */
export interface EarningsIrEvent {
  rceptNo: string;
  /** 개최 일시 "2026-07-30 10:00" */
  eventAt: string;
  place: string;
  purpose: string;
  method: string;
  summary: string;
  materialAt: string;
  irUrl: string;
  /** 오늘(KST) 기준 아직 열리지 않은 일정인가 */
  upcoming: boolean;
}

export type EarningsFocus =
  | {
      status: "ok";
      symbolCode: string;
      /** 재무제표 기준 — 확정분 출처 표기용 */
      basis: "연결" | "별도";
      /** 과거 → 최신 */
      points: EarningsQuarterPoint[];
      /** 최신 분기 요약 3칸 (매출액·영업이익·순이익) */
      highlights: EarningsHighlight[];
      /** 최신 분기 라벨 — 요약 카드 제목 */
      latestLabel: string;
      /** 최신 분기가 잠정인가 */
      latestProvisional: boolean;
      provisionalSource: EarningsProvisionalSource | null;
      irEvents: EarningsIrEvent[];
      /** 실적발표 안내 (Phase 84) — 값이 있는 잠정실적 공시만 */
      briefings: EarningsBriefingNotice[];
      /** 실적 관련 보도 (Phase 84) — 발표 후 오래됐으면 빈 배열 */
      news: EarningsNewsItem[];
    }
  | {
      /** 확정 재무를 못 구한 경우 — 잠정·IR만이라도 있으면 함께 싣는다 */
      status: "not_listed" | "no_data" | "error";
      symbolCode: string;
      irEvents: EarningsIrEvent[];
      briefings: EarningsBriefingNotice[];
      news: EarningsNewsItem[];
    };

/**
 * 화면에 그리는 분기 수 — 모바일 폭(480px)에 막대 2종을 얹어도 읽히는 한계가 9분기다.
 * 최신 분기의 전년동기(4칸 뒤)가 반드시 포함되므로 증감 계산에도 부족하지 않다.
 */
const FOCUS_QUARTERS = 9;
/** 종목별로 보여줄 IR 일정 수 */
const IR_EVENT_LIMIT = 4;
/** 종목별로 보여줄 실적발표 안내 수 (Phase 84) — 최근 분기 것만 보이면 충분하다 */
const BRIEFING_LIMIT = 2;

/**
 * 잠정실적 원문 헤더의 단위 라벨 → 억원 환산 배수.
 *
 * 실측(2026-07-20~29 거래소공시 잠정실적 60건)에서는 백만원 45·억원 15만 나왔고
 * 삼성전자는 조원을 쓴다. 목록에 없는 단위는 **환산하지 않는다** — 틀린 축척으로
 * 차트를 그리느니 그 분기를 비우는 편이 낫다.
 */
const UNIT_TO_EOK: Readonly<Record<string, number>> = {
  원: 1e-8,
  천원: 1e-5,
  만원: 1e-4,
  백만원: 1e-2,
  십억원: 10,
  억원: 1,
  조원: 1e4,
};

function toEok(value: number | null | undefined, multiplier: number): number | null {
  return value === null || value === undefined ? null : value * multiplier;
}

function percent(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole === 0) {
    return null;
  }
  return (part / whole) * 100;
}

/**
 * 당기실적 대상기간 → 분기 키. **달력 분기에 정확히 맞는 3개월만** 받는다.
 *
 * 누계(반기·9개월)를 분기값으로 오인하면 시계열이 통째로 뻥튀기된다. 사업연도가
 * 달력과 어긋난 회사도 있어(실측: 03-01~06-30) 시작·종료월을 둘 다 검사한다.
 */
function periodToQuarterKey(period: string | undefined): string | null {
  const match = period?.match(
    /^(\d{4})-(\d{2})-01 ~ (\d{4})-(\d{2})-(\d{2})$/
  );
  if (!match) {
    return null;
  }

  const [, startYear, startMonth, endYear, endMonth] = match;
  if (startYear !== endYear) {
    return null;
  }

  const start = Number(startMonth);
  const end = Number(endMonth);
  if (start % 3 !== 1 || end - start !== 2) {
    return null;
  }
  return `${startYear}Q${(start + 2) / 3}`;
}

function quarterLabel(key: string): string {
  const match = key.match(/^(\d{4})Q(\d)$/);
  return match ? `${match[1].slice(2)}.${match[2]}Q` : key;
}

/** 잠정실적 표에서 계정 한 줄 찾기 */
function figureOf(item: EarningsItem, label: string) {
  return item.figures?.find((figure) => figure.label === label) ?? null;
}

/**
 * 잠정실적 스냅샷 → 분기 키별 포인트. 같은 분기가 여러 건이면(원본 + `[기재정정]`)
 * 접수번호가 큰 쪽, 즉 **나중에 접수된 정정본**을 남긴다.
 */
function collectProvisional(
  items: EarningsItem[]
): Map<string, { point: EarningsQuarterPoint; source: EarningsProvisionalSource; item: EarningsItem }> {
  const byQuarter = new Map<
    string,
    { point: EarningsQuarterPoint; source: EarningsProvisionalSource; item: EarningsItem }
  >();

  for (const item of items) {
    const key = periodToQuarterKey(item.period);
    const multiplier = UNIT_TO_EOK[item.unit ?? ""];
    if (key === null || multiplier === undefined || item.figures === undefined) {
      continue;
    }

    const existing = byQuarter.get(key);
    if (existing !== undefined && existing.item.rceptNo >= item.rceptNo) {
      continue;
    }

    const revenue = toEok(figureOf(item, "매출액")?.current, multiplier);
    const operatingProfit = toEok(
      figureOf(item, "영업이익")?.current,
      multiplier
    );

    byQuarter.set(key, {
      item,
      point: {
        key,
        label: quarterLabel(key),
        revenue,
        operatingProfit,
        netProfit: toEok(figureOf(item, "당기순이익")?.current, multiplier),
        operatingMargin: percent(operatingProfit, revenue),
        provisional: true,
      },
      source: {
        reportNm: item.reportNm,
        rceptNo: item.rceptNo,
        rceptDt: item.rceptDt,
        unit: item.unit ?? "",
        period: item.period ?? "",
      },
    });
  }

  return byQuarter;
}

/** 오늘(KST) "YYYY-MM-DD" — IR 일정의 예정/지난 구분 기준 */
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** IR 개최 공시 → 화면 일정. 예정된 건이 먼저, 그 안에서는 가까운 순 */
function collectIrEvents(items: EarningsItem[]): EarningsIrEvent[] {
  const today = todayKst();
  const events = items.flatMap<EarningsIrEvent>((item) =>
    item.ir === undefined
      ? []
      : [
          {
            ...item.ir,
            rceptNo: item.rceptNo,
            // 일시는 "YYYY-MM-DD HH:MM"(시각 미정이면 "--:--") — 날짜 앞 10자만 비교한다
            upcoming: item.ir.eventAt.slice(0, 10) >= today,
          },
        ]
  );

  const upcoming = events
    .filter((event) => event.upcoming)
    .sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  const past = events
    .filter((event) => !event.upcoming)
    .sort((a, b) => b.eventAt.localeCompare(a.eventAt));

  return [...upcoming, ...past].slice(0, IR_EVENT_LIMIT);
}

/** 두 값의 증감율(%) — 부호가 다르면 비율이 뜻을 잃으므로 전환 라벨로 대신한다 */
function changeOf(
  current: number | null,
  base: number | null,
  fallback: { pct?: number | null; turnaround?: string | null } | null
): EarningsChange {
  if (current !== null && base !== null && base !== 0) {
    if (base > 0 && current > 0) {
      return { pct: ((current - base) / base) * 100, turnaround: null };
    }
    if (base < 0 && current > 0) {
      return { pct: null, turnaround: "흑자전환" };
    }
    if (base > 0 && current < 0) {
      return { pct: null, turnaround: "적자전환" };
    }
    // 적자 지속 — 절대값 증감율은 오히려 오독을 부른다(적자 확대가 "+"로 보인다)
    return { pct: null, turnaround: "적자지속" };
  }
  // 시계열에서 못 구하면 잠정실적 원문이 준 값으로 폴백한다
  return {
    pct: fallback?.pct ?? null,
    turnaround: fallback?.turnaround ?? null,
  };
}

/**
 * 최신 분기 요약 3칸. 증감은 **결합 시계열에서 직접 계산**한다 — 확정·잠정이 섞여도
 * 기준이 하나로 유지된다. 시계열에 짝이 없을 때만 잠정 원문의 증감 칸으로 떨어진다.
 */
function buildHighlights(
  points: EarningsQuarterPoint[],
  provisionalItem: EarningsItem | null
): EarningsHighlight[] {
  const latest = points.at(-1);
  if (latest === undefined) {
    return [];
  }

  const byKey = new Map(points.map((point) => [point.key, point]));
  const [year, quarter] = latest.key.split("Q").map(Number);
  const priorKey =
    quarter === 1 ? `${year - 1}Q4` : `${year}Q${quarter - 1}`;
  const yoyKey = `${year - 1}Q${quarter}`;
  const prior = byKey.get(priorKey) ?? null;
  const yoy = byKey.get(yoyKey) ?? null;

  const specs = [
    { label: "매출액", pick: (p: EarningsQuarterPoint) => p.revenue },
    { label: "영업이익", pick: (p: EarningsQuarterPoint) => p.operatingProfit },
    { label: "순이익", pick: (p: EarningsQuarterPoint) => p.netProfit },
  ];

  return specs.map((spec) => {
    // 잠정 원문의 계정명은 "당기순이익" — 화면 라벨("순이익")과 달라 매핑해 둔다
    const rawLabel = spec.label === "순이익" ? "당기순이익" : spec.label;
    const raw =
      provisionalItem !== null ? figureOf(provisionalItem, rawLabel) : null;

    return {
      label: spec.label,
      value: spec.pick(latest),
      qoq: changeOf(
        spec.pick(latest),
        prior === null ? null : spec.pick(prior),
        raw === null ? null : { pct: raw.qoqPct, turnaround: raw.qoqTurnaround }
      ),
      yoy: changeOf(
        spec.pick(latest),
        yoy === null ? null : spec.pick(yoy),
        raw === null ? null : { pct: raw.yoyPct, turnaround: raw.turnaround }
      ),
    };
  });
}

/**
 * 잠정실적 공시 → 실적발표 안내 (Phase 84). **행사명이 있는 건만** 만든다.
 *
 * 실측(2026-07 잠정실적 25건)에서 서식은 25/25 파싱되지만 값이 채워진 건 5건뿐이고
 * 나머지는 "-"나 "공정공시 후 수시제공"이다 — 전부 렌더하면 빈 줄 20개가 생긴다.
 * 행사명("2026년 2분기 경영실적설명회 (Conference Call)")이 이 안내의 본체라, 그것이
 * 없으면 안내 자체를 만들지 않는다.
 */
function collectBriefings(items: EarningsItem[]): EarningsBriefingNotice[] {
  const notices: EarningsBriefingNotice[] = [];

  for (const item of items) {
    const briefing = item.briefing;
    if (briefing === undefined || isBlankDartCell(briefing.event)) {
      continue;
    }

    notices.push({
      rceptNo: item.rceptNo,
      rceptDt: item.rceptDt,
      event: briefing.event.trim(),
      when: formatBriefingWhen(briefing) ?? "",
      irUrl: item.irUrl ?? null,
    });
  }

  return notices.slice(0, BRIEFING_LIMIT);
}

/** 종목 선택 칩 1개 */
export interface EarningsStockOption {
  symbolCode: string;
  name: string;
  /** 보유·관심 구분 — 칩을 두 줄로 나눠 라벨을 단다 */
  group: "holding" | "watchlist";
  /**
   * 실적 자료를 뽑을 수 있는 종목인가. **우선주(삼성전자우 등)는 DART 고유번호가
   * 없어 재무·공시가 아예 없다** — 눌러도 빈 화면이 나오므로 칩을 비활성으로 둔다.
   */
  supported: boolean;
}

/**
 * 실적 탭 종목 선택 목록 — 보유 먼저, 그다음 관심(양쪽에 있으면 보유로만 1회).
 * 개인 데이터에 종목명이 이미 있어 별도 조회가 필요 없고, DART 매핑만 한 번 읽는다.
 */
export async function getEarningsStockOptions(
  email: string
): Promise<EarningsStockOption[]> {
  const [holdings, watchlist, corpMap] = await Promise.all([
    getHoldings(email).catch(() => []),
    getWatchlist(email).catch(() => []),
    getCorpCodeMap().catch(() => null),
  ]);

  const options: EarningsStockOption[] = [];
  const seen = new Set<string>();

  const push = (
    entries: Array<{ symbolCode: string; name: string }>,
    group: "holding" | "watchlist"
  ) => {
    for (const entry of entries) {
      if (seen.has(entry.symbolCode)) {
        continue;
      }
      seen.add(entry.symbolCode);
      options.push({
        symbolCode: entry.symbolCode,
        name: entry.name || entry.symbolCode,
        group,
        // 매핑을 못 읽었으면 막지 않는다 — 눌러보면 상태 메시지가 안내한다
        supported:
          corpMap === null || corpMap.map[entry.symbolCode] !== undefined,
      });
    }
  };

  push(holdings, "holding");
  push(watchlist, "watchlist");
  return options;
}

/**
 * 종목 하나의 실적 블록을 만든다 — 확정 분기 시계열 + 잠정 이어 붙이기 + IR 일정.
 *
 * 확정 조회(`getAnalysisOverview`)와 잠정 스냅샷 조회는 서로를 기다릴 이유가 없어
 * 병렬로 돌린다. 확정을 못 구해도(비상장·자료 없음) IR 일정은 살려서 돌려준다.
 */
export async function getEarningsFocus(
  symbolCode: string
): Promise<EarningsFocus> {
  const [overviewResult, snapshots, newsSnapshot] = await Promise.all([
    getAnalysisOverview(symbolCode),
    getEarningsSnapshots([symbolCode]).catch((error: unknown) => {
      console.error("[earningsFocus] snapshot read failed:", error);
      return new Map<string, StoredEarnings>();
    }),
    getEarningsNews(symbolCode).catch((error: unknown) => {
      console.error("[earningsFocus] news read failed:", error);
      return null;
    }),
  ]);

  const items = snapshots.get(symbolCode)?.items ?? [];
  const irEvents = collectIrEvents(items);
  const briefings = collectBriefings(items);
  // 발표 후 오래된 스냅샷은 여기서 걸러진다 (다음 발표 때 덮어써질 때까지 남아 있으므로)
  const news = visibleEarningsNews(
    newsSnapshot,
    todayKstDate().replaceAll("-", "")
  );

  if (overviewResult.status !== "ok") {
    return {
      status: overviewResult.status,
      symbolCode,
      irEvents,
      briefings,
      news,
    };
  }

  const provisional = collectProvisional(items);
  const confirmed = overviewResult.overview.quarter.map(
    (point): EarningsQuarterPoint => ({
      key: point.key,
      label: point.label,
      revenue: point.revenue,
      operatingProfit: point.operatingProfit,
      netProfit: point.netProfit,
      operatingMargin: point.operatingMargin,
      provisional: false,
    })
  );

  // 확정에 이미 있는 분기는 확정을 쓴다 — 잠정은 감사 전 수치라 확정과 다를 수 있다
  const confirmedKeys = new Set(confirmed.map((point) => point.key));
  const appended = [...provisional.values()]
    .filter((entry) => !confirmedKeys.has(entry.point.key))
    .map((entry) => entry.point);

  const points = [...confirmed, ...appended]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-FOCUS_QUARTERS);

  const latest = points.at(-1) ?? null;
  const latestEntry =
    latest !== null && latest.provisional
      ? provisional.get(latest.key) ?? null
      : null;

  return {
    status: "ok",
    symbolCode,
    basis: overviewResult.overview.basis,
    points,
    highlights: buildHighlights(points, latestEntry?.item ?? null),
    latestLabel: latest?.label ?? "",
    latestProvisional: latest?.provisional ?? false,
    provisionalSource: latestEntry?.source ?? null,
    irEvents,
    briefings,
    news,
  };
}
