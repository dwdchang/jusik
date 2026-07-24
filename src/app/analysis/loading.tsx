import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 종목분석 — 랜딩(검색) + [symbolCode] 상세(재무 표) 공용 스켈레톤. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={6} />;
}
