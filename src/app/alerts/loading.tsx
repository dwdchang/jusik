import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 알림 설정 — 구독 관리 + 종목별 토글 목록. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={5} />;
}
