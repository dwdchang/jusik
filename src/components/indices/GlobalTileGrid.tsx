import type { ReactNode } from "react";
import styles from "./GlobalTileGrid.module.css";

/**
 * 글로벌 지표 타일 그리드 — Phase 89.
 * 열 수에 맞는 값 글자 크기(`--tile-value-size`)를 자식 타일에 내려보낸다.
 *
 * 구획(`GlobalTileSection`)과 화면 상단 그리드(`/indices/market`)가 함께 쓴다 —
 * 상단은 `market:detail`(10분 주기)과 `market:globalTable`(하루 3회차) 두 출처를
 * 한 그리드에 섞으므로 구획 컴포넌트로는 그릴 수 없다.
 */
export function GlobalTileGrid({
  columns,
  children,
}: {
  columns: 3 | 4;
  children: ReactNode;
}) {
  return (
    <div className={columns === 4 ? styles.grid4 : styles.grid3}>
      {children}
    </div>
  );
}
