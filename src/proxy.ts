import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = new Set(["/login"]);

/**
 * 인증 여부만 확인한다(낙관적 체크, 세션 쿠키만 검사).
 * 허용 이메일(ALLOWED_EMAILS) 여부는 여기서 판단하지 않고
 * 대시보드 page에서 access-denied 화면으로 안내한다.
 */
export default auth((req) => {
  if (req.auth || PUBLIC_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.nextUrl));
});

/**
 * 잡 라우트는 세션이 아니라 QStash 서명·CRON_SECRET으로 스스로 인증하므로
 * (`verifyJobRequest` — 미인증이면 401) 세션 리다이렉트 대상에서 제외한다.
 * 라우트를 하나씩 열거하면 새 잡을 추가할 때 빠뜨려 307 → /login으로 새는데,
 * 실제로 그래서 `api/jobs` 접두사로 묶었다 (§17.15).
 *
 * PWA 자산(sw.js·manifest·아이콘)도 제외한다 — 브라우저가 매니페스트를
 * credentials 없이 가져오고, 서비스 워커 등록 fetch가 /login 307을 받으면
 * 설치·푸시 구독이 깨진다 (Phase 10).
 */
export const config = {
  matcher: [
    "/((?!api/auth|api/jobs/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|apple-icon.png).*)",
  ],
};
