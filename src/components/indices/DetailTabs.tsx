"use client";

import { useId, useRef, useState } from "react";
import styles from "./DetailTabs.module.css";

export interface DetailTab {
  id: string;
  label: string;
  /** 서버 컴포넌트도 그대로 담을 수 있다(RSC가 props로 전달) */
  panel: React.ReactNode;
}

/**
 * 상세 화면 탭 (Phase 50) — 얇은 클라이언트 래퍼. 각 탭 패널은 서버에서 렌더된
 * ReactNode를 props로 받아 활성 탭만 표시하므로, 표 컴포넌트는 서버 컴포넌트를
 * 유지한다. 좌우 화살표로 탭 이동(WAI-ARIA tablist 패턴).
 */
export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeId)
  );
  const current = tabs[activeIndex];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (activeIndex + delta + tabs.length) % tabs.length;
    setActiveId(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div className={styles.tablist} role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => {
          const selected = tab.id === current.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${baseId}-tab-${tab.id}`}
              className={styles.tab}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={`${baseId}-panel-${current.id}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current.id}`}
      >
        {current.panel}
      </div>
    </div>
  );
}
