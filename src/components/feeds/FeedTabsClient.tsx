"use client";

import { useState } from "react";
import { formatBasDtDisplay } from "@/lib/format/basDt";
import type { FeedBoardItem } from "@/lib/feeds/homeFeed";
import styles from "./FeedTabsClient.module.css";

/**
 * 홈 통합 피드 카드 — 뉴스·공시·수출입 3탭 (Phase 17-2, plan.md §17.7).
 * 탭 전환·아코디언 펼침은 순수 상호작용이라 서버로 못 옮기는 최소 Client 예외.
 * 데이터는 전부 Server(page.tsx)에서 조회해 props로 받고, 여기선 표시 상태만 다룬다.
 * 이번 Phase는 공시 탭만 실동작하고 뉴스·수출입은 백엔드 준비 전 자리표시자다.
 */

type TabKey = "news" | "disclosure" | "trade";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "news", label: "뉴스" },
  { key: "disclosure", label: "공시" },
  { key: "trade", label: "수출입" },
];

export function FeedTabsClient({
  disclosures,
}: {
  disclosures: FeedBoardItem[];
}) {
  // 뉴스·수출입은 아직 데이터 백엔드가 없어, 실동작하는 공시 탭을 기본 선택한다.
  const [activeTab, setActiveTab] = useState<TabKey>("disclosure");
  const [openId, setOpenId] = useState<string | null>(null);

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
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.panel} role="tabpanel">
        {activeTab === "disclosure" ? (
          <DisclosureBoard
            items={disclosures}
            openId={openId}
            onToggle={(id) => setOpenId((prev) => (prev === id ? null : id))}
          />
        ) : activeTab === "news" ? (
          <p className={styles.placeholder}>
            뉴스 데이터는 아직 준비 중입니다. 후속 갱신 회차에 반영됩니다.
          </p>
        ) : (
          <p className={styles.placeholder}>
            수출입 통계는 아직 준비 중입니다. 후속 갱신 회차에 반영됩니다.
          </p>
        )}
      </div>
    </div>
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
