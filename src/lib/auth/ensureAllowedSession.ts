import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isEmailAllowed } from "./allowedEmails";

/**
 * 상세 페이지 공용 접근 검증.
 * 미로그인 → /login, 허용 목록 외 이메일 → / (홈의 access-denied 안내 화면).
 */
export async function ensureAllowedSession() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (!isEmailAllowed(session.user?.email)) {
    redirect("/");
  }

  return session;
}
