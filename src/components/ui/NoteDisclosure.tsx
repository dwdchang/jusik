import styles from "./NoteDisclosure.module.css";

/**
 * 각주 「설명」 토글 — Phase 91 신설.
 * 화면 아래에 항상 펼쳐져 있던 설명형 각주(거래소·기준·갱신 주기·출처)를 접어 두고
 * 원할 때만 펼치게 한다. 지표 상세 화면 10지점이 이것 하나를 쓴다.
 *
 * 네이티브 `<details>`라 **클라이언트 번들이 늘지 않는다**(§87·§89 관례) — 서버 컴포넌트로
 * 두고 키보드·스크린리더 지원은 브라우저에서 그대로 받는다. 글로벌 지표 구획처럼 이미
 * `<details open>`인 카드 안에 중첩되지만, 이쪽은 부모의 `<summary>` 바깥(본문)이라
 * 부모 토글의 클릭 영역과 겹치지 않는다.
 *
 * 라벨 기본값은 "설명" — 자리마다 다르게 부르면 같은 조작이 다른 것처럼 보인다.
 *
 * 여백은 사용처마다 다르므로(카드 안 각주 vs 푸터 첫 줄) `className`으로 받는다.
 * 폰트·색·펼침 회전은 여기서 쥔다.
 */
export function NoteDisclosure({
  label = "설명",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className={
        className === undefined ? styles.root : `${styles.root} ${className}`
      }
    >
      <summary className={styles.summary}>
        <span aria-hidden="true">ⓘ</span>
        {label}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </summary>
      <p className={styles.body}>{children}</p>
    </details>
  );
}
