import { formatChangeRate } from "@/lib/format/change";
import { formatIndex } from "@/lib/format/index";
import { formatEokwon } from "@/lib/format/krw";
import type { MarketCapRanking, MarketCapStock } from "@/types/indices";
import styles from "./MarketCapRankingTable.module.css";

function toneClass(value: number): string {
  if (value > 0) {
    return styles.rise;
  }
  if (value < 0) {
    return styles.fall;
  }
  return styles.flat;
}

/**
 * 전일 확정 회차 대비 순위 변동 셀 (Phase 68).
 * 응답이 상위 30건뿐이라 전일 30위권 밖에서 들어온 종목은 변동 폭을 알 수 없어
 * "NEW"로 적는다. 기준 스냅샷 자체가 없는 첫 거래일은 전부 "—".
 */
function RankChangeCell({ stock }: { stock: MarketCapStock }) {
  if (stock.isNew) {
    return (
      <td className={`${styles.num} ${styles.rise}`}>
        <span title="전일 30위권 밖에서 진입">NEW</span>
      </td>
    );
  }
  if (stock.rankChange === null) {
    return <td className={`${styles.num} ${styles.flat}`}>—</td>;
  }
  if (stock.rankChange === 0) {
    return <td className={`${styles.num} ${styles.flat}`}>—</td>;
  }

  const up = stock.rankChange > 0;
  return (
    <td className={`${styles.num} ${toneClass(stock.rankChange)}`}>
      <span className="numeric">
        {up ? "▲" : "▼"}
        {Math.abs(stock.rankChange)}
      </span>
      <span className={styles.srOnly}>
        {up ? "상승" : "하락"} {Math.abs(stock.rankChange)}단계
      </span>
    </td>
  );
}

/**
 * 시가총액 순위 표 (Phase 68) — 코스피/코스닥 각 상위 30.
 * 시총은 장중 실시간 현재가 × 상장주식수라 회차마다 순위가 움직인다. 전일 대비 두 열은
 * 직전 거래일 마지막 회차(18:15 확정) 스냅샷과 비교해 만든다. 값이 길어 가로 스크롤하며
 * 순위·종목명 열은 고정. 토글이 없어 서버 컴포넌트로 둔다.
 */
export function MarketCapRankingTable({
  ranking,
}: {
  ranking: MarketCapRanking;
}) {
  if (ranking.rows.length === 0) {
    return <p className={styles.empty}>데이터 준비 중입니다.</p>;
  }

  return (
    <div>
      <p className={styles.note}>
        시가총액 상위 30종목 · 기준: 실시간 현재가
        {ranking.baseDate !== null
          ? ` · 전일 대비는 ${ranking.baseDate} 종가 기준`
          : " · 전일 대비는 다음 거래일부터"}
      </p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.rankHead}>
                순위
              </th>
              <th scope="col" className={styles.nameHead}>
                종목명
              </th>
              <th scope="col" className={styles.numHead}>
                현재가
              </th>
              <th scope="col" className={styles.numHead}>
                등락률
              </th>
              <th scope="col" className={styles.numHead}>
                시가총액
              </th>
              <th scope="col" className={styles.numHead}>
                전일 대비
              </th>
              <th scope="col" className={styles.numHead}>
                순위 변동
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((stock) => (
              <tr key={stock.code}>
                <td className={`${styles.rankCell} numeric`}>{stock.rank}</td>
                <td className={styles.nameCell}>{stock.name}</td>
                <td className={`${styles.num} numeric`}>
                  {formatIndex(stock.price)}
                </td>
                <td
                  className={`${styles.num} numeric ${toneClass(stock.changeRate)}`}
                >
                  {formatChangeRate(stock.changeRate)}
                </td>
                <td className={`${styles.num} numeric`}>
                  {formatEokwon(stock.marketCapEok)}
                </td>
                <td
                  className={`${styles.num} numeric ${toneClass(stock.capChangeEok)}`}
                >
                  {formatEokwon(stock.capChangeEok, true)}
                </td>
                <RankChangeCell stock={stock} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
