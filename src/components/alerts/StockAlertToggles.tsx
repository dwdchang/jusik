"use client";

import { useState } from "react";
import { setStockAlertEnabledAction } from "@/app/alerts/actions";
import styles from "./StockAlertToggles.module.css";

/**
 * 보유·관심종목별 알림 on/off — 끄면 시세·공시·시장경보 알림 모두 음소거된다.
 * 목록·초기 상태는 서버 컴포넌트(alerts/page.tsx)가 내려주고,
 * 토글은 서버 액션으로 저장한 뒤 로컬 상태를 맞춘다.
 */

export interface StockAlertItem {
  symbolCode: string;
  /** 종목명 — 미확정이면 빈 문자열 (코드로 표기) */
  name: string;
  enabled: boolean;
}

export function StockAlertToggles({ items }: { items: StockAlertItem[] }) {
  const [enabledByCode, setEnabledByCode] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(items.map((item) => [item.symbolCode, item.enabled]))
  );
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(symbolCode: string) {
    const nextEnabled = !enabledByCode[symbolCode];
    setBusyCode(symbolCode);
    setError(null);
    try {
      const result = await setStockAlertEnabledAction(symbolCode, nextEnabled);
      if (result.ok) {
        setEnabledByCode((prev) => ({ ...prev, [symbolCode]: nextEnabled }));
      } else {
        setError(result.message);
      }
    } catch {
      setError("설정 저장에 실패했습니다.");
    } finally {
      setBusyCode(null);
    }
  }

  return (
    <div className={styles.list}>
      {items.map((item) => {
        const enabled = enabledByCode[item.symbolCode] ?? true;
        return (
          <div key={item.symbolCode} className={styles.row}>
            <div className={styles.stock}>
              <p className={styles.name}>
                {item.name.trim() === "" ? item.symbolCode : item.name}
              </p>
              <p className={`${styles.code} numeric`}>{item.symbolCode}</p>
            </div>
            <button
              type="button"
              className={enabled ? styles.buttonOn : styles.buttonOff}
              onClick={() => toggle(item.symbolCode)}
              disabled={busyCode !== null}
              aria-pressed={enabled}
            >
              {enabled ? "알림 켬" : "알림 끔"}
            </button>
          </div>
        );
      })}
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
