import { unzipSync } from "fflate";

/**
 * 핫종목 유니버스 — KIS 종목 마스터 파일 (plan.md §14.1-3).
 * 공개 다운로드(인증 불필요) zip을 받아 EUC-KR 고정폭 레코드를 파싱한다.
 * 증권그룹코드 ST(주권)만 남기고 스팩(종목명 "스팩" 포함)을 제외한다.
 *
 * 주의: 그룹코드 오프셋은 tail[1:3] — 공식 파이썬 샘플의 [0:2]와
 * 1바이트 다르다 (2026-07-11 원시 바이트 실측 우선, plan.md §14.1).
 */

const MASTER_BASE_URL = "https://new.real.download.dws.co.kr/common/master";

/** 레코드 뒤쪽 고정폭 필드 블록의 바이트 길이 (2026-07-11 실측) */
const MASTER_TAIL_BYTES = { KOSPI: 228, KOSDAQ: 222 } as const;

/** 마스터 파일은 수 MB — KIS API보다 여유 있게 잡는다 */
const MASTER_FETCH_TIMEOUT_MS = 30_000;

export type UniverseMarket = "KOSPI" | "KOSDAQ";

/**
 * 증권그룹코드 (Phase 46) — ST(주권) 외에 배당/분배가 있는 상품 계열.
 * EF=ETF · RT=리츠(부동산투자회사) · IF=인프라펀드. ETN(EN)은 채무증권이라 제외.
 */
export type UniverseGroup = "ST" | "EF" | "RT" | "IF";

/** 배당상품 그룹 — 배당률 순위 "배당상품" 탭 대상 (Phase 46) */
export const DIVIDEND_PRODUCT_GROUPS: ReadonlySet<UniverseGroup> = new Set([
  "EF",
  "RT",
  "IF",
]);

export interface UniverseStock {
  /** 단축코드 — KOSDAQ 신형은 영숫자 6자리(예: 0001A0)일 수 있다 */
  code: string;
  name: string;
  market: UniverseMarket;
  /** 증권그룹코드 — ST=주식, EF=ETF, RT=리츠, IF=인프라펀드 (Phase 46) */
  group: UniverseGroup;
}

async function downloadMasterRecords(
  market: UniverseMarket
): Promise<Uint8Array[]> {
  const fileName = `${market.toLowerCase()}_code.mst`;
  const response = await fetch(`${MASTER_BASE_URL}/${fileName}.zip`, {
    cache: "no-store",
    signal: AbortSignal.timeout(MASTER_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`master ${fileName}.zip HTTP ${response.status}`);
  }

  const unzipped = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const entryName = Object.keys(unzipped).find((name) =>
    name.toLowerCase().endsWith(".mst")
  );

  if (!entryName) {
    throw new Error(`master ${fileName}.zip has no .mst entry`);
  }

  // EUC-KR 멀티바이트 종목명 때문에 문자열이 아닌 바이트 단위로 레코드를 나눈다
  const bytes = unzipped[entryName];
  const records: Uint8Array[] = [];
  let start = 0;

  for (let i = 0; i <= bytes.length; i += 1) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      let end = i;
      if (end > start && bytes[end - 1] === 0x0d) {
        end -= 1;
      }
      if (end > start) {
        records.push(bytes.subarray(start, end));
      }
      start = i + 1;
    }
  }

  return records;
}

/** 파싱 대상 그룹코드 판별 — 원시 2글자를 UniverseGroup으로 좁힌다 */
function toUniverseGroup(raw: string): UniverseGroup | null {
  return raw === "ST" || raw === "EF" || raw === "RT" || raw === "IF"
    ? raw
    : null;
}

function parseMasterRecords(
  records: Uint8Array[],
  market: UniverseMarket,
  allowedGroups: ReadonlySet<UniverseGroup>
): UniverseStock[] {
  const decoder = new TextDecoder("euc-kr");
  const tailBytes = MASTER_TAIL_BYTES[market];
  const stocks: UniverseStock[] = [];

  for (const record of records) {
    if (record.length <= tailBytes) {
      continue;
    }

    const front = record.subarray(0, record.length - tailBytes);
    const tail = record.subarray(record.length - tailBytes);

    // front: [0:9] 단축코드 / [9:21] 표준코드 / [21:] 종목명
    const group = toUniverseGroup(decoder.decode(tail.subarray(1, 3)));
    if (!group || !allowedGroups.has(group)) {
      continue;
    }

    const code = decoder.decode(front.subarray(0, 9)).trim();
    const name = decoder.decode(front.subarray(21)).trim();

    // 스팩은 주권(ST)에만 존재하지만 안전하게 항상 제외한다
    if (!code || !name || name.includes("스팩")) {
      continue;
    }

    stocks.push({ code, name, market, group });
  }

  return stocks;
}

async function fetchUniverse(
  allowedGroups: ReadonlySet<UniverseGroup>
): Promise<UniverseStock[]> {
  const [kospi, kosdaq] = await Promise.all([
    downloadMasterRecords("KOSPI"),
    downloadMasterRecords("KOSDAQ"),
  ]);

  const stocks = [
    ...parseMasterRecords(kospi, "KOSPI", allowedGroups),
    ...parseMasterRecords(kosdaq, "KOSDAQ", allowedGroups),
  ];

  stocks.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return stocks;
}

const HOT_STOCK_GROUPS: ReadonlySet<UniverseGroup> = new Set(["ST"]);

/** 배당률 순위 유니버스 — 일반종목(ST) + 배당상품(EF/RT/IF) (Phase 46) */
const DIVIDEND_RANKING_GROUPS: ReadonlySet<UniverseGroup> = new Set([
  "ST",
  ...DIVIDEND_PRODUCT_GROUPS,
]);

/**
 * 코스피+코스닥 보통주(ST) 유니버스 — 스팩 제외, 약 2,650종목 (§14.1-4).
 * 커서 이어받기의 결정성을 위해 종목코드 오름차순으로 정렬해 반환한다.
 *
 * 주의(Phase 46): 이 함수는 핫종목 잡·종목명 검색(market:stockMaster)·배당률
 * 순위(일반종목) 3곳이 공유한다. ST-only 동작을 바꾸면 핫종목·검색이 ETF로
 * 오염되므로, 배당률 순위 잡은 아래 fetchDividendRankingUniverse를 쓴다.
 */
export async function fetchHotStockUniverse(): Promise<UniverseStock[]> {
  return fetchUniverse(HOT_STOCK_GROUPS);
}

/**
 * 배당률 순위 유니버스 — 일반종목(ST)과 배당상품(EF/RT/IF)을 한 번의 다운로드로
 * 함께 받아 코드 오름차순으로 반환한다 (Phase 46). 각 레코드의 `group`으로
 * 잡에서 일반종목/배당상품 두 순위로 분류한다. ETN(EN)은 채무증권이라 제외.
 */
export async function fetchDividendRankingUniverse(): Promise<UniverseStock[]> {
  return fetchUniverse(DIVIDEND_RANKING_GROUPS);
}
