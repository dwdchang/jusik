import {
  fetchKisOverseasDailyByCode,
  fetchKisStockSnapshot,
} from "@/lib/api/kis/client";
import {
  GLOBAL_TABLE_ROUND_MINUTES,
  GLOBAL_TABLE_ROUND_WINDOW_MINUTES,
  KIS_GLOBAL_TABLE_SECTIONS,
  type GlobalTableItemDef,
} from "@/lib/api/kis/constants";
import type {
  KisOverseasDailyResponse,
  KisStockPriceOutput,
} from "@/lib/api/kis/types";
import { getMarketDetail, type StoredGlobalTable } from "@/lib/market/store";
import type { GlobalTableRow, GlobalTableSection } from "@/types/indices";
import { applyKisSign, parseNum, resolveDirection } from "./kisMapper";

/**
 * 글로벌 지표 조립 — plan.md §88 · §89(5구획 27종으로 재편).
 * 카탈로그(KIS_GLOBAL_TABLE_SECTIONS) 순서대로 항목별 값을 모아 구획·행으로 만든다.
 * 항목 단위로 실패를 격리하고, 실패한 항목은 직전 스냅샷의 같은 행을 이어받는다 —
 * 하루 3회차만 갱신하므로 한 번의 실패로 행이 사라지면 최대 반나절 빈 자리가 남는다.
 *
 * **§89에서 구획 id가 바뀌었다**(`oil`·`preciousMetals`·`baseMetals` → `highlights`·`metals`).
 * 이어받기는 `id + label`로 찾으므로 배포 후 첫 회차에는 새 id의 이어받을 값이 없다 —
 * 그 회차에 새로 받으면 해소되고, 실패하면 그 항목만 빠진다.
 */

/**
 * 지금이 표 갱신 회차인지 — 09:00·15:40·18:15(KST)에서 시작하는 창 안이면 true.
 * 회차 시각을 놓치면 다음 창까지 값이 낡으므로 발화 지연을 창으로 흡수한다.
 */
export function isGlobalTableRound(now: Date = new Date()): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  return GLOBAL_TABLE_ROUND_MINUTES.some(
    (start) =>
      minutes >= start && minutes < start + GLOBAL_TABLE_ROUND_WINDOW_MINUTES
  );
}

/** output2 최신 행의 기준일 — 권역마다 다르므로 행마다 따로 담는다 */
function latestBasDt(raw: KisOverseasDailyResponse): string {
  const dates = (raw.output2 ?? [])
    .map((row) => row.stck_bsop_date)
    .filter((basDt): basDt is string => typeof basDt === "string")
    .sort();

  return dates.at(-1) ?? "";
}

/** 카탈로그에서 그대로 오는 표기 정보 — 값 출처마다 반복하지 않도록 분리 */
function rowLabels(def: GlobalTableItemDef) {
  return {
    label: def.label,
    unit: def.unit,
    flag: def.flag,
    decimals: def.decimals,
  };
}

/** 해외 기간별시세 응답 → 표 1행. output1이 비면 output2 최신 종가로 떨어진다. */
function rowFromOverseas(
  def: GlobalTableItemDef,
  raw: KisOverseasDailyResponse
): GlobalTableRow {
  const output1 = raw.output1;
  const basDt = latestBasDt(raw);

  const latestClose = (raw.output2 ?? [])
    .filter((row) => row.stck_bsop_date === basDt)
    .map((row) => parseNum(row.ovrs_nmix_prpr))
    .find((close) => close > 0);

  const close = output1?.ovrs_nmix_prpr
    ? parseNum(output1.ovrs_nmix_prpr)
    : (latestClose ?? 0);

  if (close <= 0) {
    // rt_cd=0이면서 값이 0으로 오는 계열이 있다(S 카테고리 코드를 N에 넣은 경우 등) —
    // 0을 그대로 저장하면 표에 "0.00 (0.00%)"이 남으므로 실패로 다룬다
    throw new Error(`empty close for ${def.label}`);
  }

  const changeRate = applyKisSign(
    parseNum(output1?.prdy_ctrt),
    output1?.prdy_vrss_sign
  );

  return {
    ...rowLabels(def),
    close,
    changeRate,
    direction: resolveDirection(changeRate),
    basDt,
  };
}

/**
 * 국내주식 현재가 응답 → 표 1행 (국내 금).
 * 이 응답에는 영업일 필드가 없어 기준일은 같은 회차 코스피 기준일을 받아 쓴다.
 */
