import { KIS_MARKET_CAP_RANKING_SIZE } from "@/lib/api/kis/constants";
import type { KisMarketCapRankingRow } from "@/lib/api/kis/types";
import type { MarketCapBaseline } from "@/lib/market/store";
import type { MarketCapStock } from "@/types/indices";
import { applyKisSign, parseNum, resolveDirection } from "./kisMapper";

/** 원 → 억원 */
const WON_PER_EOK = 100_000_000;

/**
 * 시가총액 상위 output → 시총 순위 행 (Phase 68).
 * KIS가 이미 시총 내림차순으로 주므로 그 순서대로 순위를 매긴다(상위 30이 상한).
 *
 * 전일 대비 두 열은 응답에 없어 여기서 만든다:
 * - **시총 증감** — 기준 스냅샷(baseline)이 있으면 실제 차액(상장주식수 변동까지 반영),
 *   없으면 `전일 대비 주가 × 상장주식수`로 역산한다. 역산은 금융위 EOD 시총과 대조해
 *   오차 0.0000%였고(2026-07-28 실측), 주식수가 바뀐 종목에서만 어긋난다.
 * - **순위 변동** — baseline의 순위와 비교한다. 응답이 30건뿐이라 전일 30위권 밖에서
 *   들어온 종목은 전일 순위를 알 수 없어 `isNew`로 표시한다(실측상 시장당 1건 발생).
 *
 * 빈 응답이어도 던지지 않는다 — 시장별 1콜씩이라 한쪽이 비어도 다른 쪽은 저장되도록.
 */
export function mapKisMarketCapRows(
  rows: KisMarketCapRankingRow[],
  baseline: MarketCapBaseline | null
): MarketCapStock[] {
  return rows
    .filter((row) => row.mksc_shrn_iscd && row.hts_kor_isnm)
    .slice(0, KIS_MARKET_CAP_RANKING_SIZE)
    .map((row, i) => {
      const rank = i + 1;
      const code = row.mksc_shrn_iscd as string;
      const changeRate = applyKisSign(
        parseNum(row.prdy_ctrt),
        row.prdy_vrss_sign
      );
      const marketCapEok = parseNum(row.stck_avls);
      const base = baseline?.entries[code];
      const capChangeEok =
        base !== undefined
          ? marketCapEok - base.capEok
          : (applyKisSign(parseNum(row.prdy_vrss), row.prdy_vrss_sign) *
              parseNum(row.lstn_stcn)) /
            WON_PER_EOK;

      return {
        rank,
        code,
        name: row.hts_kor_isnm as string,
        price: parseNum(row.stck_prpr),
        changeRate,
        direction: resolveDirection(changeRate),
        marketCapEok,
        capChangeEok,
        rankChange: base !== undefined ? base.rank - rank : null,
        isNew: baseline !== null && base === undefined,
      };
    });
}
