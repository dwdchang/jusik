import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertToggleButton } from "@/components/alerts/AlertToggleButton";
import { DailyHistoryList } from "@/components/holdings/DailyHistoryList";
import type { DailyHistoryRow } from "@/components/holdings/DailyHistoryList";
import { HoldingsChartClient } from "@/components/holdings/HoldingsChartClient";
import type { HoldingsChartPoint } from "@/components/holdings/HoldingsChart";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { StockInfoBlocks } from "@/components/stocks/StockInfoBlocks";
import { getMutedSymbols } from "@/lib/alerts/store";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatChangeRate } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatAvgPrice, formatKrw } from "@/lib/format/krw";
import { getHoldings } from "@/lib/holdings/store";
import { getStockHistory } from "@/lib/holdings/stockHistory";
import { getStockInfo } from "@/lib/holdings/stockInfo";
import type { StockDailyPrice } from "@/lib/holdings/stockHistory";
import { resolveDirection } from "@/lib/indices/kisMapper";
import { getWatchlist } from "@/lib/watchlist/store";
import { computeWatchReturnRate } from "@/lib/watchlist/summary";
import { deleteHoldingAction, updateHoldingAction } from "../actions";
import styles from "./page.module.css";

/**
 * 종목 상세 (§58) — 구 `/holdings/[symbolCode]`와 `/watchlist/[symbolCode]`를
 * 하나로 합친 라우트. 같은 종목을 보유·관심에 동시에 담을 수 있으므로
 * **`?kind=holding|watch`로 어느 쪽 상세인지 가른다**(A안). kind가 없거나 그쪽
 * 목록에 없으면 보유 → 관심 순으로 떨어지고, 둘 다 없으면 목록으로 돌린다.
 */

const ERROR_MESSAGES: Record<string, string> = {
  invalid_quantity: "수량은 1 이상의 정수여야 합니다.",
  invalid_total_cost: "총 매입금액은 0보다 큰 숫자여야 합니다.",
  not_found: "대상 종목을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.",
};

type Kind = "holding" | "watch";

