# jusik 최종 구현 계획서 — 공공 API 연동 국내 지수 대시보드

> **문서 상태:** 검토·최종 승인 대기  
> **기준 문서:** [`research.md`](./research.md) (기술 의사결정 100% 반영)  
> **스택:** Next.js 16.2.6 · React 19.2.4 · Recharts · CSS Modules (Tailwind 없음)  
> **제약:** 본 문서는 **절차·구조 스니펫만** 포함. 승인 전 **`.tsx` / `.css` 등 소스 파일 생성·수정 금지**.

---

## 요약 (현재 상태, 2026-07-04)

| Phase | 상태 |
|-------|------|
| 1 — 환경·API 클라이언트·Raw 파이프 | ✅ 완료 (data-go-kr 경로, 이후 KIS로 대체) |
| 2 — 타입·Mapper·getDashboardData·캐시 | ✅ 완료 (KIS 경로로 전환) |
| 3 — UI(Server)·스타일·Recharts | ✅ 완료 |
| 4 — 운영 갱신(cron)·polish | ✅ 완료 (14:00 cron은 §4.7에서 제거, 10분 자동 캐시로 대체) |
| 5 — KIS 마이그레이션 문서화·레거시 정리 | ✅ 완료 |
| 6 — KIS 토큰 캐시 외부 저장소(Upstash Redis) 전환 | ⚠️ 6-1~6-5 완료, **6-6 남음** |
| 7 — Google OAuth 로그인 및 접근 제한 | ✅ 완료 (실제 Google 로그인 플로우 검증 완료, 2026-07-04) |
| 8 — 시간대별 캐시 최적화 (KIS 마감 후 갱신 패턴 반영) | ⚠️ 8-1~8-5 로컬 구현·검증 완료, **8-6 프로덕션 배포 후 확인 남음** |

**남은 작업 (6-6):** 프로덕션(Vercel) 배포 후 다중 인스턴스 환경에서 토큰 발급 횟수가 실제로 줄었는지 Vercel 로그로 확인.
**참고 (2026-07-04):** KIS 서버가 7/4~7/5 전산 점검 중이라 이 기간 대시보드에서 "fetch failed"(KIS API 연결 실패)가 발생할 수 있음 — 코드 문제 아님, 점검 종료 후 재확인.

이하는 각 Phase의 상세 계획·근거·작업 단위 원문이다.

---

## 0. 앱 목표 및 완료 정의

### 0.1 핵심 스펙

| # | 스펙 | 구현 방향 (`research.md` 반영) |
|---|------|--------------------------------|
| 1 | KOSPI / KOSDAQ 지수 표시 | 금융위원회 지수시세정보 `getStockMarketIndex`, `idxNm=코스피\|코스닥` |
| 2 | 최근 추이 라인 차트 | Recharts · 최근 **7거래일** (`basDt` 7회 병렬 fetch, 전략 A) |
| 3 | 장 마감 후 일 1회 갱신 | `revalidate: 86400` + `tags: ['indices']` + **평일 14:00 KST cron `revalidateTag`** |
| 4 | CSS Modules | `tokens.css` + `globals.css` + `*.module.css` |

### 0.2 사용자에게 보여줄 데이터 지연 (UI 필수)

- 거래소 **15:30** 장 마감 ≠ 공공 API 반영 시각.
- 공식: **기준 영업일 T → T+1 영업일 13:00 이후** 데이터 개방.
- 푸터 문구(고정): **「지수 데이터는 공공데이터포털 기준 익영업일 오후 1시 이후 반영됩니다.」**
- **`asOf`**: `getDashboardData()` 실행(캐시 miss) 시각 ISO 문자열 → 「화면 갱신: …」 표시.

### 0.3 전체 아키텍처 (구현 시 따라 그릴 그림)

```
.env.local (DATA_GO_KR_SERVICE_KEY)
        │
        ▼
src/lib/api/data-go-kr/client.ts ──fetch──► apis.data.go.kr
        │ raw JSON
        ▼
normalize.ts (ensureItemsArray) + types.ts
        │
        ▼
src/lib/indices/mapper.ts + dates.ts
        │
        ▼
getDashboard.ts (unstable_cache, tags: indices)
        │
        ▼
app/page.tsx [Server] ──props──► IndexDashboard [Server]
                                      ├── IndexCard ×2 [Server]
                                      ├── IndexChartsSection [Server]
                                      │     └── IndexLineChart [Client / dynamic]
                                      └── DataAsOfFooter [Server]

(Phase 4, 선택) GET /api/cron/revalidate-indices → revalidateTag('indices')
```

---

## 1. 환경 변수 및 API 클라이언트 설정 계획

### 1.1 `.env.local` 설정

#### 1.1.1 파일 생성 절차

