import type { Metadata } from "next";
import { IndexDetailScreen } from "@/components/indices/IndexDetailScreen";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "원/달러 환율 — jusik",
  description: "원/달러 환율 상세 (최근 7거래일 차트·일별 시세)",
};

export default async function UsdKrwDetailPage() {
  await ensureAllowedSession();
  return <IndexDetailScreen market="USDKRW" />;
}
