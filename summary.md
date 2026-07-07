# 로그아웃 버튼 추가 작업 결과

## 변경 사항

- `src/components/auth/SignOutButton.tsx` 신규 생성
  - Server Component, `signOut({ redirectTo: "/login" })`을 호출하는 인라인 Server Action 사용 (로그인 페이지의 `signIn` 패턴과 동일)
  - 아이콘은 `lucide-react`의 `LogOut` 사용
- `src/components/auth/SignOutButton.module.css` 신규 생성
  - `ThemeToggle.module.css`와 동일한 스타일(아이콘 버튼, 36x36, radius, border, hover) 적용
- `src/components/indices/IndexDashboard.tsx`
  - 헤더에 `.headerActions` wrapper를 추가해 `ThemeToggle`과 `SignOutButton`을 나란히 배치
- `src/components/indices/IndexDashboard.module.css`
  - `.headerActions` (flex, gap: var(--space-8)) 스타일 추가
- `package.json` / `package-lock.json`
  - `lucide-react` 의존성 추가

## 검증

- `npx tsc --noEmit` 통과
- `npm run lint` 통과
- dev 서버 기동 후 미로그인 상태에서 `/` 접근 시 `/login`으로 307 리다이렉트되는 것 확인
- 실제 Google OAuth 로그인 → 로그아웃 버튼 클릭 → `/login` 이동 → 재로그인 흐름은 브라우저 도구가 없어 자동화 불가, 사용자 직접 확인 요청
