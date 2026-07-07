import { SignOutButton } from "@/components/auth/SignOutButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { IndexDashboardData } from "@/types/indices";
import { DataAsOfFooter } from "./DataAsOfFooter";
import { IndexCard } from "./IndexCard";
import { IndexChartsSection } from "./IndexChartsSection";
import styles from "./IndexDashboard.module.css";

export function IndexDashboard({ data }: { data: IndexDashboardData }) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>국내 지수</h1>
          <p className={styles.subtitle}>KOSPI · KOSDAQ 최근 7거래일 추이</p>
        </div>
        <div className={styles.headerActions}>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <section className={styles.cards} aria-label="지수 현황">
        <IndexCard snapshot={data.kospi} />
        <IndexCard snapshot={data.kosdaq} />
      </section>

      <IndexChartsSection
        kospi={data.kospiHistory}
        kosdaq={data.kosdaqHistory}
      />

      <DataAsOfFooter data={data} />
    </div>
  );
}
