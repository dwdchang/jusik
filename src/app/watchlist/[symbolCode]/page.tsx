import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HoldingsChartClient } from "@/components/holdings/HoldingsChartClient";
import type { HoldingsChartPoint } from "@/components/holdings/HoldingsChart";
import { StockInfoBlocks } from "@/components/stocks/StockInfoBlocks";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatChangeRate } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatKrw } from "@/lib/format/krw";
import { getStockHistory } from "@/lib/holdings/stockHistory";
import { getStockInfo } from "@/lib/holdings/stockInfo";
import type { StockDailyPrice } from "@/lib/holdings/stockHistory";
import { resolveDirection } from "@/lib/indices/kisMapper";
import { getWatchlist } from "@/lib/watchlist/store";
import { computeWatchReturnRate } from "@/lib/watchlist/summary";
import styles from "./page.module.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}): Promise<Metadata> {
  const { symbolCode } = await params;
  return {
    title: `${symbolCode} 관심종목 상세 — jusik`,
    description: "관심종목 상세 — 등록 기준 수익률·추이·종목 정보",
  };
}

export default async function WatchItemDetailPage({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}) {
  const { symbolCode } = await params;

  if (!/^\d{6}$/.test(symbolCode)) {
    redirect("/watchlist");
  }

  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const item = (await getWatchlist(email)).find(
    (row) => row.symbolCode === symbolCode
  );

  // 등록하지 않은 종목코드는 상세를 제공하지 않는다 (§15.4 — 보유종목과 동일 정책)
  if (item === undefined) {
    redirect("/watchlist");
  }

  // 등록 직후엔 종목명이 비어 있음 — 다음 갱신 회차에 잡이 채운다 (§11.10-A4)
  const name = item.name || symbolCode;

  const [info, history] = await Promise.all([
    getStockInfo(symbolCode),
    getStockHistory(symbolCode).catch((err): StockDailyPrice[] => {
      console.error(
        `[WatchItemDetailPage] history read failed (${symbolCode}):`,
        err
      );
      return [];
    }),
  ]);

  const returnRate = computeWatchReturnRate(info.currentPrice, item);
  const provisional =
    item.priceBasisDate !== null && item.priceBasisDate < item.registeredAt;

  // 등록일 이후 추이 — totalValue 자리에 종가, 수익률은 기준가 대비 (§15.3)
  const basisPrice = item.priceAtRegistration;
  const chartPoints: HoldingsChartPoint[] =
    basisPrice !== null && basisPrice > 0
      ? history
          .filter((row) => row.date >= item.registeredAt)
          .map((row) => ({
            fullDate: row.date,
            date: row.date.slice(5).replace("-", "/"),
            totalValue: row.close,
            returnRate: ((row.close - basisPrice) / basisPrice) * 100,
          }))
      : [];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/watchlist" className={styles.backLink}>
            ← 관심종목
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

        {info.currentPrice === null ? (
          <p className={styles.errorBanner} role="alert">
            아직 저장된 시세가 없어 수익률을 계산하지 못했습니다. 다음 갱신
            회차(평일 09:00~15:30 KST, 10분 간격)에 반영됩니다.
          </p>
        ) : null}

        <section className={styles.summary} aria-label="관심종목 요약">
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
              {item.registeredAt} ·{" "}
              {item.priceAtRegistration !== null
                ? formatKrw(item.priceAtRegistration)
                : "확정 중"}
              {provisional ? (
                <span className={styles.statSub}>
                  직전 거래일({item.priceBasisDate}) 종가
                </span>
              ) : null}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>등록 기준 수익률</span>
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

        <section className={styles.section} aria-label="등록일 이후 추이">
          {chartPoints.length > 0 ? (
            <HoldingsChartClient
              points={chartPoints}
              title="등록일 이후 추이"
            />
          ) : (
            <p className={styles.emptyNotice}>
              {basisPrice === null
                ? "기준가가 아직 확정되지 않았습니다. 다음 갱신 회차 이후 추이 차트가 표시됩니다."
                : "등록일 이후 종가 히스토리가 아직 없습니다. 평일 18:15(KST) 갱신 이후 추이 차트가 표시됩니다."}
            </p>
          )}
        </section>

        <section className={styles.section} aria-label="종목 정보">
          <h2 className={styles.sectionTitle}>종목 정보</h2>
          <StockInfoBlocks info={info} />
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            수익률은 등록 기준일 종가(수량·금액 없음) 대비 현재가 기준입니다.
            현재가·투자지표는 평일 09:00~15:30(KST) 10분 간격 갱신 회차에
            저장된 값이며, 종가 히스토리·배당·실적은 15:40·18:15 확정 회차에
            갱신됩니다. 원 단위 차트는 종가를 표시합니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
