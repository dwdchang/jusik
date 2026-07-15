import { refreshTradeDetail } from "@/lib/jobs/refreshTradeDetail";
import { verifyJobRequest } from "@/lib/jobs/verifyJobRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 97개 류 전수 조회가 실측 ~61초 — 공공 API 지연 여유까지 두고 잡 표준값 사용 */
export const maxDuration = 300;

/**
 * 수출입 상세 갱신 잡 엔드포인트 — 월 1회 (plan.md §17.15).
 * 인증은 공용 verifyJobRequest(QStash 서명 → CRON_SECRET Bearer 폴백).
 * KIS를 호출하지 않으므로 시간창 가드는 적용하지 않는다 (월간 확정 통계).
 *
 * feeds 잡과 분리한 이유는 refreshTradeDetail 주석 참고 — 전수 조회의 시간 예산과
 * 실패 범위를 매일 도는 뉴스·공시 파이프라인과 섞지 않기 위해서다.
 * 확정월을 이미 확보했으면 관세청을 부르지 않고 즉시 skip하므로 자주 불려도 무해하다.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const trigger = await verifyJobRequest(request, rawBody);

  if (trigger === null) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const report = await refreshTradeDetail(trigger);

  // 데이터 갱신 실패 → 500 (QStash 재시도 트리거 — 멱등이라 전체 재실행 무해)
  return Response.json(report, { status: report.ok ? 200 : 500 });
}
