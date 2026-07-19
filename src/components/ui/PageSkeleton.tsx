import styles from "./PageSkeleton.module.css";

type Variant = "dashboard" | "detail";

type Props = {
  /** dashboard: 홈 카드 그리드 · detail: 헤더+(차트)+목록 */
  variant?: Variant;
  /** dashboard면 카드 수, detail이면 목록 줄 수 */
  count?: number;
  /** detail에서 목록 위에 차트 자리를 둘지 */
  chart?: boolean;
};

/**
 * 라우트 전환 중 그려지는 자리표시자 (§40).
 *
 * 이 저장소의 라우트는 전부 동적(`auth()`가 쿠키를 읽음)이라, `loading.tsx`가
 * 없으면 Next가 prefetch 자체를 하지 않는다. 이 컴포넌트를 감싼 `loading.tsx`가
 * 곧 prefetch 경계 역할을 하므로 클라이언트 JS가 없어야 한다 — Server Component 유지.
 */
export function PageSkeleton({
  variant = "detail",
  count = variant === "dashboard" ? 8 : 5,
  chart = false,
}: Props) {
  return (
    <main className={styles.page}>
      <div
        className={styles.container}
        role="status"
        aria-label="불러오는 중"
        aria-busy="true"
      >
        <div className={styles.header} aria-hidden="true">
          <div className={styles.headerIcon} />
          <div className={styles.headerTitle} />
          <div className={styles.headerMeta} />
        </div>

        {variant === "dashboard" ? (
          <div className={styles.cards} aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className={styles.card}>
                <div className={styles.cardTitle} />
                <div className={styles.cardValue} />
                <div className={styles.cardMeta} />
              </div>
            ))}
          </div>
        ) : (
          <div aria-hidden="true">
            {chart ? <div className={styles.chart} /> : null}
            <div className={styles.rows}>
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className={styles.row}>
                  <div className={styles.rowLabel} />
                  <div className={styles.rowValue} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
