import Link from "next/link";
import { Suspense } from "react";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import {
  getEarningsFocus,
  type EarningsChange,
  type EarningsIrEvent,
  type EarningsQuarterPoint,
  type EarningsStockOption,
} from "@/lib/feeds/earningsFocus";
import { EarningsFocusChartClient } from "./EarningsFocusChartClient";
import styles from "./EarningsFocusPanel.module.css";

/**
 * 실적 탭 상단 블록 — 종목 선택 + 분기 실적(잠정+확정) + 컨퍼런스콜 일정 (Phase 82).
 *
 * **선택 UI는 라디오가 아니라 링크 칩이다.** 라디오는 `onChange`가 필요해 Client
 * Component가 강제되고, 종목 15개를 세로로 늘어놓으면 "목록이 길어서 아래로 내리고
 * 싶다"는 원래 요구와 정면으로 충돌한다. 칩을 `?code=`로 만들면 이 프로젝트가 이미
 * 쓰는 `?mode=`·`?period=`·`?tab=` 관례와 같고 서버에서 전부 처리된다(AGENTS.md §3).
 * 시각적으로만 칩이고 `role="radiogroup"`/`role="radio"`로 라디오와 동등하게 읽힌다.
 *
 * 확정 재무 첫 조회는 DART를 실제로 부르므로 느리다 — 칩과 아래 공시 목록이 그걸
 * 기다리지 않도록 본문만 `<Suspense>`로 감싼다 (Phase 78 패턴).
 */

const STATUS_MESSAGE: Record<string, string> = {
  not_listed:
    "DART에 등록된 상장기업이 아니거나 고유번호 매핑이 아직 준비되지 않았습니다.",
  no_data: "이 종목의 재무 자료를 DART에서 찾지 못했습니다.",
  error: "실적 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
};

/** 억원 → 표시 문자열. 1조(=10,000억) 이상은 조로 올린다 */
function formatEok(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}조원`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}억원`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/** 증감 칸 — 증감율이 없으면 전환 라벨("흑자전환")로 대신한다 */
function formatChange(change: EarningsChange): string {
  if (change.pct !== null) {
    return `${change.pct > 0 ? "+" : ""}${change.pct.toFixed(1)}%`;
  }
  return change.turnaround ?? "—";
}

/** 증감 색 — 전환 라벨은 흑자=상승색·적자=하락색으로 읽는다 (공시 표와 같은 규칙) */
function changeClass(change: EarningsChange): string {
  if (change.pct !== null) {
    if (change.pct === 0) {
      return styles.flat;
    }
    return change.pct > 0 ? styles.rise : styles.fall;
  }
  if (change.turnaround === null) {
    return styles.flat;
  }
  return change.turnaround.startsWith("흑") ? styles.rise : styles.fall;
}

