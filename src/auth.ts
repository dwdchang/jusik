import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * 로그인 자체는 모든 Google 계정에 허용하고, 대시보드 접근 가부는
 * page 레벨에서 ALLOWED_EMAILS로 판단한다(access-denied 화면 표시를 위해).
 * @see lib/auth/allowedEmails.ts
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  trustHost: true,
});
