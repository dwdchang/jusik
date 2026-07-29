import type { Metadata } from "next";
import Link from "next/link";
import { AnalysisChartsClient } from "@/components/analysis/AnalysisChartsClient";
import { InvestmentIndicators } from "@/components/analysis/InvestmentIndicators";
import { KeyMetricsTable } from "@/components/analysis/KeyMetricsTable";
import { NavIconLink } from "@/components/nav/NavIconLink";
import { getAnalysisOverview } from "@/lib/analysis/overview";
import { getAnalysisQuote } from "@/lib/analysis/quote";
import {
  buildInvestmentIndicators,
  withAnnualValuation,
  withQuarterValuation,
  withTtmValuation,
} from "@/lib/analysis/view";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";
import { getStockMaster } from "@/lib/market/store";
import styles from "./page.module.css";

/**
 * 종목분석 상세 — 통합지표 (Phase 72, plan.md §72).
 *
 * 화면 순서(사용자 확정): 투자지표 → 주가 변동률 → 차트 4종 → 주요 재무지표 표 →
 * 재무제표 전문 진입 버튼. 계정 전체를 늘어놓던 기존 화면은 `/statements`로 옮겼다.
 *
 * 데이터는 캐시 주기가 다른 둘을 병렬로 읽는다 — 재무(`overview`, TTL 30일)와
 * 시세(`quote`, TTL 6시간). 첫 열람은 DART·금융위를 실제로 부르므로 느릴 수 있고,
 * 그 뒤로는 캐시에서 나온다.
 */

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
    title: `${name ?? symbolCode} 종목분석 — jusik`,
  };
}

const STATUS_MESSAGE: Record<string, string> = {
  not_listed:
    "DART에 등록된 상장기업이 아니거나 고유번호 매핑이 아직 준비되지 않았습니다.",
  no_data: "이 종목의 재무 자료를 DART에서 찾지 못했습니다.",
  error: "재무 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
};

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}) {
  await ensureAllowedSession();
  const { symbolCode } = await params;

  const [name, result, quote] = await Promise.all([
    resolveName(symbolCode),
    getAnalysisOverview(symbolCode),
    getAnalysisQuote(symbolCode),
  ]);

  // 차트와 표가 같은 시리즈를 쓴다 — 조립은 한 번만
  const series =
    result.status === "ok"
      ? {
          ttm: withTtmValuation(result.overview.ttm, quote),
          annual: withAnnualValuation(result.overview.annual, quote),
          quarter: withQuarterValuation(result.overview.quarter),
        }
      : null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <NavIconLink href="/analysis" label="종목분석" icon="back" />
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{name ?? symbolCode}</h1>
            <span className={`${styles.code} numeric`}>{symbolCode}</span>
          </div>
        </header>

        {result.status !== "ok" || series === null ? (
          <p className={styles.empty}>{STATUS_MESSAGE[result.status]}</p>
        ) : (
          <>
            <p className={styles.meta}>
              {result.overview.basis}재무제표 기준 · 최근{" "}
              {result.overview.annual.length}개년 · 출처 DART
              {quote !== null ? " · 시세 금융위원회" : ""}
            </p>

            <InvestmentIndicators
              indicators={buildInvestmentIndicators(result.overview, quote)}
              basisDate={quote?.basisDate ?? null}
            />

            <AnalysisChartsClient
              changes={quote?.changes ?? []}
              series={series}
            />

            <KeyMetricsTable series={series} />

            <Link
              href={`/analysis/${symbolCode}/statements`}
              className={styles.detailLink}
              prefetch={false}
            >
              재무제표 상세보기
            </Link>

            <p className={styles.note}>
              재무 데이터는 금융감독원 전자공시(DART) 기준이며 최초 조회 후 30일간
              캐시됩니다. 시세는 금융위원회 주식시세정보의 직전 영업일 확정 종가
              기준이라 장중 실시간 값과 다릅니다. PER·PBR은 연간에서는 각 연도 말
              종가로, 연환산에서는 각 분기말 종가로 계산하며, 분기 탭에서는 3개월
              실적이라 배수를 매기지 않습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
