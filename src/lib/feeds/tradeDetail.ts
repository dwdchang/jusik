import {
  getTradeDetail,
  type StoredTradeDetail,
  type TradeDetailItem,
} from "@/lib/feeds/store";

/**
 * 수출입 상세 뷰 빌더 — Phase 17-5 (plan.md §17.15).
 * `/indices/trade/[yyyymm]`가 쓰는 읽기 전용 파생 모델.
 * 저장 스냅샷(상위 N만)에서 "기타" 행을 전체 합계 − Σ상위N으로 복원한다.
 */

/** 표 한 줄 — 품목·국가 공용 (기타 행은 code가 null) */
export interface TradeDetailRow {
  /** HS 4단위 부호 또는 국가 코드 — "기타" 합산 행이면 null */
  code: string | null;
  name: string;
  expDlr: number;
  impDlr: number;
}

/** 국가 행 + 클릭 팝업에 쓸 그 나라의 상위 품목 */
export interface TradeDetailCountryRow extends TradeDetailRow {
  /** 상위 국가만 보유 — "기타" 행은 빈 배열(클릭 불가) */
  items: TradeDetailRow[];
}

export interface TradeDetailView {
  yyyymm: string;
  totalExpDlr: number;
  totalImpDlr: number;
  /** 품목별 상위 + "기타" 한 줄 (국가 무관) */
  items: TradeDetailRow[];
  /** 국가별 상위 + "기타" 한 줄 */
  countries: TradeDetailCountryRow[];
  fetchedAt: string;
}

/** 전체 − Σ표시분 = "기타" 한 줄. 잔차가 없으면(전부 표시) null. */
function otherRow(
  totalExpDlr: number,
  totalImpDlr: number,
  shown: ReadonlyArray<{ expDlr: number; impDlr: number }>
): TradeDetailRow | null {
  const expDlr = totalExpDlr - shown.reduce((sum, r) => sum + r.expDlr, 0);
  const impDlr = totalImpDlr - shown.reduce((sum, r) => sum + r.impDlr, 0);

  // 부동소수 잔여가 아니라 실제 잔차가 있을 때만 — 1달러 미만은 표시 가치가 없다
  if (expDlr < 1 && impDlr < 1) {
    return null;
  }
  return { code: null, name: "기타", expDlr, impDlr };
}

const toRow = (item: TradeDetailItem): TradeDetailRow => ({
  code: item.hsCd,
  name: item.name,
  expDlr: item.expDlr,
  impDlr: item.impDlr,
});

/** 저장 스냅샷 → 뷰 모델 (순수). 스냅샷이 없으면 null. */
export function buildTradeDetailView(
  stored: StoredTradeDetail | null
): TradeDetailView | null {
  if (stored === null) {
    return null;
  }

  const { totalExpDlr, totalImpDlr } = stored;

  const items: TradeDetailRow[] = stored.items.map(toRow);
  const itemsOther = otherRow(totalExpDlr, totalImpDlr, stored.items);
  if (itemsOther !== null) {
    items.push(itemsOther);
  }

  const countries: TradeDetailCountryRow[] = stored.countries.map(
    (country) => ({
      code: country.code,
      name: country.name,
      expDlr: country.expDlr,
      impDlr: country.impDlr,
      items: country.items.map(toRow),
    })
  );
  const countriesOther = otherRow(totalExpDlr, totalImpDlr, stored.countries);
  if (countriesOther !== null) {
    countries.push({ ...countriesOther, items: [] });
  }

  return {
    yyyymm: stored.yyyymm,
    totalExpDlr,
    totalImpDlr,
    items,
    countries,
    fetchedAt: stored.fetchedAt,
  };
}

/** Redis에서 읽어 뷰 모델로 — 화면(Server Component) 진입점 */
export async function getTradeDetailView(
  yyyymm: string
): Promise<TradeDetailView | null> {
  return buildTradeDetailView(await getTradeDetail(yyyymm));
}
