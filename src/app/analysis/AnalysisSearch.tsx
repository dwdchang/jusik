"use client";

import { useRouter } from "next/navigation";
import { StockSearchInput } from "@/components/stocks/StockSearchInput";
import styles from "./page.module.css";

/**
 * 종목분석 검색 폼 (Phase 64) — 등록 폼의 `StockSearchInput`을 재사용해 종목을 고르고
 * 「분석」을 누르면 `/analysis/{code}` 상세로 이동한다. 검색 자체는 기존 서버 액션
 * (`searchStocks`, stockMaster 리더)이라 KIS·DART 직접 호출이 없다.
 */
export function AnalysisSearch() {
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("symbolCode");
    if (typeof code === "string" && /^[0-9A-Za-z]{6}$/.test(code)) {
      router.push(`/analysis/${code}`);
    }
  }

  return (
    <form className={styles.searchForm} onSubmit={handleSubmit}>
      <StockSearchInput placeholder="분석할 종목명 또는 코드 검색" />
      <button type="submit" className={styles.searchButton}>
        분석
      </button>
    </form>
  );
}
