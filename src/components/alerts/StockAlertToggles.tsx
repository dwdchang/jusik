"use client";

import { useState } from "react";
import { setStockAlertEnabledAction } from "@/app/alerts/actions";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import styles from "./StockAlertToggles.module.css";

/**
 * 보유·관심종목별 알림 on/off — 끄면 그 종목의 시세·공시·시장경보·**배당** 알림이
 * 모두 음소거된다(Phase 79 — Phase 73의 배당 예외 폐기).
 * 종목과 무관하게 종류 자체를 끄려면 「알림 종류」 토글(`CategoryAlertToggles`)을 쓴다.
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
        const displayName =
          item.name.trim() === "" ? item.symbolCode : item.name;
        return (
          <div key={item.symbolCode} className={styles.row}>
            <div className={styles.stock}>
              <p className={styles.name}>{displayName}</p>
              <p className={`${styles.code} numeric`}>{item.symbolCode}</p>
            </div>
            <ToggleSwitch
              checked={enabled}
              onToggle={() => toggle(item.symbolCode)}
              label={`${displayName} 알림`}
              disabled={busyCode !== null}
            />
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
