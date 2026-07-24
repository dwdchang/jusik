import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HoldingsOverview } from "@/components/holdings/HoldingsOverview";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { StockSearchInput } from "@/components/stocks/StockSearchInput";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { todayKstDate } from "@/lib/date/kst";
import { formatKstDateTime } from "@/lib/format/datetime";
import { getHoldings } from "@/lib/holdings/store";
import { getPortfolioValuation } from "@/lib/holdings/valuation";
import { getLastRefreshRecord, getStockSnapshots } from "@/lib/market/store";
import { getWatchlist } from "@/lib/watchlist/store";
import { addWatchItemAction } from "./actions";
import {
  buildHoldingRows,
  buildWatchRows,
  sortRowsByReturnRate,
  type StockRow,
} from "./rows";
import { StockRowItem, type RowColumns } from "./StockRowItem";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "내 종목 — jusik",
  description: "보유종목·관심종목 수익률 목록과 잔고",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "종목코드는 숫자 6자리여야 합니다.",
  invalid_quantity: "수량은 1 이상의 정수여야 합니다.",
  invalid_total_cost: "총 매입금액은 0보다 큰 숫자여야 합니다.",
  invalid_date: "등록 기준일은 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.",
  future_date: "등록 기준일은 오늘 이후일 수 없습니다.",
  too_old_date: "등록 기준일은 최근 2년 이내여야 합니다.",
  duplicate_code: "이미 등록된 종목입니다.",
  not_found: "대상 종목을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.",
};

/** 탭 — 모두 / 보유종목 / 관심종목 (§56) + 잔고 (§58). 핫종목·배당과 동형인 서버 탭 */
type Mode = "all" | "holdings" | "watchlist" | "balance";

const TABS: ReadonlyArray<{ key: Mode; label: string; href: string }> = [
  { key: "all", label: "모두", href: "/stocks" },
  { key: "holdings", label: "보유종목", href: "/stocks?mode=holdings" },
  { key: "watchlist", label: "관심종목", href: "/stocks?mode=watchlist" },
  { key: "balance", label: "잔고", href: "/stocks?mode=balance" },
];

/** ?mode 값 검증 — 알 수 없는 값은 기본 탭(모두)으로 (§14.5 관례) */
function resolveMode(mode: string | undefined): Mode {
  return mode === "holdings" || mode === "watchlist" || mode === "balance"
    ? mode
    : "all";
}

/** 탭별 열 구성 — 관심종목 탭만 4열(현재가·등락률·수익률·기준일) */
const COLUMNS: Record<"all" | "holdings" | "watchlist", RowColumns> = {
  all: "full",
  holdings: "full",
  watchlist: "watch",
};

const EMPTY_NOTICE: Record<"all" | "holdings" | "watchlist", string> = {
  all: "등록된 종목이 없습니다. 잔고·관심종목 탭에서 추가해보세요.",
  holdings: "등록된 보유종목이 없습니다. 잔고 탭에서 추가해보세요.",
  watchlist: "등록된 관심종목이 없습니다. 아래에서 종목을 추가해보세요.",
};

