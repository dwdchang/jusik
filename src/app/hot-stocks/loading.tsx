import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 핫종목 — 차트 없이 상위 30종목 목록. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={10} />;
}
