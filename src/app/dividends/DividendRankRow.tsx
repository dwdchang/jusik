"use client";

import { useState, type ReactNode } from "react";
import type { DividendRankingEntry } from "@/lib/dividends/ranking/store";
import {
  dartDisclosureUrl,
  formatConsecutiveYears,
  formatPayoutCycle,
  formatRoundYield,
  formatStockDividend,
  roundYearOrdinals,
  surgeTooltip,
} from "@/lib/dividends/ranking/format";
import { formatKrw } from "@/lib/format/krw";
import styles from "./page.module.css";

/**
 * 배당률 순위 행 — Phase 51. 종목명을 누르면 지난 배당 기록(회차별 기준일·주당배당금·
 * 실배당률·지급일·지급 주기)이 아래 행으로 펼쳐진다. 데이터는 스냅샷의 `entry.history`를
 * 그대로 읽어 렌더 — 클릭 시 추가 조회 없음(KIS·Redis 접근 0). 표 정렬·sticky 열은
 * 서버 렌더 때와 동일한 page.module.css 클래스를 공유한다.
 */

/** 배당률 순위 표 컬럼 수 — 펼침 상세 행은 빈 순위 셀 1 + colSpan(COLUMN_COUNT-1) */
const COLUMN_COUNT = 8;

/**
 * 시장 구분 위첨자 — ᴷ/ᴰ는 자체 위첨자 문자라 <sup> 없이 span으로 표기.
 * 핫종목 표(hot-stocks/page.tsx)와 동형 (Phase 45).
 */
const MARKET_SUP = {
  KOSPI: { mark: "ᴷ", title: "코스피", srText: "코스피 종목" },
  KOSDAQ: { mark: "ᴰ", title: "코스닥", srText: "코스닥 종목" },
} as const;

/** "YYYY-MM-DD" → "YYYY.MM.DD" 표시 */
function displayDate(isoDate: string): string {
  return isoDate.replaceAll("-", ".");
}

/**
 * 배당률 순위 "비고" 셀 — 특이사항만 `·`로 이어 붙인다 (Phase 44).
 * 우선주("우") · 주식배당 병행("현+주N%") · 폭배(비경상 급증, DART 원문 링크).
 * 평범하면 "—". 폭배는 DART 배당결정 공시가 조회됐으면 링크·툴팁을 단다.
 */
function renderRemarks(entry: DividendRankingEntry): ReactNode {
  const parts: ReactNode[] = [];

  if (entry.preferred) {
    parts.push("우");
  }

  const stockDividend = formatStockDividend(entry);
  if (stockDividend !== null) {
    parts.push(stockDividend);
  }

  if (entry.surgeCandidate) {
    parts.push(
      entry.surge !== null ? (
        <a
          href={dartDisclosureUrl(entry.surge.rceptNo)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.dartLink}
          title={surgeTooltip(entry)}
        >
          폭배 ↗
        </a>
      ) : (
        <span title={surgeTooltip(entry)}>폭배</span>
      )
    );
  }

  if (parts.length === 0) {
    return <span className={styles.remarkEmpty}>—</span>;
  }

  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 ? " · " : ""}
      {part}
    </span>
  ));
}

export function DividendRankRow({ entry }: { entry: DividendRankingEntry }) {
  const [expanded, setExpanded] = useState(false);
  const history = entry.history ?? [];
  const roundLabels = roundYearOrdinals(history, entry.payoutCycle);
  const detailId = `dividend-history-${entry.code}`;
  const market = MARKET_SUP[entry.market];

  return (
    <>
      <tr>
        <td className={`${styles.stickyRank} numeric`}>{entry.rank}</td>
        <th className={styles.stickyName} scope="row" title={entry.name}>
          <button
            type="button"
            className={styles.nameButton}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailId}
          >
            <span
              className={styles.expandIcon}
              data-expanded={expanded}
              aria-hidden="true"
            >
              ▸
            </span>
            <span className={styles.nameText}>{entry.name}</span>
            <span
              className={styles.marketSup}
              title={market.title}
              aria-hidden="true"
            >
              {market.mark}
            </span>
            <span className={styles.srOnly}>
              {market.srText}, 지난 배당 기록 {expanded ? "접기" : "펼치기"}
            </span>
          </button>
        </th>
        <td className={`${styles.numCell} numeric`}>{formatKrw(entry.price)}</td>
        <td
          className={`${styles.rankYield} ${styles.numCell} numeric`}
          title={
            entry.splitAdjusted
              ? "액면분할 보정됨 — 배당 당시 액면가와 현재 액면가가 달라 주당배당금을 신주 기준으로 환산"
              : undefined
          }
        >
          {entry.dividendYield.toFixed(2)}%
          {entry.splitAdjusted ? <span className={styles.adjMark}>*</span> : null}
        </td>
        <td className={`${styles.numCell} numeric`}>
          {formatKrw(entry.annualDividendPerShare)}
        </td>
        <td>{formatPayoutCycle(entry)}</td>
        <td className={`${styles.numCell} numeric`}>
          {formatConsecutiveYears(entry)}
        </td>
        <td className={styles.remarkCell}>{renderRemarks(entry)}</td>
      </tr>

      {expanded ? (
        <tr className={styles.detailRow}>
          {/* 빈 순위 셀 — 순위 열 영역을 비운 채 열 그리드 유지, 상세는 종목명 열부터 (Phase 54) */}
          <td className={styles.stickyRank} aria-hidden="true" />
          <td
            className={styles.detailCell}
            colSpan={COLUMN_COUNT - 1}
            id={detailId}
          >
            {history.length === 0 ? (
              <p className={styles.historyEmpty}>
                지난 배당 기록이 준비 중입니다. 다음 갱신 회차에 수집되면 여기에
                표시됩니다.
              </p>
            ) : (
              <table className={styles.historyTable}>
                <caption className={styles.historyCaption}>
                  {entry.name} 지난 배당 기록 ({history.length}회)
                </caption>
                <thead>
                  <tr>
                    <th scope="col">기준일</th>
                    <th scope="col">주당배당금</th>
                    <th scope="col">배당률</th>
                    <th scope="col">지급일</th>
                    <th scope="col">지급 주기</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((round) => {
                    const roundYield = formatRoundYield(entry, round.perShare);
                    const ordinalLabel =
                      roundLabels.get(round.recordDate) ?? null;
                    return (
                      <tr key={round.recordDate}>
                        <td className="numeric">
                          {displayDate(round.recordDate)}
                        </td>
                        <td className={`${styles.numCell} numeric`}>
                          {formatKrw(round.perShare)}
                        </td>
                        <td className={`${styles.numCell} numeric`}>
                          {roundYield.toFixed(2)}%
                          {ordinalLabel !== null ? (
                            <span
                              className={styles.cycleFraction}
                              title={
                                ordinalLabel === "연"
                                  ? "연 배당(지급 주기 간격 판정)"
                                  : `그해 관측된 배당 중 ${ordinalLabel.replace("/", "번째 / 총 ")}회`
                              }
                            >
                              ({ordinalLabel})
                            </span>
                          ) : null}
                        </td>
                        <td className="numeric">
                          {round.payDate !== null ? (
                            displayDate(round.payDate)
                          ) : (
                            <span className={styles.payPending}>미정</span>
                          )}
                        </td>
                        {/* 종류(예탁원 divi_kind: 결산/중간) 대신 간격 중앙값 기반
                            지급 주기 — 메인 표와 통일 (Phase 55). 종목 단위 단일값이라
                            회차 행마다 같은 값이 반복된다 */}
                        <td>{formatPayoutCycle(entry)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
