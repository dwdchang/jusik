"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import {
  formatUsdEok,
  formatUsdEokSigned,
  formatYoy,
  formatYyyymm,
} from "@/lib/format/trade";
import type { FeedBoardItem } from "@/lib/feeds/homeFeed";
import type { TradeStatsView } from "@/lib/feeds/tradeStats";
import styles from "./FeedTabsClient.module.css";

/**
 * 홈 통합 피드 카드 — 뉴스·공시·수출입 3탭 (Phase 17-2, plan.md §17.7).
 * 탭 전환·아코디언 펼침은 순수 상호작용이라 서버로 못 옮기는 최소 Client 예외.
 * 데이터는 전부 Server(page.tsx)에서 조회해 props로 받고, 여기선 표시 상태만 다룬다.
 * 뉴스·공시·수출입 3탭 모두 실동작한다 (§17.13·§17-4).
 */

/** 부호 → 색상 클래스 (양수=상승색, 음수=하락색) — 수출입 증감·수지 표기 공용 */
function signClass(value: number | null): string {
  if (value === null || value === 0) {
    return styles.flat;
  }
  return value > 0 ? styles.rise : styles.fall;
}

type TabKey = "news" | "disclosure" | "trade";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "news", label: "뉴스" },
  { key: "disclosure", label: "공시" },
  { key: "trade", label: "수출입" },
];

export function FeedTabsClient({
  disclosures,
  news,
  tradeStats,
}: {
  disclosures: FeedBoardItem[];
  news: FeedBoardItem[];
  tradeStats: TradeStatsView | null;
}) {
  // 첫 탭(뉴스)이 실동작하므로 기본 선택. 탭 전환 시 열린 아코디언은 접는다.
  const [activeTab, setActiveTab] = useState<TabKey>("news");
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className={styles.card}>
      <div className={styles.tabs} role="tablist" aria-label="피드 종류">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`${styles.tab} ${
              activeTab === tab.key ? styles.tabActive : ""
            }`}
            onClick={() => {
              setActiveTab(tab.key);
              setOpenId(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.panel} role="tabpanel">
        {activeTab === "disclosure" ? (
          <DisclosureBoard items={disclosures} openId={openId} onToggle={toggle} />
        ) : activeTab === "news" ? (
          <NewsBoard items={news} openId={openId} onToggle={toggle} />
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
