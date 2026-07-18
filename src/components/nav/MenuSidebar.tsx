"use client";

import { Bell, Inbox, Menu, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useId, useState } from "react";
import styles from "./MenuSidebar.module.css";

/**
 * 홈 헤더 햄버거 메뉴 + 우측 슬라이드 사이드바.
 * 테마 토글·로그아웃은 서버 컴포넌트(HeaderMenu)에서 슬롯으로 주입받는다 —
 * 로그아웃 폼의 서버 액션은 클라이언트 컴포넌트 안에서 정의할 수 없기 때문.
 */
export function MenuSidebar({
  themeSlot,
  logoutSlot,
  showDlqLink,
}: {
  themeSlot: ReactNode;
  logoutSlot: ReactNode;
  showDlqLink: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Menu />
      </button>

      <div
        className={open ? `${styles.overlay} ${styles.overlayOpen}` : styles.overlay}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id={panelId}
        className={open ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
        aria-label="메뉴"
        aria-hidden={!open}
      >
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>메뉴</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setOpen(false)}
            aria-label="메뉴 닫기"
          >
            <X />
          </button>
        </div>

        <div className={styles.themeRow}>
          <span className={styles.themeLabel}>화면 모드</span>
          {themeSlot}
        </div>

        <Link
          href="/alerts"
          className={styles.menuLink}
          onClick={() => setOpen(false)}
        >
          <Bell aria-hidden="true" />
          알림 설정
        </Link>

        {showDlqLink && (
          <Link
            href="/dlq"
            className={styles.menuLink}
            onClick={() => setOpen(false)}
          >
            <Inbox aria-hidden="true" />
            DLQ 확인
          </Link>
        )}

        <div className={styles.footer}>{logoutSlot}</div>
      </aside>
    </>
  );
}
