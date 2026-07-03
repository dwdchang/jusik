"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

type Listener = () => void;
const listeners = new Set<Listener>();

/** data-theme 속성 자체는 이벤트를 발생시키지 않으므로, 변경 시 직접 구독자에게 알린다. */
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** 서버 렌더 시점엔 인라인 스크립트가 아직 실행되지 않았으므로 라이트로 간주한다. */
function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 화면 전환 자체는 계속 진행
  }
  listeners.forEach((listener) => listener());
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 2.5v2.25M12 19.25v2.25M4.22 4.22l1.59 1.59M18.19 18.19l1.59 1.59M2.5 12h2.25M19.25 12h2.25M4.22 19.78l1.59-1.59M18.19 5.81l1.59-1.59"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
