import Link from "next/link";
import type { PriceDirection } from "@/types/indices";
import styles from "./SummaryCard.module.css";

export interface SummaryCardChange {
  text: string;
  direction: PriceDirection;
}

/**
 * 홈 화면 요약 카드 — 카드 전체가 상세 페이지로 가는 링크.
 * value가 없으면 placeholder 문구를 표시한다(데이터 연동 전 상태).
 */
export function SummaryCard({
  title,
  href,
  value,
  valueDirection,
  change,
  footnote,
  placeholder = "데이터 준비 중",
}: {
  title: string;
  href: string;
  value?: string;
  /** 지정 시 value에 등락 색상 적용 (보유종목 수익률 등) */
  valueDirection?: PriceDirection;
  change?: SummaryCardChange;
  footnote?: string;
  placeholder?: string;
}) {
  return (
    <Link href={href} className={styles.card}>
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
          {footnote !== undefined ? (
            <p className={styles.footnote}>{footnote}</p>
          ) : null}
        </>
      ) : (
        <p className={styles.placeholder}>{placeholder}</p>
      )}
    </Link>
  );
}
