import Link from "next/link";
import { formatBtcValue } from "@/lib/format/btc";
import { formatChangeRate } from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import type { StalenessLevel } from "@/lib/market/staleness";
import type { IndexSnapshot } from "@/types/indices";
import styles from "./MarketCard.module.css";
import { STALENESS_LABELS } from "./SummaryCard";

/**
 * 홈 "글로벌 지표" 카드 — 금리·유가·금·비트코인(USD) 4행 동등 표시 (§33).
 * 행 폼은 WatchlistCard 관례(지표명 + 값 + 등락률). §30 추가 지표
 * (유가·금·비트코인)는 첫 갱신 회차 전 null이라 해당 행을 생략한다.
 * staleness 배지는 SummaryCard와 동일 정책(§11.10-B2) — 홈에서 판정값을 받는다.
 * §34에서 지표명을 축약(美 금리·WTI·GOLD·BTC)해 말줄임을 없앴다. 값 열은
 * 4행 모두 숫자만 — WTI·GOLD도 통화 표기가 없고 전부 USD 기준이라 §37에서
 * BTC의 ($) 표기도 뺐다(모바일 폭 확보, 카드 안 표기 일관성).
 */
export function MarketCard({
  usTreasury10y,
  oil,
  gold,
  btcUsd,
  staleness,
}: {
  usTreasury10y: IndexSnapshot;
  oil: IndexSnapshot | null;
  gold: IndexSnapshot | null;
  btcUsd: IndexSnapshot | null;
  staleness: StalenessLevel | null;
}) {
  const rows = [
    {
      label: "美 금리",
      value: formatIndex(usTreasury10y.close),
      changeRate: usTreasury10y.changeRate,
      direction: usTreasury10y.direction,
    },
    ...(oil !== null
      ? [
        {
          label: "WTI",
          value: formatIndex(oil.close),
          changeRate: oil.changeRate,
          direction: oil.direction,
        },
      ]
      : []),
    ...(gold !== null
      ? [
        {
          label: "GOLD",
          value: formatIndex(gold.close),
          changeRate: gold.changeRate,
          direction: gold.direction,
        },
      ]
      : []),
    ...(btcUsd !== null
      ? [
        {
          label: "BTC",
          value: formatBtcValue(btcUsd.close, "USD"),
          changeRate: btcUsd.changeRate,
          direction: btcUsd.direction,
        },
      ]
      : []),
  ];

  return (
    <Link href="/indices/market" className={styles.card}>
      {staleness !== null ? (
        <span
          className={`${styles.badge} ${
            staleness === "critical" ? styles.badgeCritical : styles.badgeWarn
          }`}
          role="img"
          aria-label={STALENESS_LABELS[staleness]}
          title={STALENESS_LABELS[staleness]}
        >
          !
        </span>
      ) : null}
      <h2 className={styles.title}>글로벌 지표</h2>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.label} className={styles.row}>
            <span className={styles.name}>{row.label}</span>
            <span className={`${styles.value} numeric`}>{row.value}</span>
            <span
              className={`${styles.rate} numeric ${styles[row.direction]}`}
            >
              {formatChangeRate(row.changeRate)}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
