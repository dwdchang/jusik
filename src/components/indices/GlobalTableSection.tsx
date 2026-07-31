import { formatChangeRate } from "@/lib/format/change";
import { formatFixed } from "@/lib/format/index";
import { formatBasDtLabel } from "@/lib/indices/kisMapper";
import type { GlobalTableSection as Section } from "@/types/indices";
import styles from "./GlobalTableSection.module.css";

/**
 * 글로벌 지표 섹션 표 — Phase 88.
 * 항목명 좌측 / 숫자 우측(`.numeric` tabular-nums) / 등락률만 방향 색 / 기준일은 행마다.
 * 요청받은 4·5·6열 타일 그리드는 이 앱 폭(480px, 최소 360px)에서 값 한 줄이 들어가지
 * 않아(§88 실측) 표로 간다 — §86.2에서 도달한 형태와 같다.
 *
 * 네이티브 `<details>`라 서버 컴포넌트로 남고 클라이언트 번들이 늘지 않는다 (§87 관례).
 */
export function GlobalTableSection({
  section,
  defaultOpen = false,
}: {
  section: Section;
  defaultOpen?: boolean;
}) {
  return (
    <details className={styles.card} open={defaultOpen}>
      <summary className={styles.summary}>
        <h2 className={styles.title}>{section.title}</h2>
        <span className={styles.count}>{section.rows.length}종</span>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </summary>

      {section.rows.length === 0 ? (
        <p className={styles.empty}>
          아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일 09:00 · 15:40 ·
          18:15 KST)에 반영됩니다.
        </p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.labelHead} scope="col">
                  항목
                </th>
                <th className={styles.numHead} scope="col">
                  현재가
                </th>
                <th className={styles.numHead} scope="col">
                  전일 대비
                </th>
                <th className={styles.numHead} scope="col">
                  기준일
                </th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.label}>
                  <th className={styles.labelCell} scope="row">
                    {row.label}
                    {row.unit === undefined ? null : (
                      <span className={styles.unit}>{row.unit}</span>
                    )}
                  </th>
                  <td className={`${styles.num} numeric`}>
                    {formatFixed(row.close, row.decimals)}
                  </td>
                  <td
                    className={`${styles.num} numeric ${styles[row.direction]}`}
                  >
                    {formatChangeRate(row.changeRate)}
                  </td>
                  <td className={`${styles.dateCell} numeric`}>
                    {formatBasDtLabel(row.basDt)}
                    {/* 이 회차 조회가 실패해 직전 값을 이어받은 행 — 숫자가 왜 안 바뀌는지
                        화면에서 알 수 있게 표시한다 */}
                    {row.staleAt === undefined ? null : (
                      <span className={styles.stale} title="직전 회차 값">
                        *
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.note === undefined ? null : (
        <p className={styles.note}>{section.note}</p>
      )}
    </details>
  );
}
