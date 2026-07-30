"use client";

import type { EarningsStockOption } from "@/lib/feeds/earningsFocus";
import styles from "./EarningsStockPicker.module.css";

/**
 * 실적 탭 종목 선택 줄 — 보유·관심 세그먼트 + 종목 드롭다운 (Phase 83, plan.md §83.1).
 *
 * Phase 82는 보유·관심을 두 줄의 링크 칩으로 깔았다. 라디오를 물렸던 당시 근거는
 * "종목 15개를 세로로 늘어놓으면 선택 영역이 목록보다 길어진다"였는데, **드롭다운은
 * 접혀 있어 그 문제가 없다** — 오히려 한 줄로 줄어 원래 요구("목록을 위로 끌어올린다")에
 * 더 맞는다. 그래서 선택 영역 전체가 한 줄이 됐다: 왼쪽 세그먼트 2개, 오른쪽 드롭다운.
 *
 * 그룹은 **별도 상태로 두지 않는다** — 선택된 종목이 속한 쪽이 곧 활성 세그먼트다.
 * 상태가 하나뿐이라 URL(`?code=`)과 어긋날 여지가 없고, 세그먼트를 누르면 그 그룹의
 * 첫 종목으로 옮겨 간다.
 *
 * 접근성은 Phase 82 칩과 같은 `role="radiogroup"`/`role="radio"`를 유지한다 —
 * 시각적으로만 세그먼트다.
 */

const GROUPS: ReadonlyArray<{
  key: EarningsStockOption["group"];
  label: string;
}> = [
  { key: "holding", label: "보유" },
  { key: "watchlist", label: "관심" },
];

/** 선택된 종목이 속한 그룹 — 없으면 종목이 있는 첫 그룹 */
function resolveGroup(
  options: EarningsStockOption[],
  value: string | null
): EarningsStockOption["group"] {
  const selected = options.find((option) => option.symbolCode === value);
  if (selected !== undefined) {
    return selected.group;
  }
  return (
    GROUPS.find((group) =>
      options.some((option) => option.group === group.key)
    )?.key ?? "holding"
  );
}

export function EarningsStockPicker({
  options,
  value,
  onSelect,
}: {
  options: EarningsStockOption[];
  /** 현재 선택된 종목코드 — 없으면 null */
  value: string | null;
  onSelect: (symbolCode: string) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  const activeGroup = resolveGroup(options, value);
  const groupOptions = options.filter((option) => option.group === activeGroup);

  return (
    <div className={styles.row}>
      <div
        className={styles.segments}
        role="radiogroup"
        aria-label="실적을 볼 종목 구분"
      >
        {GROUPS.map((group) => {
          // 그룹에 고를 수 있는 종목이 하나도 없으면 누를 이유가 없다
          const firstSelectable = options.find(
            (option) => option.group === group.key && option.supported
          );
          const active = group.key === activeGroup;

          return (
            <button
              key={group.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={firstSelectable === undefined}
              className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
              onClick={() => {
                if (firstSelectable !== undefined && !active) {
                  onSelect(firstSelectable.symbolCode);
                }
              }}
            >
              {group.label}
            </button>
          );
        })}
      </div>

      <select
        className={styles.select}
        aria-label="실적을 볼 종목"
        value={value ?? ""}
        onChange={(event) => onSelect(event.target.value)}
      >
        {groupOptions.map((option) => (
          // 우선주 등 DART 고유번호가 없는 종목은 눌러도 빈 화면이라 고를 수 없게 둔다
          <option
            key={option.symbolCode}
            value={option.symbolCode}
            disabled={!option.supported}
          >
            {option.supported ? option.name : `${option.name} (자료 없음)`}
          </option>
        ))}
      </select>
    </div>
  );
}
