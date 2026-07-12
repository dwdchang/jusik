import { refreshFeeds } from "@/lib/jobs/refreshFeeds";
import { verifyJobRequest } from "@/lib/jobs/verifyJobRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** corpCode.xml 갱신 회차(수 MB zip)·종목 수 증가 대비 (시세 잡과 동일 여유) */
export const maxDuration = 300;

/**
 * 뉴스·공시 피드 갱신 잡 엔드포인트 — QStash 스케줄(매일 08~22시 정시 KST)이 호출
 * (plan.md §17.2). 인증은 공용 verifyJobRequest(QStash 서명 → CRON_SECRET Bearer 폴백).
 * KIS를 호출하지 않으므로 isWithinKisCallWindow 시간창 가드는 적용하지 않는다 —
 * 공시·뉴스는 장 마감 후·주말에도 발생한다.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const trigger = await verifyJobRequest(request, rawBody);

  if (trigger === null) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const report = await refreshFeeds(trigger);

  // 데이터 갱신 실패 → 500 (QStash 재시도 트리거 — 멱등이라 전체 재실행 무해)
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
