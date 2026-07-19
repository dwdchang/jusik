import type { Metadata } from "next";
import { DollarIndexSection } from "@/components/indices/DollarIndexSection";
import { IndexDetailScreen } from "@/components/indices/IndexDetailScreen";
import { ensureAllowedSession } from "@/lib/auth/ensureAllowedSession";

export const metadata: Metadata = {
  title: "원/달러 환율 — jusik",
  description: "원/달러 환율 상세 (최근 7거래일 차트·일별 시세·달러 인덱스)",
};

export default async function UsdKrwDetailPage() {
  await ensureAllowedSession();
  return (
    <IndexDetailScreen market="USDKRW">
      <DollarIndexSection />
    </IndexDetailScreen>
  );
}
