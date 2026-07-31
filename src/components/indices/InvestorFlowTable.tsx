"use client";

import { Fragment, useId, useState, useTransition } from "react";
import { fetchIntradayFlowSlots } from "@/app/indices/actions";
import { formatEokFromMillion, formatFlowCompact } from "@/lib/format/krw";
import {
  INTRADAY_ARCHIVE_SINCE,
  type IntradayFlowSlot,
  type InvestorFlowRow,
  type MarketIndex,
} from "@/types/indices";
import styles from "./InvestorFlowTable.module.css";

/** 일별 표와 장중 슬롯이 **같은 이름으로 공유**하는 투자자 주체 키 */
type InvestorKey =
  | "individual"
  | "foreign"
  | "institution"
  | "finInvest"
  | "trust"
  | "privateFund"
  | "bank"
  | "insurance"
  | "merchantBank"
  | "pension";

/** 표 열 구성 — 개인·외국인·기관계 + 기관 세부 7종 (순매수 금액, 백만원) */
const COLUMNS: Array<{ key: InvestorKey; label: string }> = [
  { key: "individual", label: "개인" },
  { key: "foreign", label: "외국인" },
  { key: "institution", label: "기관계" },
  { key: "finInvest", label: "금융투자" },
  { key: "trust", label: "투신" },
  { key: "privateFund", label: "사모" },
  { key: "bank", label: "은행" },
  { key: "insurance", label: "보험" },
  { key: "merchantBank", label: "종금" },
  { key: "pension", label: "연기금" },
];

/** 기관 세부(§93) 없이 저장된 날짜의 슬롯은 앞 3주체만 그린다 */
const BASE_COLUMN_COUNT = 3;

/** 아카이브 축적 시작일을 일별 행의 `basDt`("YYYYMMDD")와 같은 형식으로 */
const ARCHIVE_SINCE_BASDT = INTRADAY_ARCHIVE_SINCE.replace(/-/g, "");

/** 펼친 날짜 하나의 적재 상태 — 받아둔 날짜는 다시 펼쳐도 재요청하지 않는다 */
type SlotState =
  | { status: "loading" }
  | { status: "ready"; slots: IntradayFlowSlot[] }
  | { status: "error" };

function toneClass(value: number): string {
  if (value > 0) {
    return styles.rise;
  }
  if (value < 0) {
    return styles.fall;
  }
  return styles.flat;
}

/** "20260731" → "2026-07-31" (아카이브 키의 거래일 형식) */
function toTradingDate(basDt: string): string {
  return `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`;
}