function resolveRequestedKind(kind: string | undefined): Kind | null {
  return kind === "holding" || kind === "watch" ? kind : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}): Promise<Metadata> {
  const { symbolCode } = await params;
  return {
    title: `${symbolCode} 종목 상세 — jusik`,
    description: "종목 상세 — 수익률·추이·시가총액·배당·실적·투자지표",
  };
}

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbolCode: string }>;
  searchParams: Promise<{ error?: string; edit?: string; kind?: string }>;
}) {
  const { symbolCode } = await params;

  if (!/^\d{6}$/.test(symbolCode)) {
    redirect("/stocks");
  }

  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const { error, edit, kind } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;
  const requestedKind = resolveRequestedKind(kind);

  const [allHoldings, watchItems] = await Promise.all([
    getHoldings(email),
    getWatchlist(email),
  ]);

  const holdings = allHoldings.filter(
    (holding) => holding.symbolCode === symbolCode
  );
  const watchItem = watchItems.find((row) => row.symbolCode === symbolCode);

  // 등록하지 않은 종목코드는 상세를 제공하지 않는다 (§15.4 — 보유·관심 공통 정책)
  const kindsAvailable: Kind[] = [
    ...(holdings.length > 0 ? (["holding"] as const) : []),
    ...(watchItem !== undefined ? (["watch"] as const) : []),
  ];

  if (kindsAvailable.length === 0) {
    redirect("/stocks");
  }

  const activeKind =
    requestedKind !== null && kindsAvailable.includes(requestedKind)
      ? requestedKind
      : kindsAvailable[0];
  const isHolding = activeKind === "holding";
  const detailPath = `/stocks/${symbolCode}?kind=${activeKind}`;
  const isEditMode = isHolding && edit === "1";

  // 등록 직후엔 종목명이 비어 있음 — 다음 갱신 회차에 잡이 채운다 (§11.10-A4)
  const name = (isHolding ? holdings[0]?.name : watchItem?.name) || symbolCode;
  const totalQuantity = holdings.reduce((sum, h) => sum + h.quantity, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);

  const [info, history, muted] = await Promise.all([
    getStockInfo(symbolCode),
    getStockHistory(symbolCode).catch((err): StockDailyPrice[] => {
      console.error(
        `[StockDetailPage] history read failed (${symbolCode}):`,
        err
      );
      return [];
    }),
    getMutedSymbols(email),
  ]);

  // ── 보유 상세 계산
  const currentValue =
    info.currentPrice !== null ? info.currentPrice * totalQuantity : null;
  const profit = currentValue !== null ? currentValue - totalCost : null;
  const holdingReturnRate =
    profit !== null && totalCost > 0 ? (profit / totalCost) * 100 : null;

  // ── 관심 상세 계산
  const watchReturnRate =
    watchItem !== undefined
      ? computeWatchReturnRate(info.currentPrice, watchItem)
      : null;
  const provisional =
    watchItem !== undefined &&
    watchItem.priceBasisDate !== null &&
    watchItem.priceBasisDate < watchItem.registeredAt;
  const basisPrice = watchItem?.priceAtRegistration ?? null;

  // 보유=평가금액(수량 반영) 2년 추이, 관심=등록일 이후 기준가 대비 종가 추이 (§15.3)
  const chartPoints: HoldingsChartPoint[] = isHolding
    ? history.map((row) => ({
        fullDate: row.date,
        date: row.date.slice(5).replace("-", "/"),
        totalValue: row.close * totalQuantity,
        returnRate:
          totalCost > 0
            ? ((row.close * totalQuantity - totalCost) / totalCost) * 100
            : 0,
      }))
    : basisPrice !== null && basisPrice > 0 && watchItem !== undefined
      ? history
          .filter((row) => row.date >= watchItem.registeredAt)
          .map((row) => ({
            fullDate: row.date,
            date: row.date.slice(5).replace("-", "/"),
            totalValue: row.close,
            returnRate: ((row.close - basisPrice) / basisPrice) * 100,
          }))
      : [];

  // 일별 기록 목록 — 차트와 같은 2년 히스토리를 월 단위로 넘겨본다 (§29, 보유 전용)
  const dailyRows: DailyHistoryRow[] = isHolding
    ? history.map((row) => ({
        date: row.date,
        close: row.close,
        totalValue: row.close * totalQuantity,
        returnRate:
          totalCost > 0
            ? ((row.close * totalQuantity - totalCost) / totalCost) * 100
            : 0,
      }))
    : [];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink
            href={isHolding ? "/stocks?mode=holdings" : "/stocks?mode=watchlist"}
            label={isHolding ? "보유종목 목록으로" : "관심종목 목록으로"}
            icon="back"
          />
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

        {/* 같은 종목이 보유·관심 양쪽에 다 있으면 반대쪽 상세로 건너뛸 수 있게 한다 (§58) */}
        {kindsAvailable.length > 1 ? (
          <p className={styles.kindSwitch}>
            <span>{isHolding ? "보유종목 상세" : "관심종목 상세"}</span>
            <Link
              href={`/stocks/${symbolCode}?kind=${
                isHolding ? "watch" : "holding"
              }`}
              className={styles.kindSwitchLink}
            >
              {isHolding ? "관심종목 상세 보기 →" : "보유종목 상세 보기 →"}
            </Link>
          </p>
        ) : null}

        {errorMessage !== null ? (
          <p className={styles.errorBanner} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {info.currentPrice === null ? (
          <p className={styles.errorBanner} role="alert">
            아직 저장된 시세가 없어 {isHolding ? "평가금액을" : "수익률을"}{" "}
            계산하지 못했습니다. 다음 갱신 회차(평일 09:00~15:30 KST, 10분
            간격)에 반영됩니다.
          </p>
        ) : null}

        {isHolding ? (
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
              {holdingReturnRate !== null ? (
                <span
                  className={`${styles.statValue} numeric ${
                    styles[resolveDirection(holdingReturnRate)]
                  }`}
                >
                  {formatChangeRate(holdingReturnRate)}
                </span>
              ) : (
                <span className={styles.statEmpty}>-</span>
              )}
            </div>
          </section>
        ) : (
          <section
            className={`${styles.summary} ${styles.summaryTriple}`}
            aria-label="관심종목 요약"
          >
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
                <span className={styles.statEmpty}>시세 없음</span>
              )}
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>등록 기준일 · 기준가</span>
              <span className={`${styles.statValue} numeric`}>
                {watchItem?.registeredAt} ·{" "}
                {basisPrice !== null ? formatKrw(basisPrice) : "확정 중"}
                {provisional ? (
                  <span className={styles.statSub}>
                    직전 거래일({watchItem?.priceBasisDate}) 종가
                  </span>
                ) : null}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>등록 기준 수익률</span>
              {watchReturnRate !== null ? (
                <span
                  className={`${styles.statValue} numeric ${
                    styles[resolveDirection(watchReturnRate)]
                  }`}
                >
                  {formatChangeRate(watchReturnRate)}
                </span>
              ) : (
                <span className={styles.statEmpty}>-</span>
              )}
            </div>
          </section>
        )}

        {isHolding ? (
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
                      <form
                        action={updateHoldingAction}
                        className={styles.editForm}
                      >
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
                          <span className={styles.editLabel}>
                            총 매입금액(원)
                          </span>
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
                        <button
                          type="submit"
                          className={styles.secondaryButton}
                        >
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
                  href={`${detailPath}&edit=1`}
                  className={styles.editToggle}
                >
                  수정
                </Link>
              </div>
            )}
          </section>
        ) : null}

        <section
          className={styles.section}
          aria-label={isHolding ? "최근 2년 추이" : "등록일 이후 추이"}
        >
          {chartPoints.length > 0 ? (
            <HoldingsChartClient
              points={chartPoints}
              title={isHolding ? "최근 2년 추이" : "등록일 이후 추이"}
            />
          ) : (
            <p className={styles.emptyNotice}>
              {isHolding
                ? "종가 히스토리가 아직 없습니다. 평일 18:15(KST) 갱신 이후 추이 차트가 표시됩니다."
                : basisPrice === null
                  ? "기준가가 아직 확정되지 않았습니다. 다음 갱신 회차 이후 추이 차트가 표시됩니다."
                  : "등록일 이후 종가 히스토리가 아직 없습니다. 평일 18:15(KST) 갱신 이후 추이 차트가 표시됩니다."}
            </p>
          )}
        </section>

        {dailyRows.length > 0 ? (
          <section className={styles.section} aria-label="일별 기록">
            <DailyHistoryList rows={dailyRows} />
          </section>
        ) : null}

        <section className={styles.section} aria-label="종목 정보">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>종목 정보</h2>
            <AlertToggleButton
              symbolCode={symbolCode}
              initialEnabled={!muted.includes(symbolCode)}
            />
          </div>
          <StockInfoBlocks info={info} />
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            {isHolding
              ? "현재가·투자지표는 한국투자증권 OpenAPI 기준으로 평일 09:00~15:30(KST) 10분 간격 갱신 회차에 저장된 값입니다. 종가 히스토리·배당·실적은 15:40·18:15 확정 회차에 갱신되며, 실적은 분기 누적값을 차감한 분기 단독 기준(억원)입니다."
              : "수익률은 등록 기준일 종가(수량·금액 없음) 대비 현재가 기준입니다. 현재가·투자지표는 평일 09:00~15:30(KST) 10분 간격 갱신 회차에 저장된 값이며, 종가 히스토리·배당·실적은 15:40·18:15 확정 회차에 갱신됩니다. 원 단위 차트는 종가를 표시합니다."}
          </p>
        </footer>
      </div>
    </main>
  );
}
