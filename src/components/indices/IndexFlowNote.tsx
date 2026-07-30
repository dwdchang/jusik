import { formatFlowCompact } from "@/lib/format/krw";
import type { HomeIndexFlow, HomeIndexFlowInvestor } from "@/types/indices";
import styles from "./IndexFlowNote.module.css";

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
 * 연속 거래일 수 — `2일` / 창을 소진하면 `20일+` (§86.3).
 *
 * §86.1에서 폭 때문에 라틴 `D`로 줄였다가, 주체를 행으로 돌리며(§86.2) 여유가
 * 생겨 되돌렸다. 「거래일」 풀표기는 이 폭에 안 들어간다 — 한글 3자면 연속 열이
 * 16px → 35px으로 늘어 실데이터에서도 3.7px 모자란다(§86.3 실측).
 */
function formatStreak(streak: { days: number; capped: boolean }): string {
  return `${streak.days}일${streak.capped ? "+" : ""}`;
}

function InvestorRow({
  investor,
  basisLabel,
}: {
  investor: HomeIndexFlowInvestor;
  basisLabel: string;
}) {
  const { label, value, change, streak } = investor;
  const flowWord = value >= 0 ? "순매수" : "순매도";

  return (
    <tr>
      <th scope="row" className={styles.label}>
        {label}
      </th>
      <td className={`${styles.value} numeric ${toneClass(value)}`}>
        <span className={styles.srOnly}>{`${flowWord} `}</span>
        {formatFlowCompact(value, true)}
      </td>
      <td className={`${styles.sub} numeric`}>
        {change !== null ? (
          <>
            <span className={styles.srOnly}>{`${basisLabel} 대비 `}</span>
            {formatFlowCompact(change, true)}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={`${styles.sub} numeric`}>
        {streak !== null ? (
          <>
            <span className={styles.srOnly}>{`${flowWord} `}</span>
            {formatStreak(streak)}
            <span className={styles.srOnly}> 거래일 연속</span>
          </>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

/**
 * 홈 코스피/코스닥 카드의 거래대금·수급 보조 블록 (Phase 86, 배치는 §86.2).
 *
 * 상세 「거래대금 · 수급」(§69·§70)과 같은 스냅샷을 카드 폭에 압축한 것 —
 * 투자자 3주체를 **행**으로 둔 4열 표(주체 / 순매수 금액 / 전일 같은 시각 대비 증감 /
 * 같은 부호가 이어진 거래일 수) + 그 아래 거래대금 한 줄. **KIS 추가 호출 0**.
 *
 * 폭 근거(§86 실측 → §86.1 실기기 정정 → §86.2 배치 전환): 가장 좁은 지점은
 * **뷰포트 400~402px**이다 — 홈 그리드가 400px에서 2열로 바뀌는 바로 위 구간이라
 * 카드 내부가 332px → 155px로 급감한다(아이폰 17이 정확히 402px). 390px 이하는
 * 1열이라 오히려 넉넉하다.
 *
 * 주체를 열로 두는 배치(§86·§86.1)는 이 폭에 3열을 억지로 끼우는 일이었다 —
 * 라벨을 값과 같은 줄에 두면 상단 행만으로 160px이 필요해 접히고(§86.1), 라벨을
 * 열 머리로 올려야 겨우 들어갔다. **주체를 행으로 돌리면** 세 값이 가로로 눕고
 * 표가 열 폭을 내용에 맞춰 배분하므로(균등 `1fr` 분할과 달리 짧은 열이 남긴 폭을
 * 긴 열이 쓴다) 여유가 생긴다. 그래서 §86에서 1자로 줄였던 라벨을
 * **풀네임(개인·외국인·기관계)으로 되돌렸고**, §86.3에서 글자 크기(11px)와
 * 「일」 표기까지 되돌렸다 — 최악 케이스 기준 여유는 3.2px로 줄었지만 통과한다.
 * 여기서 더 늘릴 여지는 없다: 「거래일」 풀표기는 실데이터에서도 3.7px 모자란다.
 *
 * 테두리 없는 표를 쓰는 이유는 이 열 폭 자동 배분과 행/열 정렬이고, 데이터 표라
 * 시맨틱도 맞다(`<th scope="row">`가 주체 라벨). 시각적 격자는 없다.
 *
 * 색상은 순매수 금액에만 준다 — 지수 등락률이 카드의 대표 색상이어야 하므로
 * 거래대금 줄과 증감·연속 열은 무채색 tertiary(§85 DXY 보조줄 관례).
 */
export function IndexFlowNote({ flow }: { flow: HomeIndexFlow }) {
  const { trading, investors, basisLabel } = flow;

  return (
    <div className={styles.block}>
      {investors !== null ? (
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            {`투자자별 순매수 — 금액, ${basisLabel} 대비 증감, 연속 거래일 수`}
          </caption>
          <tbody>
            {investors.map((investor) => (
              <InvestorRow
                key={investor.label}
                investor={investor}
                basisLabel={basisLabel}
              />
            ))}
          </tbody>
        </table>
      ) : null}

      {trading !== null ? (
        <p className={`${styles.trading} numeric`}>
          거래대금 {formatFlowCompact(trading.value)}
          {trading.change !== null ? (
            <>
              <span className={styles.srOnly}>{` ${basisLabel} 대비 `}</span>
              {` (${formatFlowCompact(trading.change, true)})`}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
