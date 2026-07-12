import { formatBasDtDisplay } from "@/lib/format/basDt";
import type { StoredDisclosures } from "@/lib/feeds/store";
import styles from "./StockDisclosures.module.css";

const DART_VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do";

/**
 * 종목 공시 섹션 — 보유종목·관심종목 상세 공용 (Phase 17-1, plan.md §17.5 A안).
 * 데이터는 getDisclosures(사용자 무관 Redis 리더)가 반환한 스냅샷을 그대로 받는다.
 * 각 공시는 DART 전자공시 뷰어로 새 탭 연결한다.
 */
export function StockDisclosures({
  disclosures,
}: {
  disclosures: StoredDisclosures | null;
}) {
  if (disclosures === null) {
    return (
      <p className={styles.empty}>
        공시 데이터가 아직 수집되지 않았습니다. 다음 갱신 회차(매일 08~22시
        정시)에 반영됩니다.
      </p>
    );
  }

  if (disclosures.items.length === 0) {
    return <p className={styles.empty}>최근 90일 내 공시가 없습니다.</p>;
  }

  return (
    <div>
      <ul className={styles.list}>
        {disclosures.items.map((item) => (
          <li key={item.rceptNo} className={styles.item}>
            <a
              href={`${DART_VIEWER_URL}?rcptNo=${item.rceptNo}`}
              target="_blank"
              rel="noreferrer"
              className={styles.link}
            >
              <span className={styles.reportName}>
                {item.reportNm}
                {item.rm !== "" ? (
                  <span className={styles.remark}>{item.rm}</span>
                ) : null}
              </span>
              <span className={styles.meta}>
                <span className="numeric">
                  {formatBasDtDisplay(item.rceptDt)}
                </span>
                <span className={styles.filer}>{item.flrNm}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className={styles.source}>출처: 금융감독원 전자공시시스템(DART)</p>
    </div>
  );
}
