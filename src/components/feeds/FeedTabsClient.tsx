"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import {
  formatUsdEok,
  formatUsdEokSigned,
  formatYoy,
  formatYyyymm,
} from "@/lib/format/trade";
import type { EarningsStockOption } from "@/lib/feeds/earningsFocus";
import type { EarningsBoardItem, FeedBoardItem } from "@/lib/feeds/homeFeed";
import type { EarningsFigure } from "@/lib/feeds/store";
import type { TradeStatsView } from "@/lib/feeds/tradeStats";
import { EarningsStockPicker } from "./EarningsStockPicker";
import styles from "./FeedTabsClient.module.css";

/**
 * 홈 통합 피드 카드 — 뉴스·공시·실적·수출입 4탭 (Phase 17-2, plan.md §17.7 / §81 / §82).
 * 데이터는 전부 Server(page.tsx)에서 조회해 props로 받고, 여기선 아코디언만 다룬다.
 * 4탭 모두 실동작한다 (§17.13·§17-4·§81).
 *
 * **탭 전환은 `useState`가 아니라 `?tab=` 링크다** (Phase 82). 실적 탭 상단 블록은
 * 서버에서만 만들 수 있는데(DART 조회 + `<Suspense>` 스트리밍), 탭이 클라이언트
 * 상태이면 그 블록을 매 방문마다 미리 렌더해 둬야 했다 — 뉴스만 보고 나가는 방문에도
 * DART를 부르는 셈이다. 탭을 URL로 올리면 서버가 필요한 탭만 조립하고, 덤으로 탭
 * 상태가 공유·북마크 가능해진다(`?tab=`은 §81에서 이미 알림 링크용으로 있었다).
 */

/** 부호 → 색상 클래스 (양수=상승색, 음수=하락색) — 수출입 증감·수지 표기 공용 */
function signClass(value: number | null): string {
  if (value === null || value === 0) {
    return styles.flat;
  }
  return value > 0 ? styles.rise : styles.fall;
}

export type TabKey = "news" | "disclosure" | "earnings" | "trade";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "news", label: "뉴스" },
  { key: "disclosure", label: "공시" },
  { key: "earnings", label: "실적" },
  { key: "trade", label: "수출입" },
];

