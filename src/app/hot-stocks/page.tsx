import type { Metadata } from "next";
import Link from "next/link";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatChangeRate } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatKrw } from "@/lib/format/krw";
import {
  formatMonthDisplay,
  formatMonthRangeDisplay,
} from "@/lib/hotstocks/months";
import {
  getHotStocks,
  HOT_STOCK_WINDOW_KEYS,
  HOT_STOCK_WINDOW_LABELS,
  type HotStockWindowKey,
  type StoredHotStocks,
} from "@/lib/hotstocks/store";
import { isHotStocksStale } from "@/lib/hotstocks/summary";
import { resolveDirection } from "@/lib/indices/kisMapper";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "핫종목 — jusik",
  description: "코스피·코스닥 보통주 구간 수익률 TOP 100 (최근 1개월~1년)",
};

/** ?period 값 검증 — 알 수 없는 값은 기본 구간(최근 1개월)으로 (§14.5) */
function resolvePeriod(period: string | undefined): HotStockWindowKey {
  return HOT_STOCK_WINDOW_KEYS.includes(period as HotStockWindowKey)
    ? (period as HotStockWindowKey)
    : "1m";
}

/** 시장 구분 위첨자 — ᴷ/ᴰ는 자체 위첨자 문자라 <sup> 없이 span으로 표기 (§16) */
const MARKET_SUP = {
  KOSPI: { mark: "ᴷ", title: "코스피", srText: "코스피 종목" },
  KOSDAQ: { mark: "ᴰ", title: "코스닥", srText: "코스닥 종목" },
} as const;

export default async function HotStocksPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await ensureAllowedSession();

  const { period } = await searchParams;
  const activeKey = resolvePeriod(period);

  let stored: StoredHotStocks | null;

  try {
    stored = await getHotStocks();
  } catch (error) {
    console.error("[HotStocksPage] getHotStocks failed:", error);

    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <NavIconLink href="/" label="홈으로" icon="home" />
            <h1 className={styles.title}>핫종목</h1>
          </header>
          <p className={styles.errorBanner} role="alert">
            핫종목 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </p>
        </div>
      </main>
    );
  }

  const window = stored?.windows[activeKey] ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>핫종목</h1>
          {stored !== null ? (
            <span className={styles.lastRefresh}>
              갱신: {formatKstDateTime(stored.fetchedAt)}
            </span>
          ) : null}
        </header>

        <nav className={styles.tabs} aria-label="구간 선택">
          {HOT_STOCK_WINDOW_KEYS.map((key) => (
            <Link
              key={key}
              href={`/hot-stocks?period=${key}`}
              className={
                key === activeKey ? `${styles.tab} ${styles.tabActive}` : styles.tab
              }
              aria-current={key === activeKey ? "page" : undefined}
            >
              {HOT_STOCK_WINDOW_LABELS[key]}
            </Link>
          ))}
        </nav>

        {stored === null || window === null ? (
          <p className={styles.emptyNotice}>
            핫종목 랭킹이 아직 없습니다. 매월 첫 평일에 직전 완결 월 기준으로
            생성됩니다.
          </p>
        ) : (
          <>
            {isHotStocksStale(stored.computedFor) ? (
              <p className={styles.staleNotice} role="alert">
                갱신 지연 — 최신 기준월이 아직 반영되지 않았습니다. 아래는{" "}
                {formatMonthDisplay(stored.computedFor)} 월말 기준 랭킹입니다.
              </p>
            ) : null}

            <p className={styles.rangeInfo}>
              {window.label} ({formatMonthRangeDisplay(window.startMonth, window.endMonth)})
              · 기준: {formatMonthDisplay(stored.computedFor)} 월말 종가 · 대상{" "}
              <span className="numeric">{stored.universeCount.toLocaleString("ko-KR")}</span>
              종목
            </p>

            {window.entries.length === 0 ? (
              <p className={styles.emptyNotice}>
                이 구간에는 표시할 종목이 없습니다.
              </p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>종목명</th>
                      <th>
                        <span className={styles.srOnly}>종목코드</span>
                      </th>
                      <th>수익률</th>
                      <th>시작 종가</th>
                      <th>끝 종가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {window.entries.map((entry) => (
                      <tr key={entry.code}>
                        <td className={`${styles.rankCell} numeric`}>
                          {entry.rank}
                        </td>
                        <td className={styles.nameCell} title={entry.name}>
                          <span className={styles.nameText}>{entry.name}</span>
                          <span
                            className={styles.marketSup}
                            title={MARKET_SUP[entry.market].title}
                            aria-hidden="true"
                          >
                            {MARKET_SUP[entry.market].mark}
                          </span>
                          <span className={styles.srOnly}>
                            {MARKET_SUP[entry.market].srText}
                          </span>
                        </td>
                        <td className={`${styles.codeCell} numeric`}>
                          {entry.code}
                        </td>
                        <td
                          className={`${styles.numCell} numeric ${
                            styles[resolveDirection(entry.returnRate)]
                          }`}
                        >
                          {formatChangeRate(entry.returnRate)}
                        </td>
                        <td className={`${styles.numCell} numeric`}>
                          {formatKrw(entry.startPrice)}
                        </td>
                        <td className={`${styles.numCell} numeric`}>
                          {formatKrw(entry.endPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <footer className={styles.footer}>
          <p className={styles.notice}>
            수익률은 구간 시작 직전 월말 종가 대비 기준월 월말 종가(수정주가)의
            등락률입니다. 구간은 직전 완결 월을 끝점으로 하며, 랭킹은 매월 첫
            평일에 갱신됩니다. 코스피·코스닥 보통주(우선주 포함)가 대상이고
            스팩은 제외됩니다. 구간 시작 시점의 월말 종가가 없는 종목(신규
            상장 등)은 해당 구간에서만 제외되며, 현재 상장 종목 기준이라 구간
            중 상장폐지된 종목은 포함되지 않습니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
