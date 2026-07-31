import type { Metadata } from "next";
import { GlobalTile } from "@/components/indices/GlobalTile";
import { GlobalTileGrid } from "@/components/indices/GlobalTileGrid";
import { GlobalTileSection } from "@/components/indices/GlobalTileSection";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { formatKstDateTime } from "@/lib/format/datetime";
import { formatFixed, formatIndex } from "@/lib/format/index";
import { getGlobalTable, getMarketDetails } from "@/lib/market/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "글로벌 지표 — jusik",
  description:
    "미국 10년물 · 비트코인 · 반도체 · 국제 유가 · 세계 증시 · 전세계 환율 · 귀금속 · 비철금속 · 농산물",
};

/** 4열로 그리는 구획 — 나머지는 3열 (§89). 저장 스냅샷에는 표현 정보를 넣지 않았다. */
const FOUR_COLUMN_SECTIONS = new Set(["fx"]);

/** 화면 맨 위 그리드가 흡수하는 구획 — 아래 구획 목록에서는 뺀다 */
const HIGHLIGHTS_SECTION_ID = "highlights";

/**
 * 글로벌 지표 화면 — Phase 88 개편 / Phase 89 타일 재개편.
 * 값을 크게 두고 전일 대비율을 그 아래 작게 두는 타일 그리드로 통일했다(기준일 열 제거,
 * 전 구획 펼침). 맨 위 3열 2행은 **출처가 둘**이다 — 미국 10년물·비트코인은 10분 주기
 * `market:detail`, 반도체·유가 3종은 하루 3회차 `market:globalTable`. 주기 차이는 각주로 알린다.
 * KIS 직접 호출 없음 — 갱신 잡이 저장한 Redis 스냅샷만 읽는다 (AGENTS.md §2).
 */
export default async function MarketOverviewPage() {
  await ensureAllowedSession();

  const [rows, globalTable] = await Promise.all([
    getMarketDetails(["us10y", "btcUsd"]).catch((error: unknown) => {
      console.error("[MarketOverviewPage] getMarketDetails failed:", error);
      return [null, null];
    }),
    getGlobalTable().catch((error: unknown) => {
      console.error("[MarketOverviewPage] getGlobalTable failed:", error);
      return null;
    }),
  ]);

  const [us10y, btcUsd] = rows;

  const fetchedAts = rows
    .map((row) => row?.fetchedAt)
    .filter((at): at is string => typeof at === "string");
  // 「마지막 갱신」은 가장 오래된 수집 시각 — staleness를 낙관 표시하지 않는다.
  // 하루 3회차인 표는 여기서 제외하고 자기 갱신 시각을 따로 적는다 — 넣으면 10분마다
  // 도는 두 지표까지 반나절 낡은 것처럼 보인다 (§85 dxy와 같은 이유)
  const oldestFetchedAt = fetchedAts.sort()[0] ?? null;

  const highlights =
    globalTable?.sections.find(
      (section) => section.id === HIGHLIGHTS_SECTION_ID
    ) ?? null;
  const sections = (globalTable?.sections ?? []).filter(
    (section) => section.id !== HIGHLIGHTS_SECTION_ID
  );

  const emptyNotice = (
    <p className={styles.emptyNotice}>
      아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일 09:00~18:15 KST)에
      반영됩니다.
    </p>
  );

  const hasHighlights =
    us10y !== null || btcUsd !== null || (highlights?.rows.length ?? 0) > 0;

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

        <section className={styles.card} aria-label="주요 지표">
          <h2 className={styles.cardTitle}>주요 지표</h2>

          {hasHighlights ? (
            <>
              <GlobalTileGrid columns={3}>
                {us10y === null ? null : (
                  <GlobalTile
                    label="미국 10년물"
                    unit="국채금리 %"
                    value={formatIndex(us10y.snapshot.close)}
                    changeRate={us10y.snapshot.changeRate}
                    direction={us10y.snapshot.direction}
                  />
                )}
                {btcUsd === null ? null : (
                  <GlobalTile
                    label="비트코인"
                    unit="USD"
                    /* 11만 달러 단위에서 센트 자리는 정보가 없고, 10자가 되면
                       3열 값 폰트 상한이 14.8px로 떨어진다 (§89) */
                    value={formatFixed(btcUsd.snapshot.close, 0)}
                    changeRate={btcUsd.snapshot.changeRate}
                    direction={btcUsd.snapshot.direction}
                  />
                )}
                {(highlights?.rows ?? []).map((row) => (
                  <GlobalTile
                    key={row.label}
                    label={row.label}
                    unit={row.unit}
                    value={formatFixed(row.close, row.decimals)}
                    changeRate={row.changeRate}
                    direction={row.direction}
                    stale={row.staleAt !== undefined}
                  />
                ))}
              </GlobalTileGrid>

              {highlights?.note === undefined ? null : (
                <p className={styles.note}>{highlights.note}</p>
              )}
            </>
          ) : (
            emptyNotice
          )}
        </section>

        <section className={styles.sections} aria-label="글로벌 지표 구획">
          {globalTable === null ? null : (
            <p className={styles.tableRefresh}>
              지표 갱신: {formatKstDateTime(globalTable.fetchedAt)}
            </p>
          )}

          {sections.length === 0 ? (
            <p className={styles.emptyNotice}>
              아직 수집된 데이터가 없습니다. 지표는 평일 09:00 · 15:40 · 18:15
              (KST) 세 회차에만 갱신됩니다.
            </p>
          ) : (
            sections.map((section) => (
              <GlobalTileSection
                key={section.id}
                section={section}
                columns={FOUR_COLUMN_SECTIONS.has(section.id) ? 4 : 3}
              />
            ))
          )}
        </section>

        <footer className={styles.footer}>
          <p className={styles.notice}>
            미국 10년물 국채금리(%)·비트코인은 10분 간격으로, 그 밖의 27종은
            평일 09:00 · 15:40 · 18:15(KST) 세 회차에 갱신됩니다 — 해외
            지수·상품은 전일 종가가 하루 한 번 바뀝니다. 비트코인은 업비트
            USDT 마켓(USDT-BTC) 시세입니다. 값 뒤의 「*」는 그 회차 조회가 실패해
            직전 회차 값을 그대로 쓴 항목입니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
