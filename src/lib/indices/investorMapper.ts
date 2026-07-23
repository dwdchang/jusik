import { KIS_INVESTOR_ROW_COUNT } from "@/lib/api/kis/constants";
import type { KisInvestorDailyResponse } from "@/lib/api/kis/types";
import type { InvestorFlowRow, MarketIndex } from "@/types/indices";
import { formatBasDtLabel, parseNum } from "./kisMapper";

/**
 * 시장별 투자자매매동향(일별) output → 일별 수급 리스트 (최신순, 최근 N거래일).
 * 순매수 금액(백만원, 부호 포함)만 추출한다. KIS가 금액을 부호와 함께 반환하므로
 * applyKisSign 없이 parseNum만 거친다 (2026-07-22 실측). 금액 필드는 전 주체가
 * `_ntby_tr_pbmn` 접미사로 규칙적이다.
 */
export function mapKisInvestorRows(
  raw: KisInvestorDailyResponse,
  market: MarketIndex
): InvestorFlowRow[] {
  const rows = (raw.output ?? [])
    .filter((row) => row.stck_bsop_date)
    .sort((a, b) =>
      (b.stck_bsop_date as string).localeCompare(a.stck_bsop_date as string)
    )
    .slice(0, KIS_INVESTOR_ROW_COUNT)
    .map((row) => ({
      basDt: row.stck_bsop_date as string,
      date: formatBasDtLabel(row.stck_bsop_date as string),
      individual: parseNum(row.prsn_ntby_tr_pbmn),
      foreign: parseNum(row.frgn_ntby_tr_pbmn),
      institution: parseNum(row.orgn_ntby_tr_pbmn),
      finInvest: parseNum(row.scrt_ntby_tr_pbmn),
      trust: parseNum(row.ivtr_ntby_tr_pbmn),
      privateFund: parseNum(row.pe_fund_ntby_tr_pbmn),
      bank: parseNum(row.bank_ntby_tr_pbmn),
      insurance: parseNum(row.insu_ntby_tr_pbmn),
      merchantBank: parseNum(row.mrbn_ntby_tr_pbmn),
      pension: parseNum(row.fund_ntby_tr_pbmn),
    }));

  if (rows.length === 0) {
    throw new Error(`No KIS investor rows available for ${market}`);
  }

  return rows;
}
