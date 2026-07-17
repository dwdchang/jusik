import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { isAdminEmail } from "@/lib/auth/allowedEmails";
import { MenuSidebar } from "./MenuSidebar";

/**
 * 홈 헤더 우측 햄버거 메뉴 — 서버 액션 폼(SignOutButton)과 테마 토글을
 * 클라이언트 사이드바(MenuSidebar)에 슬롯으로 주입하는 조립 전용 서버 컴포넌트.
 * DLQ 확인 링크는 관리자 계정에만 노출한다 (/dlq 페이지 자체도 재검증).
 */
export async function HeaderMenu() {
  const session = await auth();

  return (
    <MenuSidebar
      themeSlot={<ThemeToggle />}
      logoutSlot={<SignOutButton />}
      showDlqLink={isAdminEmail(session?.user?.email)}
    />
  );
}
