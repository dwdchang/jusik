import type { Metadata } from "next";
import { GlobalTableSection } from "@/components/indices/GlobalTableSection";
import { IndexDailyList } from "@/components/indices/IndexDailyList";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import { formatBtcChange, formatBtcValue } from "@/lib/format/btc";
import { formatChange } from "@/lib/format/change";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatIndex } from "@/lib/format/index";
import { getGlobalTable, getMarketDetails } from "@/lib/market/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "글로벌 지표 — jusik",
  description:
    "세계 증시 · 전세계 환율 · 국제 유가 · 귀금속 · 비철금속 · 농산물 · 미국 10년물 · 비트코인",
};

/**
 * 글로벌 지표 화면 — Phase 88 전면 개편.
 * 상단은 미국 10년물·비트코인 두 카드만 남기고(WTI·금은 아래 표로 흡수) 미니 차트는
 * 전부 걷어냈다. 그 아래로 섹션 6개 32종을 표로 세우며, 첫 섹션만 펼치고 나머지는
 * 접는다(§87 관례) — 다 펼치면 화면이 너무 길어진다.
 * KIS 직접 호출 없음 — 갱신 잡이 저장한 Redis 스냅샷만 읽는다 (AGENTS.md §2).
 */
export default async function MarketOverviewPage() {
  await ensureAllowedSession();

  const [rows, globalTable] = await Promise.all([
    getMarketDetails(["us10y", "btcKrw", "btcUsd"]).catch((error: unknown) => {
      console.error("[MarketOverviewPage] getMarketDetails failed:", error);
      return [null, null, null];
    }),
    getGlobalTable().catch((error: unknown) => {
      console.error("[MarketOverviewPage] getGlobalTable failed:", error);
      return null;
    }),
  ]);

  const [us10y, btcKrw, btcUsd] = rows;

  const fetchedAts = rows
    .map((row) => row?.fetchedAt)
    .filter((at): at is string => typeof at === "string");
  // 「마지막 갱신」은 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다.
  // 표(하루 3회차)는 여기서 제외하고 자기 갱신 시각을 따로 적는다 — 넣으면 10분마다
  // 도는 두 카드까지 반나절 낡은 것처럼 보인다 (§85 dxy와 같은 이유)
  const oldestFetchedAt = fetchedAts.sort()[0] ?? null;

  const emptyNotice = (
    <p className={styles.emptyNotice}>
      아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일 09:00~18:15 KST)에
      반영됩니다.
    </p>
  );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈으로" icon="home" />
          <h1 className={styles.title}>글로벌 지표</h1>
          {oldestFetchedAt !== null ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(oldestFetchedAt)}
            </span>
          ) : null}
        </header>

        <section className={styles.cards} aria-label="미국 10년물 · 비트코인">
          <article className={styles.card} aria-label="미국 10년물 국채금리">
            {us10y === null ? (
              emptyNotice
            ) : (
              <>
                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.cardTitle}>{us10y.snapshot.name}</h2>
                    <p className={styles.basDt}>
                      기준일 {formatBasDtDisplay(us10y.snapshot.basDt)}
                    </p>
                  </div>
                  <div className={styles.cardValues}>
                    <p className={`${styles.value} numeric`}>
                      {formatIndex(us10y.snapshot.close)}
                    </p>
                    <p
                      className={`${styles.change} numeric ${
                        styles[us10y.snapshot.direction]
                      }`}
                    >
                      {formatChange(
                        us10y.snapshot.changeAmount,
                        us10y.snapshot.changeRate
                      )}
                    </p>
                  </div>
                </div>
                <details className={styles.dailyDetails}>
                  <summary className={styles.dailyToggle}>
                    일별 기록
                    <span className={styles.chevron} aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <IndexDailyList rows={us10y.dailyRows} />
                </details>
              </>
            )}
          </article>

          <article className={styles.card} aria-label="비트코인">
            {btcKrw === null ? (
              emptyNotice
            ) : (
              <>
                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.cardTitle}>비트코인</h2>
                    <p className={styles.basDt}>
                      기준일 {formatBasDtDisplay(btcKrw.snapshot.basDt)}
                    </p>
                  </div>
                  <div className={styles.cardValues}>
                    <p className={`${styles.value} numeric`}>
                      {formatBtcValue(btcKrw.snapshot.close, "KRW")}
                    </p>
                    <p
                      className={`${styles.change} numeric ${
                        styles[btcKrw.snapshot.direction]
                      }`}
                    >
                      {formatBtcChange(
                        btcKrw.snapshot.changeAmount,
                        btcKrw.snapshot.changeRate,
                        "KRW"
                      )}
                    </p>
                    {btcUsd !== null ? (
                      <p className={`${styles.subValue} numeric`}>
                        {formatBtcValue(btcUsd.snapshot.close, "USD")} USD{" "}
                        <span className={styles[btcUsd.snapshot.direction]}>
                          {formatBtcChange(
                            btcUsd.snapshot.changeAmount,
                            btcUsd.snapshot.changeRate,
                            "USD"
                          )}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <details className={styles.dailyDetails}>
                  <summary className={styles.dailyToggle}>
                    일별 기록
                    <span className={styles.chevron} aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <ol className={styles.dailyList}>
                    {btcKrw.dailyRows.map((row) => (
                      <li key={row.basDt} className={styles.dailyRow}>
                        <span className={styles.dailyDate}>{row.date}</span>
                        <span className={`${styles.dailyClose} numeric`}>
                          {formatBtcValue(row.close, "KRW")}
                        </span>
                        <span
                          className={`${styles.dailyChange} numeric ${
                            styles[row.direction]
                          }`}
                        >
                          {formatBtcChange(
                            row.changeAmount,
                            row.changeRate,
                            "KRW"
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )}
          </article>
        </section>

        <section className={styles.tables} aria-label="글로벌 지표 표">
          <div className={styles.tablesHead}>
            <h2 className={styles.tablesTitle}>지표 표</h2>
            {globalTable !== null ? (
              <span className={styles.lastRefresh}>
                표 갱신: {formatKstDateTime(globalTable.fetchedAt)}
              </span>
            ) : null}
          </div>

          {globalTable === null ? (
            <p className={styles.emptyNotice}>
              아직 수집된 데이터가 없습니다. 표는 평일 09:00 · 15:40 · 18:15
              (KST) 세 회차에만 갱신됩니다.
            </p>
          ) : (
            globalTable.sections.map((section, i) => (
              <GlobalTableSection
                key={section.id}
                section={section}
                defaultOpen={i === 0}
              />
            ))
          )}
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            미국 10년물 국채금리(%)·비트코인은 10분 간격으로, 아래 지표 표
            32종은 평일 09:00 · 15:40 · 18:15(KST) 세 회차에 갱신됩니다 — 해외
            지수·상품은 전일 종가가 하루 한 번 바뀝니다. 비트코인은 업비트
            원화(KRW-BTC)·USDT(USDT-BTC) 마켓 시세입니다. 기준일이 항목마다
            다르며(미국·유럽은 전일 종가) 표의 기준일 뒤 「*」는 그 회차 조회가
            실패해 직전 회차 값을 그대로 쓴 행입니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
