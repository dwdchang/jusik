"use client";

import styles from "./ToggleSwitch.module.css";

/**
 * on/off 스위치 — 알림 토글 4곳(기기 푸시·알림 종류·종목별·종목 상세 인라인) 공용 (§74).
 *
 * 이전에는 같은 "켜짐"을 기기 쪽은 「알림 끄기」(누르면 일어날 동작), 개별 쪽은
 * 「알림 켬」(현재 상태)으로 표기해 문구·색이 정반대로 보였다. 스위치는 상태를
 * 손잡이 위치와 색 두 축으로만 나타내므로 그 혼동이 생기지 않는다 — 그래서
 * 트랙 안에 켬/끔 문구를 넣지 않는다.
 *
 * `role="switch"` + `aria-checked`가 접근성 계약이다(상태형 버튼용 `aria-pressed` 아님).
 * 무엇을 켜는 스위치인지는 화면에 붙은 라벨과 `label` prop이 함께 알린다.
 */
export function ToggleSwitch({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  /** 스크린리더용 이름 — 예: "시세 알림" */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={styles.switch}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
