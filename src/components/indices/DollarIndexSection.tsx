import { MARKET_DATA_EMPTY_MESSAGE } from "@/lib/indices/getDashboard";
import { getOverseasDetail } from "@/lib/indices/getOverseasDetail";
import type { IndexDetailData } from "@/types/indices";
import { IndexCard } from "./IndexCard";
import { IndexChartClient } from "./IndexChartClient";
import styles from "./DollarIndexSection.module.css";

/**
 * 원/달러 상세 하단 달러 인덱스 섹션 — plan.md §28.
 * 갱신 잡이 KIS 환율 6종으로 계산해 저장한 `market:detail:dxy`를 읽는다.
 */
export async function DollarIndexSection() {
  let data: IndexDetailData;

  try {
    data = await getOverseasDetail("DXY");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message !== MARKET_DATA_EMPTY_MESSAGE) {
      console.error("[DollarIndexSection] getOverseasDetail(DXY) failed:", error);
    }

    return (
      <section className={styles.section} aria-label="달러 인덱스">
        <h2 className={styles.sectionTitle}>달러 인덱스</h2>
        <p className={styles.empty}>
          아직 수집된 데이터가 없습니다. 다음 갱신 회차(평일 09:00~18:15 KST)에
          반영됩니다.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="달러 인덱스">
      <IndexCard snapshot={data.snapshot} />
      <IndexChartClient series={data.history} />
      <p className={styles.note}>
        달러 인덱스는 KIS 환율 6종(유로·엔·파운드·캐나다달러·크로나·프랑)으로
        계산한 ICE 지수 근사치입니다.
      </p>
    </section>
  );
}
