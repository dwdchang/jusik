import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CountryTradeTable } from "@/components/indices/CountryTradeTable";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getTradeDetailView } from "@/lib/feeds/tradeDetail";
import { formatKstDateTime } from "@/lib/format/datetime";
import {
  formatUsdEok,
  formatUsdEokSigned,
  formatYyyymm,
} from "@/lib/format/trade";
import styles from "./page.module.css";

/** "YYYYMM" 형식이면서 실재할 수 있는 월(01~12)인지 — 외부 입력 검증 */
function isValidYyyymm(value: string): boolean {
  if (!/^\d{6}$/.test(value)) {
    return false;
  }
  const month = Number(value.slice(4, 6));
  return month >= 1 && month <= 12;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ yyyymm: string }>;
}): Promise<Metadata> {
  const { yyyymm } = await params;
  return {
    title: `${formatYyyymm(yyyymm)} 수출입 상세 — jusik`,
    description: "관세청 확정 통계 기준 품목별·국가별 수출입 상세",
  };
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ yyyymm: string }>;
}) {
  // 수출입은 시장 전체 지표라 사용자별 데이터가 없다 — 세션 가드만 통과시키면 된다
  await ensureAllowedSession();

  const { yyyymm } = await params;
  if (!isValidYyyymm(yyyymm)) {
    redirect("/feeds");
  }

  const view = await getTradeDetailView(yyyymm).catch((error) => {
    console.error("[TradeDetailPage] getTradeDetailView failed:", error);
    return null;
  });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/feeds" label="뉴스·공시로" icon="back" />
          <h1 className={styles.title}>{formatYyyymm(yyyymm)} 수출입</h1>
          {view !== null && view.fetchedAt !== "" ? (
            <span className={styles.lastRefresh}>
              마지막 갱신: {formatKstDateTime(view.fetchedAt)}
            </span>
          ) : null}
        </header>

        {view === null ? (
          <p className={styles.empty}>
            {formatYyyymm(yyyymm)} 수출입 상세가 아직 없습니다. 상세는 갱신 잡이
            도는 달부터 쌓이며, 그 이전 달은 월별 합계만 제공합니다.
          </p>
        ) : (
          <>
            <section className={styles.card} aria-label="월 합계">
              <dl className={styles.summary}>
                <div className={styles.stat}>
                  <dt>수출</dt>
                  <dd className="numeric">{formatUsdEok(view.totalExpDlr)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>수입</dt>
                  <dd className="numeric">{formatUsdEok(view.totalImpDlr)}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>무역수지</dt>
                  <dd
                    className={`numeric ${
                      view.totalExpDlr - view.totalImpDlr >= 0
                        ? styles.rise
                        : styles.fall
                    }`}
                  >
                    {formatUsdEokSigned(view.totalExpDlr - view.totalImpDlr)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.card} aria-label="품목별 수출입">
              <h2 className={styles.cardTitle}>품목별</h2>
              <p className={styles.cardNote}>
                국가 구분 없는 합계 · 교역액(수출+수입) 상위 순 · HS 4단위
              </p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">품목</th>
                    <th scope="col">수출</th>
                    <th scope="col">수입</th>
                  </tr>
                </thead>
                <tbody>
                  {view.items.map((item) => (
                    <tr key={item.code ?? "other"}>
                      {/*
                        품목명은 관세청 법령 원문이라 최대 182자다. 두 줄로 자르면
                        식별이 어려워 HS 부호를 함께 보이고, 전체 문구는 title로 준다.
                      */}
                      <th scope="row" className={styles.itemCell}>
                        {item.code !== null ? (
                          <span className={`numeric ${styles.hsCode}`}>
                            {item.code}
                          </span>
                        ) : null}
                        <span className={styles.itemName} title={item.name}>
                          {item.name}
                        </span>
                      </th>
                      <td className="numeric">{formatUsdEok(item.expDlr)}</td>
                      <td className="numeric">{formatUsdEok(item.impDlr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.card} aria-label="국가별 수출입">
              <h2 className={styles.cardTitle}>국가별</h2>
              <p className={styles.cardNote}>
                교역액 상위 {view.countries.filter((c) => c.code !== null).length}
                개국 · 국가를 누르면 그 나라의 상위 품목을 봅니다
              </p>
              <CountryTradeTable countries={view.countries} />
            </section>

            <p className={styles.source}>
              출처: 관세청 품목별 국가별 수출입실적 (확정 통계, 억 달러 = 1억 USD).
              합계는 품목별 통계를 집계한 값이라 수출입총괄 기준 월 합계와 0.1%
              미만 차이날 수 있습니다.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
