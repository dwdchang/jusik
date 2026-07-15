import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { StockSearchInput } from "@/components/stocks/StockSearchInput";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { todayKstDate } from "@/lib/date/kst";
import { formatChangeRate } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatKrw } from "@/lib/format/krw";
import { resolveDirection } from "@/lib/indices/kisMapper";
import { getLastRefreshRecord, getStockSnapshots } from "@/lib/market/store";
import { getWatchlist } from "@/lib/watchlist/store";
import { computeWatchReturnRate } from "@/lib/watchlist/summary";
import {
  addWatchItemAction,
  deleteWatchItemAction,
  updateWatchItemAction,
} from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "관심종목 — jusik",
  description: "관심종목 — 등록 기준일 종가 대비 수익률 추적",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "종목코드는 숫자 6자리여야 합니다.",
  invalid_date: "등록 기준일은 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.",
  future_date: "등록 기준일은 오늘 이후일 수 없습니다.",
  too_old_date: "등록 기준일은 최근 2년 이내여야 합니다.",
  duplicate_code: "이미 등록된 관심종목입니다.",
  not_found: "대상 종목을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.",
};

export default async function WatchlistPage({
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
  const today = todayKstDate();

  const [items, lastRefresh] = await Promise.all([
    getWatchlist(email),
    getLastRefreshRecord().catch(() => null),
  ]);

  let snapshots: Awaited<ReturnType<typeof getStockSnapshots>>;
  try {
    snapshots = await getStockSnapshots(
      [...new Set(items.map((item) => item.symbolCode))]
    );
  } catch (err) {
    console.error("[WatchlistPage] getStockSnapshots failed:", err);
    snapshots = new Map();
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>관심종목</h1>
          {lastRefresh !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(lastRefresh.at)}
            </span>
          ) : null}
        </header>

        {errorMessage !== null ? (
          <p className={styles.errorBanner} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className={styles.section} aria-label="관심종목 추가">
          {/* 폼 검증 실패로 돌아온 경우엔 펼친 상태로 렌더 — 재입력 동선 유지 */}
          <details className={styles.addDetails} open={errorMessage !== null}>
            {/* 열림 상태에서 summary가 취소 버튼 역할 — 클릭 시 폼이 접힌다 (§17.12) */}
            <summary className={styles.addToggle}>
              <span className={styles.addToggleOpenLabel}>+ 종목 추가</span>
              <span className={styles.addToggleCloseLabel}>✕ 취소</span>
            </summary>
            <form action={addWatchItemAction} className={styles.addForm}>
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
              종목명으로 검색해 선택하세요. 기준가(등록 기준일 종가)는 다음 갱신
              회차(평일 09:00~15:30 KST, 10분 간격)에 자동으로 채워집니다.
              기준일이 휴장일이면 직전 거래일 종가가 기준가가 됩니다.
            </p>
          </details>
        </section>

        <section className={styles.section} aria-label="관심종목 목록">
          <h2 className={styles.sectionTitle}>관심종목 ({items.length})</h2>
          {items.length === 0 ? (
            <p className={styles.emptyNotice}>
              등록된 관심종목이 없습니다. 위에서 종목을 추가해보세요.
            </p>
          ) : (
            <ul className={styles.itemList}>
              {items.map((item) => {
                const currentPrice =
                  snapshots.get(item.symbolCode)?.price ?? null;
                const returnRate = computeWatchReturnRate(currentPrice, item);
                const provisional =
                  item.priceBasisDate !== null &&
                  item.priceBasisDate < item.registeredAt;

                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemHead}>
                      <Link
                        href={`/watchlist/${item.symbolCode}`}
                        className={styles.itemName}
                      >
                        {item.name || item.symbolCode}
                        <span className={`${styles.itemCode} numeric`}>
                          {item.symbolCode}
                        </span>
                      </Link>
                      {returnRate !== null ? (
                        <span
                          className={`${styles.itemReturn} numeric ${
                            styles[resolveDirection(returnRate)]
                          }`}
                        >
                          {formatChangeRate(returnRate)}
                        </span>
                      ) : (
                        <span className={styles.itemReturnEmpty}>-</span>
                      )}
                    </div>

                    <dl className={styles.itemStats}>
                      <div className={styles.itemStat}>
                        <dt>등록 기준일</dt>
                        <dd className="numeric">{item.registeredAt}</dd>
                      </div>
                      <div className={styles.itemStat}>
                        <dt>기준가</dt>
                        <dd className="numeric">
                          {item.priceAtRegistration !== null
                            ? `${formatKrw(item.priceAtRegistration)}${
                                provisional ? " (직전 거래일)" : ""
                              }`
                            : "확정 중"}
                        </dd>
                      </div>
                      <div className={styles.itemStat}>
                        <dt>현재가</dt>
                        <dd className="numeric">
                          {currentPrice !== null
                            ? formatKrw(currentPrice)
                            : "시세 없음"}
                        </dd>
                      </div>
                    </dl>

                    <div className={styles.itemActions}>
                      <form
                        action={updateWatchItemAction}
                        className={styles.editForm}
                      >
                        <input type="hidden" name="id" value={item.id} />
                        <input
                          name="registeredAt"
                          className={styles.input}
                          type="date"
                          defaultValue={item.registeredAt}
                          max={today}
                          required
                        />
                        <button type="submit" className={styles.secondaryButton}>
                          기준일 변경
                        </button>
                      </form>
                      <form action={deleteWatchItemAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className={styles.dangerButton}>
                          삭제
                        </button>
                      </form>
                      <Link
                        href={`/watchlist/${item.symbolCode}`}
                        className={styles.detailLink}
                      >
                        상세 보기 →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            수익률은 등록 기준일 종가 대비 현재가 기준이며, 수량·금액 없이
            비율만 추적합니다. 기준일을 변경하면 기준가가 다음 갱신 회차에서
            다시 확정됩니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
