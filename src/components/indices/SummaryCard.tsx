import Link from "next/link";
import type { ReactNode } from "react";
import type { StalenessLevel } from "@/lib/market/staleness";
import type { PriceDirection } from "@/types/indices";
import styles from "./SummaryCard.module.css";

export interface SummaryCardChange {
  text: string;
  direction: PriceDirection;
}

export const STALENESS_LABELS: Record<StalenessLevel, string> = {
  warn: "갱신 지연 — 20분 이상 경과",
  critical: "갱신 중단 — 1시간 이상 경과",
};

/**
 * 홈 화면 요약 카드 — 카드 전체가 상세 페이지로 가는 링크.
 * value가 없으면 placeholder 문구를 표시한다(데이터 연동 전 상태).
 * staleness는 장중(KST 평일 09:00~18:20)에만 판정된 값 — 우측 상단 배지 (§11.10-B2).
 */
export function SummaryCard({
  title,
  href,
  value,
  valueDirection,
  change,
  note,
  flow,
  placeholder = "데이터 준비 중",
  staleness = null,
}: {
  title: string;
  href: string;
  value?: string;
  /** 지정 시 value에 등락 색상 적용 (보유종목 수익률 등) */
  valueDirection?: PriceDirection;
  change?: SummaryCardChange;
  /** change 아래 보조 한 줄 — 기준이 다른 부가 지표(변동성 카드의 월평균 등, §71) */
  note?: string;
  /**
   * note 아래 보조 블록 — 한 줄로 안 담기는 보조 정보용 슬롯 (§86 코스피·코스닥
   * 거래대금·수급). 문자열 한 줄인 `note`와 달리 여러 줄·그리드를 넣을 수 있다.
   */
  flow?: ReactNode;
  placeholder?: string;
  staleness?: StalenessLevel | null;
}) {
  return (
    <Link href={href} className={styles.card}>
      {staleness !== null ? (
        <span
          className={`${styles.badge} ${
            staleness === "critical" ? styles.badgeCritical : styles.badgeWarn
          }`}
          role="img"
          aria-label={STALENESS_LABELS[staleness]}
          title={STALENESS_LABELS[staleness]}
        >
          !
        </span>
      ) : null}
      <h2 className={styles.title}>{title}</h2>
      {value !== undefined ? (
        <>
          <p
            className={`${styles.value} numeric ${
              valueDirection !== undefined ? styles[valueDirection] : ""
            }`}
          >
            {value}
          </p>
          {change !== undefined ? (
            <p
              className={`${styles.change} numeric ${styles[change.direction]}`}
            >
              {change.text}
            </p>
          ) : null}
          {note !== undefined ? (
            <p className={`${styles.note} numeric`}>{note}</p>
          ) : null}
          {flow}
        </>
      ) : (
        <p className={styles.placeholder}>{placeholder}</p>
      )}
    </Link>
  );
}
