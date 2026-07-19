import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** 관심종목 목록·[symbolCode] 상세 공용 (보유종목과 동일 구조). */
export default function Loading() {
  return <PageSkeleton variant="detail" count={5} chart />;
}
