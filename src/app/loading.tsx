import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 홈 대시보드 — 카드 7종 그리드(§58에서 보유종목 카드 삭제).
 *  자기 loading.tsx가 없는 하위 라우트의 폴백도 겸한다. */
export default function Loading() {
  return <PageSkeleton variant="dashboard" count={7} />;
}
