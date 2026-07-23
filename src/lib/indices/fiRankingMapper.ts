import { KIS_FI_RANKING_SIZE } from "@/lib/api/kis/constants";
import type { KisFiTradeRankingResponse } from "@/lib/api/kis/types";
import type { FiFlowStock } from "@/types/indices";
import { applyKisSign, parseNum, resolveDirection } from "./kisMapper";

/**
 * 외국인/기관 매매상위 output → 종목별 수급 순위 (Phase 50).
 * KIS가 이미 순매수(또는 순매도) 순으로 정렬해 주므로 그 순서대로 순위를 매긴다.
 * 순매수 수량·금액은 조회한 투자자 그룹의 필드(foreign=frgn_*, institution=orgn_*)를
 * 쓰며 부호를 포함한다(순매도상위는 음수). 상위 KIS_FI_RANKING_SIZE(30)까지.
 * 빈 응답이어도 던지지 않는다 — 8콜 중 일부만 비어도 나머지는 저장되도록 격리 (§50).
 */
export function mapKisFiRankingRows(
  raw: KisFiTradeRankingResponse,
  group: "foreign" | "institution"
): FiFlowStock[] {
  const qtyField = group === "foreign" ? "frgn_ntby_qty" : "orgn_ntby_qty";
  const amountField =
    group === "foreign" ? "frgn_ntby_tr_pbmn" : "orgn_ntby_tr_pbmn";

  return (raw.output ?? [])
    .filter((row) => row.mksc_shrn_iscd && row.hts_kor_isnm)
    .slice(0, KIS_FI_RANKING_SIZE)
    .map((row, i) => {
      const changeRate = applyKisSign(
        parseNum(row.prdy_ctrt),
        row.prdy_vrss_sign
      );
      return {
        rank: i + 1,
        code: row.mksc_shrn_iscd as string,
        name: row.hts_kor_isnm as string,
        price: parseNum(row.stck_prpr),
        changeRate,
        direction: resolveDirection(changeRate),
        // 그룹별 순매수 수량(주)·금액(백만원) — KIS가 부호 포함 반환
        netBuyQty: parseNum(row[qtyField] as string | undefined),
        netBuyAmount: parseNum(row[amountField] as string | undefined),
      };
    });
}
