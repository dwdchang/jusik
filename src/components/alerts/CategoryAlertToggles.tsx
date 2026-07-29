"use client";

import { useState } from "react";
import { setAlertCategoryEnabledAction } from "@/app/alerts/actions";
import type { AlertCategory } from "@/lib/alerts/categories";
import styles from "./CategoryAlertToggles.module.css";

/**
 * 알림 종류별 on/off — Phase 73. `/alerts`의 「알림 종류」 섹션(4종)과
 * 배당 페이지 「내 배당」 탭(배당 1종)이 같은 컴포넌트·같은 서버 액션을 쓴다.
 * 표시할 항목·초기 상태는 서버 컴포넌트가 내려준다.
 */

export interface CategoryAlertItem {
  key: AlertCategory;
  label: string;
  description: string;
  enabled: boolean;
}

export function CategoryAlertToggles({
  items,
}: {
  items: CategoryAlertItem[];
}) {
  const [enabledByKey, setEnabledByKey] = useState<
    Partial<Record<AlertCategory, boolean>>
  >(() => Object.fromEntries(items.map((item) => [item.key, item.enabled])));
  const [busyKey, setBusyKey] = useState<AlertCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: AlertCategory) {
    const nextEnabled = !(enabledByKey[key] ?? true);
    setBusyKey(key);
    setError(null);
    try {
      const result = await setAlertCategoryEnabledAction(key, nextEnabled);
      if (result.ok) {
        setEnabledByKey((prev) => ({ ...prev, [key]: nextEnabled }));
      } else {
        setError(result.message);
      }
    } catch {
      setError("설정 저장에 실패했습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className={styles.list}>
      {items.map((item) => {
        const enabled = enabledByKey[item.key] ?? true;
        return (
          <div key={item.key} className={styles.row}>
            <div className={styles.category}>
              <p className={styles.label}>{item.label}</p>
              <p className={styles.description}>{item.description}</p>
            </div>
            <button
              type="button"
              className={enabled ? styles.buttonOn : styles.buttonOff}
              onClick={() => toggle(item.key)}
              disabled={busyKey !== null}
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
