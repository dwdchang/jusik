"use client";

import { useState } from "react";
import Link from "next/link";
import { formatChangeRate } from "@/lib/format/change";
import { formatAvgPrice, formatEokwon, formatKrw } from "@/lib/format/krw";
import { resolveDirection } from "@/lib/indices/kisMapper";
import { deleteWatchItemAction, updateWatchItemAction } from "./actions";
import type { StockRow } from "./rows";
import styles from "./page.module.css";

/**
 * 종목 목록 표의 1행 (§56) — 종목명을 누르면 상세가 아래 행으로 펼쳐진다.
 * 배당률 순위 표(`app/dividends/DividendRankRow`)와 같은 패턴이며, 펼침 내용은
 * 서버가 넘긴 `StockRow`만 읽어 렌더한다(클릭 시 추가 조회 0).
 *
 * 관심종목 행의 펼침에는 기준일 변경·삭제 폼이 들어간다 — Phase 23의 `?edit=1`
 * 편집 모드를 대체한다.
 */

/** 열 구성 — 모두·보유종목 탭은 6열(full), 관심종목 탭은 4열(watch) */
export type RowColumns = "full" | "watch";

/** 종목명 열 + 값 열 수 */
const COLUMN_COUNT: Record<RowColumns, number> = { full: 7, watch: 5 };

/** 값이 없는 셀 — 관심종목 행의 보유 전용 열 등 (사용자 확정: "-") */
const EMPTY = "-";

/** "YYYY-MM-DD" 두 날짜 사이의 일수 — 달력일 기준(문자열만 보므로 시계 무관) */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/** 등락률·수익률·손익처럼 방향 색이 붙는 값 */
function SignedCell({
  value,
  text,
  className,
}: {
  value: number | null;
  text: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <td className={`${styles.numCell} ${styles.emptyCell}`}>{EMPTY}</td>
    );
  }
  return (
    <td
      className={`${styles.numCell} numeric ${styles[resolveDirection(value)]}${
        className !== undefined ? ` ${className}` : ""
      }`}
    >
      {text}
    </td>
  );
}

/** 펼침 상세의 항목 한 줄 */
function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.detailItem}>
      <dt>{label}</dt>
      <dd className="numeric">{children}</dd>
    </div>
  );
}

