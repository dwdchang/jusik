import { formatFixed } from "@/lib/format/index";
import type { GlobalTableSection as Section } from "@/types/indices";
import { GlobalTile } from "./GlobalTile";
import { GlobalTileGrid } from "./GlobalTileGrid";
import styles from "./GlobalTileSection.module.css";

/**
 * 글로벌 지표 구획 — Phase 89 (§88의 4열 표를 대체).
 * 값을 크게 두고 전일 대비율을 그 아래 작게 두는 타일 그리드 하나. 기준일 열은 뺐고,
 * 기준일이 알려주던 것(미국·유럽은 전일 종가)은 각주 문장으로 옮겼다.
 *
 * 기본이 펼침이지만 **접기 자체는 남겼다** — 요청은 "펼친 상태"였지 "접기 제거"가 아니고,
 * 네이티브 `<details>`라 클라이언트 번들이 늘지 않는다(§87 관례).
 */
export function GlobalTileSection({
  section,
  columns = 3,
}: {
  section: Section;
  columns?: 3 | 4;
}) {
  return (
    <details className={styles.card} open>
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
        <GlobalTileGrid columns={columns}>
          {section.rows.map((row) => (
            <GlobalTile
              key={row.label}
              label={row.label}
              unit={row.unit}
              flag={row.flag}
              value={formatFixed(row.close, row.decimals)}
              changeRate={row.changeRate}
              direction={row.direction}
              stale={row.staleAt !== undefined}
            />
          ))}
        </GlobalTileGrid>
      )}

      {section.note === undefined ? null : (
        <p className={styles.note}>{section.note}</p>
      )}
    </details>
  );
}
