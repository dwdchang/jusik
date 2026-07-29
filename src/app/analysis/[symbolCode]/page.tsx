import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache, Suspense } from "react";
import {
  AnalysisFinancialChartsClient,
  AnalysisQuoteChartsClient,
} from "@/components/analysis/AnalysisChartsClient";
import { InvestmentIndicators } from "@/components/analysis/InvestmentIndicators";
import { KeyMetricsTable } from "@/components/analysis/KeyMetricsTable";
import {
  InvestmentIndicatorsPending,
  KeyMetricsTablePending,
  QuoteChartsPending,
} from "@/components/analysis/QuotePendingBlocks";
import { NavIconLink } from "@/components/nav/NavIconLink";
import type { AnalysisOverview } from "@/lib/analysis/overview";
import { getAnalysisOverview } from "@/lib/analysis/overview";
import type { AnalysisQuote } from "@/lib/analysis/quote";
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
 *
 * **둘을 함께 기다리지는 않는다** (Phase 78) — 응답 속도가 10배 넘게 벌어져(DART 1초 대
 * 금융위 5~15초, 2026-07-29 실측) 예전에는 재무 차트까지 시세에 묶여 있었다. 지금은
 * 시세 의존 블록만 `<Suspense>`로 감싸 재무 차트를 먼저 내보내고, 그 자리는
 * `QuotePendingBlocks`가 경과 시간과 함께 지킨다. 화면 순서는 그대로다.
 */

/**
 * 종목명 조회 — `generateMetadata`와 본문이 같은 요청에서 각각 부른다.
 * `market:stockMaster`가 161KB라 `cache()`가 없으면 그 왕복을 두 번 한다(Phase 78).
 */
const resolveName = cache(async (symbolCode: string): Promise<string | null> => {
  try {
    const master = await getStockMaster();
    return master?.items.find((item) => item.code === symbolCode)?.name ?? null;
  } catch {
    return null;
  }
});

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

/**
 * 차트와 표가 같은 시리즈를 쓴다 — 조립은 순수 함수라 블록마다 다시 만들어도 부담이 없다.
 * `quote`가 null이면 시세로 채우는 칸(PER·PBR·연환산 시가배당률)만 빈다.
 */
function buildSeries(overview: AnalysisOverview, quote: AnalysisQuote | null) {
  return {
    ttm: withTtmValuation(overview.ttm, quote),
    annual: withAnnualValuation(overview.annual, quote),
    quarter: withQuarterValuation(overview.quarter),
  };
}

// ── 시세 의존 블록 ───────────────────────────────────────
// 셋 다 같은 `quotePromise`를 기다린다(호출은 한 번뿐이라 중복 조회가 없다). 하나로
// 합치지 않은 이유는 화면 순서다 — 사이에 재무 차트가 끼어 있고 그 순서는 확정 사항이다.

async function IndicatorsSection({
  overview,
  quotePromise,
}: {
  overview: AnalysisOverview;
  quotePromise: Promise<AnalysisQuote | null>;
}) {
  const quote = await quotePromise;
  return (
    <InvestmentIndicators
      indicators={buildInvestmentIndicators(overview, quote)}
      basisDate={quote?.basisDate ?? null}
    />
  );
}

async function QuoteChartsSection({
  overview,
  quotePromise,
}: {
  overview: AnalysisOverview;
  quotePromise: Promise<AnalysisQuote | null>;
}) {
  const quote = await quotePromise;
  return (
    <AnalysisQuoteChartsClient
      changes={quote?.changes ?? []}
      series={buildSeries(overview, quote)}
    />
  );
}

async function KeyMetricsSection({
  overview,
  quotePromise,
}: {
  overview: AnalysisOverview;
  quotePromise: Promise<AnalysisQuote | null>;
}) {
  const quote = await quotePromise;
  return <KeyMetricsTable series={buildSeries(overview, quote)} />;
}

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ symbolCode: string }>;
}) {
  await ensureAllowedSession();
  const { symbolCode } = await params;

  // 6자리 숫자 코드만 통과 — `/stocks/[symbolCode]`·`/indices/trade/[yyyymm]`와 같은 관례.
  // overview는 corpCode 매핑에서 걸러지지만 quote는 그 게이트를 지나지 않고 곧바로
  // 금융위 API를 부른다(likeSrtnCd가 부분일치라 임의 문자열도 400행을 받아 쿼터만 태운다).
  if (!/^\d{6}$/.test(symbolCode)) {
    redirect("/analysis");
  }

  // 시세는 여기서 **시작만** 하고 기다리지 않는다 — 재무와 병렬로 흐르다가 아래
  // `<Suspense>` 안에서 도착한다. (실패해도 null로 끝나 reject되지 않는다)
  const quotePromise = getAnalysisQuote(symbolCode);

  const [name, result] = await Promise.all([
    resolveName(symbolCode),
    getAnalysisOverview(symbolCode),
  ]);

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

        {result.status !== "ok" ? (
          <p className={styles.empty}>{STATUS_MESSAGE[result.status]}</p>
        ) : (
          <>
            <p className={styles.meta}>
              {result.overview.basis}재무제표 기준 · 최근{" "}
              {result.overview.annual.length}개년 · 출처 DART
            </p>

            <Suspense fallback={<InvestmentIndicatorsPending />}>
              <IndicatorsSection
                overview={result.overview}
                quotePromise={quotePromise}
              />
            </Suspense>

            <Suspense fallback={<QuoteChartsPending />}>
              <QuoteChartsSection
                overview={result.overview}
                quotePromise={quotePromise}
              />
            </Suspense>

            {/* 시세를 안 쓰는 차트 3종 — 재무가 오는 대로 먼저 그린다 */}
            <AnalysisFinancialChartsClient
              series={buildSeries(result.overview, null)}
            />

            <Suspense fallback={<KeyMetricsTablePending />}>
              <KeyMetricsSection
                overview={result.overview}
                quotePromise={quotePromise}
              />
            </Suspense>

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