export default async function StocksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const { error, mode } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;
  const activeMode = resolveMode(mode);
  const today = todayKstDate();
  const isBalance = activeMode === "balance";

  // 잔고 탭은 표가 아니라 포트폴리오 본문이라 목록·시세를 읽지 않는다
  // (필요한 데이터는 HoldingsOverview가 직접 읽는다, §58)
  const needsHoldings = !isBalance && activeMode !== "watchlist";
  const needsWatchlist = !isBalance && activeMode !== "holdings";

  // 활성 탭에 필요한 목록만 읽는다 (배당 페이지 3탭과 같은 관례)
  const [holdings, watchItems, lastRefresh] = await Promise.all([
    needsHoldings ? getHoldings(email) : Promise.resolve([]),
    needsWatchlist ? getWatchlist(email) : Promise.resolve([]),
    getLastRefreshRecord().catch(() => null),
  ]);

  // 시세 스냅샷은 두 목록 합집합으로 한 번에. 실패해도 목록 자체는 보여준다
  // (현재가·등락률만 「시세 없음」으로 떨어짐, §11.10-A4 실패 격리)
  let snapshots: Awaited<ReturnType<typeof getStockSnapshots>>;
  try {
    snapshots = await getStockSnapshots([
      ...new Set([
        ...holdings.map((h) => h.symbolCode),
        ...watchItems.map((w) => w.symbolCode),
      ]),
    ]);
  } catch (err) {
    console.error("[StocksPage] getStockSnapshots failed:", err);
    snapshots = new Map();
  }

  let valuationError: string | null = null;
  const rows: StockRow[] = [];

  if (holdings.length > 0) {
    try {
      const valuation = await getPortfolioValuation(holdings);
      rows.push(...buildHoldingRows(valuation.items, snapshots));
    } catch (err) {
      console.error("[StocksPage] getPortfolioValuation failed:", err);
      valuationError =
        "보유종목 평가에 실패했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  if (watchItems.length > 0) {
    rows.push(...buildWatchRows(watchItems, snapshots));
  }

  const sortedRows = sortRowsByReturnRate(rows);
  const tableMode = isBalance ? null : activeMode;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>내 종목</h1>
          {lastRefresh !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(lastRefresh.at)}
            </span>
          ) : null}
        </header>

        <nav className={styles.tabs} aria-label="목록 선택">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={
                tab.key === activeMode
                  ? `${styles.tab} ${styles.tabActive}`
                  : styles.tab
              }
              aria-current={tab.key === activeMode ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

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

        {/* 잔고 탭 — 구 `/holdings` 화면 본문 그대로 (§58) */}
        {isBalance ? (
          <HoldingsOverview email={email} openAddForm={errorMessage !== null} />
        ) : null}

        {tableMode !== null ? (
          sortedRows.length === 0 ? (
            <p className={styles.emptyNotice}>{EMPTY_NOTICE[tableMode]}</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.stockTable}>
                <thead>
                  <tr>
                    <th>종목명</th>
                    <th>현재가</th>
                    <th>등락률</th>
                    <th>수익률</th>
                    {COLUMNS[tableMode] === "full" ? (
                      <>
                        <th>수익금</th>
                        <th>평균단가</th>
                        <th>총 매입금액</th>
                      </>
                    ) : (
                      <th>기준일</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <StockRowItem
                      key={row.key}
                      row={row}
                      columns={COLUMNS[tableMode]}
                      highlightHolding={activeMode === "all"}
                      mode={activeMode}
                      today={today}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {activeMode === "watchlist" ? (
          <section className={styles.section} aria-label="관심종목 추가">
            {/* 폼 검증 실패로 돌아온 경우엔 펼친 상태로 렌더 — 재입력 동선 유지 */}
            <details className={styles.addDetails} open={errorMessage !== null}>
              {/* 열림 상태에서 summary가 취소 버튼 역할 (§17.12) */}
              <summary className={styles.addToggle}>
                <span className={styles.addToggleOpenLabel}>
                  + 관심종목 추가
                </span>
                <span className={styles.addToggleCloseLabel}>✕ 취소</span>
              </summary>
              <form action={addWatchItemAction} className={styles.addForm}>
                <input type="hidden" name="mode" value="watchlist" />
                <StockSearchInput />
                <input
                  name="registeredAt"
                  className={styles.input}
                  type="date"
                  defaultValue={today}
                  max={today}
                  required
                />
                <button type="submit" className={styles.primaryButton}>
                  추가
                </button>
              </form>
              <p className={styles.formHint}>
                종목명으로 검색해 선택하세요. 기준가(등록 기준일 종가)는 다음
                갱신 회차(평일 09:00~15:30 KST, 10분 간격)에 자동으로 채워집니다.
                기준일이 휴장일이면 직전 거래일 종가가 기준가가 됩니다.
              </p>
            </details>
          </section>
        ) : null}

        <footer className={styles.footer}>
          {isBalance ? (
            <p className={styles.notice}>
              현재가는 한국투자증권 OpenAPI 기준으로 평일 09:00~15:30(KST) 10분
              간격 갱신 회차에 저장된 값입니다. 일별 기록은 장중 갱신되고
              15:40·18:15 회차에서 확정됩니다.
            </p>
          ) : (
            <p className={styles.notice}>
              종목명을 누르면 상세가 펼쳐집니다. 수익률은 보유종목이 평균 매입가
              대비, 관심종목이 등록 기준일 종가 대비이며 수익금·평균단가·총
              매입금액은 보유종목에만 해당합니다. 목록은 수익률 내림차순이고,
              시세나 기준가가 아직 없는 종목은 맨 뒤에 놓입니다. 현재가는
              한국투자증권 OpenAPI 기준으로 갱신 회차(평일 09:00~15:30 KST, 10분
              간격)에 저장된 값입니다.
            </p>
          )}
        </footer>
      </div>
    </main>
  );
}
