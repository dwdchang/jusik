import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 배당 일정 — 보유종목 한 줄씩 목록. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={5} />;
}
