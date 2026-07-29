import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinancialSection } from "@/components/analysis/FinancialSection";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { getFinancialAnalysis } from "@/lib/analysis/financials";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getStockMaster } from "@/lib/market/store";
import styles from "./page.module.css";

/**
 * 종목분석 — 재무제표 전문 (Phase 64에서 만든 화면을 Phase 72에서 이 경로로 이설).
 *
 * 계정이 회사당 수백 행이라 통합지표 화면(`/analysis/[code]`)에 같이 두면 초기 HTML이
 * 지나치게 무거워진다. 「재무제표 상세보기」로 진입하는 별도 라우트로 분리해, 필요할
 * 때만 받아 가게 했다. 데이터·캐시(TTL 30일)는 Phase 64 그대로다.
 */

/** 재무제표 금액(원) → 조/억/원 축약 (계정마다 규모가 달라 단위를 유동적으로) */
function formatAmount(won: number): string {
  const abs = Math.abs(won);
  if (abs >= 1e12) {
    return `${(won / 1e12).toLocaleString("ko-KR", {
      maximumFractionDigits: 1,
    })}조`;
  }
  if (abs >= 1e8) {
    return `${Math.round(won / 1e8).toLocaleString("ko-KR")}억`;
  }
  return won.toLocaleString("ko-KR");
}

/** 재무지표 값 — 비율/배수라 소수 둘째 자리까지 */
function formatIndexValue(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

async function resolveName(symbolCode: string): Promise<string | null> {
  try {
    const master = await getStockMaster();
    return master?.items.find((item) => item.code === symbolCode)?.name ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}): Promise<Metadata> {
  const { symbolCode } = await params;
  const name = await resolveName(symbolCode);
  return {
    title: `${name ?? symbolCode} 재무제표 — jusik`,
  };
}

const STATUS_MESSAGE: Record<string, string> = {
  not_listed:
    "DART에 등록된 상장기업이 아니거나 고유번호 매핑이 아직 준비되지 않았습니다.",
  no_data: "이 종목의 재무제표를 DART에서 찾지 못했습니다.",
  error: "재무 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
};

export default async function AnalysisStatementsPage({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}) {
  await ensureAllowedSession();
  const { symbolCode } = await params;

  // 통합지표 화면과 같은 형식 게이트 — 여기서도 코드가 그대로 캐시 키·링크에 쓰인다
  if (!/^\d{6}$/.test(symbolCode)) {
    redirect("/analysis");
  }

  const [name, result] = await Promise.all([
    resolveName(symbolCode),
    getFinancialAnalysis(symbolCode),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink
            href={`/analysis/${symbolCode}`}
            label="종목분석"
            icon="back"
          />
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{name ?? symbolCode}</h1>
            <span className={`${styles.code} numeric`}>재무제표</span>
          </div>
        </header>

        {result.status !== "ok" ? (
          <p className={styles.empty}>{STATUS_MESSAGE[result.status]}</p>
        ) : (
          <>
            <p className={styles.meta}>
              {result.analysis.basis}재무제표 · 사업보고서(연간) 기준 ·{" "}
              {result.analysis.years.length}개년 · 출처 DART
            </p>

            {result.analysis.statements.map((statement) => (
              <FinancialSection
                key={statement.division}
                title={statement.title}
                years={result.analysis.years}
                rows={statement.rows}
                format={formatAmount}
                unitNote="단위: 원(조·억 축약)"
              />
            ))}

            {result.analysis.indices.map((group) => (
              <FinancialSection
                key={group.category}
                title={group.category}
                years={result.analysis.years}
                rows={group.rows}
                format={formatIndexValue}
              />
            ))}

            <p className={styles.note}>
              재무 데이터는 금융감독원 전자공시(DART) 사업보고서 기준이며, 최초
              조회 후 30일간 캐시됩니다. 재무지표(수익성·안정성·성장성·활동성)는
              DART가 2023 사업연도부터만 제공해 그 이전 연도는 비어 있습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
