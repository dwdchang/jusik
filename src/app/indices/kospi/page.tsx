import type { Metadata } from "next";
import { IndexDetailScreen } from "@/components/indices/IndexDetailScreen";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";

export const metadata: Metadata = {
  title: "코스피 — jusik",
  description: "코스피 지수 상세 (최근 7거래일 차트·일별 시세)",
};

export default async function KospiDetailPage() {
  await ensureAllowedSession();
  return <IndexDetailScreen market="KOSPI" />;
}
