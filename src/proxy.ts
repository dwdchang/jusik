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

export const config = {
  matcher: [
    "/((?!api/auth|api/jobs/refresh-market-data|_next/static|_next/image|favicon.ico).*)",
  ],
};
