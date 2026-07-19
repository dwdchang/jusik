import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 보유종목 목록·[symbolCode] 상세 공용 — 요약 + 추이 차트 + 일별 기록. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={5} chart />;
}
