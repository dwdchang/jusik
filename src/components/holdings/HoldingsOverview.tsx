import { addHoldingAction } from "@/app/stocks/actions";
import { DailyHistoryList } from "@/components/holdings/DailyHistoryList";
import type { DailyHistoryRow } from "@/components/holdings/DailyHistoryList";
import { HoldingsChartClient } from "@/components/holdings/HoldingsChartClient";
import type { HoldingsChartPoint } from "@/components/holdings/HoldingsChart";
import { StockSearchInput } from "@/components/stocks/StockSearchInput";
import { HoverPrefetchLink } from "@/components/ui/HoverPrefetchLink";
import { formatChangeRate } from "@/lib/format/change";
import { formatKrw } from "@/lib/format/krw";
import {
  getHoldings,
  getPortfolioHistory,
  todayKstDate,
} from "@/lib/holdings/store";
import { getPortfolioValuation } from "@/lib/holdings/valuation";
import { resolveDirection } from "@/lib/indices/kisMapper";
import type { PortfolioValuation } from "@/types/holdings";
import styles from "./HoldingsOverview.module.css";

/**
 * 잔고 화면 본문 (§58) — 구 `/holdings` 목록 화면의 본문을 그대로 옮긴 것.
 * 종목 화면(`/stocks`)의 「잔고」 탭에서만 렌더된다.
 *
 * 데이터는 전부 Redis 읽기(보유목록·포트폴리오 히스토리·평가)이며 KIS 직접
 * 호출은 없다(§2 대원칙). 평가 실패는 이 컴포넌트 안에서 배너로 격리한다.
 */