export function FeedTabsClient({
  disclosures,
  news,
  earnings,
  earningsFocus,
  earningsOptions,
  earningsCode,
  tradeStats,
  activeTab,
}: {
  disclosures: FeedBoardItem[];
  news: FeedBoardItem[];
  earnings: EarningsBoardItem[];
  /**
   * 실적 탭 상단 블록(분기 실적 + IR 일정) — Phase 82.
   * **서버에서 렌더해 슬롯으로 받는다.** 안에 `<Suspense>` 스트리밍과 DART 조회가
   * 들어 있어 Client 경계 밖에 둬야 한다 (이 컴포넌트는 아코디언만 다룬다).
   */
  earningsFocus: ReactNode;
  /** 실적 탭 종목 선택지 — 보유 먼저, 그다음 관심 (Phase 83) */
  earningsOptions: EarningsStockOption[];
  /** 서버가 `?code=`에서 확정한 종목코드 — 고를 종목이 없으면 null */
  earningsCode: string | null;
  tradeStats: TradeStatsView | null;
  /** 서버가 `?tab=`에서 확정한 현재 탭 (기본 뉴스) */
  activeTab: TabKey;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  // 선택 종목은 URL(`?code=`)이 정본이지만, 화면 반응은 여기서 먼저 낸다 —
  // 서버 왕복은 상단 블록(DART 조회 + Suspense)을 위한 것이고, 아래 공시 목록은
  // 이미 전 종목치를 들고 있어 기다릴 이유가 없다 (Phase 83, 사용자 확정 B안).
  const [pickedCode, setPickedCode] = useState(earningsCode);
  const [syncedCode, setSyncedCode] = useState(earningsCode);
  if (syncedCode !== earningsCode) {
    // 뒤로가기 등으로 URL이 바뀌면 그쪽을 따른다 (렌더 중 상태 조정 — React 19 권장 패턴)
    setSyncedCode(earningsCode);
    setPickedCode(earningsCode);
  }

  const toggle = (id: string) =>
    setOpenId((prev) => (prev === id ? null : id));

  const selectStock = (symbolCode: string) => {
    setPickedCode(symbolCode);
    setOpenId(null); // 종목이 바뀌면 펼쳐 둔 다른 종목 항목은 닫는다
    router.push(`/feeds?tab=earnings&code=${symbolCode}`, { scroll: false });
  };

  const earningsForStock =
    pickedCode === null
      ? []
      : earnings.filter((item) => item.symbolCode === pickedCode);

  return (
    <div className={styles.card}>
      <div className={styles.tabs} role="tablist" aria-label="피드 종류">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/feeds?tab=${tab.key}`}
            scroll={false}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`${styles.tab} ${
              activeTab === tab.key ? styles.tabActive : ""
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className={styles.panel} role="tabpanel">
        {activeTab === "disclosure" ? (
          <DisclosureBoard items={disclosures} openId={openId} onToggle={toggle} />
        ) : activeTab === "news" ? (
          <NewsBoard items={news} openId={openId} onToggle={toggle} />
        ) : activeTab === "earnings" ? (
          <>
            <EarningsStockPicker
              options={earningsOptions}
              value={pickedCode}
              onSelect={selectStock}
            />
            {earningsFocus}
            <EarningsBoard
              items={earningsForStock}
              stockName={
                earningsOptions.find(
                  (option) => option.symbolCode === pickedCode
                )?.name ?? null
              }
              openId={openId}
              onToggle={toggle}
            />
          </>
        ) : (
          <TradeBoard view={tradeStats} />
        )}
      </div>
    </div>
  );
}

function NewsBoard({
  items,
  openId,
  onToggle,
}: {
  items: FeedBoardItem[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className={styles.placeholder}>
        보유·관심종목의 최근 뉴스가 아직 없습니다. 매일 08~22시 정시 갱신 회차에
        반영됩니다.
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => {
          const isOpen = openId === item.id;
          return (
            <li key={item.id} className={styles.item}>
              <button
                type="button"
                className={styles.row}
                aria-expanded={isOpen}
                onClick={() => onToggle(item.id)}
              >
                <span className={styles.title}>{item.title}</span>
                <span className={styles.rowMeta}>
                  <span className={styles.stockName}>{item.stockName}</span>
                  <span className="numeric">
                    {formatBasDtDisplay(item.date)}
                  </span>
                </span>
              </button>

              {isOpen ? (
                <div className={styles.accordion}>
                  <dl className={styles.metaList}>
                    <div className={styles.metaRow}>
                      <dt>종목</dt>
                      <dd>
                        {item.stockName} ({item.symbolCode})
                      </dd>
                    </div>
                    {item.meta !== "" ? (
                      <div className={styles.metaRow}>
                        <dt>출처</dt>
                        <dd>{item.meta}</dd>
                      </div>
                    ) : null}
                    <div className={styles.metaRow}>
                      <dt>발행일</dt>
                      <dd className="numeric">
                        {formatBasDtDisplay(item.date)}
                      </dd>
                    </div>
                  </dl>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.originalLink}
                  >
                    원문 보기 →
                  </a>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className={styles.source}>출처: 네이버 뉴스 검색</p>
    </>
  );
}

function DisclosureBoard({
  items,
  openId,
  onToggle,
}: {
  items: FeedBoardItem[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className={styles.placeholder}>
        보유·관심종목의 최근 90일 공시가 아직 없습니다. 매일 08~22시 정시 갱신
        회차에 반영됩니다.
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => {
          const isOpen = openId === item.id;
          return (
            <li key={item.id} className={styles.item}>
              <button
                type="button"
                className={styles.row}
                aria-expanded={isOpen}
                onClick={() => onToggle(item.id)}
              >
                <span className={styles.title}>
                  {item.title}
                  {item.remark !== "" ? (
                    <span className={styles.remark}>{item.remark}</span>
                  ) : null}
                </span>
                <span className={styles.rowMeta}>
                  <span className={styles.stockName}>{item.stockName}</span>
                  <span className="numeric">
                    {formatBasDtDisplay(item.date)}
                  </span>
                </span>
              </button>

              {isOpen ? (
                <div className={styles.accordion}>
                  <dl className={styles.metaList}>
                    <div className={styles.metaRow}>
                      <dt>종목</dt>
                      <dd>
                        {item.stockName} ({item.symbolCode})
                      </dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>제출인</dt>
                      <dd>{item.meta}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>접수일</dt>
                      <dd className="numeric">
                        {formatBasDtDisplay(item.date)}
                      </dd>
                    </div>
                  </dl>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.originalLink}
                  >
                    원문 보기 →
                  </a>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className={styles.source}>출처: 금융감독원 전자공시시스템(DART)</p>
    </>
  );
}

/** 잠정실적 표의 금액 셀 — 단위는 원문 헤더 그대로라 캡션에 따로 적는다 */
function formatFigure(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("ko-KR");
}

/**
 * 증감 칸 — 부호를 명시해 개선/악화가 한눈에 보이게 한다.
 * 흑자·적자 전환이면 DART 서식이 증감율 칸을 비우고 전환 라벨을 대신 채운다.
 */
function formatFigureChange(
  pct: number | null | undefined,
  turnaround: string | null | undefined
): string {
  if (pct !== null && pct !== undefined) {
    return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }
  return turnaround ?? "—";
}

/** 증감 칸 색 — 전환 라벨은 흑자=상승색·적자=하락색으로 읽는다 */
function changeSignClass(
  pct: number | null | undefined,
  turnaround: string | null | undefined
): string {
  if (pct !== null && pct !== undefined) {
    return signClass(pct);
  }
  if (turnaround === null || turnaround === undefined) {
    return styles.flat;
  }
  return turnaround.startsWith("흑") ? styles.rise : styles.fall;
}

/** 잠정실적 표에 전기(전분기) 칸이 있는가 — 파서 v1로 저장된 옛 항목엔 없다 (Phase 82) */
function hasQoqColumns(figures: EarningsFigure[]): boolean {
  return figures.some((figure) => figure.qoqBase !== undefined);
}

/**
 * 실적 게시판 (Phase 81) — 잠정실적 공정공시·정기보고서·IR 개최 등 실적 이벤트.
 * 잠정실적은 원문에서 파싱한 매출액·영업이익·당기순이익 표를 아코디언에 함께 편다.
 * Phase 83부터 **선택한 종목 것만** 나온다(위 드롭다운에서 거른 뒤 넘어온다).
 */
function EarningsBoard({
  items,
  stockName,
  openId,
  onToggle,
}: {
  items: EarningsBoardItem[];
  /** 선택된 종목명 — 빈 안내 문구에 쓴다. 선택된 게 없으면 null */
  stockName: string | null;
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className={styles.placeholder}>
        {stockName ?? "보유·관심종목"}의 최근 90일 실적 공시가 아직 없습니다.
        실적은 분기 발표 시즌(2·5·8·11월 전후)에 집중됩니다.
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => {
          const isOpen = openId === item.id;
          const figures: EarningsFigure[] = item.figures ?? [];
          const showQoq = hasQoqColumns(figures);
          return (
            <li key={item.id} className={styles.item}>
              <button
                type="button"
                className={styles.row}
                aria-expanded={isOpen}
                onClick={() => onToggle(item.id)}
              >
                <span className={styles.title}>
                  <span className={styles.badge}>{item.categories[0]}</span>
                  {item.title}
                </span>
                <span className={styles.rowMeta}>
                  <span className={styles.stockName}>{item.stockName}</span>
                  <span className="numeric">
                    {formatBasDtDisplay(item.date)}
                  </span>
                </span>
              </button>

              {isOpen ? (
                <div className={styles.accordion}>
                  <dl className={styles.metaList}>
                    <div className={styles.metaRow}>
                      <dt>종목</dt>
                      <dd>
                        {item.stockName} ({item.symbolCode})
                      </dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>유형</dt>
                      <dd>{item.categories.join(" · ")}</dd>
                    </div>
                    {item.period !== undefined && item.period !== "" ? (
                      <div className={styles.metaRow}>
                        <dt>대상기간</dt>
                        <dd className="numeric">{item.period}</dd>
                      </div>
                    ) : null}
                    <div className={styles.metaRow}>
                      <dt>제출인</dt>
                      <dd>{item.meta}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>접수일</dt>
                      <dd className="numeric">
                        {formatBasDtDisplay(item.date)}
                      </dd>
                    </div>
                  </dl>

                  {figures.length > 0 ? (
                    <>
                      {/* 6칸이 480px에 안 들어가는 단위(백만원)가 있어 표만 가로 스크롤 */}
                      <div className={styles.earningsTableScroll}>
                        <table className={styles.earningsTable}>
                          <thead>
                            <tr>
                              <th scope="col">구분</th>
                              <th scope="col">당기</th>
                              {showQoq ? (
                                <>
                                  <th scope="col">전분기</th>
                                  <th scope="col">전분기대비</th>
                                </>
                              ) : null}
                              <th scope="col">전년동기</th>
                              <th scope="col">전년동기대비</th>
                            </tr>
                          </thead>
                          <tbody>
                            {figures.map((figure) => (
                              <tr key={figure.label}>
                                <th scope="row">{figure.label}</th>
                                <td className="numeric">
                                  {formatFigure(figure.current)}
                                </td>
                                {showQoq ? (
                                  <>
                                    <td className="numeric">
                                      {formatFigure(figure.qoqBase ?? null)}
                                    </td>
                                    <td
                                      className={`numeric ${changeSignClass(
                                        figure.qoqPct,
                                        figure.qoqTurnaround
                                      )}`}
                                    >
                                      {formatFigureChange(
                                        figure.qoqPct,
                                        figure.qoqTurnaround
                                      )}
                                    </td>
                                  </>
                                ) : null}
                                <td className="numeric">
                                  {formatFigure(figure.yoyBase)}
                                </td>
                                <td
                                  className={`numeric ${changeSignClass(
                                    figure.yoyPct,
                                    figure.turnaround
                                  )}`}
                                >
                                  {formatFigureChange(
                                    figure.yoyPct,
                                    figure.turnaround
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className={styles.tradeCaption}>
                        단위 {item.unit !== undefined && item.unit !== ""
                          ? item.unit
                          : "원문 기준"}{" "}
                        · 잠정치라 확정치와 다를 수 있음
                      </p>
                    </>
                  ) : null}

                  {item.ir !== undefined ? (
                    <dl className={styles.metaList}>
                      <div className={styles.metaRow}>
                        <dt>개최일시</dt>
                        <dd className="numeric">{item.ir.eventAt}</dd>
                      </div>
                      <div className={styles.metaRow}>
                        <dt>개최방법</dt>
                        <dd>{item.ir.method}</dd>
                      </div>
                      <div className={styles.metaRow}>
                        <dt>개최목적</dt>
                        <dd>{item.ir.purpose}</dd>
                      </div>
                      {item.ir.irUrl.startsWith("http") ? (
                        <div className={styles.metaRow}>
                          <dt>IR 자료</dt>
                          <dd>
                            <a
                              href={item.ir.irUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.originalLink}
                            >
                              바로가기 →
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.originalLink}
                  >
                    원문 보기 →
                  </a>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className={styles.source}>출처: 금융감독원 전자공시시스템(DART)</p>
    </>
  );
}

/**
 * 수출입 게시판 (§17-4) — 최신 확정월 요약(수출·수입·무역수지 + 전년동월비) +
 * 최근 월별 표. 월간 데이터라 아코디언 없이 정적 표만 보여준다.
 */
function TradeBoard({ view }: { view: TradeStatsView | null }) {
  if (view === null) {
    return (
      <p className={styles.placeholder}>
        수출입 통계가 아직 없습니다. 매월 관세청 확정 통계 공표 후 갱신 회차에
        반영됩니다.
      </p>
    );
  }

  const { latest, months } = view;
  const hasDetail = new Set(view.detailMonths);

  return (
    <>
      <dl className={styles.tradeSummary}>
        <div className={styles.tradeStat}>
          <dt>수출</dt>
          <dd>
            <span className="numeric">{formatUsdEok(latest.expDlr)}</span>
            <span className={`numeric ${signClass(latest.expYoy)}`}>
              {formatYoy(latest.expYoy)}
            </span>
          </dd>
        </div>
        <div className={styles.tradeStat}>
          <dt>수입</dt>
          <dd>
            <span className="numeric">{formatUsdEok(latest.impDlr)}</span>
            <span className={`numeric ${signClass(latest.impYoy)}`}>
              {formatYoy(latest.impYoy)}
            </span>
          </dd>
        </div>
        <div className={styles.tradeStat}>
          <dt>무역수지</dt>
          <dd>
            <span className={`numeric ${signClass(latest.balPayments)}`}>
              {formatUsdEokSigned(latest.balPayments)}
            </span>
          </dd>
        </div>
      </dl>
      <p className={styles.tradeCaption}>
        {formatYyyymm(latest.yyyymm)} 기준 · 증감률은 전년동월비
      </p>

      <table className={styles.tradeTable}>
        <thead>
          <tr>
            <th scope="col">기준월</th>
            <th scope="col">수출</th>
            <th scope="col">수입</th>
            <th scope="col">무역수지</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.yyyymm}>
              <th scope="row" className="numeric">
                {/* 상세는 갱신 잡이 도는 달부터 쌓인다 — 없는 달엔 링크를 걸지 않는다 */}
                {hasDetail.has(m.yyyymm) ? (
                  <Link
                    href={`/indices/trade/${m.yyyymm}`}
                    className={styles.tradeMonthLink}
                  >
                    {formatYyyymm(m.yyyymm)}
                    <span aria-hidden="true">›</span>
                  </Link>
                ) : (
                  formatYyyymm(m.yyyymm)
                )}
              </th>
              <td className="numeric">{formatUsdEok(m.expDlr)}</td>
              <td className="numeric">{formatUsdEok(m.impDlr)}</td>
              <td className={`numeric ${signClass(m.balPayments)}`}>
                {formatUsdEokSigned(m.balPayments)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.source}>출처: 관세청 수출입무역통계</p>
    </>
  );
}