function rowFromDomestic(
  def: GlobalTableItemDef,
  output: KisStockPriceOutput,
  basDt: string
): GlobalTableRow {
  const close = parseNum(output.stck_prpr);

  if (close <= 0) {
    throw new Error(`empty close for ${def.label}`);
  }

  const changeRate = applyKisSign(
    parseNum(output.prdy_ctrt),
    output.prdy_vrss_sign
  );

  return {
    ...rowLabels(def),
    close,
    changeRate,
    direction: resolveDirection(changeRate),
    basDt,
  };
}

/** 항목 1개 조회 — 출처별 분기. dxyPair·detail은 KIS를 다시 부르지 않는다. */
async function fetchRow(
  def: GlobalTableItemDef,
  context: {
    fxRawByCode: ReadonlyMap<string, KisOverseasDailyResponse>;
    domesticBasDt: string;
  }
): Promise<GlobalTableRow> {
  const { source } = def;

  switch (source.kind) {
    case "overseas":
      return rowFromOverseas(
        def,
        await fetchKisOverseasDailyByCode(source.marketDivCode, source.code)
      );

    case "dxyPair": {
      const raw = context.fxRawByCode.get(source.code);
      if (raw === undefined) {
        // 달러 인덱스 태스크가 이 통화쌍에서 실패한 회차 — 표를 위해 다시 부르지 않고
        // 직전 회차 행을 이어받게 둔다(재사용이 목적이므로 추가 호출은 하지 않는다)
        throw new Error(`dxy pair response unavailable: ${source.code}`);
      }
      return rowFromOverseas(def, raw);
    }

    case "detail": {
      const stored = await getMarketDetail(source.detailKey);
      if (stored === null) {
        throw new Error(`market:detail:${source.detailKey} unavailable`);
      }
      return {
        ...rowLabels(def),
        close: stored.snapshot.close,
        changeRate: stored.snapshot.changeRate,
        direction: stored.snapshot.direction,
        basDt: stored.snapshot.basDt,
      };
    }

    case "domestic":
      return rowFromDomestic(
        def,
        await fetchKisStockSnapshot(source.code),
        context.domesticBasDt
      );
  }
}

/** 직전 스냅샷에서 같은 항목 행 찾기 — 라벨이 카탈로그 안에서 유일한 식별자다 */
function previousRow(
  previous: StoredGlobalTable | null,
  sectionId: string,
  label: string
): GlobalTableRow | undefined {
  return previous?.sections
    .find((section) => section.id === sectionId)
    ?.rows.find((row) => row.label === label);
}

export interface GlobalTableBuildResult {
  sections: GlobalTableSection[];
  /** 이 회차에 새로 받은 행 수 */
  fresh: number;
  /** 직전 회차 값을 이어받은 행 수 */
  stale: number;
  /** 이어받을 값도 없어 표에서 빠진 항목 라벨 */
  dropped: string[];
}

export async function buildGlobalTableSections(context: {
  /** 달러 인덱스 태스크가 받아온 통화쌍 원응답 — EUR·JPY·GBP 재사용(추가 호출 0) */
  fxRawByCode: ReadonlyMap<string, KisOverseasDailyResponse>;
  /** 국내 금 기준일로 쓸 같은 회차 코스피 기준일 "YYYYMMDD" */
  domesticBasDt: string;
  previous: StoredGlobalTable | null;
}): Promise<GlobalTableBuildResult> {
  const sections: GlobalTableSection[] = [];
  const dropped: string[] = [];
  let fresh = 0;
  let stale = 0;

  for (const sectionDef of KIS_GLOBAL_TABLE_SECTIONS) {
    const rows: GlobalTableRow[] = [];

    // 순차 조회 — KIS 유량 배려 (§28 달러 인덱스와 같은 방식)
    for (const def of sectionDef.items) {
      try {
        rows.push(await fetchRow(def, context));
        fresh += 1;
      } catch (error) {
        console.error(
          `[job] global table item failed (${sectionDef.id}/${def.label}):`,
          error
        );

        const carried = previousRow(context.previous, sectionDef.id, def.label);
        if (carried === undefined) {
          dropped.push(`${sectionDef.id}/${def.label}`);
          continue;
        }

        rows.push({
          ...carried,
          // 이어받은 값의 나이는 이 회차가 아니라 직전 값의 나이다
          staleAt: carried.staleAt ?? context.previous?.fetchedAt,
        });
        stale += 1;
      }
    }

    sections.push({
      id: sectionDef.id,
      title: sectionDef.title,
      note: sectionDef.note,
      rows,
    });
  }

  return { sections, fresh, stale, dropped };
}
