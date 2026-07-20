import { refreshDividendRanking } from "@/lib/jobs/refreshDividendRanking";
import { verifyJobRequest } from "@/lib/jobs/verifyJobRequest";
import { isWithinKisCallWindow } from "@/lib/market/staleness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** 현재가 89콜 + 유니버스 ~2,650콜 ≈ 3분 — 시간 예산 250초 + 커서 이어받기 (§43) */
export const maxDuration = 300;

/**
 * 배당률 순위 갱신 잡 엔드포인트 — QStash 스케줄이 호출 (plan.md §43).
 * 가드 2종이 실제 계산을 회차당 1회로 좁힌다:
 * ① KST 호출 창 밖(주말·야간) → no-op 200, ② 기준일 이미 완료 → no-op 200.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const trigger = await verifyJobRequest(request, rawBody);

  if (trigger === null) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 시간창·완료 가드 우회(디버깅·재시딩용) — CRON_SECRET 수동 트리거에만 허용.
  // 완료 가드까지 우회하므로 키 삭제 없이 같은 기준일을 재계산할 수 있다 (Phase 46).
  const force =
    trigger === "manual" &&
    new URL(request.url).searchParams.get("force") === "true";

  if (!force && !isWithinKisCallWindow()) {
    return Response.json({
      ok: true,
      skipped: "outside KIS call window (KST weekday 09:00-18:40)",
    });
  }

  try {
    const report = await refreshDividendRanking(trigger, { force });
    return Response.json(report, { status: report.ok ? 200 : 500 });
  } catch (error) {
    // 마스터 다운로드 실패·연속 실패 중단 등 — progress가 있으면 커서부터 재개된다.
    // 500이면 QStash가 1회 재시도, 그래도 실패 시 다음 스케줄이 백스톱 (§43).
    console.error("[job] refresh-dividend-ranking failed:", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
