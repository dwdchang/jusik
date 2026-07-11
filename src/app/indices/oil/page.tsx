import type { Metadata } from "next";
import { IndexDetailScreen } from "@/components/indices/IndexDetailScreen";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";

export const metadata: Metadata = {
  title: "국제유가 WTI — jusik",
  description: "국제유가 WTI 상세 (최근 7거래일 차트·일별 시세)",
};

export default async function OilDetailPage() {
  await ensureAllowedSession();
  return <IndexDetailScreen market="OIL" />;
}
