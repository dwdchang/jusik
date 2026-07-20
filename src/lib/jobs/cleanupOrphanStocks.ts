import { getAllowedEmails } from "@/lib/auth/allowedEmails";
import { getRedis } from "@/lib/redis/client";
import {
  collectHoldings,
  collectWatchlists,
  errorMessage,
  unionSymbolCodes,
} from "./collectTargets";
import { STOCK_KEY_PREFIX, stockInfoKey, stockKey } from "@/lib/market/store";
import { stockHistoryKey } from "@/lib/holdings/stockHistory";
import { disclosuresKey, newsKey } from "@/lib/feeds/store";
import { disclosureCursorKey, marketWarnKey } from "@/lib/alerts/store";

/**
 * 고아 종목 키 정리 잡 — Phase 49 (plan.md §49).
 *
 * `market:stock:{code}` 계열 per-종목 키는 "전 사용자 보유+관심 합집합"으로만 생성된다
 * (refreshMarketData/refreshFeeds). 어떤 사용자도 더 이상 갖고 있지 않게 된 종목의 키는
 * 갱신 잡이 다시 쓰지 않아 고아로 남는다. 이 잡이 매일 새벽 3시(KST)에 고아 키를 수거한다.
 * KIS를 호출하지 않고 Redis만 읽고 지우므로 시세 호출창(09:00~18:40) 가드는 적용하지 않는다.
 *
 * 안전장치(사용자 승인):
 * - 대량 삭제 방어: 허용 이메일 전체의 보유·관심 읽기가 하나라도 실패하면(또는 허용 이메일이
 *   0이면) 이번 회차 삭제를 통째로 skip한다. 일시 장애로 "살아있는 집합"이 비어 전 종목을
 *   지우는 참사를 막는다.
 * - 경합 허용: 정리 직후 어떤 사용자가 그 종목을 다시 추가하면 다음 거래일 시세 잡이 스냅샷을
 *   복구한다. 그 사이 화면은 "데이터 없음"으로 보일 뿐 오작동은 아니다.
 */

const SCAN_COUNT = 500;

/**
 * 종목 하나가 고아일 때 함께 지우는 per-종목 키 패밀리 (전부 같은 합집합으로만 생성됨).
 * 각 키 빌더를 소유 store에서 import해 포맷 드리프트를 막는다.
 * 제외: `alerts:dividend:sent:{code}:{payDate}`는 payDate가 붙은 복합 키이고 자체 TTL(2일)로
 * 자동 정리되므로 대상에서 뺀다.
 */
function orphanKeysFor(code: string): string[] {
  return [
    stockKey(code),
    stockInfoKey(code),
    stockHistoryKey(code),
    disclosuresKey(code),
    newsKey(code),
    disclosureCursorKey(code),
    marketWarnKey(code),
  ];
}

export interface CleanupOrphanStocksReport {
  ok: boolean;
  /** 안전장치로 삭제를 건너뛴 사유 (있으면 삭제 미수행) */
  skipped?: string;
  /** 살아있는 종목 수 (보유+관심 합집합) */
  liveCount?: number;
  /** SCAN으로 확인한 기존 market:stock 키 수 */
  scannedCount?: number;
  /** 고아로 판정된 종목 수 */
  orphanCount?: number;
  /** 실제로 삭제된 키 총수 (종목당 최대 7개, 미존재 키는 제외) */
  deletedKeys?: number;
  /** 고아 종목코드 (로그·점검용) */
  orphanCodes?: string[];
  error?: string;
}

export async function cleanupOrphanStocks(
  trigger: string
): Promise<CleanupOrphanStocksReport> {
  try {
    const redis = getRedis();

    // 1. 살아있는 집합 계산 (기존 갱신 잡과 동일한 수집 경로 재사용)
    const [holdingsByEmail, watchlists] = await Promise.all([
      collectHoldings(),
      collectWatchlists(),
    ]);

    // 대량 삭제 방어 — 읽기 실패가 하나라도 있으면 이번 회차 삭제 skip
    const allowedCount = getAllowedEmails().length;
    const watchFailed = watchlists.results.some((row) => !row.ok);
    // collectHoldings는 실패 이메일을 조용히 건너뛰므로, 읽힌 수가 허용 수보다 적으면 실패로 본다
    const holdingsFailed = holdingsByEmail.size !== allowedCount;

    if (allowedCount === 0 || watchFailed || holdingsFailed) {
      const reason =
        allowedCount === 0
          ? "no allowed emails (misconfiguration guard)"
          : "holdings/watchlist read failure (mass-delete guard)";
      console.warn(`[job] cleanupOrphanStocks skipped: ${reason}`);
      return { ok: true, skipped: reason };
    }

    const liveSet = new Set(
      unionSymbolCodes(holdingsByEmail, watchlists.byEmail)
    );

    // 2. 기존 market:stock:* 키를 SCAN해 존재하는 종목코드 수집 (중복 제거)
    const existingCodes = new Set<string>();
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, {
        match: `${STOCK_KEY_PREFIX}*`,
        count: SCAN_COUNT,
      });
      cursor = next;
      for (const key of keys) {
        existingCodes.add(key.slice(STOCK_KEY_PREFIX.length));
      }
    } while (cursor !== "0");

    // 3. 고아 = 존재하나 살아있는 집합에 없는 종목
    const orphanCodes = [...existingCodes].filter(
      (code) => !liveSet.has(code)
    );

    // 4. 고아 종목의 per-종목 키 패밀리 일괄 삭제 (DEL은 멱등 — 미존재 키는 무시)
    let deletedKeys = 0;
    for (const code of orphanCodes) {
      deletedKeys += await redis.del(...orphanKeysFor(code));
    }

    console.log(
      `[job] cleanupOrphanStocks(${trigger}): live=${liveSet.size} scanned=${existingCodes.size} orphans=${orphanCodes.length} deletedKeys=${deletedKeys}`
    );

    return {
      ok: true,
      liveCount: liveSet.size,
      scannedCount: existingCodes.size,
      orphanCount: orphanCodes.length,
      deletedKeys,
      orphanCodes,
    };
  } catch (error) {
    console.error("[job] cleanupOrphanStocks failed:", error);
    return { ok: false, error: errorMessage(error) };
  }
}
