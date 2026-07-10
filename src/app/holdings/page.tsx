import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HoldingsChartClient } from "@/components/holdings/HoldingsChartClient";
import type { HoldingsChartPoint } from "@/components/holdings/HoldingsChart";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatChangeRate } from "@/lib/format/change";
import { formatKrw } from "@/lib/format/krw";
import {
  getHoldings,
  getPortfolioHistory,
  todayKstDate,
} from "@/lib/holdings/store";
import {
  computeDailyChangeRate,
  getPortfolioValuation,
  latestRecordBefore,
} from "@/lib/holdings/valuation";
import { resolveDirection } from "@/lib/indices/kisMapper";
import type { PortfolioValuation } from "@/types/holdings";
import { addHoldingAction } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "보유종목 — jusik",
  description: "보유종목 수익률·연초 이후 추이·종목 관리",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "종목코드는 숫자 6자리여야 합니다.",
  invalid_quantity: "수량은 1 이상의 정수여야 합니다.",
  invalid_total_cost: "총 매입금액은 0보다 큰 숫자여야 합니다.",
  duplicate_code:
    "이미 등록된 종목입니다. 수량 변경은 종목 상세 페이지에서 해주세요.",
  stock_lookup_failed:
    "종목 정보를 조회하지 못했습니다. 종목코드를 확인해주세요.",
  not_found: "대상 종목을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.",
};

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  const [holdings, history] = await Promise.all([
    getHoldings(email),
    getPortfolioHistory(email),
  ]);

  let valuation: PortfolioValuation | null = null;
  let valuationError: string | null = null;

  if (holdings.length > 0) {
    try {
      valuation = await getPortfolioValuation(holdings);
    } catch (err) {
      console.error("[HoldingsPage] getPortfolioValuation failed:", err);
      valuationError =
        "현재가 조회에 실패해 평가금액을 계산하지 못했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  const today = todayKstDate();
  const currentYear = today.slice(0, 4);
  const yearHistory = history.filter((row) => row.date.startsWith(currentYear));

  const chartPoints: HoldingsChartPoint[] = yearHistory.map((row) => ({
    fullDate: row.date,
    date: row.date.slice(5).replace("-", "/"),
    totalValue: row.totalValue,
    returnRate:
      row.totalCost > 0
        ? ((row.totalValue - row.totalCost) / row.totalCost) * 100
        : 0,
  }));

  const dailyChangeRate = valuation
    ? computeDailyChangeRate(
        valuation.totalValue,
        latestRecordBefore(history, today)
      )
    : null;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" className={styles.backLink}>
            ← 홈으로
          </Link>
          <h1 className={styles.title}>보유종목</h1>
        </header>

        {errorMessage !== null ? (
          <p className={styles.errorBanner} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {valuationError !== null ? (
          <p className={styles.errorBanner} role="alert">
            {valuationError}
          </p>
        ) : null}

        {valuation !== null ? (
          <section className={styles.summary} aria-label="포트폴리오 요약">
            <div className={styles.stat}>
              <span className={styles.statLabel}>총 평가금액</span>
              <span className={`${styles.statValue} numeric`}>
                {formatKrw(valuation.totalValue)}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>총 매입금액</span>
              <span className={`${styles.statValue} numeric`}>
                {formatKrw(valuation.totalCost)}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>총 수익률</span>
              <span
                className={`${styles.statValue} numeric ${
                  styles[resolveDirection(valuation.totalReturnRate)]
                }`}
              >
                {formatChangeRate(valuation.totalReturnRate)}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>일일 변동률 (전일 대비)</span>
              {dailyChangeRate !== null ? (
                <span
                  className={`${styles.statValue} numeric ${
                    styles[resolveDirection(dailyChangeRate)]
                  }`}
                >
                  {formatChangeRate(dailyChangeRate)}
                </span>
              ) : (
                <span className={styles.statEmpty}>전일 기록 없음</span>
              )}
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-label="연초 이후 추이">
          {chartPoints.length > 0 ? (
            <HoldingsChartClient points={chartPoints} />
          ) : (
            <p className={styles.emptyNotice}>
              일별 기록이 아직 없습니다. 평일 18:15(KST) 기록 생성 이후 추이
              차트가 표시됩니다.
            </p>
          )}
        </section>

        {yearHistory.length > 0 ? (
          <section className={styles.section} aria-label="일별 기록">
            <h2 className={styles.sectionTitle}>일별 기록</h2>
            <ol className={styles.dailyList}>
              {[...yearHistory].reverse().map((row) => {
                const rate =
                  row.totalCost > 0
                    ? ((row.totalValue - row.totalCost) / row.totalCost) * 100
                    : 0;
                return (
                  <li key={row.date} className={styles.dailyRow}>
                    <span className={styles.dailyDate}>{row.date}</span>
                    <span className={`${styles.dailyValue} numeric`}>
                      {formatKrw(row.totalValue)}
                    </span>
                    <span
                      className={`${styles.dailyRate} numeric ${
                        styles[resolveDirection(rate)]
                      }`}
                    >
                      {formatChangeRate(rate)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className={styles.section} aria-label="종목 추가">
          <h2 className={styles.sectionTitle}>종목 추가</h2>
          <form action={addHoldingAction} className={styles.addForm}>
            <input
              name="symbolCode"
              className={styles.input}
              placeholder="종목코드 6자리"
              inputMode="numeric"
              pattern="\d{6}"
              required
            />
            <input
              name="quantity"
              className={styles.input}
              placeholder="수량"
              type="number"
              min={1}
              step={1}
              required
            />
            <input
              name="totalCost"
              className={styles.input}
              placeholder="총 매입금액(원)"
              type="number"
              min={1}
              step="any"
              required
            />
            <button type="submit" className={styles.primaryButton}>
              추가
            </button>
          </form>
          <p className={styles.formHint}>
            종목명은 저장 시 자동으로 조회됩니다.
          </p>
        </section>

        <section className={styles.section} aria-label="보유종목 목록">
          <h2 className={styles.sectionTitle}>
            보유종목 ({holdings.length})
          </h2>
          {holdings.length === 0 ? (
            <p className={styles.emptyNotice}>
              등록된 종목이 없습니다. 위에서 종목을 추가해보세요.
            </p>
          ) : (
            <ul className={styles.holdingList}>
              {holdings.map((holding) => {
                const item = valuation?.items.find(
                  (v) => v.holding.id === holding.id
                );
                return (
                  <li key={holding.id}>
                    <Link
                      href={`/holdings/${holding.symbolCode}`}
                      className={styles.holdingItem}
                    >
                      <div className={styles.holdingHead}>
                        <span className={styles.holdingName}>
                          {holding.name}
                          <span className={styles.holdingCode}>
                            {holding.symbolCode}
                          </span>
                        </span>
                        {item ? (
                          <span
                            className={`${styles.holdingReturn} numeric ${
                              styles[resolveDirection(item.returnRate)]
                            }`}
                          >
                            {formatChangeRate(item.returnRate)}
                          </span>
                        ) : null}
                      </div>

                      {item ? (
                        <dl className={styles.holdingStats}>
                          <div className={styles.holdingStat}>
                            <dt>현재가</dt>
                            <dd className="numeric">
                              {formatKrw(item.currentPrice)}
                            </dd>
                          </div>
                          <div className={styles.holdingStat}>
                            <dt>평가금액</dt>
                            <dd className="numeric">{formatKrw(item.value)}</dd>
                          </div>
                          <div className={styles.holdingStat}>
                            <dt>매입금액</dt>
                            <dd className="numeric">{formatKrw(item.cost)}</dd>
                          </div>
                          <div className={styles.holdingStat}>
                            <dt>평가손익</dt>
                            <dd
                              className={`numeric ${
                                styles[resolveDirection(item.profit)]
                              }`}
                            >
                              {formatKrw(item.profit)}
                            </dd>
                          </div>
                        </dl>
                      ) : null}

                      <span className={styles.holdingDetailCue}>
                        상세 보기 →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            현재가는 한국투자증권 OpenAPI 기준이며 약 10분 간격으로 갱신됩니다.
            일별 기록은 평일 18:15(KST)에 저장됩니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
