import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { DIVIDEND_RANKING_LOOKBACK_YEARS } from "@/lib/api/kis/constants";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import {
  type DividendRankingCategory,
  getDividendRankingView,
} from "@/lib/dividends/ranking/summary";
import { getDividendSchedule } from "@/lib/dividends/summary";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatKrw } from "@/lib/format/krw";
import { getLastRefreshRecord } from "@/lib/market/store";
import { DividendRankRow } from "./DividendRankRow";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "배당 — jusik",
  description: "보유종목의 확정 배당 기준일·지급일·예상 지급액",
};

/** "YYYY-MM-DD" → "YYYY.MM.DD" 표시 */
function displayDate(isoDate: string): string {
  return isoDate.replaceAll("-", ".");
}

/** 배당 페이지 탭 키 — 순위 2종(일반종목/배당상품) + 개인 일정 1종(내 배당) */
type DividendTab = DividendRankingCategory | "schedule";

/**
 * 배당 페이지 탭 — 일반종목/배당상품(전체 배당률 순위) + 내 배당(보유종목 확정
 * 배당 일정) (Phase 47). 앞 두 탭은 공개 데이터 탐색, "내 배당"은 개인 보유 기준.
 * 순위표와 확정 배당 목록이 따로 스크롤돼 불편하다는 요청으로 한 탭 바에 통합.
 */
const DIVIDEND_TABS: ReadonlyArray<{
  key: DividendTab;
  label: string;
  href: string;
}> = [
  { key: "stock", label: "일반종목", href: "/dividends" },
  { key: "product", label: "배당상품", href: "/dividends?mode=product" },
  { key: "schedule", label: "내 배당", href: "/dividends?mode=schedule" },
];

/** 순위 탭별 메타 — 대상 수 수식어·빈 안내 (내 배당 탭은 순위가 아니라 제외) */
const RANK_META: Record<
  DividendRankingCategory,
  { universeLabel: string; emptyNotice: string }
> = {
  stock: {
    universeLabel: "전 종목",
    emptyNotice:
      "아직 산출된 배당률 순위가 없습니다. 전 종목 스캔이 다음 갱신 회차에 완료되면 여기에 표시됩니다.",
  },
  product: {
    universeLabel: "전 배당상품",
    emptyNotice:
      "아직 산출된 배당상품 순위가 없습니다. ETF·리츠·인프라펀드 스캔이 다음 갱신 회차에 완료되면 여기에 표시됩니다.",
  },
};

/**
 * 배당 상세 페이지 — Phase 25 (plan.md §25). 홈 "배당" 카드에서 이동.
 * 보유종목만 대상(관심종목 제외 — 사용자 확정). 시세 잡이 저장한 확정 배당
 * 회차를 한 줄씩 나열하며, 예상 지급액은 현재 보유수량 기준·세전 금액이다.
 */