export async function HoldingsOverview({
  email,
  /** 추가 폼 검증 실패로 돌아온 경우 폼을 펼친 상태로 연다 */
  openAddForm,
}: {
  email: string;
  openAddForm: boolean;
}) {
  const [holdings, history] = await Promise.all([
    getHoldings(email),
    getPortfolioHistory(email),
  ]);

  let valuation: PortfolioValuation | null = null;
  let valuationError: string | null = null;

  if (holdings.length > 0) {
    try {
      valuation = await getPortfolioValuation(holdings);
    } catch (err) {
      console.error("[HoldingsOverview] getPortfolioValuation failed:", err);
      valuationError =
        "현재가 조회에 실패해 평가금액을 계산하지 못했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  const currentYear = todayKstDate().slice(0, 4);
  const yearHistory = history.filter((row) => row.date.startsWith(currentYear));

  const chartPoints: HoldingsChartPoint[] = yearHistory.map((row) => ({
    fullDate: row.date,
    date: row.date.slice(5).replace("-", "/"),
    totalValue: row.totalValue,
    returnRate:
      row.totalCost > 0
        ? ((row.totalValue - row.totalCost) / row.totalCost) * 100
        : 0,
  }));

  const dailyChangeRate = valuation ? valuation.totalDailyChangeRate : null;

  // 일별 기록 목록은 월 단위 페이지네이션이라 연도 필터 없이 전체 히스토리를 넘긴다 (§29)
  const dailyRows: DailyHistoryRow[] = history.map((row) => ({
    date: row.date,
    totalValue: row.totalValue,
    returnRate:
      row.totalCost > 0
        ? ((row.totalValue - row.totalCost) / row.totalCost) * 100
        : 0,
  }));

  return (
    <>
      {valuationError !== null ? (
        <p className={styles.errorBanner} role="alert">
          {valuationError}
        </p>
      ) : null}
      {valuation !== null && valuation.missingPriceSymbols.length > 0 ? (
        <p className={styles.errorBanner} role="alert">
          시세 없음: {valuation.missingPriceSymbols.join(", ")} — 다음 갱신
          회차(평일 09:00~15:30 KST, 10분 간격)에 반영되며, 종목코드가
          잘못됐다면 계속 비어 있습니다. 합계에서는 제외됩니다.
        </p>
      ) : null}

      {valuation !== null ? (
        <section className={styles.summary} aria-label="포트폴리오 요약">
          <div className={styles.stat}>
            <span className={styles.statLabel}>총 평가금액</span>
            <span className={`${styles.statValue} numeric`}>
              {formatKrw(valuation.totalValue)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>총 매입금액</span>
            <span className={`${styles.statValue} numeric`}>
              {formatKrw(valuation.totalCost)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>총 수익률</span>
            <span
              className={`${styles.statValue} numeric ${
                styles[resolveDirection(valuation.totalReturnRate)]
              }`}
            >
              {formatChangeRate(valuation.totalReturnRate)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>일일 변동률 (전일 대비)</span>
            {dailyChangeRate !== null ? (
              <span
                className={`${styles.statValue} numeric ${
                  styles[resolveDirection(dailyChangeRate)]
                }`}
              >
                {formatChangeRate(dailyChangeRate)}
              </span>
            ) : (
              <span className={styles.statEmpty}>전일 기록 없음</span>
            )}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-label="연초 이후 추이">
        {chartPoints.length > 0 ? (
          <HoldingsChartClient points={chartPoints} />
        ) : (
          <p className={styles.emptyNotice}>
            일별 기록이 아직 없습니다. 평일 18:15(KST) 기록 생성 이후 추이 차트가
            표시됩니다.
          </p>
        )}
      </section>

      {dailyRows.length > 0 ? (
        <section className={styles.section} aria-label="일별 기록">
          <DailyHistoryList rows={dailyRows} />
        </section>
      ) : null}

      <section className={styles.section} aria-label="종목 추가">
        <details className={styles.addDetails} open={openAddForm}>
          {/* 열림 상태에서 summary가 취소 버튼 역할 — 클릭 시 폼이 접힌다 (§17.12) */}
          <summary className={styles.addToggle}>
            <span className={styles.addToggleOpenLabel}>+ 종목 추가</span>
            <span className={styles.addToggleCloseLabel}>✕ 취소</span>
          </summary>
          <form action={addHoldingAction} className={styles.addForm}>
            {/* 제출 후 돌아올 탭 — 서버가 화이트리스트로 검사해 경로를 조립한다 (§58) */}
            <input type="hidden" name="mode" value="balance" />
            <StockSearchInput />
            <input
              name="quantity"
              className={styles.input}
              placeholder="수량"
              type="number"
              min={1}
              step={1}
              required
            />
            <input
              name="totalCost"
              className={styles.input}
              placeholder="총 매입금액(원)"
              type="number"
              min={1}
              step="any"
              required
            />
            <button type="submit" className={styles.primaryButton}>
              추가
            </button>
          </form>
          <p className={styles.formHint}>
            종목명으로 검색해 선택하세요. 시세는 다음 갱신 회차(평일
            09:00~15:30 KST, 10분 간격)에 자동으로 채워집니다.
          </p>
        </details>
      </section>

      <section className={styles.section} aria-label="보유종목 목록">
        <h2 className={styles.sectionTitle}>보유종목 ({holdings.length})</h2>
        {holdings.length === 0 ? (
          <p className={styles.emptyNotice}>
            등록된 종목이 없습니다. 위에서 종목을 추가해보세요.
          </p>
        ) : (
          <ul className={styles.holdingList}>
            {holdings.map((holding) => {
              const item = valuation?.items.find(
                (v) => v.holding.id === holding.id
              );
              return (
                <li key={holding.id}>
                  <HoverPrefetchLink
                    href={`/stocks/${holding.symbolCode}?kind=holding`}
                    className={styles.holdingItem}
                  >
                    <div className={styles.holdingHead}>
                      <span className={styles.holdingName}>
                        {holding.name || holding.symbolCode}
                        <span className={styles.holdingCode}>
                          {holding.symbolCode}
                        </span>
                      </span>
                      {item && item.returnRate !== null ? (
                        <span
                          className={`${styles.holdingReturn} numeric ${
                            styles[resolveDirection(item.returnRate)]
                          }`}
                        >
                          {formatChangeRate(item.returnRate)}
                        </span>
                      ) : null}
                    </div>

                    {item ? (
                      <dl className={styles.holdingStats}>
                        <div className={styles.holdingStat}>
                          <dt>현재가</dt>
                          <dd className="numeric">
                            {item.currentPrice !== null
                              ? formatKrw(item.currentPrice)
                              : "시세 없음"}
                          </dd>
                        </div>
                        <div className={styles.holdingStat}>
                          <dt>평가금액</dt>
                          <dd className="numeric">
                            {item.value !== null ? formatKrw(item.value) : "-"}
                          </dd>
                        </div>
                        <div className={styles.holdingStat}>
                          <dt>매입금액</dt>
                          <dd className="numeric">{formatKrw(item.cost)}</dd>
                        </div>
                        <div className={styles.holdingStat}>
                          <dt>평가손익</dt>
                          <dd
                            className={`numeric ${
                              item.profit !== null
                                ? styles[resolveDirection(item.profit)]
                                : ""
                            }`}
                          >
                            {item.profit !== null ? formatKrw(item.profit) : "-"}
                          </dd>
                        </div>
                      </dl>
                    ) : null}

                    <span className={styles.holdingDetailCue}>상세 보기 →</span>
                  </HoverPrefetchLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