export function StockRowItem({
  row,
  columns,
  highlightHolding,
  mode,
  today,
}: {
  row: StockRow;
  columns: RowColumns;
  /** 보유종목 종목명에 강조색을 입힐지 — "모두" 탭에서만 켠다 */
  highlightHolding: boolean;
  /** 현재 탭 — Server Action 처리 후 같은 탭으로 돌아오기 위해 폼에 실어 보낸다 */
  mode: string;
  /** KST 오늘 "YYYY-MM-DD" — 기준일 입력 상한·경과일 계산 */
  today: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailId = `stock-detail-${row.key.replace(":", "-")}`;
  const isHolding = row.kind === "holding";
  const indicators = row.indicators;

  return (
    <>
      <tr>
        <th className={styles.stickyName} scope="row" title={row.name}>
          <button
            type="button"
            className={`${styles.nameButton}${
              highlightHolding && isHolding ? ` ${styles.holdingName}` : ""
            }`}
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
            <span className={styles.nameText}>{row.name}</span>
            <span className={styles.srOnly}>
              {isHolding ? "보유종목" : "관심종목"}, 상세{" "}
              {expanded ? "접기" : "펼치기"}
            </span>
          </button>
        </th>

        {row.currentPrice !== null ? (
          <td className={`${styles.numCell} numeric`}>
            {formatKrw(row.currentPrice)}
          </td>
        ) : (
          <td className={`${styles.numCell} ${styles.emptyCell}`}>시세 없음</td>
        )}

        <SignedCell
          value={row.changeRate}
          text={row.changeRate !== null ? formatChangeRate(row.changeRate) : ""}
        />
        <SignedCell
          value={row.returnRate}
          text={row.returnRate !== null ? formatChangeRate(row.returnRate) : ""}
          className={styles.returnCell}
        />

        {columns === "full" ? (
          <>
            <SignedCell
              value={row.profit}
              text={row.profit !== null ? formatKrw(row.profit) : ""}
            />
            <td className={`${styles.numCell} numeric`}>
              {row.totalCost !== null && row.quantity !== null ? (
                formatAvgPrice(row.totalCost, row.quantity)
              ) : (
                <span className={styles.emptyMark}>{EMPTY}</span>
              )}
            </td>
            <td className={`${styles.numCell} numeric`}>
              {row.totalCost !== null ? (
                formatKrw(row.totalCost)
              ) : (
                <span className={styles.emptyMark}>{EMPTY}</span>
              )}
            </td>
          </>
        ) : (
          <td className={`${styles.numCell} numeric`}>
            {row.registeredAt ?? EMPTY}
          </td>
        )}
      </tr>

      {expanded ? (
        <tr className={styles.detailRow}>
          <td
            className={styles.detailCell}
            colSpan={COLUMN_COUNT[columns]}
            id={detailId}
          >
            <dl className={styles.detailList}>
              {isHolding ? (
                <>
                  <DetailItem label="보유수량">
                    {row.quantity !== null
                      ? `${row.quantity.toLocaleString("ko-KR")}주`
                      : EMPTY}
                  </DetailItem>
                  <DetailItem label="평가금액">
                    {row.value !== null ? formatKrw(row.value) : EMPTY}
                  </DetailItem>
                  <DetailItem label="오늘 손익">
                    {row.todayProfit !== null ? (
                      <span className={styles[resolveDirection(row.todayProfit)]}>
                        {formatKrw(row.todayProfit)}
                      </span>
                    ) : (
                      EMPTY
                    )}
                  </DetailItem>
                </>
              ) : (
                <>
                  <DetailItem label="기준가">
                    {row.priceAtRegistration !== null
                      ? `${formatKrw(row.priceAtRegistration)}${
                          row.provisionalBasis ? " (직전 거래일)" : ""
                        }`
                      : "확정 중"}
                  </DetailItem>
                  <DetailItem label="등록 기준일">
                    {row.registeredAt ?? EMPTY}
                  </DetailItem>
                  <DetailItem label="등록 후">
                    {row.registeredAt !== null
                      ? `${daysBetween(row.registeredAt, today).toLocaleString(
                          "ko-KR"
                        )}일`
                      : EMPTY}
                  </DetailItem>
                </>
              )}

              <DetailItem label="52주 최고">
                {indicators?.w52High != null ? (
                  <>
                    {formatKrw(indicators.w52High)}
                    {indicators.w52HighGap !== null ? (
                      <span className={styles.detailSub}>
                        {formatChangeRate(indicators.w52HighGap)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  EMPTY
                )}
              </DetailItem>
              <DetailItem label="52주 최저">
                {indicators?.w52Low != null ? (
                  <>
                    {formatKrw(indicators.w52Low)}
                    {indicators.w52LowGap !== null ? (
                      <span className={styles.detailSub}>
                        {formatChangeRate(indicators.w52LowGap)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  EMPTY
                )}
              </DetailItem>
              <DetailItem label="PER / PBR">
                {indicators?.per != null ? `${indicators.per.toFixed(2)}배` : EMPTY}
                {" / "}
                {indicators?.pbr != null ? `${indicators.pbr.toFixed(2)}배` : EMPTY}
              </DetailItem>
              <DetailItem label="시가총액">
                {indicators?.marketCapEokwon != null
                  ? formatEokwon(indicators.marketCapEokwon)
                  : EMPTY}
              </DetailItem>
            </dl>

            {/* 관심종목 편집 — Phase 23의 `?edit=1` 인라인 폼을 여기로 옮겼다 (§56) */}
            {!isHolding && row.watchId !== null ? (
              <div className={styles.detailActions}>
                <form action={updateWatchItemAction} className={styles.editForm}>
                  <input type="hidden" name="id" value={row.watchId} />
                  <input type="hidden" name="mode" value={mode} />
                  <input
                    name="registeredAt"
                    className={styles.input}
                    type="date"
                    defaultValue={row.registeredAt ?? today}
                    max={today}
                    required
                    aria-label={`${row.name} 등록 기준일`}
                  />
                  <button type="submit" className={styles.secondaryButton}>
                    기준일 변경
                  </button>
                </form>
                <form action={deleteWatchItemAction}>
                  <input type="hidden" name="id" value={row.watchId} />
                  <input type="hidden" name="mode" value={mode} />
                  <button type="submit" className={styles.dangerButton}>
                    삭제
                  </button>
                </form>
              </div>
            ) : null}

            <Link href={row.detailHref} className={styles.detailLink}>
              상세 보기 →
            </Link>
          </td>
        </tr>
      ) : null}
    </>
  );
}