export default async function DividendsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await ensureAllowedSession();
  const email = session.user?.email;

  if (!email) {
    redirect("/login");
  }

  const { mode } = await searchParams;
  const activeTab: DividendTab =
    mode === "product" ? "product" : mode === "schedule" ? "schedule" : "stock";
  const isRankingTab = activeTab === "stock" || activeTab === "product";

  // 활성 탭에 필요한 데이터만 로드 — 순위 탭은 순위, 내 배당 탭은 확정 일정
  const [rows, ranking, lastRefresh] = await Promise.all([
    activeTab === "schedule"
      ? getDividendSchedule(email).catch((err): [] => {
          console.error("[DividendsPage] getDividendSchedule failed:", err);
          return [];
        })
      : Promise.resolve([]),
    // 순위는 잡이 아직 안 돌았으면 null — 탭 자체는 막지 않는다
    isRankingTab
      ? getDividendRankingView(activeTab).catch((err) => {
          console.error("[DividendsPage] getDividendRankingView failed:", err);
          return null;
        })
      : Promise.resolve(null),
    getLastRefreshRecord().catch(() => null),
  ]);

  const rankMeta = isRankingTab ? RANK_META[activeTab] : null;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>배당</h1>
          {lastRefresh !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(lastRefresh.at)}
            </span>
          ) : null}
        </header>

        <nav className={styles.tabs} aria-label="배당 유형 선택">
          {DIVIDEND_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={
                tab.key === activeTab
                  ? `${styles.tab} ${styles.tabActive}`
                  : styles.tab
              }
              aria-current={tab.key === activeTab ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {activeTab === "schedule" ? (
          <section className={styles.section} aria-label="보유종목 확정 배당">
            <h2 className={styles.sectionTitle}>
              보유종목 확정 배당 ({rows.length})
            </h2>
            {rows.length === 0 ? (
              <p className={styles.emptyNotice}>
                표시할 배당 일정이 없습니다. 보유종목의 확정 배당(최근 1년)이
                다음 갱신 회차에 수집되면 여기에 표시됩니다.{" "}
                <Link href="/holdings" className={styles.emptyLink}>
                  보유종목 관리 →
                </Link>
              </p>
            ) : (
              <ul className={styles.itemList}>
                {rows.map((row) => (
                  <li
                    key={`${row.symbolCode}-${row.recordDate}`}
                    className={styles.item}
                  >
                    <div className={styles.itemHead}>
                      {/* 종목명 링크 제거 (Phase 47) — 목록 터치 시 원치 않는 이동 방지 */}
                      <span className={styles.itemName}>
                        {row.name}
                        <span className={`${styles.itemCode} numeric`}>
                          {row.symbolCode}
                        </span>
                      </span>
                      <span className={`${styles.itemAmount} numeric`}>
                        예상 {formatKrw(row.expectedAmount)}
                      </span>
                    </div>
                    <p className={`${styles.itemMeta} numeric`}>
                      {row.kind !== null ? `${row.kind} · ` : ""}기준일{" "}
                      {displayDate(row.recordDate)} · 지급일{" "}
                      {row.payDate !== null ? (
                        displayDate(row.payDate)
                      ) : (
                        <span className={styles.payPending}>미정</span>
                      )}{" "}
                      · 주당 {formatKrw(row.amountPerShare)} × {row.quantity}주
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className={styles.section} aria-label="배당률 순위">
            <h2 className={styles.sectionTitle}>
              배당률 순위
              {ranking !== null && rankMeta !== null
                ? ` TOP ${ranking.entries.length} (${rankMeta.universeLabel} ${ranking.universeCount.toLocaleString("ko-KR")}개 대상)`
                : ""}
            </h2>

            {ranking === null ? (
              <p className={styles.emptyNotice}>{rankMeta?.emptyNotice}</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.rankTable}>
                  <thead>
                    <tr>
                      <th className={styles.stickyRank} scope="col">
                        순위
                      </th>
                      <th className={styles.stickyName} scope="col">
                        종목명
                      </th>
                      <th scope="col">현재가</th>
                      <th scope="col">배당률</th>
                      <th scope="col">주당배당금</th>
                      <th scope="col">지급 주기</th>
                      <th scope="col">연속 배당</th>
                      <th scope="col">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.entries.map((entry) => (
                      <DividendRankRow key={entry.code} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <footer className={styles.footer}>
          {activeTab === "schedule" ? (
            <p className={styles.notice}>
              예상 지급액은 <strong>현재 보유수량 기준</strong>입니다 — 실제
              수령 자격은 배당 기준일 시점 보유 여부로 결정되며, 수량 변경
              이력은 반영되지 않습니다. 금액은 <strong>세전</strong>(배당소득세
              15.4% 원천징수 전) 기준입니다. 지급일이 미정인 회차는 공시로
              확정되면 자동으로 채워집니다.
            </p>
          ) : (
            <>
              <p className={styles.notice}>
                <strong>종목명을 누르면</strong> 지난 배당 기록(회차별 기준일·주당배당금·
                지급일)이 펼쳐집니다.
              </p>
              <p className={styles.notice}>
                배당률은 <strong>시가배당률</strong>(최근 1년 확정 주당배당금 합
                ÷ 산출 시점 현재가)이며, 액면가배당률이 아닙니다.
                현재가·배당률·순위는 산출 시점 기준으로 함께 고정되므로 장중
                시세와는 차이가 있습니다. 연속 배당 연수의 <strong>+</strong>{" "}
                표기는 조회 범위(최근 {DIVIDEND_RANKING_LOOKBACK_YEARS}년) 끝까지
                배당이 이어져 실제로는 더 길 수 있다는 뜻입니다.
              </p>
              <p className={styles.notice}>
                비고의 <strong>우</strong>는 우선주, <strong>현+주N%</strong>는
                현금과 함께 주식배당(주식배당률 N%)을 병행한 종목입니다.{" "}
                <strong>폭배</strong>는 최근 1년 배당이 예년보다 비경상적으로
                급증한 종목으로, 특별배당·결산기 변경 등 일회성일 수 있어 지속
                배당률로 보기 어렵습니다 — 링크로 DART 배당결정 공시 원문을
                확인할 수 있습니다. 배당률 옆 <strong>*</strong>는
                액면분할/병합이 반영돼 배당 당시 액면가와 현재 액면가가 달라,
                주당배당금을 현재 주식 수 기준으로 환산해 보정한 값입니다.
              </p>
            </>
          )}
        </footer>
      </div>
    </main>
  );
}
