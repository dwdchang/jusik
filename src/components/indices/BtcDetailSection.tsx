"use client";

import { useState } from "react";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import {
  formatBtcChange,
  formatBtcValue,
  type BtcCurrency,
} from "@/lib/format/btc";
import type { StoredMarketDetail } from "@/lib/market/store";
import { BtcChartClient } from "./BtcChartClient";
import styles from "./BtcDetailSection.module.css";

/**
 * 비트코인 상세 — 원화↔달러 토글 (plan.md §30, HoldingsChart 토글 패턴).
 * 스냅샷 카드·차트·일별 시세 목록이 선택 통화로 함께 전환된다.
 * 데이터는 서버가 전량 내려주므로 토글은 순수 UI 상태.
 */
export function BtcDetailSection({
  krw,
  usd,
}: {
  krw: StoredMarketDetail | null;
  usd: StoredMarketDetail | null;
}) {
  const [currency, setCurrency] = useState<BtcCurrency>("KRW");
  const selected = currency === "KRW" ? krw : usd;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toggle} role="group" aria-label="통화 전환">
          <button
            type="button"
            className={
              currency === "KRW" ? styles.toggleActive : styles.toggleButton
            }
            onClick={() => setCurrency("KRW")}
          >
            원화
          </button>
          <button
            type="button"
            className={
              currency === "USD" ? styles.toggleActive : styles.toggleButton
            }
            onClick={() => setCurrency("USD")}
          >
            달러
          </button>
        </div>
      </div>

      {selected === null ? (
        <p className={styles.emptyNotice}>
          아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일 09:00~18:15
          KST)에 반영됩니다.
        </p>
      ) : (
        <>
          <section
            className={styles.section}
            aria-label={`${selected.snapshot.name} 현황`}
          >
            <article className={styles.card}>
              <h2 className={styles.name}>{selected.snapshot.name}</h2>
              <p className={`${styles.close} numeric`}>
                {formatBtcValue(selected.snapshot.close, currency)}
              </p>
              <p
                className={`${styles.change} numeric ${
                  styles[selected.snapshot.direction]
                }`}
              >
                {formatBtcChange(
                  selected.snapshot.changeAmount,
                  selected.snapshot.changeRate,
                  currency
                )}
              </p>
              <p className={styles.basDt}>
                기준일 {formatBasDtDisplay(selected.snapshot.basDt)}
              </p>
            </article>
          </section>

          <section className={styles.section} aria-label="최근 7일 추이">
            <BtcChartClient series={selected.history} currency={currency} />
          </section>

          <section className={styles.section} aria-label="일별 시세">
            <h2 className={styles.sectionTitle}>일별 시세</h2>
            <ol className={styles.list}>
              {selected.dailyRows.map((row) => (
                <li key={row.basDt} className={styles.row}>
                  <span className={styles.date}>{row.date}</span>
                  <span className={`${styles.rowClose} numeric`}>
                    {formatBtcValue(row.close, currency)}
                  </span>
                  <span
                    className={`${styles.rowChange} numeric ${
                      styles[row.direction]
                    }`}
                  >
                    {formatBtcChange(row.changeAmount, row.changeRate, currency)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
