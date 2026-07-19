import { PageSkeleton } from "@/components/ui/PageSkeleton";

/**
 * 지표 상세 6종 공용 — kospi·kosdaq·usdkrw·market·kospi-volatility·trade/[yyyymm].
 * 전부 "헤더 + 차트/카드 + 일별 기록 목록" 골격이라 한 파일로 커버한다.
 */
export default function Loading() {
  return <PageSkeleton variant="detail" count={6} chart />;
}
