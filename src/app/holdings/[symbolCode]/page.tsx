import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HoldingsChartClient } from "@/components/holdings/HoldingsChartClient";
import type { HoldingsChartPoint } from "@/components/holdings/HoldingsChart";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatChangeRate } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatAvgPrice, formatEokwon, formatKrw } from "@/lib/format/krw";
import { getHoldings } from "@/lib/holdings/store";
import { getStockHistory } from "@/lib/holdings/stockHistory";
import { getStockInfo } from "@/lib/holdings/stockInfo";
import type { StockDailyPrice } from "@/lib/holdings/stockHistory";
import { resolveDirection } from "@/lib/indices/kisMapper";
import { deleteHoldingAction, updateHoldingAction } from "../actions";
import styles from "./page.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_quantity: "수량은 1 이상의 정수여야 합니다.",
  invalid_total_cost: "총 매입금액은 0보다 큰 숫자여야 합니다.",
  not_found: "대상 종목을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.",
};

/** PER/PBR 등 배수·비율 값 — 소수점 둘째 자리까지 */
function formatRatio(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
    value
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}): Promise<Metadata> {
  const { symbolCode } = await params;
  return {
    title: `${symbolCode} 종목 상세 — jusik`,
    description: "보유종목 상세 — 평가·차트·시가총액·배당·실적·투자지표",
  };
}

