import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** DLQ 목록 — 홈 카드 그리드 폴백 대신 목록 골격을 쓴다. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={6} />;
}
