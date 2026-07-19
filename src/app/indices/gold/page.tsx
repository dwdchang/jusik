import type { Metadata } from "next";
import { IndexDetailScreen } from "@/components/indices/IndexDetailScreen";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";

export const metadata: Metadata = {
  title: "금 현물(국제) — jusik",
  description: "LBMA 런던 금 현물 상세 (최근 7거래일 차트·일별 시세)",
};

export default async function GoldDetailPage() {
  await ensureAllowedSession();
  return <IndexDetailScreen market="GOLD" />;
}
