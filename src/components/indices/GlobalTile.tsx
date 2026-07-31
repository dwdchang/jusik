import { formatChangeRate } from "@/lib/format/change";
import type { PriceDirection } from "@/types/indices";
import styles from "./GlobalTile.module.css";

/**
 * 글로벌 지표 타일 하나 — Phase 89.
 * 라벨(+국기·단위) / 값 큼직 / 전일 대비율 작게, 세로 순서 고정.
 *
 * 값 글자 크기는 **`--tile-value-size`를 상속받는다** — 3열이냐 4열이냐로 상한이 달라지는데
 * (§89 폭 실측: 360px에서 17.5px vs 14.3px), CSS Modules는 파일마다 클래스 해시가 달라
 * 부모 그리드가 이 클래스를 직접 고를 수 없다. CSS 변수는 상속되므로 그리드 쪽에서 내려보낸다.
 *
 * 값은 **포맷된 문자열**로 받는다 — 소수 0·2·4자리가 섞이고 상단 그리드는 detail 스냅샷의
 * 다른 포맷 함수(`formatIndex`)도 쓴다.
 */
export function GlobalTile({
  label,
  unit,
  flag,
  value,
  changeRate,
  direction,
  stale = false,
}: {
  label: string;
  unit?: string;
  /** 국기 이모지 — 환율 전용 */
  flag?: string;
  value: string;
  changeRate: number;
  direction: PriceDirection;
  /** 이 회차 조회가 실패해 직전 회차 값을 이어받은 항목 */
  stale?: boolean;
}) {
  return (
    <div className={styles.tile}>
      <p className={styles.label}>
        {flag === undefined ? null : (
          <span aria-hidden="true">{flag} </span>
        )}
        {label}
      </p>
      {unit === undefined ? null : <p className={styles.unit}>{unit}</p>}
      <p className={`${styles.value} numeric`}>
        {value}
        {/* 기준일 열을 뺐으므로(§89) 이어받은 값 표시는 값 뒤로 옮겼다 */}
        {stale ? (
          <span className={styles.stale} title="직전 회차 값">
            *
          </span>
        ) : null}
      </p>
      <p className={`${styles.change} numeric ${styles[direction]}`}>
        {formatChangeRate(changeRate)}
      </p>
    </div>
  );
}
