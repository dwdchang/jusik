import { cleanupOrphanStocks } from "@/lib/jobs/cleanupOrphanStocks";
import { verifyJobRequest } from "@/lib/jobs/verifyJobRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 종목 수 증가·SCAN 페이징 대비 (다른 잡과 동일 여유) */
export const maxDuration = 300;

/**
 * 고아 종목 키 정리 잡 엔드포인트 — QStash 스케줄(매일 03:00 KST)이 호출 (plan.md §49).
 * 인증은 공용 verifyJobRequest(QStash 서명 → CRON_SECRET Bearer 폴백).
 * KIS를 호출하지 않고 Redis만 만지므로 isWithinKisCallWindow 시간창 가드는 적용하지 않는다 —
 * 정리는 장 마감 후·새벽·주말에 돈다.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const trigger = await verifyJobRequest(request, rawBody);

  if (trigger === null) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const report = await cleanupOrphanStocks(trigger);

  // 실패 → 500 (QStash 재시도 트리거 — 멱등이라 전체 재실행 무해). 안전장치 skip은 ok:true → 200.
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
