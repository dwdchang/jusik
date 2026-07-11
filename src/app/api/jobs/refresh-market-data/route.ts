import { refreshMarketData } from "@/lib/jobs/refreshMarketData";
import { verifyJobRequest } from "@/lib/jobs/verifyJobRequest";
import { isWithinKisCallWindow } from "@/lib/market/staleness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 종목 수 증가 대비 — QStash는 응답을 최대 15분까지 대기 (§11.9-9) */
export const maxDuration = 300;

/**
 * 시세 갱신 잡 엔드포인트 — QStash 스케줄 4개가 호출 (plan.md §11.5).
 * 인증은 공용 verifyJobRequest(QStash 서명 → CRON_SECRET Bearer 폴백).
 * 수동 트리거도 KST 허용 시간 가드를 동일하게 통과해야 한다.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const trigger = await verifyJobRequest(request, rawBody);

  if (trigger === null) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // KST 허용 시간 가드(이중 방어) — 평일 09:00~18:40 밖이면 KIS를 호출하지 않는다.
  // 200이어야 QStash가 재시도하지 않는다 (§11.4).
  if (!isWithinKisCallWindow()) {
    return Response.json({
      ok: true,
      skipped: "outside KIS call window (KST weekday 09:00-18:40)",
    });
  }

  const report = await refreshMarketData(trigger);

  // 데이터 갱신 실패 → 500 (QStash 재시도 트리거 — 멱등이라 전체 재실행 무해).
  // 알림 발송만 실패한 경우는 report.ok에 포함되지 않아 200 (§11.10-A6).
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
