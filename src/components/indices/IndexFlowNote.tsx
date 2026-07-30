import { formatFlowCompact } from "@/lib/format/krw";
import type { HomeIndexFlow, HomeIndexFlowInvestor } from "@/types/indices";
import styles from "./IndexFlowNote.module.css";

/** 1자 축약 라벨의 스크린리더용 원래 이름 (§86) */
const FULL_LABELS: Record<string, string> = {
  개: "개인",
  외: "외국인",
  기: "기관계",
};

function toneClass(value: number): string {
  if (value > 0) {
    return styles.rise;
  }
  if (value < 0) {
    return styles.fall;
  }
  return styles.flat;
}

/** "3일" / 창을 소진하면 "20일+" (§86) */
function formatStreak(streak: { days: number; capped: boolean }): string {
  return `${streak.days}일${streak.capped ? "+" : ""}`;
}

function InvestorCell({
  investor,
  basisLabel,
}: {
  investor: HomeIndexFlowInvestor;
  basisLabel: string;
}) {
  const { label, value, change, streak } = investor;
  const full = FULL_LABELS[label] ?? label;
  const flowWord = value > 0 ? "순매수" : value < 0 ? "순매도" : "순매수";

  return (
    <div className={styles.cell}>
      <span className={styles.cellTop}>
        <span className={styles.label} aria-hidden="true">
          {label}
        </span>
        <span className={styles.srOnly}>{`${full} ${flowWord} `}</span>
        <span
          className={`${styles.cellValue} ${styles.piece} numeric ${toneClass(
            value
          )}`}
        >
          {formatFlowCompact(value, true)}
        </span>
      </span>
      {/* 증감·연속은 각각 nowrap 조각 — 열이 좁으면(430px 뷰포트) 조각 사이에서만
          접혀 "+3624억" / "2일" 두 줄이 된다. 숫자 중간이 쪼개지지 않게. */}
      <span className={styles.cellSub}>
        {change !== null ? (
          <span className={`${styles.piece} numeric`}>
            <span className={styles.srOnly}>{`${basisLabel} 대비 `}</span>
            {formatFlowCompact(change, true)}
          </span>
        ) : null}
        {streak !== null ? (
          <span className={`${styles.piece} numeric`}>
            <span className={styles.srOnly}>{` ${flowWord} `}</span>
            {formatStreak(streak)}
            <span className={styles.srOnly}> 연속</span>
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * 홈 코스피/코스닥 카드의 거래대금·수급 보조 블록 (Phase 86).
 *
 * 상세 「거래대금 · 수급」(§69·§70)과 같은 스냅샷을 카드 폭에 압축한 것 —
 * 거래대금 한 줄 + 개·외·기 3열(상단 순매수 금액, 하단 전일 같은 시각 대비 증감과
 * 같은 부호가 이어진 거래일 수). **KIS 추가 호출 0**(저장된 스냅샷만).
 *
 * 폭 근거(§86 실측): 가장 좁은 지점은 360px이 아니라 **430px 뷰포트**다 —
 * 홈 그리드가 400px에서 2열로 바뀌며 카드 내부가 302px → 169px로 줄고, 3열이면
 * 열당 53.7px뿐이다. 그래서 라벨을 「개·외·기」 1자로 줄이고(원래 이름은 `.srOnly`로
 * 남긴다) 금액은 쉼표 없는 `formatFlowCompact`를 쓴다. 실데이터 6개는 전부 들어가고
 * 9,999억대와 20일 연속이 겹치는 극단값만 한 줄 넘치는데, `nowrap`을 걸지 않아
 * 잘림 없이 카드 높이만 늘어난다.
 *
 * 색상은 순매수 금액에만 준다 — 지수 등락률이 카드의 대표 색상이어야 하므로
 * 거래대금 줄과 하단 증감·연속은 무채색 tertiary(§85 DXY 보조줄 관례).
 */
export function IndexFlowNote({ flow }: { flow: HomeIndexFlow }) {
  const { trading, investors, basisLabel } = flow;

  return (
    <div className={styles.block}>
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

      {investors !== null ? (
        <div className={styles.grid}>
          {investors.map((investor) => (
            <InvestorCell
              key={investor.label}
              investor={investor}
              basisLabel={basisLabel}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
