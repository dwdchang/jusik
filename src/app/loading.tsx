import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 홈 대시보드 — 카드 8종 그리드. 자기 loading.tsx가 없는 하위 라우트의 폴백도 겸한다. */
export default function Loading() {
  return <PageSkeleton variant="dashboard" count={8} />;
}