1. 프로젝트 루트에 `.env.local` 생성 (git에 **커밋하지 않음**).
2. [공공데이터포털](https://www.data.go.kr) → 활용신청 → **금융위원회_지수시세정보** 승인.
3. 마이페이지 → 일반 인증키 **Decoding** 복사 (Encoding은 수동 URL concat 시만).
4. 포털 **미리보기**에서 `resultType=json`, `idxNm=코스피` 호출 성공 확인.

#### 1.1.2 변수 목록

```bash
# .env.local — 예시 (값은 본인 키로 교체)

# 필수: 서버 전용. NEXT_PUBLIC_ 접두사 절대 사용 금지
DATA_GO_KR_SERVICE_KEY=여기에_Decoding_일반인증키

# Phase 4: Vercel Cron용 (선택)
CRON_SECRET=랜덤_긴_문자열
```

| 변수 | 필수 | 노출 | 용도 |
|------|------|------|------|
| `DATA_GO_KR_SERVICE_KEY` | ✅ | 서버 only | `serviceKey` 쿼리 |
| `CRON_SECRET` | Phase 4 | 서버 only | cron Route 인증 |
| `NEXT_PUBLIC_*` | ❌ 금지 | 브라우저 | 인증키 노출 위험 |

#### 1.1.3 `.gitignore` 확인 체크리스트

- [ ] 루트 `.gitignore`에 `.env*` 항목 존재 (현재 프로젝트: **포함됨**).
- [ ] `git status`에 `.env.local` 미표시 확인.
- [ ] README 또는 팀 문서에 「키는 Decoding, URLSearchParams 사용」 명시 (선택).

#### 1.1.4 로컬 검증

```bash
# 구현 Phase 1 후
npm run dev
# Server Component / lib에서만 process.env.DATA_GO_KR_SERVICE_KEY 참조
```

---

### 1.2 `src/lib/api/data-go-kr/` 파일 계획

| 파일 | 책임 |
|------|------|
| `constants.ts` | Base URL, operation path, 타임아웃 ms |
| `types.ts` | Raw envelope·item 타입 |
| `normalize.ts` | `ensureItemsArray`, `assertApiSuccess` |
| `client.ts` | `buildUrl`, `fetchDataGoKr` |

**Base URL (가이드 확인 전 기본값 — `research.md` §3.2):**

```ts
// constants.ts — 스니펫
export const DATA_GO_KR_INDEX_BASE =
  "https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService";

export const OPERATION_STOCK_MARKET_INDEX = "/getStockMarketIndex";

/** 포털 가이드와 불일치 시 이 파일만 수정 */
export const INDEX_NAMES = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
} as const;
```

---

### 1.3 `client.ts` 구조 설계

#### 1.3.1 책임 분리

```
getServiceKey()     → env 검증, 없으면 throw
buildIndexParams()  → URLSearchParams (Decoding 키)
buildIndexUrl()     → base + operation + ?params
fetchDataGoKr()     → fetch + cache options + JSON parse + header 검증
fetchStockMarketIndex() → idxNm, basDt?, numOfRows 공개 API
```

#### 1.3.2 `URLSearchParams` + Decoding 키 (핵심)

```ts
// client.ts — 구조 스니펫 (전체 구현 X)

function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key?.trim()) {
    throw new Error("DATA_GO_KR_SERVICE_KEY is not set");
  }
  return key.trim();
}

export type StockMarketIndexParams = {
  idxNm: string;           // "코스피" | "코스닥"
  pageNo?: number;
  numOfRows?: number;
  basDt?: string;          // "YYYYMMDD", 미지정 = 최신
  resultType?: "json";
};

function buildIndexParams(input: StockMarketIndexParams): URLSearchParams {
  const params = new URLSearchParams({
    serviceKey: getServiceKey(),
    resultType: input.resultType ?? "json",
    pageNo: String(input.pageNo ?? 1),
    numOfRows: String(input.numOfRows ?? 1),
    idxNm: input.idxNm,
  });
  if (input.basDt) params.set("basDt", input.basDt);
  return params;
}

export function buildStockMarketIndexUrl(input: StockMarketIndexParams): string {
  const qs = buildIndexParams(input).toString();
  return `${DATA_GO_KR_INDEX_BASE}${OPERATION_STOCK_MARKET_INDEX}?${qs}`;
}
```

> **Encoding 키를 env에 넣은 경우:** `URLSearchParams`가 `%2B` 등을 **이중 인코딩**할 수 있음 → 401/SERVICE_KEY 오류. **반드시 Decoding 키로 교체**.

#### 1.3.3 `fetch` 래퍼 + 캐시 옵션

```ts
// client.ts — fetch 스니펫

const CACHE = {
  revalidate: 86_400,
  tags: ["indices"] as const,
} as const;

export async function fetchDataGoKr<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    next: { revalidate: CACHE.revalidate, tags: [...CACHE.tags] },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`data.go.kr HTTP ${res.status}`);
  }

  const json = (await res.json()) as T;
  return json;
}
```

- **401 HTTP:** 키·활용승인·Encoding/Decoding 불일치.
- **`response.header.resultCode !== '00'`:** 비즈니스 오류 → `normalize.ts`의 `assertApiSuccess`에서 처리.

#### 1.3.4 가이드 기반 파라미터 매핑표

| 가이드/포털 명 | 쿼리 키 | 구현 값 | 비고 |
|----------------|---------|---------|------|
| 인증키 | `serviceKey` | env Decoding | |
| 데이터 타입 | `resultType` | `json` | XML 미사용 |
| 페이지 | `pageNo` | `1` (스냅샷), 이력 조회 시 동일 | |
| 행 수 | `numOfRows` | 스냅샷 `1`, 이력 시도 `7` | B전략 실패 시 A로 |
| 지수명 | `idxNm` | `코스피` / `코스닥` | 2024.12 지수명 변경 가이드 참고 |
| 기준일자 | `basDt` | `YYYYMMDD` | 7일 이력 시 날짜별 설정 |

#### 1.3.5 공개 함수 (indices 레이어가 호출)

```ts
// client.ts — export 스케치

export async function fetchStockMarketIndex(
  params: StockMarketIndexParams
): Promise<RawStockMarketIndexResponse> {
  const url = buildStockMarketIndexUrl(params);
  const raw = await fetchDataGoKr<RawStockMarketIndexResponse>(url);
  assertApiSuccess(raw);
  return raw;
}
```

#### 1.3.6 구현 순서 (Part 1)

1. `constants.ts` → `types.ts` (raw) → `normalize.ts` (`assertApiSuccess`)  
2. `client.ts` (`buildUrl`, `fetchDataGoKr`, `fetchStockMarketIndex`)  
3. 임시 Server 스크립트 또는 Phase 1 마지막에 `page.tsx`에서 1회 호출해 JSON `resultCode` 확인  
4. Encoding/Decoding 실패 시 env 교체 후 재시험  

---

## 2. 데이터 정상화(Normalize) 및 TypeScript 타입 정의

### 2.1 파일 배치

```
src/types/indices.ts          # 도메인 (UI · Recharts)
src/lib/api/data-go-kr/types.ts # Raw API
src/lib/api/data-go-kr/normalize.ts
src/lib/indices/mapper.ts       # Raw → Domain
src/lib/indices/dates.ts        # 7 영업일 basDt 목록
src/lib/format/number.ts        # parseNum, formatBasDtLabel (선택)
```

---

### 2.2 Raw API 타입 (`data-go-kr/types.ts`)

```ts
// envelope — research.md §3.3

export interface RawApiHeader {
  resultCode: string;
  resultMsg: string;
}

export interface RawStockMarketIndexItem {
  basDt?: string;
  idxNm?: string;
  clpr?: string | number;
  vs?: string | number;
  fltRt?: string | number;
  mkp?: string | number;
  hipr?: string | number;
  lopr?: string | number;
  // 가이드에 있는 필드는 optional로 확장
  [key: string]: unknown;
}

export interface RawItemsWrapper<T> {
  item?: T | T[];
}

export interface RawStockMarketIndexBody {
  numOfRows?: number;
  pageNo?: number;
  totalCount?: number;
  items?: RawItemsWrapper<RawStockMarketIndexItem>;
}

export interface RawStockMarketIndexResponse {
  response?: {
    header?: RawApiHeader;
    body?: RawStockMarketIndexBody;
  };
}
```

---

### 2.3 `ensureItemsArray` 및 API 성공 검증 (`normalize.ts`)

```ts
// normalize.ts — 설계 스니펫

export function ensureItemsArray<T>(
  items: RawItemsWrapper<T> | undefined | null
): T[] {
  if (!items?.item) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

export function assertApiSuccess(raw: RawStockMarketIndexResponse): void {
  const code = raw.response?.header?.resultCode;
  const msg = raw.response?.header?.resultMsg ?? "Unknown error";
  if (code !== "00") {
    throw new Error(`data.go.kr API error: [${code}] ${msg}`);
  }
}

export function getRawItems(
  raw: RawStockMarketIndexResponse
): RawStockMarketIndexItem[] {
  assertApiSuccess(raw);
  return ensureItemsArray(raw.response?.body?.items);
}
```

| 방어 대상 | 처리 |
|-----------|------|
| `item` 단일 객체 | 배열로 감쌈 |
| `item` 배열 | 그대로 |
| `items` 없음 | `[]` → 상위에서 empty UI |
| `resultCode` 03, 99 등 | throw → page `error.tsx` 또는 try/catch fallback |

---

### 2.4 도메인 타입 (`src/types/indices.ts`)

```ts
// UI · Recharts 공용 — research.md §6.2 확정

export type MarketIndex = "KOSPI" | "KOSDAQ";

export type PriceDirection = "rise" | "fall" | "flat";

export interface IndexSnapshot {
  market: MarketIndex;
  name: string;
  basDt: string;
  close: number;
  changeAmount: number;
  changeRate: number;
  direction: PriceDirection;
}

export interface IndexChartPoint {
  date: string;
  basDt: string;
  close: number;
}

export interface IndexSeries {
  market: MarketIndex;
  points: IndexChartPoint[];
}

export interface IndexDashboardData {
  asOf: string;
  dataNotice: string;
  kospi: IndexSnapshot;
  kosdaq: IndexSnapshot;
  kospiHistory: IndexSeries;
  kosdaqHistory: IndexSeries;
}
```

**`dataNotice`:** 상수 문자열을 `getDashboardData`에서 주입.

```ts
export const DATA_UPDATE_NOTICE =
  "지수 데이터는 공공데이터포털 기준 익영업일 오후 1시 이후 반영됩니다.";
```

---

### 2.5 Mapper (`lib/indices/mapper.ts`)

#### 2.5.1 유틸

```ts
// mapper.ts — 스니펫

export function parseNum(value: string | number | undefined): number {
  if (value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return 0;
  return n;
}

export function resolveDirection(changeRate: number): PriceDirection {
  if (changeRate > 0) return "rise";
  if (changeRate < 0) return "fall";
  return "flat";
}

export function formatBasDtLabel(basDt: string): string {
  // "20260522" → "05/22"
  if (basDt.length !== 8) return basDt;
  return `${basDt.slice(4, 6)}/${basDt.slice(6, 8)}`;
}
```

#### 2.5.2 매핑 함수

| 함수 | 입력 | 출력 |
|------|------|------|
| `mapToSnapshot` | `RawStockMarketIndexItem`, `MarketIndex` | `IndexSnapshot` |
| `mapToChartPoints` | `RawStockMarketIndexItem[]` | `IndexChartPoint[]` |
| `mapLatestSnapshot` | `RawStockMarketIndexResponse`, market | `IndexSnapshot` (첫 item 또는 최신 basDt) |

```ts
// mapToSnapshot — 스니펫
export function mapToSnapshot(
  item: RawStockMarketIndexItem,
  market: MarketIndex
): IndexSnapshot {
  const changeRate = parseNum(item.fltRt);
  return {
    market,
    name: item.idxNm ?? (market === "KOSPI" ? "코스피" : "코스닥"),
    basDt: item.basDt ?? "",
    close: parseNum(item.clpr),
    changeAmount: parseNum(item.vs),
    changeRate,
    direction: resolveDirection(changeRate),
  };
}

export function mapToChartPoints(
  items: RawStockMarketIndexItem[]
): IndexChartPoint[] {
  return [...items]
    .sort((a, b) => (a.basDt ?? "").localeCompare(b.basDt ?? ""))
    .map((row) => ({
      basDt: row.basDt ?? "",
      date: formatBasDtLabel(row.basDt ?? ""),
      close: parseNum(row.clpr),
    }));
}
```

#### 2.5.3 7일 이력 fetch (`dates.ts` + history fetcher)

**전략 A (채택):** `getLast7BusinessDates()` → 각 `basDt`로 `fetchStockMarketIndex` **병렬 7회** / 지수.

```ts
// dates.ts — 스니펫 (주말 제외, 공휴일 미반영 Phase 1)

export function getLast7BusinessDates(from: Date = new Date()): string[] {
  const dates: string[] = [];
  const d = new Date(from);
  while (dates.length < 7) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(formatYyyyMmDd(d));
    }
    d.setDate(d.getDate() - 1);
  }
  return dates.reverse();
}
```

```ts
// history.ts 또는 getDashboard 내부 — 스니펫

async function fetchIndexHistory(idxNm: string, market: MarketIndex) {
  const dates = getLast7BusinessDates();
  const raws = await Promise.all(
    dates.map((basDt) =>
      fetchStockMarketIndex({ idxNm, basDt, numOfRows: 1 })
    )
  );
  const items = raws.flatMap((raw) => getRawItems(raw));
  return { market, points: mapToChartPoints(items) };
}
```

**대안 B (구현 시 1차 시도 optional):** `numOfRows: 7` 단일 호출 → items ≥ 7이면 A 생략.

---

### 2.6 Part 2 구현 체크리스트

- [ ] `types.ts` (raw) + `indices.ts` (domain)  
- [ ] `ensureItemsArray` + `assertApiSuccess` 단위 동작 확인  
- [ ] `mapper.ts` 전 함수  
- [ ] `dates.ts`  
- [ ] 포털 JSON 샘플 1건으로 `mapToSnapshot` 수동 검증  

---

## 3. 데이터 페칭 및 캐싱 아키텍처 계획

### 3.1 `getDashboardData()` 설계 (`src/lib/indices/getDashboard.ts`)

#### 3.1.1 역할

- KOSPI/KOSDAQ **스냅샷** + **7일 이력**을 한 번에 조립.
- **`asOf`**: 캐시 함수 **실행 시점** `new Date().toISOString()`.
- **`dataNotice`**: `DATA_UPDATE_NOTICE` 상수.
- 모든 외부 호출은 `client.ts` 경유 (캐시 옵션 일관).

#### 3.1.2 내부 병렬 구조

```ts
// getDashboard.ts — 로직 스니펫 (uncached 내부 함수)

async function loadDashboardUncached(): Promise<IndexDashboardData> {
  const [kospiRaw, kosdaqRaw, kospiHistory, kosdaqHistory] =
    await Promise.all([
      fetchStockMarketIndex({
        idxNm: INDEX_NAMES.KOSPI,
        numOfRows: 1,
      }),
      fetchStockMarketIndex({
        idxNm: INDEX_NAMES.KOSDAQ,
        numOfRows: 1,
      }),
      fetchIndexHistory(INDEX_NAMES.KOSPI, "KOSPI"),
      fetchIndexHistory(INDEX_NAMES.KOSDAQ, "KOSDAQ"),
    ]);

  const kospiItems = getRawItems(kospiRaw);
  const kosdaqItems = getRawItems(kosdaqRaw);

  return {
    asOf: new Date().toISOString(),
    dataNotice: DATA_UPDATE_NOTICE,
    kospi: mapToSnapshot(kospiItems[0], "KOSPI"),
    kosdaq: mapToSnapshot(kosdaqItems[0], "KOSDAQ"),
    kospiHistory,
    kosdaqHistory,
  };
}
```

- `kospiItems[0]`: 비어 있으면 Phase 3에서 empty state 분기.

---

### 3.2 `unstable_cache` 적용 (Next.js 16 · `cacheComponents` 미사용)

`research.md` §5.3 전략 1+3: **fetch 레벨**과 **대시보드 조립 레벨** 이중 캐시.

#### 3.2.1 fetch 레벨 (이미 `client.ts`)

```ts
next: { revalidate: 86_400, tags: ["indices"] }
```

#### 3.2.2 대시보드 조립 레벨

```ts
// getDashboard.ts — export 스니펫

import { unstable_cache } from "next/cache";

export const getDashboardData = unstable_cache(
  loadDashboardUncached,
  ["dashboard-indices-v1"],
  {
    revalidate: 86_400,
    tags: ["indices"],
  }
);
```

| 옵션 | 값 | 의미 |
|------|-----|------|
| `revalidate` | `86400` | 24시간마다 stale 후 백그라운드 재검증 |
| `tags` | `['indices']` | cron·`revalidateTag` 대상 |
| cache key | `['dashboard-indices-v1']` | 스키마 변경 시 suffix 버전업 |

#### 3.2.3 페이지 segment (보조)

```ts
// app/page.tsx — 스니펫
export const revalidate = 86_400;
```

- 리터럴 상수만 허용 (`60 * 60 * 24` ❌).
- 개발 모드에서는 매 요청 렌더 → **캐시 QA는 `npm run build && npm run start`**.

---

### 3.3 평일 14:00 KST cron (`revalidateTag`) — Phase 4

| 항목 | 값 |
|------|-----|
| 파일 | `src/app/api/cron/revalidate-indices/route.ts` |
| 스케줄 (Vercel) | `0 5 * * 1-5` UTC ≈ 14:00 KST (일광절약 시 조정) |
| 동작 | `revalidateTag('indices')` |
| 인증 | `Authorization: Bearer ${CRON_SECRET}` |

```ts
// route.ts — 구조 스니펫
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (request.headers.get("authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  revalidateTag("indices");
  return Response.json({ ok: true, revalidatedAt: new Date().toISOString() });
}
```

**15:30 cron은 하지 않음** (`research.md` §5.4 — API 데이터 미반영).

---

### 3.4 `asOf` · 안내 문구 UI 데이터 흐름

```
getDashboardData() 실행 (cache miss)
    → asOf = new Date().toISOString()
    → dataNotice = DATA_UPDATE_NOTICE
         │
         ▼
page.tsx: const data = await getDashboardData()
         │
         ▼
IndexDashboard({ data })
    ├── IndexCard: data.kospi.basDt → 「기준일 2026.05.22」
    └── DataAsOfFooter:
          - data.asOf → formatKstDateTime (lib/format/datetime.ts)
          - data.dataNotice → 고정 안내 문단
```

```tsx
// DataAsOfFooter — JSX 스니펫 (구현 시)
<footer className={styles.footer}>
  <p className={styles.notice}>{data.dataNotice}</p>
  <p className={styles.asOf}>
    화면 데이터 조회 시각: {formatKstDateTime(data.asOf)}
  </p>
  <p className={styles.basDt}>
    코스피 기준일 {formatBasDtDisplay(data.kospi.basDt)} ·
    코스닥 기준일 {formatBasDtDisplay(data.kosdaq.basDt)}
  </p>
</footer>
```

---

### 3.5 에러·empty 처리 (page 레벨)

```tsx
// page.tsx — 스니펫
export default async function HomePage() {
  try {
    const data = await getDashboardData();
    return <IndexDashboard data={data} />;
  } catch (e) {
    // error.tsx 연동 또는 인라인 fallback
    return <IndexDashboardError message="지수 데이터를 불러오지 못했습니다." />;
  }
}
```

---

### 3.6 Part 3 체크리스트

- [ ] `getDashboard.ts` + `unstable_cache`  
- [ ] `export const revalidate = 86400` in `page.tsx`  
- [ ] production에서 2회째 요청 응답 시간 단축 확인  
- [ ] (Phase 4) cron route + Vercel Cron 설정  

---

## 4. 컴포넌트 구조 및 React 19 / Next 16 호환 계획

### 4.1 디렉터리 및 파일 목록

```
src/components/indices/
├── IndexDashboard.tsx
├── IndexDashboard.module.css
├── IndexCard.tsx
├── IndexCard.module.css
├── IndexChartsSection.tsx
├── IndexChartsSection.module.css
├── IndexLineChart.tsx          # 'use client' (패턴 A)
├── IndexLineChart.module.css
├── IndexChartsSection.dynamic.tsx  # (선택) 패턴 B용 dynamic 래퍼
└── DataAsOfFooter.tsx
    └── DataAsOfFooter.module.css
```

---

### 4.2 컴포넌트별 명세

| 컴포넌트 | RSC/Client | Props | 책임 |
|----------|------------|-------|------|
| `page.tsx` | **Server** | — | `getDashboardData()`, `revalidate` export |
| `IndexDashboard` | **Server** | `{ data: IndexDashboardData }` | shell, 섹션 배치 |
| `IndexCard` | **Server** | `{ snapshot: IndexSnapshot }` | 지수값·등락률·direction 색 |
| `IndexChartsSection` | **Server** | `{ kospi, kosdaq: IndexSeries }` | 차트 2열 레이아웃 |
| `IndexLineChart` | **Client** | `{ series: IndexSeries }` | Recharts LineChart |
| `DataAsOfFooter` | **Server** | `{ data: IndexDashboardData }` | notice + asOf + basDt |

**금지:** Client 컴포넌트에서 `process.env.DATA_GO_KR_*` 또는 `fetch(apis.data.go.kr)` 호출.

---

### 4.3 `app/page.tsx` (Server)

```tsx
// page.tsx — 구조 스니펫

import { getDashboardData } from "@/lib/indices/getDashboard";
import { IndexDashboard } from "@/components/indices/IndexDashboard";

export const revalidate = 86_400;

export default async function HomePage() {
  const data = await getDashboardData();
  return (
    <main className={/* page.module.css */}>
      <IndexDashboard data={data} />
    </main>
  );
}
```

- create-next-app 템플릿 JSX·`next/image` 홍보 블록 **전부 제거**.
- `metadata` / `layout.tsx` `lang="ko"`는 Phase 2~3에서 정리.

---

### 4.4 `IndexDashboard.tsx` (Server)

```tsx
// IndexDashboard — 구조 스니펫

import type { IndexDashboardData } from "@/types/indices";
import { IndexCard } from "./IndexCard";
import { IndexChartsSection } from "./IndexChartsSection";
import { DataAsOfFooter } from "./DataAsOfFooter";

export function IndexDashboard({ data }: { data: IndexDashboardData }) {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1>국내 지수</h1>
      </header>
      <section className={styles.cards}>
        <IndexCard snapshot={data.kospi} />
        <IndexCard snapshot={data.kosdaq} />
      </section>
      <IndexChartsSection
        kospi={data.kospiHistory}
        kosdaq={data.kosdaqHistory}
      />
      <DataAsOfFooter data={data} />
    </div>
  );
}
```

---

### 4.5 `IndexCard.tsx` (Server)

```tsx
// IndexCard — 구조 스니펫

import type { IndexSnapshot } from "@/types/indices";

export function IndexCard({ snapshot }: { snapshot: IndexSnapshot }) {
  const dirClass = styles[snapshot.direction]; // rise | fall | flat
  return (
    <article className={styles.card}>
      <h2>{snapshot.name}</h2>
      <p className={`${styles.close} numeric`}>{formatIndex(snapshot.close)}</p>
      <p className={`${styles.change} numeric ${dirClass}`}>
        {formatChange(snapshot.changeAmount, snapshot.changeRate)}
      </p>
      <p className={styles.basDt}>기준일 {formatBasDtDisplay(snapshot.basDt)}</p>
    </article>
  );
}
```

- `numeric` 클래스: `globals.css` 전역 (§5).
- 색상: `styles.rise` → `color: var(--color-rise)` 등 module에서 토큰 참조.

---

### 4.6 `IndexLineChart.tsx` (Client) + Recharts

#### 4.6.1 의존성 (Phase 3)

```bash
npm install recharts
npm ls react-is   # React 19와 버전 일치 확인
```

#### 4.6.2 패턴 A — 직접 Client (1차 시도)

```tsx
// IndexLineChart.tsx — 스니펫

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { IndexSeries } from "@/types/indices";

const STROKE = {
  KOSPI: "var(--color-primary)",
  KOSDAQ: "var(--color-fall)",
} as const;

export function IndexLineChart({ series }: { series: IndexSeries }) {
  return (
    <div className={styles.chart}>
      <h3>{series.market}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={series.points}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="close"
            stroke={STROKE[series.market]}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

#### 4.6.3 패턴 B — `next/dynamic` + `ssr: false` (하이드레이션 오류 시)

`IndexChartsSection.tsx` **(Server)** 에서만 dynamic import:

```tsx
// IndexChartsSection.tsx — 패턴 B 스니펫

import dynamic from "next/dynamic";
import type { IndexSeries } from "@/types/indices";

const IndexLineChart = dynamic(
  () => import("./IndexLineChart").then((m) => m.IndexLineChart),
  {
    ssr: false,
    loading: () => <div className={styles.chartSkeleton}>차트 로딩 중…</div>,
  }
);

export function IndexChartsSection({
  kospi,
  kosdaq,
}: {
  kospi: IndexSeries;
  kosdaq: IndexSeries;
}) {
  return (
    <section className={styles.charts}>
      <IndexLineChart series={kospi} />
      <IndexLineChart series={kosdaq} />
    </section>
  );
}
```

| 상황 | 선택 |
|------|------|
| `npm run build` 성공, 차트 표시 정상 | **패턴 A** 유지 |
| hydration mismatch / Recharts blank | **패턴 B**로 전환 |
| `react-is` peer 충돌 | `package.json` `overrides` (Recharts #5146) |

#### 4.6.4 React 19 호환 체크

- [ ] `recharts@^2.13` 이상  
- [ ] Chart `children`에 **React Fragment 직접 사용 지양** (이슈 #2462)  
- [ ] production build 후 차트 툴팁·리사이즈 동작 확인  

---

### 4.7 Server → Client props 직렬화 규칙

| 허용 | 불허 |
|------|------|
| `IndexSeries` plain object | `Date` 객체 (문자열로 변환) |
| `number`, `string`, 배열 | 함수, Symbol |
| `points` 배열 | `undefined` in nested (optional chaining 대비) |

---

### 4.8 `layout.tsx` 연동 (스타일 import 순서)

```tsx
// layout.tsx — import 순서 스니펫 (Phase 2)
import "@/styles/tokens.css";
import "./globals.css";
```

---

## 5. 디자인 토큰 및 CSS Modules 스타일 계획

### 5.1 `src/styles/tokens.css` (신규)

```css
/* tokens.css — 스니펫 (research.md §8 + 한국 시장 관례) */

:root {
  /* Brand */
  --color-primary: #3182f6;
  --color-primary-pressed: #1b64da;

  /* Market — 상승 빨강 / 하락 파랑 */
  --color-rise: #f04452;
  --color-fall: #3182f6;
  --color-flat: #8b95a1;

  /* Surface */
  --color-bg: #f2f4f6;
  --color-surface: #ffffff;
  --color-border: #e5e8eb;

  /* Text */
  --color-text-primary: #191f28;
  --color-text-secondary: #4e5968;
  --color-text-tertiary: #8b95a1;

  /* Typography */
  --font-sans: var(--font-geist-sans, -apple-system, BlinkMacSystemFont,
    "Apple SD Gothic Neo", sans-serif);
  --text-title: 22px;
  --text-price: 28px;
  --text-caption: 13px;

  /* Layout */
  --layout-max-width: 480px;
  --space-16: 16px;
  --radius-lg: 16px;

  /* Chart */
  --chart-height: 200px;
}
```

- Pretendard 도입은 **선택** (Phase 2). 초기에는 Geist variable 유지 가능.

---

### 5.2 `src/app/globals.css` 개편

```css
/* globals.css — 추가·변경 스니펫 */

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

/* 지수·등락률 숫자 정렬 — 필수 */
.numeric {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
```

| 변경 | 내용 |
|------|------|
| 제거·이전 | `:root --background/--foreground` → `tokens.css`로 이전 |
| `body` font | `Arial` 제거 → `var(--font-sans)` |
| 다크모드 | Phase 1~3 **미구현** (토스 유사 라이트 only) |

---

### 5.3 CSS Modules 매핑

| 파일 | 주요 클래스 | 토큰 사용 |
|------|-------------|-----------|
| `IndexDashboard.module.css` | `.dashboard`, `.header`, `.cards` | `--layout-max-width`, `--color-bg` |
| `IndexCard.module.css` | `.card`, `.rise`, `.fall`, `.flat` | `--color-surface`, `--color-rise/fall` |
| `IndexChartsSection.module.css` | `.charts`, `.chartSkeleton` | `--chart-height` |
| `IndexLineChart.module.css` | `.chart` | padding, min-height |
| `DataAsOfFooter.module.css` | `.notice`, `.asOf` | `--color-text-tertiary` |
| `page.module.css` | `.page` | 중앙 정렬, padding |

**규칙:** hex 하드코딩 금지 → `var(--color-*)` only.

---

### 5.4 Recharts stroke와 토큰

- Client에서 `stroke="var(--color-rise)"`는 **일부 환경에서 SVG 미적용** 가능.
- fallback: `IndexLineChart` 상단에 상수 `CHART_STROKE_KOSPI = "#3182f6"` (토큰과 동일 값) 주석으로 토큰과 동기화 유지.

---

### 5.5 Part 5 체크리스트

- [ ] `tokens.css` 생성 + `layout.tsx` 최상단 import  
- [ ] `globals.css` `.numeric` + body 토큰  
- [ ] 각 `*.module.css` co-locate  
- [ ] 카드 rise/fall 색 육안 QA  

---

## 6. 단계별 구현 마일스톤 (Phase 1 ~ 7)

### Phase 1 — 환경·API 클라이언트·Raw 파이프

**목표:** 서버에서 공공 API 1회 호출 성공, raw JSON 검증.

| 순서 | 작업 | 파일 |
|------|------|------|
| 1-1 | `.env.local` + gitignore 확인 | 루트 |
| 1-2 | `constants.ts` | `lib/api/data-go-kr/` |
| 1-3 | `types.ts` (raw) | 동일 |
| 1-4 | `normalize.ts` | 동일 |
| 1-5 | `client.ts` | 동일 |
| 1-6 | 임시: `page.tsx`에서 `fetchStockMarketIndex({ idxNm: '코스피' })` 로그 또는 최소 JSON 표시 | `app/page.tsx` |
| 1-7 | `resultCode === '00'` 확인 | — |
| 1-8 | `npm run lint` | — |

**Phase 1 완료 조건:** ☐ Decoding 키로 코스피 1건 fetch 성공.

---

### Phase 2 — 타입·Mapper·getDashboardData·캐시

**목표:** `IndexDashboardData`까지 서버에서 조립, UI 없이 검증 가능.

| 순서 | 작업 | 파일 |
|------|------|------|
| 2-1 | `src/types/indices.ts` | domain |
| 2-2 | `mapper.ts`, `dates.ts`, `format/*` | `lib/indices/` |
| 2-3 | `fetchIndexHistory` (7일 병렬) | `lib/indices/history.ts` 또는 `getDashboard.ts` |
| 2-4 | `getDashboard.ts` + `unstable_cache` | `lib/indices/` |
| 2-5 | `page.tsx` → `getDashboardData()` JSON 일부 렌더 (개발용) | `app/page.tsx` |
| 2-6 | `export const revalidate = 86400` | `app/page.tsx` |
| 2-7 | `npm run build && npm run start` 캐시 동작 확인 | — |

**Phase 2 완료 조건:** ☐ KOSPI+KOSDAQ 스냅샷·7일 points·`asOf`·`dataNotice` 포함 객체 생성.

---

### Phase 3 — UI (Server) · 스타일 · Recharts

**목표:** 대시보드 화면 완성, 차트 표시.

| 순서 | 작업 | 파일 |
|------|------|------|
| 3-1 | `tokens.css` + `globals.css` | `styles/`, `app/` |
| 3-2 | `layout.tsx` import 순서, `lang="ko"`, metadata | `app/layout.tsx` |
| 3-3 | `IndexCard`, `DataAsOfFooter`, `IndexDashboard` + css | `components/indices/` |
| 3-4 | `page.tsx` 템플릿 제거 → `IndexDashboard` | `app/page.tsx` |
| 3-5 | `npm install recharts` | `package.json` |
| 3-6 | `IndexLineChart` (패턴 A) | Client |
| 3-7 | `IndexChartsSection` | Server |
| 3-8 | 하이드레이션 이슈 시 패턴 B 전환 | dynamic |
| 3-9 | `page.module.css` 정리 | `app/` |
| 3-10 | `npm run build` · lint · 375px 뷰포트 QA | — |

**Phase 3 완료 조건:** ☐ 카드·이중 차트·푸터 안내·tabular 숫자 표시.

---

### Phase 4 — 운영 갱신 (cron) · polish

**목표:** 평일 14:00 KST 전후 캐시 무효화, 운영 안정화.

| 순서 | 작업 | 파일 |
|------|------|------|
| 4-1 | `CRON_SECRET` env | `.env.local` |
| 4-2 | `api/cron/revalidate-indices/route.ts` | `app/api/` |
| 4-3 | Vercel Cron `0 5 * * 1-5` 등록 | 대시보드 |
| 4-4 | (선택) `error.tsx`, `loading.tsx` | `app/` |
| 4-5 | production 재검증: cron 후 `asOf` 갱신 | — |
| 4-6 | API 가이드 PDF와 URL/필드명 최종 diff | `constants.ts` |

**Phase 4 완료 조건:** ☐ `revalidateTag('indices')` 후 새 `asOf` 반영.

### 4.7 (2026-07-03) 결정: 14:00 KST cron 제거

**결정:** 4-2/4-3에서 구축한 `api/cron/revalidate-indices` 라우트와 `vercel.json`의 `0 5 * * 1-5`(평일 14:00 KST) cron 스케줄을 **삭제**했다. `src/app/api/cron/`, `vercel.json`을 제거했고, `CRON_SECRET`은 애초에 `.env.local`에 설정된 적이 없어 추가 정리는 불필요했다.

**이유:**
- 이 cron은 원안(data-go-kr, §5.2~5.4)의 캐시 구조를 전제로 설계되었다. data-go-kr API는 **하루 한 번, 그것도 익영업일 13:00 이후**에야 전일 종가가 반영되고 캐시도 `revalidate: 86400`(24시간)이었기 때문에, 새 데이터가 나온 뒤 캐시가 자연 만료될 때까지 기다리면 최대 24시간 지연될 수 있어 **14:00 KST 강제 revalidate**가 필요했다.
- Phase 5에서 data-go-kr 레거시를 전량 제거하고 KIS API로 완전히 전환한 지금은 캐시 정책이 `KIS_CACHE_REVALIDATE_SECONDS = 600`(10분)이며, KIS는 준실시간 시세를 제공한다(research.md §14.1~14.2). 하루 중 언제 방문해도 최악의 경우 10분 이내의 데이터가 자동으로 나오므로, 하루 한 번뿐인 14:00 강제 갱신은 10분 자동 캐시가 이미 하는 일을 중복할 뿐 추가 이점이 없다.
- 14:00이라는 시각 자체도 "T+1 13:00 이후 공공 API 반영"이라는 data-go-kr 전용 타이밍 근거였고, KIS 준실시간 데이터와는 무관하다.

**결과:** Phase 4의 운영 갱신 방식은 cron 없이 **fetch 레벨 `revalidate: 600s`(ISR) 단독**으로 대체되었다. 이에 따라 4-1~4-3, 4-5는 더 이상 유효하지 않은 항목으로 처리하고, Phase 4 완료 조건도 "10분 자동 캐시로 `asOf`가 갱신되는지"로 재해석한다 (Phase 6 검증 시 `getDashboard.ts` 캐시 만료·재검증 동작을 통해 이미 실측 확인함).

---

### Phase 5 — KIS API 마이그레이션 문서화 및 레거시 정리

**목표:** 이미 코드베이스에 구현된 KIS API 전환 내용을 계획 문서에 소급 반영하고, 남은 data-go-kr 레거시 코드의 처리 방향을 확정한다. (배경: research.md §14)

| 순서 | 작업 | 파일 | 상태 |
|------|------|------|------|
| 5-1 | KIS 전환 배경·API 개요·토큰 제약 리서치 반영 | `research.md` §14 | ☑ 완료 |
| 5-2 | data-go-kr 레거시(`lib/api/data-go-kr/`, `lib/indices/mapper.ts` 중 KIS 미전환 함수) 사용 여부 확인 | `lib/api/data-go-kr/`, `lib/indices/mapper.ts` | ☑ 확인 완료 — `history.ts`만 참조하는 죽은 코드였고, `mapper.ts`는 `kisMapper.ts`가 유틸 3개만 재사용 중이었음 |
| 5-3 | 미사용 확정 시 제거 여부 결정 (제거 또는 유지 사유 기록) | 동일 | ☑ 제거로 결정·실행 — `history.ts`·`mapper.ts`·`lib/api/data-go-kr/` 전체 삭제, 재사용 유틸 3개(`parseNum`/`resolveDirection`/`formatBasDtLabel`)는 `kisMapper.ts`로 이관. 부수적으로 cron 라우트가 레거시 `CACHE_TAGS`를 import하던 버그도 `KIS_CACHE_TAGS`로 수정 |
| 5-4 | `DATA_GO_KR_SERVICE_KEY` 등 미사용 env 정리 여부 확인 | `.env.local`, README | ☑ 완료 — `.env.local`에서 주석 처리된 `DATA_GO_KR_SERVICE_KEY` 줄 삭제 |
| 5-5 | `KIS_DATA_NOTICE` 문구가 UI(`DataAsOfFooter` 등)에 정상 반영되는지 확인 | `types/indices.ts`, `components/indices/` | ☑ 완료 |

**Phase 5 완료 조건:** ☑ research.md/plan.md에 KIS 전환 내역 반영 완료, ☑ data-go-kr 레거시 처리 방향 결정(제거·실행 완료).

---

### Phase 6 — KIS 토큰 캐시 외부 저장소 전환

**목표:** 서버리스 다중 인스턴스 환경에서 토큰 발급 요청이 인스턴스별로 분산되어 발생하는 `1분당 1회`(`EGW00133`) rate limit 리스크를 제거한다. (배경: research.md §14.3~14.4)

| 순서 | 작업 | 파일 | 상태 |
|------|------|------|------|
| 6-1 | 저장소 선택 확정 (Vercel KV vs Upstash Redis) — research.md §14.4 권고안(Upstash Redis) 검토 | 의사결정 | ☑ Upstash Redis 채택 |
| 6-2 | 패키지 설치 및 env 추가 (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 등) | `.env.local`, `package.json` | ☑ 완료 |
| 6-3 | `getKisAccessToken`을 외부 저장소 get/set으로 리팩터링 (토큰 + 만료 시각 함께 저장) | `lib/api/kis/auth.ts` | ☑ 완료 |
| 6-4 | 동시 요청 합류(`inflight`) 로직을 분산 환경에 맞게 재검토 (저장소 레벨 락 또는 짧은 TTL로 완화) | 동일 | ☑ `SET NX PX` 분산 락 + 기존 inflight 병행 |
| 6-5 | 로컬에서 토큰 캐시 hit/miss 로그로 검증 | — | ☑ 완료 (summary.md 참고) |
| 6-6 | 프로덕션(Vercel) 배포 후 다중 인스턴스에서 토큰 발급 횟수 감소 확인 | Vercel 로그 | ☐ 미완료 — 배포 후 확인 필요 |

**Phase 6 완료 조건:** ☐ 인스턴스 재시작/스케일아웃 시에도 토큰이 재사용되어 `1분당 1회` 제한에 걸리지 않음.
(로컬 6-1~6-5 검증 완료. 프로덕션 다중 인스턴스 확인(6-6)은 배포 후 별도 진행 필요.)

**트러블슈팅 기록 (2026-07-04):** 대시보드에서 "데이터를 불러올 수 없습니다 - fetch failed" 에러 발생. 조사 결과 토큰 발급 제한(rate limit)이 아니라 **KIS 서버의 7/4~7/5 전산 점검 공지**로 인한 연결 실패로 확인됨(공식 공지 확인). 코드/설정 문제 아님 — 점검 종료 후 재확인 필요.

---

### Phase 7 — Google OAuth 로그인 및 접근 제한

**목표:** 미인증 사용자에게는 대시보드를 노출하지 않고, Google OAuth 로그인 후 사전에 허용된 이메일 계정만 실제 대시보드에 접근하도록 제한한다. (2026-07-04 계획 수립 및 구현)

**아키텍처 결정:**
- Next.js 16 App Router에서 세션을 확인해야 하므로, 구버전 `next-auth@4`가 아니라 App Router 네이티브 지원이 되는 **Auth.js v5**(`next-auth@beta`, 실측 `5.0.0-beta.31`, `next ^16.0.0` peer 지원 확인)를 사용한다.
- **구현 중 발견:** Next.js 16에서 `middleware.ts` 컨벤션이 `proxy.ts`로 이름이 바뀌었다(`middleware`는 deprecated, `node_modules/next/dist/docs`의 `proxy.md` 확인). 기본 런타임도 Edge가 아닌 **Node.js**로 바뀌어, Auth.js 설정을 edge/node로 분리할 필요 없이 `src/auth.ts` 하나를 `src/proxy.ts`에서 바로 import해서 쓴다.
- Provider는 **Google** 단일 사용 (`Google` provider), 별도 회원가입/비밀번호 플로우 없음.
- 허용 여부 판단은 DB 없이 **env 변수의 이메일 화이트리스트**(`ALLOWED_EMAILS`, 쉼표 구분)로 처리한다.
- 로그인 페이지는 **제목·설명 없이 "Google로 로그인" 버튼 중심**의 미니멀 디자인 — 기존 `tokens.css` + CSS Modules 규칙 그대로 따름(Tailwind 금지).
- **구현 중 변경:** 로그인 버튼은 별도 Client Component 대신, Next.js App Router의 `<form action={서버 액션}>` 패턴(Auth.js 공식 예제와 동일)으로 처리했다. `signIn("google")` 호출에 클라이언트 상태가 필요 없어 `"use client"` 없이도 동작하고, 프로젝트의 "Server Component 우선" 원칙에 더 부합한다.

| 순서 | 작업 | 파일 | 상태 |
|------|------|------|------|
| 7-1 | 패키지 설치 및 env 추가 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ALLOWED_EMAILS`) | `.env.local`, `package.json` | ☑ 완료 (`AUTH_SECRET`은 `openssl rand -base64 32`로 생성해 채움) |
| 7-2 | Google Cloud Console에서 OAuth 클라이언트 발급 (승인된 리디렉션 URI: `.../api/auth/callback/google`) | 외부 설정 (사용자 작업) | ☐ **사용자 작업 필요** — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`ALLOWED_EMAILS`는 아직 빈 값 |
| 7-3 | Auth.js 설정 — `Google` provider. 화이트리스트 검사는 signIn 콜백이 아니라 대시보드 렌더 시점(7-8)에서 수행 | `src/auth.ts` | ☑ 완료 |
| 7-4 | Auth.js 라우트 핸들러 마운트 | `src/app/api/auth/[...nextauth]/route.ts` | ☑ 완료 |
| 7-5 | `proxy.ts` — 미인증 요청은 `/login`으로 리다이렉트해 대시보드(`/`) 및 향후 추가될 경로를 보호 (matcher로 `/login`, `/api/auth`, 정적 자원 제외) | `src/proxy.ts` | ☑ 완료 |
| 7-6 | `/login` 페이지 — 제목/설명 없이 "Google로 로그인" 버튼만 배치, Server Action으로 `signIn("google")` 호출 | `src/app/login/page.tsx`, `page.module.css` | ☑ 완료 |
| 7-7 | 허용 이메일이 아닌 계정으로 로그인 성공 시 접근 거부 처리 — 대시보드 대신 "접근 권한이 없습니다" 안내 + 로그아웃 버튼 | `src/app/page.tsx` 조건 분기 | ☑ 완료 |
| 7-8 | 대시보드(`page.tsx`)에서 서버 세션(`auth()`) 확인 → 세션 없으면 `/login` redirect(방어적 이중 확인) → `ALLOWED_EMAILS` 통과 시에만 `IndexDashboard` 렌더 | `src/app/page.tsx` | ☑ 완료 |
| 7-9 | 로컬 검증 — (a) 미인증 상태로 `/` 접속 → `/login` 리다이렉트(307) 확인, (b) `/login` 렌더 확인(스크린샷), (c) 허용/비허용 이메일 실제 로그인 플로우 | — | ☑ 완료 — (a)(b)(c) 모두 확인 (2026-07-04, 허용 이메일 계정으로 로그인 → 대시보드 진입 확인) |
| 7-10 | 프로덕션(Vercel) 배포 시 `AUTH_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`ALLOWED_EMAILS` env 등록, Google Console에 프로덕션 콜백 URL 추가 | Vercel 대시보드, Google Cloud Console | ☐ 미완료 — 배포 시 진행 |

**Phase 7 완료 조건:** ☑ 미인증 사용자는 `/login`만 볼 수 있음, ☑ `ALLOWED_EMAILS`에 있는 계정만 대시보드 접근 가능(2026-07-04 실제 로그인 검증 완료), ☐ 그 외 계정은 로그인은 되지만 접근 거부 메시지만 표시됨(비허용 계정 실측은 아직 미실시).
**남은 작업:** 7-10 프로덕션 배포 시 env 등록만 남음. 로컬 로그인 플로우 검증은 완료.

**트러블슈팅 기록 (2026-07-04):** 최초 로그인 시 세션 쿠키(`authjs.session-token`)는 정상 발급됐으나 `/`로 리다이렉트된 직후 다시 `/login`으로 튕기는 현상이 있었음. `proxy.ts`/`auth.ts`에 임시 디버그 로그(`console.log`, `debug: true`)를 추가해 원인 조사를 진행했고, 이후 재현 시 정상 동작함을 확인 — 임시 디버그 코드는 확인 후 제거함. (자세한 조사 과정은 `summary.md` 참고)

---

### Phase 8 — 시간대별 캐시 최적화 (KIS 마감 후 갱신 패턴 반영)

**목표:** `summary.md`("KIS 지수 API 장 마감 후 갱신 여부 조사", 2026-07-07 실측)의 결론을 바탕으로, 기본 캐시 주기는 그대로 두되 확정 반영 시각에 강제 캐시 무효화를 걸어 불필요한 지연 없이 최신 데이터를 보장한다.

**배경 (실측 요약 — 전체 근거는 `summary.md` 참고):**
- 09:00~15:30 정규장: 5분 간격으로 계속 변동.
- 15:35경 마감 직후 최종 체결가 반영, 18:10경 누적거래량(`acml_vol`)만 소폭 정정.
- 18:30 이후~다음 개장 전까지는 완전히 정적(2시간 20분 이상 무변화 확인, NXT 20:00 마감 포함).

**최종 설계 (2026-07-08 확정):**

- **기본 캐시는 변경하지 않는다.** `unstable_cache`/fetch 레벨 모두 기존 `KIS_CACHE_REVALIDATE_SECONDS = 600`(10분)을 09:00~다음 개장 전까지 시간대 구분 없이 그대로 유지한다. (이전 초안에서 검토했던 `getKisCacheRevalidateSeconds` 시간대별 동적 TTL 방식은 `unstable_cache`가 정의 시점에 revalidate를 고정하는 한계 때문에 채택하지 않고 폐기한다.)
- 대신 **정확한 확정 시각에 강제 무효화하는 cron 2개**를 신설해 "10분 자동 재검증 + 확정 시각 강제 갱신"을 병행한다:
  - **15:40 KST (평일 월~금)** — 15:35 마감 후 최종 체결가 확정 반영
  - **18:15 KST (평일 월~금)** — 18:10 누적거래량 정정치 확정 반영
- 두 cron 모두 Phase 4.7(§4.7)에서 제거했던 `api/cron/revalidate-indices/route.ts`의 구조(커밋 `0bcfdd7`의 부모 커밋에 있던 버전)를 그대로 재사용하되, 삭제된 legacy `CACHE_TAGS`(`lib/api/data-go-kr/constants`, Phase 5에서 제거됨) import만 현재의 `KIS_CACHE_TAGS`(`lib/api/kis/constants`)로 교체한다. `isValidCronSecret`(`timingSafeEqual` 기반 Bearer 토큰 비교), 응답 포맷은 그대로 유지.
- `CRON_SECRET` 인증 방식도 예전과 동일하게 유지한다 (env 값은 Phase 7에서 비어있는 상태이므로 재발급 필요할 수 있음).
- `vercel.json`을 새로 만들어 crons 배열에 2개 스케줄을 등록한다.

**`vercel.json` 스니펫 (KST → UTC, KST는 서머타임 없이 항상 UTC+9):**

```json
{
  "crons": [
    { "path": "/api/cron/revalidate-indices", "schedule": "40 6 * * 1-5" },
    { "path": "/api/cron/revalidate-indices", "schedule": "15 9 * * 1-5" }
  ]
}
```

| KST 실행 시각 | UTC cron 표현식 | 의미 |
|---|---|---|
| 15:40 (월~금) | `40 6 * * 1-5` | 15:35 종가 확정 반영 |
| 18:15 (월~금) | `15 9 * * 1-5` | 18:10 거래량 확정 반영 |

**cron 라우트 스니펫 (`0bcfdd7^` 구조 재사용, 태그만 교체):**

```ts
// src/app/api/cron/revalidate-indices/route.ts — 스니펫 (신규 파일)
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { KIS_CACHE_TAGS } from "@/lib/api/kis/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization) return false;
  const expected = `Bearer ${secret}`;
  const authBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  if (authBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(authBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  if (!isValidCronSecret(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const revalidatedAt = new Date().toISOString();
  for (const tag of KIS_CACHE_TAGS) {
    revalidateTag(tag, { expire: 0 });
  }

  return Response.json({
    ok: true,
    revalidatedAt,
    tags: [...KIS_CACHE_TAGS],
    message: "Cache tags expired immediately (expire: 0).",
  });
}
```

**구현 중 발견 1 — `revalidateTag`의 두 번째 인자 (`node_modules/next/dist/docs`의 `revalidateTag.md` 확인 후 반영):**

당초 스니펫은 공식 예제를 따라 `revalidateTag(tag, "max")`를 사용했으나, 로컬 검증(8-5) 과정에서 크론 호출 직후 첫 응답이 여전히 이전 `asOf`를 반환하는 것을 확인했다. 문서 확인 결과 `profile="max"`는 **stale-while-revalidate**로 동작한다 — 태그를 stale로만 표시하고, 실제 재요청은 "그 태그를 쓰는 페이지/라우트가 다음에 방문될 때"에야 백그라운드로 트리거되며, 그 방문 자체는 여전히 이전 값을 반환한다(한 번 더 방문해야 새 값). 이는 방문자가 뜸한 대시보드에서 크론이 원하는 "확정 시각에는 이미 최신"이라는 목표와 맞지 않는다.

문서는 정확히 이 케이스("외부 시스템/webhook이 Route Handler를 호출해 즉시 만료가 필요한 경우")를 위해 `revalidateTag(tag, { expire: 0 })`를 명시적으로 권장하고 있어 이를 채택했다. 로컬 재검증 결과 크론 호출 직후 첫 요청부터 바로 새 `asOf`가 반영됨을 확인함 (아래 8-5 참고).

**구현 중 발견 2 — `proxy.ts`의 인증 matcher가 `/api/cron`을 보호 대상에서 빠뜨림:**

Phase 7에서 설정한 `proxy.ts`의 matcher(`/((?!api/auth|_next/static|_next/image|favicon.ico).*)`)는 `/api/auth`만 예외 처리하고 있어, 신설한 `/api/cron/revalidate-indices`도 인증 미들웨어에 걸려 세션 없는 요청(= Vercel Cron 호출 포함 모든 외부 호출)이 매번 `/login`으로 307 리다이렉트되고 실제 라우트 핸들러(및 그 안의 `CRON_SECRET` 검사)에 전혀 도달하지 못하는 문제를 발견했다.

최초 수정은 `api/cron` 경로 전체를 예외 처리했으나, 보안 검토(2026-07-08) 과정에서 이 경우 향후 `/api/cron/` 아래에 자체 인증 로직 없는 라우트가 추가되면 그대로 공개될 위험이 있다는 지적이 나와, 예외 범위를 현재 존재하는 라우트 하나로 좁혔다:

```ts
// src/proxy.ts — 최종 수정본
export const config = {
  matcher: [
    "/((?!api/auth|api/cron/revalidate-indices|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**작업 목록:**

| 순서 | 작업 | 파일 | 상태 |
|------|------|------|------|
| 8-1 | `CRON_SECRET` env 값 확인·재발급 | `.env.local` | ☑ 완료 — 값 없었음, `openssl rand -base64 32`로 신규 발급해 추가 |
| 8-2 | cron 라우트 재작성 — `CACHE_TAGS` → `KIS_CACHE_TAGS`(`@/lib/api/kis/constants`)로 교체해 복원, `revalidateTag(tag, { expire: 0 })`로 즉시 만료 | `src/app/api/cron/revalidate-indices/route.ts` (신규) | ☑ 완료 |
| 8-3 | `vercel.json` 신규 생성, crons 2개(`40 6 * * 1-5`, `15 9 * * 1-5`) 등록 | `vercel.json` (신규) | ☑ 완료 |
| 8-4 | 기본 캐시(`KIS_CACHE_REVALIDATE_SECONDS = 600`)는 변경 없이 유지되는지 재확인 | `lib/api/kis/constants.ts` | ☑ 확인 완료 — 파일 변경 없음 |
| 8-5 | 로컬에서 `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/revalidate-indices` → 200 응답 + `asOf` 갱신 확인 | — | ☑ 완료 — `npm run build && npm run start` 후 무인증(401)/오답 시크릿(401)/정답 시크릿(200) 확인. `asOf` 갱신은 임시 디버그 라우트(`/api/cron/debug-asof`, 검증 후 삭제)로 실제 `getDashboardData()`를 호출해 확인: 크론 호출 전 `05:34:54.097`(revalidatedAt) → 크론 호출 직후 첫 요청부터 새 `asOf` `05:34:54.591` 반영 |
| 8-6 | Vercel 프로덕션 배포 후 `CRON_SECRET` env 등록, 15:40/18:15 KST 실제 cron 실행 로그와 `asOf` 갱신 여부 확인 | Vercel 대시보드/로그 | ☐ 미완료 — 배포 후 확인 필요 |

**Phase 8 완료 조건:** ☑ cron route(8-2) 구현 및 로컬 200/401 검증, ☑ `vercel.json` crons 2개 등록, ☑ 기본 10분 캐시 변경 없음 재확인, ☑ 로컬에서 `asOf` 즉시 갱신 확인, ☐ 배포 후 15:40/18:15 KST 실행 및 `asOf` 갱신 확인(8-6, 남은 작업).

---

## 7. PR 분리 권장 (선택)

| PR | Phase | 리뷰 포인트 |
|----|-------|-------------|
| PR-1 | 1~2 | 키 보안, mapper, 캐시 |
| PR-2 | 3 | UI/UX, Recharts, a11y |
| PR-3 | 4 | cron, 운영 |
| PR-4 | 5 | 문서 정합성, 레거시 정리 |
| PR-5 | 6 | 토큰 캐시 외부화, 운영 안정성 |
| PR-6 | 7 | 인증 플로우, 접근 제어, 시크릿 관리 |
| PR-7 | 8 | 확정 시각 cron 2개(15:40/18:15 KST), `vercel.json`, `CRON_SECRET` 인증 재사용 |

---

## 8. `research.md` 의사결정 대조표 (100% 반영 확인)

| research.md 결정 | plan.md 반영 위치 |
|------------------|-------------------|
| Server + lib 직접 fetch, BFF 선택 | §0.3, §1, §4 |
| Decoding + URLSearchParams | §1.3.2 |
| `revalidate: 86400` + `tags: indices` | §1.3.3, §3.2 |
| 14:00 KST cron, 15:30 단독 ❌ | §3.3, Phase 4 |
| T+1 13:00 UI 안내 | §0.2, §3.4, `DATA_UPDATE_NOTICE` |
| ensureItemsArray | §2.3 |
| 7일 basDt 병렬 A | §2.5.3 |
| Recharts Client, dynamic 대안 | §4.6 |
| tokens + numeric | §5 |
| cacheComponents 미사용 | §3.2 |

---

## 9. 승인 후 첫 커맨드 (참고)

```bash
# Phase 1 시작 시 (승인 후에만 실행)
touch .env.local   # 키 직접 입력
mkdir -p src/lib/api/data-go-kr src/lib/indices src/types src/styles
```

---

**본 `plan.md`를 최종 승인한 뒤에만 Phase 1 파일 생성을 시작한다.**

---

*문서 버전: 1.4 (2026-07-08: Phase 8 구현 완료 — cron 라우트/`vercel.json` 추가, `revalidateTag`는 `{ expire: 0 }`로 즉시 만료 채택, `proxy.ts` matcher에 `api/cron` 누락 버그 수정. 8-6 프로덕션 확인만 남음) · 공공 API 국내 지수 대시보드 최종 구현 계획*
