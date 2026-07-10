import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { IndexDashboard } from "@/components/indices/IndexDashboard";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { getHoldingsCardSummary } from "@/lib/holdings/summary";
import { getDashboardData } from "@/lib/indices/getDashboard";
import { getVolatilityCardSummary } from "@/lib/indices/volatility";
import styles from "./page.module.css";

export const revalidate = 600;

export default async function HomePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const email = session.user?.email;

  if (!isEmailAllowed(email)) {
    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <h1 className={styles.errorTitle}>접근 권한이 없습니다</h1>
          <p className={styles.errorMessage}>
            {email ?? "이 계정"}은(는) 이 대시보드에 접근할 수 있는 목록에
            없습니다.
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className={styles.signOutButton}>
              로그아웃
            </button>
          </form>
        </div>
      </main>
    );
  }

  let data: Awaited<ReturnType<typeof getDashboardData>>;
  let holdingsSummary: Awaited<ReturnType<typeof getHoldingsCardSummary>>;
  let volatilitySummary: Awaited<ReturnType<typeof getVolatilityCardSummary>>;

  try {
    // 카드 요약(보유종목·변동성)은 실패 시 null 반환 — 홈 전체를 막지 않는다
    [data, holdingsSummary, volatilitySummary] = await Promise.all([
      getDashboardData(),
      getHoldingsCardSummary(email),
      getVolatilityCardSummary(),
    ]);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지수 데이터를 불러오지 못했습니다.";

    console.error(
      "[HomePage] getDashboardData failed:",
      message,
      error instanceof Error ? error.cause : undefined
    );

    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <h1 className={styles.errorTitle}>데이터를 불러올 수 없습니다</h1>
          <p className={styles.errorMessage}>{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <IndexDashboard
        data={data}
        holdingsSummary={holdingsSummary}
        volatilitySummary={volatilitySummary}
      />
    </main>
  );
}
