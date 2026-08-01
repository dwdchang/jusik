import { Suspense } from "react";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import {
  getEarningsFocus,
  type EarningsBriefingNotice,
  type EarningsChange,
  type EarningsIrEvent,
  type EarningsQuarterPoint,
} from "@/lib/feeds/earningsFocus";
import type { EarningsNewsItem } from "@/lib/feeds/store";
import { NoteDisclosure } from "@/components/ui/NoteDisclosure";
import { EarningsFocusChartClient } from "./EarningsFocusChartClient";
import styles from "./EarningsFocusPanel.module.css";

/**
 * 실적 탭 상단 블록 — 분기 실적(잠정+확정) + 컨퍼런스콜 일정 (Phase 82).
 *
 * 종목 선택 UI는 Phase 83에서 이 서버 컴포넌트 밖(`EarningsStockPicker`)으로 나갔다 —
 * 드롭다운은 `onChange`가 필요해 Client여야 하고, 선택이 바뀔 때 **아래 공시 목록이
 * 서버 왕복을 기다리지 않고 즉시 걸러지려면** 선택 상태가 클라이언트에 있어야 한다.
 * 여기 남은 것은 선택된 종목의 본문뿐이고, 그 본문은 `?code=`로 서버가 정한다.
 *
 * 확정 재무 첫 조회는 DART를 실제로 부르므로 느리다 — 선택 줄과 아래 공시 목록이
 * 그걸 기다리지 않도록 본문만 `<Suspense>`로 감싼다 (Phase 78 패턴).
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

/**
 * 실적발표 안내 (Phase 84) — 잠정실적 공시 「2. 정보제공내역」에 적힌 컨퍼런스콜 일정.
 * IR 개최 공시를 따로 내지 않는 회사도 여기엔 적으므로 위 IR 카드의 빈자리를 메운다.
 */
function Briefings({ items }: { items: EarningsBriefingNotice[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.irBlock}>
      <h3 className={styles.blockTitle}>실적 발표 안내</h3>
      <ul className={styles.irList}>
        {items.map((item) => (
          <li key={item.rceptNo} className={styles.irItem}>
            {item.when !== "" ? (
              <div className={styles.irHead}>
                <span className={`${styles.irWhen} numeric`}>{item.when}</span>
              </div>
            ) : null}
            <p className={styles.irPurpose}>{item.event}</p>
            <p className={styles.irMeta}>
              {formatBasDtDisplay(item.rceptDt)} 잠정실적 공시 기준
            </p>
            {item.irUrl !== null ? (
              <a
                href={item.irUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.irLink}
              >
                회사 IR 페이지 →
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 실적 관련 보도 (Phase 84) — 발표 직후 모아 둔 기사의 **제목 + 네이버 발췌**.
 *
 * 회사·애널리스트의 실적 코멘트가 실리는 유일한 자리다(DART 원문에는 면책 문구뿐이다).
 * 저작권상 여기까지가 선이라 본문은 담지 않고 **원문 링크로 넘긴다**.
 */
function EarningsNews({ items }: { items: EarningsNewsItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.newsBlock}>
      <h3 className={styles.blockTitle}>실적 관련 보도</h3>
      <ul className={styles.newsList}>
        {items.map((item) => (
          <li key={item.link} className={styles.newsItem}>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className={styles.newsTitle}
            >
              {item.title}
            </a>
            <p className={styles.newsSummary}>{item.summary}</p>
            <p className={styles.newsMeta}>
              <span className="numeric">
                {formatBasDtDisplay(item.pubDateKst)}
              </span>
            </p>
          </li>
        ))}
      </ul>
      {/* §91의 각주 토글을 실적 탭에도 (§98) — 출처·한계 설명이라 상시 펼침이 아니어도 된다 */}
      <NoteDisclosure>
        네이버 뉴스 검색 결과이며 발췌·링크만 표시합니다. 기사 내용의 정확성은 각
        언론사 원문을 확인해주세요.
      </NoteDisclosure>
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
        <Briefings items={focus.briefings} />
        <EarningsNews items={focus.news} />
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
      <NoteDisclosure>
        {focus.basis}재무제표 기준 · 확정 실적은 정기보고서(DART), 「잠정」 표시 분기는
        영업(잠정)실적 공정공시에서 왔습니다.
        {focus.provisionalSource !== null
          ? ` 최신 잠정치는 ${formatBasDtDisplay(
              focus.provisionalSource.rceptDt
            )} 접수분(단위 ${focus.provisionalSource.unit})이며 감사 전 수치라 확정치와 다를 수 있습니다.`
          : ""}
      </NoteDisclosure>
      <IrEvents events={focus.irEvents} />
      <Briefings items={focus.briefings} />
      <EarningsNews items={focus.news} />
    </>
  );
}

export function EarningsFocusPanel({
  selected,
  hasOptions,
}: {
  /** 서버가 `?code=`에서 확정한 종목 — 고를 종목이 없으면 null */
  selected: string | null;
  /** 보유·관심종목이 하나라도 있는가 — 빈 안내 문구를 가른다 */
  hasOptions: boolean;
}) {
  return (
    <section className={styles.panel}>
      {selected === null ? (
        <p className={styles.status}>
          {hasOptions
            ? "실적 자료를 뽑을 수 있는 종목이 없습니다. 우선주는 DART에 재무 자료가 없습니다."
            : "보유·관심종목을 등록하면 종목별 분기 실적을 볼 수 있습니다."}
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
