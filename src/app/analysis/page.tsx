import type { Metadata } from "next";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { AnalysisSearch } from "./AnalysisSearch";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "종목분석 — jusik",
  description: "종목의 재무제표·재무지표를 검색해 분석합니다.",
};

/**
 * 종목분석 랜딩 (Phase 64, plan.md §64) — 홈 「종목분석」 카드에서 진입.
 * 종목을 검색해 상세(`/analysis/[symbolCode]`)로 이동한다. 상세에서 사용자가
 * 종목을 열람할 때만 DART를 조회하므로(read-through 캐시), 이 화면은 검색만 한다.
 */
export default async function AnalysisPage() {
  await ensureAllowedSession();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/" label="홈" icon="home" />
          <h1 className={styles.title}>종목분석</h1>
        </header>

        <p className={styles.lead}>
          종목을 검색하면 최근 5개년 재무제표·재무지표를 볼 수 있습니다.
        </p>
        <AnalysisSearch />
        <p className={styles.note}>
          재무 데이터 출처: 금융감독원 전자공시(DART). 사업보고서(연간) 기준이며,
          연결재무제표가 있으면 연결을 우선합니다.
        </p>
      </div>
    </div>
  );
}
