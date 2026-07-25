/**
 * 내 종목 화면(§56·§58) 행 모델 — 보유종목·관심종목을 한 표에서 렌더하기 위한 공통 형태.
 *
 * 서버(page.tsx)에서 조립하고 클라이언트 행 컴포넌트(StockRowItem)는 이 형태만 본다 —
 * KIS 원본(`snapshot.raw`) 파싱은 전부 여기서 끝낸다. 계산은 순수 함수라 Redis·KIS
 * 접근이 없다(스냅샷은 호출부가 이미 읽어서 넘긴다).
 */

import { parseNum } from "@/lib/indices/kisMapper";
import { buildStockIndicators } from "@/lib/holdings/stockInfo";
import type { StoredStockSnapshot } from "@/lib/market/store";
import { computeWatchReturnRate } from "@/lib/watchlist/summary";
import type { HoldingValuation } from "@/types/holdings";
import type { WatchItem } from "@/types/watchlist";

/** 행 펼침에 공통으로 붙는 지표 — 스냅샷 원본에서 뽑는다(추가 조회 0) */
export interface StockRowIndicators {
  per: number | null;
  pbr: number | null;
  /** 52주 최고가(원) */
  w52High: number | null;
  /** 52주 최고가 대비 현재가 괴리율(%) — 현재가·최고가가 있어야 계산 */
  w52HighGap: number | null;
  w52Low: number | null;
  w52LowGap: number | null;
  /** 시가총액(억원) */
  marketCapEokwon: number | null;
}

/**
 * 표 1행 — `kind`로 보유/관심을 구분한다. 보유 전용 값(수익금·수량·매입금액)과
 * 관심 전용 값(기준일·기준가)은 반대쪽에서 null이며, 화면에서 "-"로 렌더된다.
 */
export interface StockRow {
  /** React key — 보유·관심에서 같은 종목이 각각 1행씩 나오므로 종류를 섞어 만든다 */
  key: string;
  kind: "holding" | "watch";
  symbolCode: string;
  name: string;
  /** 상세 페이지 경로 — 통합 상세 `/stocks/{code}`에 `?kind`로 종류를 실어 보낸다 (§58) */
  detailHref: string;
  currentPrice: number | null;
  /** 전일 대비 등락률(%) — 스냅샷이 없으면 null */
  changeRate: number | null;
  /** 수익률(%) — 보유=매입가 대비, 관심=등록 기준가 대비 */
  returnRate: number | null;
  indicators: StockRowIndicators | null;

  // 보유 전용
  /** 평가손익(원) */
  profit: number | null;
  quantity: number | null;
  totalCost: number | null;
  /** 평가금액(원) */
  value: number | null;
  /** 오늘 손익(원) — 평가금액에서 전일 평가액을 역산해 뺀 값 */
  todayProfit: number | null;

  // 관심 전용
  /** 관심종목 id — 펼침의 기준일 변경·삭제 폼용 */
  watchId: string | null;
  /** 등록 기준일 "YYYY-MM-DD" */
  registeredAt: string | null;
  /** 기준가(원) — 미확정이면 null */
  priceAtRegistration: number | null;
  /** 기준가가 직전 거래일 종가인 잠정값인지 (§15.4) */
  provisionalBasis: boolean;
  /**
   * 현재가·등락률이 실시간 스냅샷이 아니라 등록 시 종가로 폴백된 값인지 (§65).
   * 장 마감 후·주말 등록 직후 스냅샷이 아직 없는 구간에서만 true — 흐린 색·툴팁으로
   * 실시간 값과 구분해 표시한다. 폴백의 출처 날짜는 `priceBasisDate`.
   */
  provisionalPrice: boolean;
  /** 폴백 현재가의 출처 종가일 "YYYY-MM-DD" — provisionalPrice일 때만 의미 있다 */
  priceBasisDate: string | null;
}

/** 스냅샷 원본 → 펼침 지표. 스냅샷이 없으면 null */
function buildIndicators(
  snapshot: StoredStockSnapshot | undefined
): StockRowIndicators | null {
  if (snapshot === undefined) {
    return null;
  }

  const indicators = buildStockIndicators(snapshot.raw);
  const price = snapshot.price;
  const gap = (base: number | null): number | null =>
    base !== null && base > 0 && price > 0 ? ((price - base) / base) * 100 : null;
  const marketCapEokwon = parseNum(snapshot.raw.hts_avls);

  return {
    per: indicators?.per ?? null,
    pbr: indicators?.pbr ?? null,
    w52High: indicators?.w52High ?? null,
    w52HighGap: gap(indicators?.w52High ?? null),
    w52Low: indicators?.w52Low ?? null,
    w52LowGap: gap(indicators?.w52Low ?? null),
    marketCapEokwon: marketCapEokwon > 0 ? marketCapEokwon : null,
  };
}

