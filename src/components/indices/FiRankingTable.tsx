"use client";

import { useState } from "react";
import { formatChangeRate } from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import { formatEokFromMillion, formatSharesKo } from "@/lib/format/krw";
import type { FiFlowRanking, FiFlowStock } from "@/types/indices";
import styles from "./FiRankingTable.module.css";

type Group = "foreign" | "institution";
type Direction = "buy" | "sell";

const GROUP_LABEL: Record<Group, string> = {
  foreign: "외국인",
  institution: "기관",
};

const DIRECTION_LABEL: Record<Direction, string> = {
  buy: "순매수",
  sell: "순매도",
};

function toneClass(value: number): string {
  if (value > 0) {
    return styles.rise;
  }
  if (value < 0) {
    return styles.fall;
  }
  return styles.flat;
}

/**
 * 종목별 수급 순위 표 (Phase 50) — 외국인/기관 × 순매수/순매도 각 상위 30.
 * 두 토글(투자자 그룹·매매 방향)로 4개 목록 중 하나를 보여준다. 순매수 수량은
 * 만주/억주, 금액은 조/억원. 값이 길어 가로 스크롤하며 순위·종목명 열은 고정.
 */
export function FiRankingTable({ ranking }: { ranking: FiFlowRanking }) {
  const [group, setGroup] = useState<Group>("foreign");
  const [direction, setDirection] = useState<Direction>("buy");

  const rows: FiFlowStock[] = ranking[group][direction];

  return (
    <div>
      <div className={styles.controls}>
        <div
          className={styles.toggleGroup}
          role="group"
          aria-label="투자자 그룹"
        >
          {(["foreign", "institution"] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={styles.toggle}
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
            >
              {GROUP_LABEL[g]}
            </button>
          ))}
        </div>
        <div className={styles.toggleGroup} role="group" aria-label="매매 방향">
          {(["buy", "sell"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={styles.toggle}
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
            >
              {DIRECTION_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>데이터 준비 중입니다.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.rankHead} scope="col">
                  순위
                </th>
                <th className={styles.nameHead} scope="col">
                  종목명
                </th>
                <th className={styles.numHead} scope="col">
                  현재가
                </th>
                <th className={styles.numHead} scope="col">
                  전일 대비
                </th>
                <th className={styles.numHead} scope="col">
                  순매수 수량
                </th>
                <th className={styles.numHead} scope="col">
                  순매수 금액
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td className={`${styles.rankCell} numeric`}>{row.rank}</td>
                  <th className={styles.nameCell} scope="row">
                    {row.name}
                  </th>
                  <td className={`${styles.num} numeric`}>
                    {formatIndex(row.price)}
                  </td>
                  <td
                    className={`${styles.num} numeric ${styles[row.direction]}`}
                  >
                    {formatChangeRate(row.changeRate)}
                  </td>
                  <td
                    className={`${styles.num} numeric ${toneClass(row.netBuyQty)}`}
                  >
                    {formatSharesKo(row.netBuyQty, true)}
                  </td>
                  <td
                    className={`${styles.num} numeric ${toneClass(row.netBuyAmount)}`}
                  >
                    {formatEokFromMillion(row.netBuyAmount, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
