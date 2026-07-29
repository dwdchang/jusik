import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getLastRefreshRecord } from "@/lib/market/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 마지막 갱신 시각 조회 (GET) — 자동 새로고침(`components/ui/AutoRefresh`) 전용 (Phase 77).
 * Redis `market:lastRefreshAt`에서 성공 시각 하나만 꺼내 돌려준다(Redis GET 1회·KIS 호출 0).
 *
 * 잡 라우트(§4)와 달리 **세션 인증**이다 — 호출 주체가 로그인한 브라우저이기 때문.
 * proxy.ts matcher가 이미 미인증 요청을 /login으로 돌리지만, Phase 76 방침대로
 * 라우트에서도 허용 이메일까지 직접 확인한다(이중 방어).
 *
 * 응답이 캐시되면 갱신 감지 자체가 무의미해지므로 `no-store`를 명시한다.
 */
export async function GET() {
  const session = await auth();

  if (!isEmailAllowed(session?.user?.email)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const record = await getLastRefreshRecord();

  return Response.json(
    { at: record?.at ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
