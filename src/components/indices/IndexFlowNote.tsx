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

/**
 * 연속 거래일 수 — `2D` / 창을 소진하면 `20D+` (§86.1).
 * 「일」(한글 1자 = 폰트 크기만큼의 폭)을 라틴 `D`로 바꿔 폭을 아낀다.
 */
function formatStreak(streak: { days: number; capped: boolean }): string {
  return `${streak.days}D${streak.capped ? "+" : ""}`;
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

  // 값이 없는 칸도 자리를 지켜야 4행이 열끼리 어긋나지 않는다
  return (
    <div className={styles.cell}>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <span className={styles.srOnly}>{`${full} ${flowWord} `}</span>
      <span className={`${styles.cellValue} numeric ${toneClass(value)}`}>
        {formatFlowCompact(value, true)}
      </span>
      <span className={`${styles.cellSub} numeric`}>
        {change !== null ? (
          <>
            <span className={styles.srOnly}>{`${basisLabel} 대비 `}</span>
            {formatFlowCompact(change, true)}
          </>
        ) : (
          "—"
        )}
      </span>
      <span className={`${styles.cellSub} numeric`}>
        {streak !== null ? (
          <>
            <span className={styles.srOnly}>{` ${flowWord} `}</span>
            {formatStreak(streak)}
            <span className={styles.srOnly}> 거래일 연속</span>
          </>
        ) : (
          "—"
        )}
      </span>
    </div>
  );
}

/**
 * 홈 코스피/코스닥 카드의 거래대금·수급 보조 블록 (Phase 86).
 *
 * 상세 「거래대금 · 수급」(§69·§70)과 같은 스냅샷을 카드 폭에 압축한 것 —
 * 거래대금 한 줄 + 개·외·기 3열 × 4행(라벨 / 순매수 금액 / 전일 같은 시각 대비 증감 /
 * 같은 부호가 이어진 거래일 수). **KIS 추가 호출 0**(저장된 스냅샷만).
 *
 * 폭 근거(§86 실측 → §86.1 실기기 정정): 가장 좁은 지점은 **뷰포트 400~402px**이다 —
 * 홈 그리드가 400px에서 2열로 바뀌는 바로 위 구간이라 카드 내부가 332px → 155px로
 * 급감하고 3열이면 **열당 49px**뿐이다(아이폰 17이 정확히 402px). 390px 이하는 1열이라
 * 오히려 넉넉하고, 430px·480px은 이보다 넓다.
 *
 * §86 최초안은 라벨을 값과 같은 줄에 뒀다가 실기기에서 `기 / -1111억 / -1188억 / 3일`로
 * 네 줄이 됐다(`기 -1111억` 55.3px > 49px). 폰트를 줄이는 방향으로는 못 풀린다 —
 * 억 4자리 증감(40px) + 연속(14px)이 한 줄에 들어가려면 54px이 필요해서, 10px까지
 * 낮춰도 63.9px로 넘쳤다. 그래서 **라벨을 열 머리 행으로 올려** 각 칸이 값 하나만
 * 갖게 했다(가장 긴 칸 40.6px, 여유 8px). 라벨은 11px 그대로, 값·증감·연속만 10.5px.
 *
 * 색상은 순매수 금액에만 준다 — 지수 등락률이 카드의 대표 색상이어야 하므로
 * 거래대금 줄과 증감·연속 행은 무채색 tertiary(§85 DXY 보조줄 관례).
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