/** 종목 선택 칩 묶음 — 보유·관심을 줄로 나눠 각각 라벨을 단다 */
function StockChips({
  options,
  selected,
}: {
  options: EarningsStockOption[];
  selected: string | null;
}) {
  const groups: Array<{ key: "holding" | "watchlist"; label: string }> = [
    { key: "holding", label: "보유" },
    { key: "watchlist", label: "관심" },
  ];

  return (
    <div className={styles.chipGroups} role="radiogroup" aria-label="실적을 볼 종목">
      {groups.map((group) => {
        const items = options.filter((option) => option.group === group.key);
        if (items.length === 0) {
          return null;
        }
        return (
          <div key={group.key} className={styles.chipRow}>
            <span className={styles.chipRowLabel}>{group.label}</span>
            <div className={styles.chips}>
              {items.map((option) =>
                option.supported ? (
                  <Link
                    key={option.symbolCode}
                    href={`/feeds?tab=earnings&code=${option.symbolCode}`}
                    scroll={false}
                    role="radio"
                    aria-checked={option.symbolCode === selected}
                    className={`${styles.chip} ${
                      option.symbolCode === selected ? styles.chipActive : ""
                    }`}
                  >
                    {option.name}
                  </Link>
                ) : (
                  // 우선주 등 DART 고유번호가 없는 종목 — 눌러도 빈 화면이라 막는다
                  <span
                    key={option.symbolCode}
                    role="radio"
                    aria-checked={false}
                    aria-disabled="true"
                    title="DART에 재무 자료가 없는 종목입니다 (우선주 등)"
                    className={`${styles.chip} ${styles.chipDisabled}`}
                  >
                    {option.name}
                  </span>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 최신 분기 요약 3칸 — 값 + 전분기대비 + 전년동기대비 */
function Highlights({
  highlights,
  label,
  provisional,
}: {
  highlights: Array<{ label: string; value: number | null; qoq: EarningsChange; yoy: EarningsChange }>;
  label: string;
  provisional: boolean;
}) {
  return (
    <>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>
          {label} 실적
          {provisional ? <span className={styles.badge}>잠정</span> : null}
        </h3>
      </div>
      <dl className={styles.highlights}>
        {highlights.map((item) => (
          <div key={item.label} className={styles.highlight}>
            <dt>{item.label}</dt>
            <dd>
              <span className={`${styles.highlightValue} numeric`}>
                {formatEok(item.value)}
              </span>
              <span className={styles.highlightChanges}>
                <span className={`numeric ${changeClass(item.qoq)}`}>
                  전분기 {formatChange(item.qoq)}
                </span>
                <span className={`numeric ${changeClass(item.yoy)}`}>
                  전년동기 {formatChange(item.yoy)}
                </span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** 분기 표 — 최신이 위. 잠정 행은 라벨에 표시를 달고 흐리게 */
function QuarterTable({ points }: { points: EarningsQuarterPoint[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">분기</th>
          <th scope="col">매출액</th>
          <th scope="col">영업이익</th>
          <th scope="col">영업이익률</th>
          <th scope="col">순이익</th>
        </tr>
      </thead>
      <tbody>
        {[...points].reverse().map((point) => (
          <tr
            key={point.key}
            className={point.provisional ? styles.provisionalRow : ""}
          >
            <th scope="row" className="numeric">
              {point.label}
              {point.provisional ? <span className={styles.rowMark}>잠정</span> : null}
            </th>
            <td className="numeric">{formatEok(point.revenue)}</td>
            <td className="numeric">{formatEok(point.operatingProfit)}</td>
            <td className="numeric">{formatPercent(point.operatingMargin)}</td>
            <td className="numeric">{formatEok(point.netProfit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 컨퍼런스콜·IR 일정 — DART 「기업설명회(IR)개최」 공시의 정형 항목 그대로.
 * 발언·Q&A 내용 자체는 DART에 없어서 여기까지가 한계다(회사 IR 페이지 링크로 잇는다).
 */
function IrEvents({ events }: { events: EarningsIrEvent[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className={styles.irBlock}>
      <h3 className={styles.blockTitle}>실적 발표 · IR 일정</h3>
      <ul className={styles.irList}>
        {events.map((event) => (
          <li key={event.rceptNo} className={styles.irItem}>
            <div className={styles.irHead}>
              <span className={`${styles.irWhen} numeric`}>{event.eventAt}</span>
              {event.upcoming ? (
                <span className={styles.badge}>예정</span>
              ) : null}
            </div>
            <p className={styles.irPurpose}>{event.purpose}</p>
            <p className={styles.irMeta}>
              {event.method}
              {event.place !== "" && event.place !== "-"
                ? ` · ${event.place}`
                : ""}
            </p>
            {event.summary !== "" && event.summary !== "-" ? (
              <p className={styles.irSummary}>{event.summary}</p>
            ) : null}
            {event.irUrl.startsWith("http") ? (
              <a
                href={event.irUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.irLink}
              >
                IR 자료 보기 →
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 확정 재무를 기다리는 동안 자리를 지킨다 — 높이를 미리 잡아 레이아웃 점프를 막는다 */
function FocusPending() {
  return <div className={styles.pending}>실적 자료를 불러오는 중…</div>;
}

async function FocusBody({ symbolCode }: { symbolCode: string }) {
  const focus = await getEarningsFocus(symbolCode);

  if (focus.status !== "ok") {
    return (
      <>
        <p className={styles.status}>{STATUS_MESSAGE[focus.status]}</p>
        <IrEvents events={focus.irEvents} />
      </>
    );
  }

  return (
    <>
      <Highlights
        highlights={focus.highlights}
        label={focus.latestLabel}
        provisional={focus.latestProvisional}
      />
      <EarningsFocusChartClient points={focus.points} />
      <QuarterTable points={focus.points} />
      <p className={styles.caption}>
        {focus.basis}재무제표 기준 · 확정 실적은 정기보고서(DART), 「잠정」 표시 분기는
        영업(잠정)실적 공정공시에서 왔습니다.
        {focus.provisionalSource !== null
          ? ` 최신 잠정치는 ${formatBasDtDisplay(
              focus.provisionalSource.rceptDt
            )} 접수분(단위 ${focus.provisionalSource.unit})이며 감사 전 수치라 확정치와 다를 수 있습니다.`
          : ""}
      </p>
      <IrEvents events={focus.irEvents} />
    </>
  );
}

export function EarningsFocusPanel({
  options,
  selected,
}: {
  options: EarningsStockOption[];
  selected: string | null;
}) {
  return (
    <section className={styles.panel}>
      <StockChips options={options} selected={selected} />

      {selected === null ? (
        <p className={styles.status}>
          {options.length === 0
            ? "보유·관심종목을 등록하면 종목별 분기 실적을 볼 수 있습니다."
            : "종목을 선택하면 분기 실적과 IR 일정을 볼 수 있습니다."}
        </p>
      ) : (
        // key를 종목코드로 둬야 종목을 바꿀 때 fallback이 다시 뜬다
        <Suspense key={selected} fallback={<FocusPending />}>
          <FocusBody symbolCode={selected} />
        </Suspense>
      )}
    </section>
  );
}