/**
 * 오늘 손익(원) — 평가금액과 전일 대비 등락률로 전일 평가액을 역산해 뺀다.
 * `getPortfolioValuation`의 일일 변동률 계산과 같은 방식(포트폴리오 히스토리 불필요).
 */
function computeTodayProfit(
  value: number | null,
  changeRate: number | null
): number | null {
  if (value === null || changeRate === null) {
    return null;
  }
  const denom = 1 + changeRate / 100;
  if (denom <= 0) {
    return null;
  }
  return value - value / denom;
}

/** 보유종목 평가 결과 → 행 */
export function buildHoldingRows(
  items: HoldingValuation[],
  snapshots: Map<string, StoredStockSnapshot>
): StockRow[] {
  return items.map((item) => {
    const { holding } = item;
    const snapshot = snapshots.get(holding.symbolCode);
    const changeRate = snapshot?.changeRate ?? null;

    return {
      key: `holding:${holding.id}`,
      kind: "holding",
      symbolCode: holding.symbolCode,
      name: holding.name || holding.symbolCode,
      detailHref: `/stocks/${holding.symbolCode}?kind=holding`,
      currentPrice: item.currentPrice,
      changeRate,
      returnRate: item.returnRate,
      indicators: buildIndicators(snapshot),
      profit: item.profit,
      quantity: holding.quantity,
      totalCost: item.cost,
      value: item.value,
      todayProfit: computeTodayProfit(item.value, changeRate),
      watchId: null,
      registeredAt: null,
      priceAtRegistration: null,
      provisionalBasis: false,
      // 보유는 현재가가 평가금액·평가손익 계산에 직접 들어가므로 종가를 섞지 않는다 (§65)
      provisionalPrice: false,
      priceBasisDate: null,
    };
  });
}

/** 관심종목 → 행 */
export function buildWatchRows(
  items: WatchItem[],
  snapshots: Map<string, StoredStockSnapshot>
): StockRow[] {
  return items.map((item) => {
    const snapshot = snapshots.get(item.symbolCode);

    // 갱신 잡은 평일 09:00~18:15만 돌아, 장 마감 후·주말에 등록하면 다음 영업일까지
    // 스냅샷이 없다. 그 구간에는 등록 시 확보해 둔 종가로 폴백해 「시세 없음」을 피한다
    // (§65). 스냅샷이 생기면 실시간 값이 이기고 폴백은 저절로 사라진다 — 추가 조회 0.
    const provisionalPrice =
      snapshot === undefined && item.priceAtRegistration !== null;
    const currentPrice = snapshot?.price ?? item.priceAtRegistration;

    return {
      key: `watch:${item.id}`,
      kind: "watch",
      symbolCode: item.symbolCode,
      name: item.name || item.symbolCode,
      detailHref: `/stocks/${item.symbolCode}?kind=watch`,
      currentPrice,
      changeRate:
        snapshot?.changeRate ??
        (provisionalPrice ? (item.changeRateAtRegistration ?? null) : null),
      // 폴백 현재가는 기준가와 같은 값이라 수익률이 정확히 0%가 된다. 등록 직후에만
      // 걸리는 구간이고 실제 수익률도 0% 근처라 정렬에 그대로 참여시킨다 (사용자 확정).
      returnRate: computeWatchReturnRate(currentPrice, item),
      indicators: buildIndicators(snapshot),
      profit: null,
      quantity: null,
      totalCost: null,
      value: null,
      todayProfit: null,
      watchId: item.id,
      registeredAt: item.registeredAt,
      priceAtRegistration: item.priceAtRegistration,
      // 기준가가 등록일보다 과거 종가면 직전 거래일 잠정값 (§15.4)
      provisionalBasis:
        item.priceBasisDate !== null && item.priceBasisDate < item.registeredAt,
      provisionalPrice,
      priceBasisDate: item.priceBasisDate,
    };
  });
}

/**
 * 수익률 내림차순 정렬 (사용자 확정, §56). 수익률이 없는 행(시세 없음·기준가
 * 확정 중)은 순서를 매길 수 없으므로 맨 뒤로 보내고 그들끼리는 종목명순.
 */
export function sortRowsByReturnRate(rows: StockRow[]): StockRow[] {
  return [...rows].sort((a, b) => {
    if (a.returnRate === null && b.returnRate === null) {
      return a.name.localeCompare(b.name, "ko-KR");
    }
    if (a.returnRate === null) {
      return 1;
    }
    if (b.returnRate === null) {
      return -1;
    }
    return b.returnRate - a.returnRate;
  });
}
