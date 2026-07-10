import type { Metadata } from "next";
import { IndexDetailScreen } from "@/components/indices/IndexDetailScreen";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "미국 10년물 국채금리 — jusik",
  description: "미국 10년물 국채금리 상세 (최근 7거래일 차트·일별 시세)",
};

export default async function Us10yDetailPage() {
  await ensureAllowedSession();
  return <IndexDetailScreen market="US10Y" />;
}
