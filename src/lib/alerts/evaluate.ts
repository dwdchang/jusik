import { formatChangeRate } from "@/lib/format/change";
import { formatKrw } from "@/lib/format/krw";
import { getMarketDetails, type StoredStockSnapshot } from "@/lib/market/store";
import { sendPushToEmail } from "@/lib/push/send";
import type { Holding } from "@/types/holdings";
import {
  getMutedSymbols,
  getStockPeaks,
  isInCooldown,
  saveStockPeaks,
  setCooldown,
  type StockPeak,
  type StockPeakMap,
} from "./store";

/**
 * 시세 알림 조건 판정·발송 — Phase 10 2단계 (plan.md §10.2, §10.6).
 * 시세 갱신 잡(refreshMarketData)의 evaluateAlertsHook에서만 호출된다.
 * 거래일 가드는 호출 측이 담당하고, 여기서는 판정→신고가 갱신→발송→쿨다운만 한다.
 */

/** 조건 1 — 매입가 대비 종목 수익률 하한(%) */
const LOSS_RATE_THRESHOLD = -10;
/** 조건 2 — 신고가 대비 하락률 상한(%) */
const PEAK_DROP_THRESHOLD = 10;
/** 조건 3 — 당일 지수 등락률 하한(%) */
const INDEX_DROP_THRESHOLD = -2;
/** 조건 3 — 당일 종목 등락률 하한(%) */
const STOCK_DROP_THRESHOLD = -12;

interface IndexState {
  close: number;
  changeRate: number;
}

export interface AlertIndexContext {
  kospi: IndexState | null;
  kosdaq: IndexState | null;
}

/**
 * KIS 소속 시장명(rprs_mrkt_kor_name — 실측값 "KOSPI"·"KOSPI200"·"KOSDAQ" 등)
 * → 조건 3 판정에 쓸 지수. 판별 불가(null 포함)면 코스피로 폴백한다.
 */
export function marketIndexOf(
  marketName: string | null
): keyof AlertIndexContext {
  const upper = (marketName ?? "").toUpperCase();
  return upper.includes("KOSDAQ") || upper.includes("코스닥")
    ? "kosdaq"
    : "kospi";
}

export interface HoldingEvaluation {
  /** 갱신(또는 초기화)된 신고가 — 저장은 호출 측이 모아서 수행 */
  nextPeak: StockPeak;
  /** 충족된 조건 설명 (비면 알림 없음) */
  reasons: string[];
}

/** 보유종목 1건 판정 — 신고가 갱신과 조건 3종(OR) 평가 (§10.2) */
export function evaluateHolding(input: {
  holding: Holding;
  snapshot: StoredStockSnapshot;
  peak: StockPeak | undefined;
  indexes: AlertIndexContext;
}): HoldingEvaluation {
  const { holding, snapshot, peak, indexes } = input;
  const price = snapshot.price;
  const now = new Date().toISOString();

  // 신고가 추적 — 최초엔 현재가로 초기화, 이후 현재가가 높아질 때만 덮어쓰기
  const nextPeak: StockPeak =
    peak === undefined || price > peak.peakPrice
      ? {
          peakPrice: price,
          kospi: indexes.kospi?.close ?? peak?.kospi ?? 0,
          kosdaq: indexes.kosdaq?.close ?? peak?.kosdaq ?? 0,
          updatedAt: now,
        }
      : peak;

  const reasons: string[] = [];

  // 조건 1 — 매입가 대비 수익률 ≤ −10% (totalCost 모델, §13.1)
  if (holding.totalCost > 0 && holding.quantity > 0) {
    const returnRate =
      ((price * holding.quantity - holding.totalCost) / holding.totalCost) *
      100;
    if (returnRate <= LOSS_RATE_THRESHOLD) {
      reasons.push(`매입가 대비 ${formatChangeRate(returnRate)}`);
    }
  }

  // 조건 2 — 신고가 대비 하락률 ≥ 10% (신고가 갱신 직후엔 0%라 미충족)
  if (nextPeak.peakPrice > 0) {
    const dropRate = ((nextPeak.peakPrice - price) / nextPeak.peakPrice) * 100;
    if (dropRate >= PEAK_DROP_THRESHOLD) {
      reasons.push(
        `신고가 ${formatKrw(nextPeak.peakPrice)} 대비 −${dropRate.toFixed(1)}%`
      );
    }
  }

  // 조건 3 — 소속 시장 지수 ≤ −2% AND 종목 등락률 ≤ −12%
  const indexKey = marketIndexOf(snapshot.marketName);
  const index = indexes[indexKey];
  if (
    index !== null &&
    index.changeRate <= INDEX_DROP_THRESHOLD &&
    snapshot.changeRate <= STOCK_DROP_THRESHOLD
  ) {
    const indexLabel = indexKey === "kosdaq" ? "코스닥" : "코스피";
    reasons.push(
      `${indexLabel} ${formatChangeRate(index.changeRate)} · 종목 ${formatChangeRate(snapshot.changeRate)} 동반 하락`
    );
  }

  return { nextPeak, reasons };
}