export default async function HoldingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbolCode: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { symbolCode } = await params;

  if (!/^\d{6}$/.test(symbolCode)) {
    redirect("/holdings");
  }

  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const { error, edit } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;
  const isEditMode = edit === "1";
  const detailPath = `/holdings/${symbolCode}`;

  const holdings = (await getHoldings(email)).filter(
    (holding) => holding.symbolCode === symbolCode
  );

  // 보유하지 않은 종목코드는 상세를 제공하지 않는다 (plan.md §13.4)
  if (holdings.length === 0) {
    redirect("/holdings");
  }

  // 등록 직후엔 종목명이 비어 있음 — 다음 갱신 회차에 잡이 채운다 (§11.10-A4)
  const name = holdings[0].name || symbolCode;
  const totalQuantity = holdings.reduce((sum, h) => sum + h.quantity, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);

  const [info, history] = await Promise.all([
    getStockInfo(symbolCode),
    getStockHistory(symbolCode).catch((err): StockDailyPrice[] => {
      console.error(`[HoldingDetailPage] history read failed (${symbolCode}):`, err);
      return [];
    }),
  ]);

  const currentValue =
    info.currentPrice !== null ? info.currentPrice * totalQuantity : null;
  const profit = currentValue !== null ? currentValue - totalCost : null;
  const returnRate =
    profit !== null && totalCost > 0 ? (profit / totalCost) * 100 : null;

  const chartPoints: HoldingsChartPoint[] = history.map((row) => ({
    fullDate: row.date,
    date: row.date.slice(5).replace("-", "/"),
    totalValue: row.close * totalQuantity,
    returnRate:
      totalCost > 0
        ? ((row.close * totalQuantity - totalCost) / totalCost) * 100
        : 0,
  }));

  const { marketCap, dividend, earnings, indicators } = info;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/holdings" className={styles.backLink}>
            ← 보유종목
          </Link>
          <h1 className={styles.title}>
            {name}
            <span className={styles.titleCode}>{symbolCode}</span>
          </h1>
          {info.fetchedAt !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(info.fetchedAt)}
            </span>
          ) : null}
        </header>

        {errorMessage !== null ? (
          <p className={styles.errorBanner} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {info.currentPrice === null ? (
          <p className={styles.errorBanner} role="alert">
            아직 저장된 시세가 없어 평가금액을 계산하지 못했습니다. 다음 갱신
            회차(평일 09:00~15:30 KST, 10분 간격)에 반영됩니다.
          </p>
        ) : null}

        <section className={styles.summary} aria-label="보유 현황">
          <div className={styles.stat}>
            <span className={styles.statLabel}>현재가</span>
            {info.currentPrice !== null ? (
              <span className={`${styles.statValue} numeric`}>
                {formatKrw(info.currentPrice)}
                {info.changeRate !== null ? (
                  <span
                    className={`${styles.statSub} numeric ${
                      styles[resolveDirection(info.changeRate)]
                    }`}
                  >
                    {formatChangeRate(info.changeRate)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className={styles.statEmpty}>조회 실패</span>
            )}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>보유수량 · 평균 매입가</span>
            <span className={`${styles.statValue} numeric`}>
              {new Intl.NumberFormat("ko-KR").format(totalQuantity)}주 ·{" "}
              {formatAvgPrice(totalCost, totalQuantity)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>매입금액</span>
            <span className={`${styles.statValue} numeric`}>
              {formatKrw(totalCost)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>평가금액</span>
            {currentValue !== null ? (
              <span className={`${styles.statValue} numeric`}>
                {formatKrw(currentValue)}
              </span>
            ) : (
              <span className={styles.statEmpty}>-</span>
            )}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>평가손익</span>
            {profit !== null ? (
              <span
                className={`${styles.statValue} numeric ${
                  styles[resolveDirection(profit)]
                }`}
              >
                {formatKrw(profit)}
              </span>
            ) : (
              <span className={styles.statEmpty}>-</span>
            )}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>수익률</span>
            {returnRate !== null ? (
              <span
                className={`${styles.statValue} numeric ${
                  styles[resolveDirection(returnRate)]
                }`}
              >
                {formatChangeRate(returnRate)}
              </span>
            ) : (
              <span className={styles.statEmpty}>-</span>
            )}
          </div>
        </section>

        <section className={styles.section} aria-label="보유 내역 관리">
          {isEditMode ? (
            <>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>보유 내역 수정</h2>
                <Link href={detailPath} className={styles.editToggle}>
                  취소
                </Link>
              </div>
              <ul className={styles.editList}>
                {holdings.map((holding) => (
                  <li key={holding.id} className={styles.editItem}>
                    <form action={updateHoldingAction} className={styles.editForm}>
                      <input type="hidden" name="id" value={holding.id} />
                      <label className={styles.editField}>
                        <span className={styles.editLabel}>수량</span>
                        <input
                          name="quantity"
                          className={styles.input}
                          defaultValue={holding.quantity}
                          type="number"
                          min={1}
                          step={1}
                          required
                        />
                      </label>
                      <label className={styles.editField}>
                        <span className={styles.editLabel}>총 매입금액(원)</span>
                        <input
                          name="totalCost"
                          className={styles.input}
                          defaultValue={holding.totalCost}
                          type="number"
                          min={1}
                          step="any"
                          required
                        />
                      </label>
                      <button type="submit" className={styles.secondaryButton}>
                        저장
                      </button>
                    </form>
                    <form action={deleteHoldingAction}>
                      <input type="hidden" name="id" value={holding.id} />
                      <button type="submit" className={styles.dangerButton}>
                        삭제
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>보유 내역</h2>
              <Link
                href={`${detailPath}?edit=1`}
                className={styles.editToggle}
              >
                수정
              </Link>
            </div>
          )}
        </section>

        <section className={styles.section} aria-label="최근 2년 추이">
          {chartPoints.length > 0 ? (
            <HoldingsChartClient points={chartPoints} title="최근 2년 추이" />
          ) : (
            <p className={styles.emptyNotice}>
              종가 히스토리가 아직 없습니다. 평일 18:15(KST) 갱신 이후 추이
              차트가 표시됩니다.
            </p>
          )}
        </section>

        <section className={styles.section} aria-label="종목 정보">
          <h2 className={styles.sectionTitle}>종목 정보</h2>
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
                      <dt>최근 1년 주당배당금</dt>
                      <dd className="numeric">
                        {formatKrw(dividend.annualDividendPerShare)}
                      </dd>
                    </div>
                    <div className={styles.infoRow}>
                      <dt>시가배당률</dt>
                      <dd className="numeric">
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
                      {formatRatio(indicators.per)}배 /{" "}
                      {formatRatio(indicators.pbr)}배
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt>EPS / BPS</dt>
                    <dd className="numeric">
                      {indicators.eps !== null ? formatKrw(indicators.eps) : "-"}{" "}
                      /{" "}
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
                      {indicators.w52Low !== null
                        ? formatKrw(indicators.w52Low)
                        : "-"}
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
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            현재가·투자지표는 한국투자증권 OpenAPI 기준으로 평일
            09:00~15:30(KST) 10분 간격 갱신 회차에 저장된 값입니다. 종가
            히스토리·배당·실적은 15:40·18:15 확정 회차에 갱신되며, 실적은 분기
            누적값을 차감한 분기 단독 기준(억원)입니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
