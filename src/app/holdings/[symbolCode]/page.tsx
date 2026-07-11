import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HoldingsChartClient } from "@/components/holdings/HoldingsChartClient";
import type { HoldingsChartPoint } from "@/components/holdings/HoldingsChart";
import { StockInfoBlocks } from "@/components/stocks/StockInfoBlocks";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatChangeRate } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatAvgPrice, formatKrw } from "@/lib/format/krw";
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
          <StockInfoBlocks info={info} />
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