export interface PriceAlertsReport {
  /** 스냅샷이 있어 판정한 보유종목 수 */
  evaluated: number;
  /** 푸시 발송에 성공한 종목 수 */
  sent: number;
  /** 조건 충족했지만 쿨다운으로 건너뛴 종목 수 */
  cooldownSkipped: number;
  /** 조건 충족했지만 종목별 알림 꺼짐으로 건너뛴 종목 수 */
  mutedSkipped: number;
}

/**
 * 전체 사용자 보유종목 시세 알림 파이프라인.
 * 지수 등락률은 방금 저장된 market:detail:{kospi|kosdaq}를 MGET 1회로 읽는다 (§10.6).
 * 이메일 단위 실패 격리 — 한 사용자 오류가 다른 사용자 발송을 막지 않는다.
 */
export async function evaluatePriceAlerts(context: {
  snapshots: Map<string, StoredStockSnapshot>;
  holdingsByEmail: Map<string, Holding[]>;
}): Promise<PriceAlertsReport> {
  const report: PriceAlertsReport = {
    evaluated: 0,
    sent: 0,
    cooldownSkipped: 0,
    mutedSkipped: 0,
  };

  const [kospiDetail, kosdaqDetail] = await getMarketDetails([
    "kospi",
    "kosdaq",
  ]);
  const indexes: AlertIndexContext = {
    kospi: kospiDetail
      ? {
          close: kospiDetail.snapshot.close,
          changeRate: kospiDetail.snapshot.changeRate,
        }
      : null,
    kosdaq: kosdaqDetail
      ? {
          close: kosdaqDetail.snapshot.close,
          changeRate: kosdaqDetail.snapshot.changeRate,
        }
      : null,
  };

  for (const [email, holdings] of context.holdingsByEmail) {
    if (holdings.length === 0) {
      continue;
    }

    try {
      const [peaks, muted] = await Promise.all([
        getStockPeaks(email),
        getMutedSymbols(email),
      ]);
      const mutedSet = new Set(muted);

      // 보유 중인 종목만 유지 — 매도한 종목의 신고가는 자연 정리된다
      const nextPeaks: StockPeakMap = {};
      const triggered: Array<{ holding: Holding; reasons: string[] }> = [];

      for (const holding of holdings) {
        const snapshot = context.snapshots.get(holding.symbolCode);
        if (snapshot === undefined) {
          const kept = peaks[holding.symbolCode];
          if (kept !== undefined) {
            nextPeaks[holding.symbolCode] = kept;
          }
          continue;
        }

        report.evaluated += 1;
        const { nextPeak, reasons } = evaluateHolding({
          holding,
          snapshot,
          peak: peaks[holding.symbolCode],
          indexes,
        });
        nextPeaks[holding.symbolCode] = nextPeak;

        if (reasons.length > 0) {
          triggered.push({ holding, reasons });
        }
      }

      if (JSON.stringify(nextPeaks) !== JSON.stringify(peaks)) {
        await saveStockPeaks(email, nextPeaks);
      }

      for (const { holding, reasons } of triggered) {
        const symbolCode = holding.symbolCode;

        if (mutedSet.has(symbolCode)) {
          report.mutedSkipped += 1;
          continue;
        }
        if (await isInCooldown(email, symbolCode)) {
          report.cooldownSkipped += 1;
          continue;
        }

        const name = holding.name.trim() === "" ? symbolCode : holding.name;
        const price = context.snapshots.get(symbolCode)?.price ?? 0;
        const sendReport = await sendPushToEmail(email, {
          title: `종목 알림 — ${name}`,
          body: `현재가 ${formatKrw(price)} · ${reasons.join(" / ")}`,
          url: "/holdings",
          tag: `stock-alert-${symbolCode}`,
        });

        // 실제 도달한 기기가 있을 때만 쿨다운 — 전송 실패 시 다음 회차에 재시도
        if (sendReport.sent > 0) {
          await setCooldown(email, symbolCode);
          report.sent += 1;
        }
      }
    } catch (error) {
      console.error(`[alerts] price alert failed (${email}):`, error);
    }
  }

  return report;
}
