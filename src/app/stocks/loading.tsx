import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 내 종목 목록(4탭)·[symbolCode] 상세 공용 — 구 holdings·watchlist 2개를 합친 것 (§58). */
export default function Loading() {
  return <PageSkeleton variant="detail" count={5} chart />;
}