/** "0910" → "09:10" */
function formatHhmm(hhmm: string): string {
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

/**
 * 직전 회차 대비 증가분. 슬롯 값이 **그 시각까지의 누적**이라 그대로 늘어놓으면
 * "어느 시각에 몰렸는지"가 안 보인다(§92 실측 — 7/31 코스피 외국인은 09:10 한
 * 구간이 종일의 36%였다). 첫 슬롯은 개장부터의 누적이라 증분과 같다.
 *
 * 직전 슬롯에 그 주체가 없으면(스키마 확장 회차를 걸친 날) 차를 구할 수 없어
 * `undefined` — 누적을 그대로 쓰면 증가분을 크게 부풀려 보여주게 된다.
 */
function computeDelta(
  slot: IntradayFlowSlot,
  previous: IntradayFlowSlot | undefined,
  key: InvestorKey | "tradingValue"
): number | undefined {
  const value = slot[key];
  if (value === undefined) {
    return undefined;
  }
  if (previous === undefined) {
    return value;
  }
  const before = previous[key];
  return before === undefined ? undefined : value - before;
}

/** 누적(위)·증분(아래) 두 줄 셀 — 폭이 좁아 조/억 압축 표기를 쓴다 */
function SlotCell({
  value,
  delta,
  signed,
}: {
  value: number | undefined;
  delta: number | undefined;
  /** 순매수는 부호·색으로 방향을 보이고, 거래대금은 항상 양수라 중립으로 */
  signed: boolean;
}) {
  return (
    <td className={`${styles.subNum} numeric`}>
      <span
        className={`${styles.cumulative} ${
          signed && value !== undefined ? toneClass(value) : ""
        }`}
      >
        {value === undefined ? "—" : formatFlowCompact(value, signed)}
      </span>
      <span className={styles.delta}>
        {delta === undefined ? "—" : formatFlowCompact(delta, signed)}
      </span>
    </td>
  );
}

/** 펼친 날짜 하나의 시간대별 표 (또는 로딩·실패·기록 없음 안내) */
function IntradayPanel({ state }: { state: SlotState | undefined }) {
  if (state === undefined || state.status === "loading") {
    return <p className={styles.panelNote}>시간대별 기록을 불러오는 중…</p>;
  }

  if (state.status === "error") {
    return (
      <p className={styles.panelNote}>
        시간대별 기록을 불러오지 못했습니다. 날짜를 다시 눌러 주세요.
      </p>
    );
  }

  const { slots } = state;

  if (slots.length === 0) {
    return (
      <p className={styles.panelNote}>이 날은 시간대별 기록이 없습니다.</p>
    );
  }

  // 기관 세부는 §93 이후 슬롯에만 있다 — 없는 날은 3열로 줄여 빈 칸을 늘어놓지 않는다.
  const hasDetail = slots.some((slot) => slot.finInvest !== undefined);
  const columns = hasDetail ? COLUMNS : COLUMNS.slice(0, BASE_COLUMN_COUNT);
  const showTradingValue = slots.some((slot) => slot.tradingValue !== undefined);

  return (
    <>
      <p className={styles.panelNote}>
        위: 그 시각까지 누적 · 아래: 직전 회차 대비 증가분
        {hasDetail ? "" : " · 이 날은 개인·외국인·기관계만 기록됐습니다"}
      </p>
      <table className={styles.subTable}>
        <thead>
          <tr>
            <th className={styles.subTimeHead} scope="col">
              시각
            </th>
            {columns.map((col) => (
              <th key={col.key} className={styles.subNumHead} scope="col">
                {col.label}
              </th>
            ))}
            {showTradingValue ? (
              <th className={styles.subNumHead} scope="col">
                거래대금
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, index) => {
            const previous = index > 0 ? slots[index - 1] : undefined;
            return (
              <tr key={slot.hhmm}>
                <th className={styles.subTimeCell} scope="row">
                  {formatHhmm(slot.hhmm)}
                </th>
                {columns.map((col) => (
                  <SlotCell
                    key={col.key}
                    value={slot[col.key]}
                    delta={computeDelta(slot, previous, col.key)}
                    signed
                  />
                ))}
                {showTradingValue ? (
                  <SlotCell
                    value={slot.tradingValue}
                    delta={computeDelta(slot, previous, "tradingValue")}
                    signed={false}
                  />
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/**
 * 일별 수급 표 — 시장 전체 투자자 순매수 금액(백만원). 열이 많아 가로 스크롤한다
 * (AGENTS.md — 넓은 표는 자체 컨테이너에서 스크롤). 날짜 열은 스크롤 시 고정.
 *
 * **날짜를 누르면 그날의 장중 시각 슬롯이 펼쳐진다 (§93)** — 아카이브(§92)가 있는
 * 날짜만 누를 수 있고, 슬롯은 클릭 시 Server Action으로 그 날짜만 받아온다.
 * 상세 진입 시 20일치를 미리 내려보내면 대부분 펼치지 않을 데이터가 매번 실린다.
 * 여러 날짜를 동시에 펼칠 수 있다 — 같은 시각끼리 견주는 것이 이 표의 쓸모다.
 *
 * `FiRankingTable`(§50)과 같은 이유로 Client Component다(표 자체의 상호작용).
 */
export function InvestorFlowTable({
  rows,
  market,
}: {
  rows: InvestorFlowRow[];
  market: MarketIndex;
}) {
  const panelIdBase = useId();
  const [openDates, setOpenDates] = useState<ReadonlySet<string>>(new Set());
  const [slotsByDate, setSlotsByDate] = useState<Record<string, SlotState>>({});
  const [, startTransition] = useTransition();

  const toggle = (basDt: string) => {
    const willOpen = !openDates.has(basDt);

    setOpenDates((previous) => {
      const next = new Set(previous);
      if (next.has(basDt)) {
        next.delete(basDt);
      } else {
        next.add(basDt);
      }
      return next;
    });

    if (!willOpen) {
      return;
    }

    // 받아둔 날짜는 그대로 다시 보여준다. 실패한 날짜만 다시 눌러 재시도할 수 있다.
    const cached = slotsByDate[basDt];
    if (cached !== undefined && cached.status !== "error") {
      return;
    }

    setSlotsByDate((previous) => ({
      ...previous,
      [basDt]: { status: "loading" },
    }));

    startTransition(async () => {
      try {
        const slots = await fetchIntradayFlowSlots(market, toTradingDate(basDt));
        setSlotsByDate((previous) => ({
          ...previous,
          [basDt]: { status: "ready", slots },
        }));
      } catch {
        setSlotsByDate((previous) => ({
          ...previous,
          [basDt]: { status: "error" },
        }));
      }
    });
  };

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.dateHead} scope="col">
              날짜
            </th>
            {COLUMNS.map((col) => (
              <th key={col.key} className={styles.numHead} scope="col">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // 축적 시작일 이전은 KIS로도 채울 수 없어 펼침 자체를 열지 않는다 (§93)
            const expandable = row.basDt >= ARCHIVE_SINCE_BASDT;
            const isOpen = openDates.has(row.basDt);
            const panelId = `${panelIdBase}-${row.basDt}`;

            return (
              <Fragment key={row.basDt}>
                <tr>
                  <th className={styles.dateCell} scope="row">
                    {expandable ? (
                      <button
                        type="button"
                        className={styles.dateToggle}
                        onClick={() => toggle(row.basDt)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                      >
                        <span
                          aria-hidden="true"
                          className={`${styles.caret} ${
                            isOpen ? styles.caretOpen : ""
                          }`}
                        >
                          ▸
                        </span>
                        {row.date}
                      </button>
                    ) : (
                      row.date
                    )}
                  </th>
                  {COLUMNS.map((col) => {
                    const value = row[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`${styles.num} numeric ${toneClass(value)}`}
                      >
                        {formatEokFromMillion(value, true)}
                      </td>
                    );
                  })}
                </tr>
                {isOpen ? (
                  <tr>
                    <td
                      className={styles.expandCell}
                      colSpan={COLUMNS.length + 1}
                      id={panelId}
                    >
                      <IntradayPanel state={slotsByDate[row.basDt]} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
