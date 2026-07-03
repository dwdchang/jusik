import { IndexDashboard } from "@/components/indices/IndexDashboard";
import { getDashboardData } from "@/lib/indices/getDashboard";
import styles from "./page.module.css";

export const revalidate = 600;

export default async function HomePage() {
  let data: Awaited<ReturnType<typeof getDashboardData>>;

  try {
    data = await getDashboardData();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지수 데이터를 불러오지 못했습니다.";

    console.error("[HomePage] getDashboardData failed:", message);

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
      <IndexDashboard data={data} />
    </main>
  );
}
