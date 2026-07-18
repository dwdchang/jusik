"use client";

import { useState } from "react";
import { setStockAlertEnabledAction } from "@/app/alerts/actions";
import styles from "./AlertToggleButton.module.css";

/**
 * 종목 상세 화면의 인라인 알림 토글 — /alerts 이동 없이 그 자리에서 on/off.
 * 초기 상태는 서버 컴포넌트가 muted 목록으로 계산해 내려주고,
 * 저장은 /alerts 화면과 동일한 setStockAlertEnabledAction을 재사용한다.
 */
export function AlertToggleButton({
  symbolCode,
  initialEnabled,
}: {
  symbolCode: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const nextEnabled = !enabled;
    setBusy(true);
    setError(null);
    try {
      const result = await setStockAlertEnabledAction(symbolCode, nextEnabled);
      if (result.ok) {
        setEnabled(nextEnabled);
      } else {
        setError(result.message);
      }
    } catch {
      setError("설정 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={enabled ? styles.buttonOn : styles.buttonOff}
        onClick={toggle}
        disabled={busy}
        aria-pressed={enabled}
      >
        {enabled ? "알림 켬" : "알림 끔"}
      </button>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
