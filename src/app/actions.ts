"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";

/**
 * 클라이언트 라우터 캐시 전량 무효화 — 자동 새로고침(`components/ui/AutoRefresh`) 전용 (Phase 77).
 *
 * `router.refresh()`만 쓰면 **현재 라우트**의 캐시만 지워, 갱신 직후 다른 화면으로
 * 이동했을 때 `staleTimes.dynamic`(600초) 안에 있는 묵은 세그먼트가 그대로 보인다.
 * `revalidatePath(path, "layout")`은 루트 레이아웃 아래 전부를 대상으로 하므로
 * 화면 간 이동에도 새 시세가 보장된다(문서상 클라이언트 캐시 무효화 수단 중 하나).
 *
 * 이 앱의 화면은 전부 동적 렌더(`auth()`가 쿠키 접근)라 무효화할 서버 캐시가 없고,
 * 노리는 효과는 클라이언트 캐시 무효화 하나뿐이다 — KIS 호출·Redis 쓰기 0.
 */
export async function invalidateMarketRouterCache(): Promise<void> {
  const session = await auth();

  if (!isEmailAllowed(session?.user?.email)) {
    redirect("/login");
  }

  revalidatePath("/", "layout");
}
