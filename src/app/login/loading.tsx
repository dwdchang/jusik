import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 로그인 — 조회할 데이터가 없는 화면이라 홈 카드 그리드 상속을 끊고 최소 골격만 둔다. */
export default function Loading() {
  return <PageSkeleton variant="detail" count={1} />;
}
