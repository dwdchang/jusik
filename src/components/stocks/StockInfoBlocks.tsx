import { formatChangeRate } from "@/lib/format/change";
import { formatEokwon, formatKrw } from "@/lib/format/krw";
import type { StockInfo } from "@/lib/holdings/stockInfo";
import styles from "./StockInfoBlocks.module.css";

/** PER/PBR 등 배수·비율 값 — 소수점 둘째 자리까지 */
export function formatRatio(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    value
  );
}

/**
 * 종목 정보 블록 4종(시가총액·배당·실적·투자지표) — 보유종목·관심종목 상세 공용.
 * 데이터는 getStockInfo(사용자 무관 Redis 리더)가 조합한 StockInfo를 그대로 받는다.
 * Phase 13 보유종목 상세의 인라인 JSX를 추출한 것 (plan.md §15.3 — 동작 불변).
 */
export function StockInfoBlocks({ info }: { info: StockInfo }) {
  const { marketCap, dividend, earnings, indicators } = info;

  return (
    <div className={styles.infoGrid}>
      <article className={styles.infoCard}>
        <h3 className={styles.infoTitle}>시가총액</h3>
        {marketCap !== null ? (
          <dl className={styles.infoRows}>
            <div className={styles.infoRow}>
              <dt>시가총액</dt>
              <dd className="numeric">
                {formatEokwon(marketCap.marketCapEokwon)}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>시총 순위</dt>
              <dd className="numeric">{marketCap.rankLabel ?? "-"}</dd>
            </div>
          </dl>
        ) : (
          <p className={styles.infoEmpty}>정보를 불러오지 못했습니다.</p>
        )}
      </article>

      <article className={styles.infoCard}>
        <h3 className={styles.infoTitle}>배당</h3>
        {dividend !== null ? (
          dividend.annualDividendPerShare > 0 ? (
            <dl className={styles.infoRows}>
              <div className={styles.infoRow}>
                <dt>배당 방식</dt>
                <dd>
                  {dividend.kindLabel !== null
                    ? `${dividend.kindLabel} 배당`
                    : "-"}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt>
                  {dividend.basisYear != null
                    ? `${dividend.basisYear} 사업연도 주당배당금`
                    : "최근 1년 주당배당금"}
                </dt>
                <dd className="numeric">
                  {formatKrw(dividend.annualDividendPerShare)}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt>시가배당률</dt>
                <dd
                  className="numeric"
                  title={
                    dividend.basisYear != null
                      ? `${dividend.basisYear} 사업연도 확정 배당금 합 ÷ 현재가`
                      : "최근 1년 확정 배당금 합 ÷ 현재가"
                  }
                >
                  {dividend.yieldRate !== null
                    ? `${formatRatio(dividend.yieldRate)}%`
                    : "-"}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt>최근 지급일</dt>
                <dd className="numeric">{dividend.lastPayDate ?? "-"}</dd>
              </div>
            </dl>
          ) : (
            <p className={styles.infoEmpty}>
              최근 1년 내 확정 배당이 없습니다.
            </p>
          )
        ) : (
          <p className={styles.infoEmpty}>정보를 불러오지 못했습니다.</p>
        )}
      </article>

      <article className={styles.infoCard}>
        <h3 className={styles.infoTitle}>실적</h3>
        {earnings !== null ? (
          <dl className={styles.infoRows}>
            <div className={styles.infoRow}>
              <dt>기준 분기</dt>
              <dd className="numeric">{earnings.quarterLabel}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt>매출액</dt>
              <dd className="numeric">
                {earnings.revenueEokwon !== null
                  ? formatEokwon(earnings.revenueEokwon)
                  : "-"}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>매출 증감 (전년 동기 / 직전 분기)</dt>
              <dd className="numeric">
                {earnings.revenueYoyRate !== null
                  ? formatChangeRate(earnings.revenueYoyRate)
                  : "-"}{" "}
                /{" "}
                {earnings.revenueQoqRate !== null
                  ? formatChangeRate(earnings.revenueQoqRate)
                  : "-"}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>영업이익</dt>
              <dd className="numeric">
                {earnings.operatingProfitEokwon !== null
                  ? formatEokwon(earnings.operatingProfitEokwon)
                  : "-"}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>영업이익 증감 (전년 동기 / 직전 분기)</dt>
              <dd className="numeric">
                {earnings.operatingProfitYoyRate !== null
                  ? formatChangeRate(earnings.operatingProfitYoyRate)
                  : "-"}{" "}
                /{" "}
                {earnings.operatingProfitQoqRate !== null
                  ? formatChangeRate(earnings.operatingProfitQoqRate)
                  : "-"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className={styles.infoEmpty}>정보를 불러오지 못했습니다.</p>
        )}
      </article>

      <article className={styles.infoCard}>
        <h3 className={styles.infoTitle}>투자지표</h3>
        {indicators !== null ? (
          <dl className={styles.infoRows}>
            <div className={styles.infoRow}>
              <dt>PER / PBR</dt>
              <dd className="numeric">
                {formatRatio(indicators.per)}배 / {formatRatio(indicators.pbr)}
                배
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>EPS / BPS</dt>
              <dd className="numeric">
                {indicators.eps !== null ? formatKrw(indicators.eps) : "-"} /{" "}
                {indicators.bps !== null ? formatKrw(indicators.bps) : "-"}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>52주 최고</dt>
              <dd className="numeric">
                {indicators.w52High !== null
                  ? formatKrw(indicators.w52High)
                  : "-"}
                {indicators.w52HighDate !== null ? (
                  <span className={styles.infoSub}>
                    {indicators.w52HighDate}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt>52주 최저</dt>
              <dd className="numeric">
                {indicators.w52Low !== null ? formatKrw(indicators.w52Low) : "-"}
                {indicators.w52LowDate !== null ? (
                  <span className={styles.infoSub}>
                    {indicators.w52LowDate}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className={styles.infoEmpty}>정보를 불러오지 못했습니다.</p>
        )}
      </article>
    </div>
  );
}
