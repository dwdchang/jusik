import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 뉴스·공시 — 탭 + 게시판 목록. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={8} />;
}
