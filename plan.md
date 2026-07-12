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
| 8 — 시간대별 캐시 최적화 (KIS 마감 후 갱신 패턴 반영) | ⚠️ 8-1~8-5 로컬 구현·검증 완료, 8-6 프로덕션 확인 남음 — **Phase 11 승인 시 구조 자체가 대체되어 8-6은 폐기** |
| 9 — 홈 화면 지표 확장 및 보유종목 관리 | ✅ 그룹 1~7 구현·로컬 검증 완료 (2026-07-09) — 배포 후 cron 확인은 Phase 11로 대체 |
| 10 — 보유종목 알림 기능 (Web Push) | 📋 조사·설계 완료, 구현 미착수 — **호출 방식(맥미니 crontab)은 Phase 11로 대체**, Web Push·조건 판정 설계는 유효 |
| 11 — 데이터 갱신 구조 전면 재설계 (QStash Scheduled Push) | ✅ **구현 완료(2026-07-11, 그룹 1~8)** — KIS 호출을 QStash 잡(`/api/jobs/refresh-market-data`) 단일 경로로 이관(허용 시간 가드 09:00~18:40), 화면은 `market:*` Redis만 읽음(상세 정보 블록 4종 포함 — 같은 날 사용자 승인), `unstable_cache`/`revalidateTag`/Vercel cron 전부 제거, 2단계 staleness 배지·「마지막 갱신」 표기. lint·tsc·build·가드/staleness 실측 통과. **남은 작업: 배포 체크리스트(§11.11 — Vercel env·콘솔 스케줄 4개·장중 수동 시딩·첫 거래일 확인)** |
| 12 — 보유종목 데이터 암호화 저장 (AES-256-GCM) | ⚠️ **구현·로컬 검증 완료(2026-07-10, 12건 실측 PASS)** — 남은 작업: Vercel env 등록·키 백업(사용자), 배포 후 화면 확인·즉시 마이그레이션. **Phase 11보다 먼저 진행** |
| 13 — 보유종목 페이지 개선 (`totalCost` 모델·종목명 자동 조회·종목 상세 페이지) | ✅ **구현 완료(2026-07-11, 13-1~13-6)** — `totalCost` 모델 전환(레거시 `avgPrice` 역산 하위호환), 종목명 CTPF1002R 자동 조회, `stock:{symbolCode}:history` 공용 저장소(2년 백필·cron 갱신), `/holdings/[symbolCode]` 상세 페이지(수정 모드·2년 차트·정보 블록 4종: 시가총액/배당/실적/투자지표), `/holdings` 메인 개편. lint·tsc·build·라이브 실측 통과. **다음: Phase 11 착수** |
| 14 — 핫종목 (최근 1개월/분기/반기/연도 수익률 TOP 100) | ✅ **구현 완료(2026-07-11) — 배포·Upstash 스케줄 등록만 대기.** 완결된 달력 구간 4종(직전 월말 기준 최근 1/3/6/12개월) 수익률 랭킹, 매월 첫 평일 1회 배치(월봉 종목당 1콜 × 유니버스 2,647 실측 = 약 2,650콜), 홈 7번째 카드 + `/hot-stocks` 상세(구간 탭 4개). 2026-06 기준 전 구간 로컬 시딩 실측(3패스 이어받기·실패 0건) |
| 15 — 관심종목 + 시장 통합 카드 | ✅ **구현 완료(2026-07-11, 15-1~15-9 + 로컬 실측 9건 PASS)** — ① 유가(WTI `N`/`WTIF`) 지표 추가, 홈 "시장" 통합 카드, `/indices/market`(미니 카드 3종)·`/indices/oil`. ② 관심종목 `watchlist:{email}` 암호화 저장(`enc:v1:` 실측), 갱신 잡 통합(union 합류·이름 채움·기준가 확정/잠정 승격·멱등 — 전부 로컬 실측), `/watchlist` 목록·상세, 공용 `StockInfoBlocks` 추출(보유종목 상세 리팩터). lint·tsc·build·라우트 마운트 스모크 통과. **남은 실측(배포 후·평일 — §15.5 15-10): oil 첫 갱신 회차 저장, 브라우저 CRUD, 오늘 등록→18:15 승격** |
| 16 — 핫종목 상세 테이블 시장 구분 위첨자 전환 | 📋 **설계 반영 완료, 구현 미착수 — 승인 대기.** "시장" 열 제거 + 종목명 뒤 위첨자(ᴷ/ᴰ)로 대체해 가로 스크롤 해소. 기존 `entry.market` 필드만 사용(추가 API 호출 없음), 핫종목 상세 화면 한정 |

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

### Phase 9 — 홈 화면 지표 확장 및 보유종목 관리

**목표:** 홈 화면을 "KOSPI/KOSDAQ 카드+차트 직결" 구조에서 **요약 카드 6개 그리드 + 지표별 상세 페이지** 구조로 재구성하고, 원달러 환율·미국 10년물 국채금리·(로그인 사용자별) 보유종목 수익률·코스피 변동성 지수 4종을 신규 지표로 추가한다. **최종 통합 확정(2026-07-09) — 이전의 모든 개정판(2026-07-08 최초안, 07-09 1차/2차/3차 수정)을 전부 대체하는 최종 버전. 구현은 승인 후 시작 — 이 문서 갱신 시점까지 소스 파일은 생성하지 않음.**

#### 9.1 조사 결과 (2026-07-08, 실제 KIS API 라이브 호출로 검증 완료)

**결론: 환율·금리 모두 KIS API만으로 가능 — FRED 등 외부 API 불필요.**

기존에 쓰던 국내지수 엔드포인트(`/uapi/domestic-stock/v1/quotations/inquire-index-daily-price`)와는 별도로, KIS가 "해외주식 종목_지수_환율기간별시세" 엔드포인트를 제공한다. `FID_COND_MRKT_DIV_CODE`로 4개 카테고리(N: 해외지수, X: 환율, I: 국채, S: 금선물)를 구분하고, 같은 엔드포인트로 원달러 환율과 미국 국채금리를 둘 다 조회할 수 있다.

| 항목 | 값 |
|---|---|
| 엔드포인트 | `/uapi/overseas-price/v1/quotations/inquire-daily-chartprice` |
| TR_ID | `FHKST03030100` |
| 파라미터 | `FID_COND_MRKT_DIV_CODE`, `FID_INPUT_ISCD`, `FID_INPUT_DATE_1`(시작일), `FID_INPUT_DATE_2`(종료일), `FID_PERIOD_DIV_CODE`(D/W/M/Y) |
| 응답 | `output1`(현재 스냅샷, 국내지수 API의 `output1`과 구조 유사) + `output2`(기간별 배열) |

종목코드는 KIS가 공개 배포하는 해외지수 마스터 파일(`https://new.real.download.dws.co.kr/common/master/frgn_code.mst.zip`, `koreainvestment/open-trading-api` 저장소의 `stocks_info/overseas_index_code.py`가 이 파일을 내려받아 정제하는 스크립트)에서 확인:

| 지표 | `FID_COND_MRKT_DIV_CODE` | `FID_INPUT_ISCD` | 마스터 파일 상 한글명 |
|---|---|---|---|
| 원/달러 환율 | `X` | `FX@KRW` | 원/달러(KMB) |
| 미국 10년물 국채(수익률) | `I` | `Y0202` | 미국 10년T-NOTE 수익률 |

**실측 검증 (App Key/Secret으로 실제 라이브 호출, 2026-07-08):**

```
=== 원/달러 환율 (mrktDivCode=X, iscd=FX@KRW) ===
HTTP 200, output1.ovrs_nmix_prpr = "1500.8000" (오늘), ovrs_nmix_prdy_vrss = "-15.0000"

=== 미국 10년물 국채 (mrktDivCode=I, iscd=Y0202) ===
HTTP 200, output1.ovrs_nmix_prpr = "4.5500" (%), ovrs_nmix_prdy_vrss = "0.0700"

=== 대조군: 다우존스 (mrktDivCode=N, iscd=.DJI) ===
HTTP 200, output1.ovrs_nmix_prpr = "52925.15" — 기존에 알려진 사용 예와 결과 일치, 엔드포인트 신뢰도 확인
```

두 응답 모두 필드 구조(`ovrs_nmix_prpr`, `ovrs_nmix_prdy_vrss`, `prdy_ctrt`, `ovrs_prod_oprc/hgpr/lwpr`)가 국내지수 API의 `bstp_nmix_*` 필드와 거의 1:1 대응 — 기존 `mapKisSnapshot`/`mapKisHistory` 패턴을 그대로 확장해서 재사용 가능할 것으로 보인다(필드명만 다름).

**보유종목 현재가 조회 (기존과 동일 패턴, 실측 확인):**

| 항목 | 값 |
|---|---|
| 엔드포인트 | `/uapi/domestic-stock/v1/quotations/inquire-price` |
| TR_ID | `FHKST01010100` |
| 파라미터 | `FID_COND_MRKT_DIV_CODE=J`(주식), `FID_INPUT_ISCD=종목코드`(6자리) |
| 현재가 필드 | `output.stck_prpr` |

실측: 삼성전자(`005930`) 조회 → HTTP 200, `stck_prpr: "277500"` 정상 반환.

#### 9.2 홈 화면 재구성 — 카드 6개 그리드 (2026-07-09 최종 확정)

기존에는 KOSPI/KOSDAQ 카드에 차트가 바로 붙어있었으나(§4장 `IndexChartsSection`), 이를 전부 "요약 카드"로 통일하고 차트는 상세 페이지로 분리한다. **홈 화면에는 차트를 표시하지 않는다** — 모든 차트는 지표별 상세 페이지(§9.3)로 이동.

**카드 6개 (2열 그리드, 반응형), 각 카드는 클릭/터치 시 해당 상세 페이지로 이동:**

| # | 카드 | 표시 값 | 이동 상세 페이지 |
|---|---|---|---|
| 1 | 코스피 | 현재가, 전일 대비 등락률 | `/indices/kospi` |
| 2 | 코스닥 | 현재가, 전일 대비 등락률 | `/indices/kosdaq` |
| 3 | 원달러 환율 | 현재가, 전일 대비 등락률 | `/indices/usdkrw` |
| 4 | 미국 10년물 국채금리 | 현재가, 전일 대비 등락률 | `/indices/us10y` |
| 5 | 보유종목 수익률 | 총 수익률(%), 전일 대비 변동률(%) | `/holdings` |
| 6 | 코스피 변동성 지수 | 당월 평균 변동성(%), 전월 대비 증감(%p) | `/indices/kospi-volatility` |

- 레이아웃은 기존 다크모드/디자인 토큰 시스템(`tokens.css`)을 그대로 활용.
- 기존 `IndexDashboard`/`IndexChartsSection`(§4.4, §4.6)의 차트 렌더링 부분은 홈에서 제거하고 각 상세 페이지로 이전한다.

#### 9.3 상세 페이지 라우트 구조

| 지표 | 라우트 | 로그인 필요 |
|---|---|---|
| 코스피 | `/indices/kospi` | 불필요 |
| 코스닥 | `/indices/kosdaq` | 불필요 |
| 원달러 환율 | `/indices/usdkrw` | 불필요 |
| 미국 10년물 국채금리 | `/indices/us10y` | 불필요 |
| 보유종목 수익률 | `/holdings` | **필요** |
| 코스피 변동성 지수 | `/indices/kospi-volatility` | 불필요 |

#### 9.4 지표별 상세 설계

##### 9.4.1 코스피/코스닥

- 기존 구현(§2~§4의 mapper·`getDashboard`·`IndexLineChart`) 로직은 그대로 유지하되, 렌더링 위치만 홈(`page.tsx`)에서 상세 페이지(`/indices/kospi`, `/indices/kosdaq`)로 이전한다.
- 구성: 차트(상단, 기존 7거래일 유지 — 기간 확장은 이번 범위 밖) + 일별 수치 리스트(하단).

##### 9.4.2 원달러 환율 / 미국 10년물 금리

- 9.1에서 조사·실측 검증 완료한 KIS 엔드포인트(`/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`, TR_ID `FHKST03030100`) 사용.
- 코스피/코스닥과 동일한 패턴(`mapKisSnapshot`/`mapKisHistory` 등 재사용)으로 스냅샷 + 히스토리(7거래일) 구현.
- 구성: 차트(상단) + 일별 수치 리스트(하단) — 코스피/코스닥 상세 페이지와 동일 형식.

##### 9.4.3 보유종목 수익률

> **⚠️ Phase 13에 의한 개정 예고 (2026-07-10):** 본 절의 `Holding` 모델(`avgPrice` 저장)·종목명 직접 입력·`/holdings` 단일 페이지(CRUD 포함) UI는 **Phase 13에서 `totalCost` 모델·종목명 자동 조회·종목 상세 페이지(`/holdings/[symbolCode]`) 분리로 대체 예정**(§Phase 13 참고). 히스토리 모델(`PortfolioDailyRecord`)·포트폴리오 차트·cron 설계는 그대로 유효.

**입력 방식 범위 (유지):** 수동 입력만 지원한다. CSV 업로드, 이미지 인식, 오픈뱅킹/마이데이터 연동, 웹 스크래핑 등 자동 연동 방식은 이번 범위에서 전부 제외하고, 필요해지면 별도 Phase로 검토한다.

**데이터 모델 (유지):**

```ts
// 설계 스니펫 — 아직 파일 생성 안 함
interface Holding {
  id: string;            // crypto.randomUUID()
  symbolCode: string;     // 종목코드 6자리, 예: "005930"
  name: string;           // 종목명(표시용, 사용자가 직접 입력 — 조회 API로 검증하지 않음)
  quantity: number;       // 수량
  avgPrice: number;       // 매입가(원)
  createdAt: string;
  updatedAt: string;
}
```

**저장 — Upstash Redis, 로그인 이메일 기준:**

- 키: `holdings:{email}` (예: `holdings:dwdchang@gmail.com`) — 현재 보유 목록, `Holding[]` JSON 배열 하나를 통째로 저장/치환. `ALLOWED_EMAILS`가 소수 인원 화이트리스트라 배열 통짜 read/write로 충분, 개별 필드 단위 Redis 자료구조(Hash 등)는 과설계.
- 키: `holdings:{email}:history` — 일별 시계열, `PortfolioDailyRecord[]` 배열(날짜 오름차순), 그해 1월 1일부터 누적. 같은 날짜에 이미 기록이 있으면 덮어쓴다(upsert, 재실행 안전).

```ts
// 설계 스니펫 — 아직 파일 생성 안 함
interface PortfolioDailyRecord {
  date: string;       // "YYYY-MM-DD" (KST 기준)
  totalCost: number;  // 그날의 총 매입금액(원)
  totalValue: number; // 그날의 총 평가금액(원)
}
```

- 기존 `lib/redis/client.ts`의 `getRedis()` 싱글턴 그대로 재사용.
- 신규 모듈 후보: `src/lib/holdings/store.ts` — `getHoldings(email)`, `saveHoldings(email, holdings)`, `getPortfolioHistory(email)`, `upsertPortfolioHistory(email, record)`.

**현재가 조회 (9.1의 엔드포인트 재사용):**

- 각 holding의 `symbolCode`로 `/uapi/domestic-stock/v1/quotations/inquire-price`(TR_ID `FHKST01010100`) 호출 → `stck_prpr`.
- 종목별 계산: 평가금액 = 현재가 × 수량, 매입금액 = 매입가 × 수량, 평가손익 = 평가금액 − 매입금액, 수익률(%) = 평가손익 / 매입금액 × 100.

**홈 카드에 표시:**

1. **총 수익률(%)**: (총평가금액 − 총매입금액) / 총매입금액 × 100 — 오늘 기록의 `totalCost`/`totalValue` 기준.
2. **일일 변동률(전일 대비, %)**: (오늘 총평가금액 − 전일 총평가금액) / 전일 총평가금액 × 100 — 시계열의 최근 2개 기록(오늘·전일) 비교.

**상세 페이지 (`/holdings`, 로그인 필요 — 기존 `page.tsx`와 동일하게 `auth()` 세션 확인 + `isEmailAllowed`):**

- 차트: 그해 1/1부터 오늘까지, 토글 버튼으로 두 모드 전환. 두 모드 모두 같은 저장 데이터(`totalCost`, `totalValue`)를 화면에서 계산해 그리며, 모드별 데이터를 별도로 중복 저장하지 않는다.

  | 모드 | y축 | 비고 |
  |---|---|---|
  | 수익률 모드(기본값) | 그날의 수익률(%) = `(totalValue-totalCost)/totalCost×100` | 지수화 없이 값 그대로 표시(0%면 0, +100%면 100) |
  | 원 단위 모드 | 그날의 `totalValue` | M(백만원)/B(십억원) 영어 축약 단위로 표기 (예: 12,000,000원 → 12M, 1,000,000,000원 → 1B) |

- 차트 하단: 일별 수치 리스트(`date`, `totalCost`, `totalValue`, 수익률%).
- 보유종목 CRUD(추가/수정/삭제) UI도 이 페이지에 포함 — Server Actions로 처리(로그인 페이지의 `signIn` 서버 액션 패턴과 동일하게 `"use client"` 최소화). 입력 필드: 종목코드(6자리, 형식 검증만 — 실존 여부는 저장 시 KIS 현재가 조회로 자연스럽게 검증됨), 종목명, 수량, 매입가.

**cron:** Phase 8에서 신설한 15:40 KST 평일 cron 시점에 맞춰 그날의 `totalCost`/`totalValue`를 `holdings:{email}:history`에 upsert한다. 기존 `/api/cron/revalidate-indices` 라우트에 얹을지 별도 라우트로 분리할지는 **구현 단계에서 판단**한다(§9.6 그룹 6 cron 통합 참고). → **구현 확정(2026-07-09, 사용자 결정):** 기존 라우트를 확장하고, cron 스케줄을 15:40/18:15 두 개에서 **평일 18:15 KST 단일**로 통합(`vercel.json` cron 1개). 캐시 무효화 후 KIS 확정치로 보유종목·변동성 히스토리를 upsert한다.

**단순화 원칙(유지):** 종목 추가/매도로 인한 자금 유출입은 정밀 보정(TWR 등)하지 않는다 — 개인 프로젝트 규모에 맞는 단순화이며, 리밸런싱 보정 로직은 이번 범위에 없음.

##### 9.4.4 코스피 변동성 지수 (신규)

- **정의:** 코스피의 일일 (최고가 − 최저가) / 최저가 × 100 (%)를 매일 계산해서 저장.
- **저장:** `kospiVolatility:history` — `{ date, dailyGapPercent }[]` 일별 시계열, 평일 18:15 KST cron 시점에 함께 기록(§9.4.3 cron 구현 확정 참고). KIS 일자별 응답(output2)의 고가·저가가 있는 거래일 전부를 upsert하므로 최초 실행 시 약 100거래일(≈5개월) 백필된다.

```ts
// 설계 스니펫 — 아직 파일 생성 안 함
interface KospiVolatilityRecord {
  date: string;           // "YYYY-MM-DD" (KST 기준)
  dailyGapPercent: number; // (고가-저가)/저가 × 100
}
```

- **홈 카드 표시:** 당월 평균 변동성(%) — 당월은 오늘까지의 일수만으로 평균 계산, 전월 대비 증감(%p).
- **상세 페이지 (`/indices/kospi-volatility`):** 최근 6개월 월별 평균 변동성 차트 **하나만** 표시(당월 포함, 당월은 진행분까지 평균). 토글 버튼 없음, 차트 하단 목록 없음 — 참고용 지표이므로 최대한 단순하게 유지한다.

#### 9.5 공통 사항

- **보안:** 코스피/코스닥/환율/금리/변동성 지수는 로그인 불필요(기존과 동일, 공개 데이터). 보유종목만 로그인 필요(`session.user.email` + 기존 `isEmailAllowed()`) — 새 인증 로직 불필요, 기존 패턴 재사용.
- **캐시:** 기존 Phase 8 정책(10분 자동 재검증 + 확정 시각 cron) 유지 — 단, cron은 구현 시 평일 18:15 KST 단일로 통합(§9.4.3). 종목별 현재가는 사용자마다 다른 보유종목을 조회하므로 KOSPI/KOSDAQ와 같은 `unstable_cache` 단일 키 방식은 맞지 않음 — 종목코드별 fetch 레벨 캐시 전략은 **구현 단계에서 설계**(방향성만: `next.tags`에 종목코드를 포함해 종목 단위로 무효화 가능하게).
- **단순화 원칙 유지:** 보유종목 자금 유출입 정밀 보정(TWR 등) 안 함.
- **레이아웃:** 홈 화면 카드 레이아웃은 기존 다크모드/디자인 토큰 시스템(`tokens.css`) 그대로 활용.
- Redis 키에 이메일을 평문으로 쓰는 것에 대해: 현재 `ALLOWED_EMAILS`가 1~소수 인원이라 즉시 위험은 없으나, 필요 시 이메일 해시(sha256 등)로 키를 만드는 방안도 구현 단계에서 검토.

#### 9.6 작업 목록 (홈 화면 재구성 포함 — 그룹 재편)

| 그룹 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 1. 홈 화면 리팩토링 | 카드 6개 그리드로 재구성, 기존 `IndexChartsSection` 차트 렌더링을 홈에서 제거하고 카드→상세 페이지 링크 연결 | `components/indices/IndexDashboard.tsx`, `SummaryCard.tsx` (신규) | ✅ 완료 (2026-07-09) |
| 2. 코스피/코스닥 상세 페이지 신설 | 기존 차트+로직을 `/indices/kospi`, `/indices/kosdaq` 상세 페이지로 이전(기존 로직 재사용) | `app/indices/kospi/page.tsx`, `app/indices/kosdaq/page.tsx` (신규) | ✅ 완료 (2026-07-09) |
| 3. 환율/금리 스냅샷+히스토리 | `KIS_ENDPOINTS`/`KIS_TR_ID`에 해외가격 엔드포인트 추가, `fetchKisOverseasPriceDaily(market)` 클라이언트, 도메인 타입/매퍼 확장, 상세 페이지(`/indices/usdkrw`, `/indices/us10y`) 신설 | `lib/api/kis/constants.ts`, `lib/api/kis/client.ts`, `types/indices.ts`, `lib/indices/kisOverseasMapper.ts` (신규), `app/indices/usdkrw/page.tsx`, `app/indices/us10y/page.tsx` (신규) | ✅ 완료 (2026-07-09, 라이브 검증 포함) |
| 4. 보유종목 CRUD+수익률 계산+히스토리 저장 | `Holding`/`PortfolioDailyRecord` 타입, Redis 저장소(`holdings:{email}`, `holdings:{email}:history`), 종목별 현재가 조회+평가금액/수익률 계산, `/holdings` 상세 페이지(CRUD+차트+토글+일별 리스트) | `lib/holdings/store.ts`, `lib/holdings/valuation.ts` (신규), `app/holdings/page.tsx` (신규) | ✅ 완료 (2026-07-09) |
| 5. 변동성 지수 계산+히스토리 저장+상세 페이지 | 일일 변동성(`dailyGapPercent`) 계산 로직, `kospiVolatility:history` 저장소, 당월/전월 집계, `/indices/kospi-volatility` 상세 페이지(최근 6개월 월별 평균 막대 차트) | `lib/indices/volatility.ts`, `lib/date/kst.ts`, `components/indices/VolatilityChart(Client).tsx`, `app/indices/kospi-volatility/page.tsx` (신규) | ✅ 완료 (2026-07-09) |
| 6. cron 통합 | 기존 라우트 확장으로 확정(사용자 결정) — 평일 18:15 KST 단일 cron에서 캐시 재검증 → 변동성 `history` upsert → 허용 이메일별 보유종목 `history` upsert. `vercel.json` cron 2개→1개(`15 9 * * 1-5`) | `app/api/cron/revalidate-indices/route.ts` (확장), `vercel.json`, `getAllowedEmails()` 신설 | ✅ 완료 (2026-07-09) |
| 7. 검증 | 로컬 `build`+`start` 통과, 전체 라우트 응답 확인(미로그인 307→/login, /login 200), cron 401(무인증)/200(인증) 및 변동성 100거래일 백필·재실행 멱등성(중복 날짜 0) Redis 실측 확인 | — | ✅ 완료 (2026-07-09, 로컬 — 배포 후 Vercel cron 실행 로그 확인 남음) |

**Phase 9 완료 조건:** ☑ 홈 화면 카드 6개 그리드 및 상세 페이지 이동 동작, ☑ 코스피/코스닥 상세 페이지 이전 완료, ☑ 환율/금리 스냅샷+히스토리 상세 페이지 표시, ☑ 보유종목 CRUD·수익률·히스토리·차트 토글 동작, ☑ 코스피 변동성 지수 계산·홈 카드·상세 페이지(최근 6개월 차트) 표시, ☑ cron 통합 동작 확인(로컬), ☑ 로컬 검증. (배포 후 Vercel cron 실제 실행 확인은 별도 남은 작업)

**다음 단계:** 배포 후 평일 18:15 KST Vercel cron 실행 로그 및 `holdings:{email}:history`/`kospiVolatility:history` 적재 확인.

---

### Phase 10 — 보유종목 알림 기능 (Web Push)

**목표:** 보유종목이 하락 조건에 걸리면 Web Push로 알림을 보낸다. 종목별 신고가를 추적하고, 조건 3가지(OR) 충족 시 1회 발송 + 2시간 쿨다운 정책으로 재알림한다. 체크는 Vercel cron이 아니라 **맥미니 로컬 crontab이 10분마다 알림 체크 API를 curl로 호출**하는 방식(Vercel Hobby cron 횟수 제한과 무관). **사용자 확정(2026-07-09, phase9.request.md) — 현재는 조사·설계만 완료, 구현 미착수(소스 파일 생성 안 함).**

#### 10.1 조사 결과 (2026-07-09, 저장소·번들 문서 확인)

- **PWA 자산 없음:** `manifest`(정적/동적 모두)·service worker 미존재 — `public/`에는 svg 아이콘만 있음. → 신규 작성 필요.
- **Next.js 16 컨벤션 확인** (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`, `.../01-metadata/manifest.md`):
  - manifest는 `src/app/manifest.ts` 파일 컨벤션(`MetadataRoute.Manifest` 반환) → `/manifest.webmanifest`로 서빙. 홈 화면 설치에 192/512 PNG 아이콘 필요(`public/`).
  - service worker는 `public/sw.js` — `push`(수신 → `showNotification`)·`notificationclick`(클릭 → 앱 열기) 리스너. `navigator.serviceWorker.register("/sw.js")`로 클라이언트에서 등록.
  - 발송은 `web-push` 라이브러리(서버) + VAPID 키. 가이드 권장 env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(공개키), `VAPID_PRIVATE_KEY`(서버 전용). **VAPID 공개키는 설계상 공개 값(클라이언트 구독 시 필수)이라 `NEXT_PUBLIC_` 사용이 §2 서버 전용 키 원칙과 충돌하지 않음.** 키 생성: `npx web-push generate-vapid-keys`.
  - `sw.js`에 전용 응답 헤더 권장(`Cache-Control: no-cache`, 엄격한 CSP) — `next.config.ts` `headers()`로 설정.
  - **iOS는 16.4+에서 홈 화면에 PWA로 설치한 경우에만 푸시 지원** — 설치 안내 UI(InstallPrompt 패턴) 필요.
- **`web-push` 미설치:** `package.json` dependencies에 없음 → 의존성 추가 필요.
- **proxy(미들웨어) 확인:** `src/proxy.ts` matcher가 `api/auth`·`api/cron/revalidate-indices`·`_next/*`·`favicon.ico`만 인증 예외 처리 → **`api/cron/check-alerts`, `/sw.js`, `/manifest.webmanifest`, PWA 아이콘 PNG를 예외에 추가해야 함** (manifest는 브라우저가 credentials 없이 가져갈 수 있어 미로그인 접근이 가능해야 함).
- **KIS 현재가 API 확장 필요:** 기존 `fetchKisStockPrice`(FHKST01010100)는 `stck_prpr`만 사용. 알림 조건 3에 필요한 **당일 종목 등락률**(`prdy_ctrt`+`prdy_vrss_sign`)과 **종목 소속 시장 판별**(`rprs_mrkt_kor_name` 예상) 필드는 응답에 포함된 것으로 알려져 있으나 **구현 시작 시 라이브 실측 검증 필요**(Phase 9 §9.1과 동일한 방식).

#### 10.2 확정 설계 (사용자 결정)

**신고가 추적:**

- 종목의 현재가가 저장된 신고가보다 높아지면, 신고가와 **그 시점의 코스피/코스닥 지수 값**을 함께 갱신. 배열(이력)이 아닌 **단일 값 덮어쓰기**.
- 최초 체크 시(저장된 신고가 없음) 현재가로 초기화하고 그 시점 지수를 함께 저장.

```ts
// 설계 스니펫 — 아직 파일 생성 안 함
interface StockPeak {
  peakPrice: number;   // 신고가(원)
  kospi: number;       // 신고가 갱신 시점 코스피
  kosdaq: number;      // 신고가 갱신 시점 코스닥
  updatedAt: string;   // ISO
}
```

**알림 조건 3가지 (OR — 하나라도 충족 시 알림):**

| # | 조건 | 판정 값 출처 |
|---|---|---|
| 1 | 매입가 대비 종목 수익률 ≤ −10% | `(현재가 − avgPrice) / avgPrice × 100` — holdings + 현재가 |
| 2 | 종목 신고가 대비 현재가 하락률 ≥ 10% | `(peakPrice − 현재가) / peakPrice × 100` — `StockPeak` |
| 3 | 당일 지수 등락률 ≤ −2% **AND** 당일 종목 등락률 ≤ −12% | 지수: 기존 국내지수 API `output1`(코스피/코스닥 중 **종목 소속 시장** 기준), 종목: 현재가 API `prdy_ctrt`(부호 적용) |

**체크 주기 / 호출 방식:**

- 10분마다 **맥미니 자체 crontab**이 알림 체크 API(`/api/cron/check-alerts` 가칭)를 curl로 호출. Vercel cron 아님(Hobby 플랜 cron 제한과 무관).
- crontab은 장중(평일 09시~15시대)으로 제한 권장 — 장외에는 시세가 변하지 않는데 쿨다운 만료마다 같은 알림이 반복되는 것을 방지. 예시(맥미니는 KST):
  `*/10 9-15 * * 1-5 curl -s -H "Authorization: Bearer $CRON_SECRET" https://<배포 도메인>/api/cron/check-alerts`
- 맥미니 crontab 설정은 **Jump Desktop으로 직접 접속해서 수동 설정**해야 함(예전 poswel-menu-app 때와 동일한 제약) → 설정 절차 문서화 필요(§10.5 그룹 5).

**알림 재발송 정책:**

- 조건 충족 시 알림 1회 발송 → 이후 **2시간 동안 같은 종목 재알림 금지**(조건 구분 없이 종목 단위) → 2시간 경과 후에도 여전히 조건 충족이면 다시 발송.
- 구현: 발송 시 쿨다운 키를 `EX 7200`(2시간 TTL)으로 SET — 키 존재 여부만으로 재알림 판단, 만료는 Redis가 자동 처리.

#### 10.3 데이터 모델 — Upstash Redis (기존 `getRedis()` 재사용)

| 키 | 값 | 비고 |
|---|---|---|
| `alerts:{email}:peaks` | `Record<symbolCode, StockPeak>` | 단일 객체 덮어쓰기(이력 없음) |
| `alerts:{email}:cooldown:{symbolCode}` | 발송 시각(ISO) | `EX 7200` — 2시간 자동 만료 |
| `push:subs:{email}` | `PushSubscription[]` | 기기별 여러 구독. 발송 시 410/404 응답 구독은 제거 |

#### 10.4 알림 체크 API·발송 흐름 설계

- 라우트: `GET /api/cron/check-alerts` — 기존 `CRON_SECRET` Bearer 인증 재사용(`isValidCronSecret`을 `lib/cron/auth.ts` 등 공용 모듈로 추출해 revalidate-indices와 공유).
- 흐름: 허용 이메일별 → holdings 로드 → 종목별 현재가·당일 등락률·소속 시장 조회 → 신고가 갱신 → 조건 3종 평가 → (쿨다운 없는 종목만) Web Push 발송 → 쿨다운 키 SET. 단계별 실패 격리 + 응답 JSON에 개별 결과 포함(기존 cron 라우트와 동일한 패턴).
- **캐시 주의:** 기존 `fetchKisStockPrice`는 600초 fetch 캐시를 쓰므로 10분 주기 체크에서는 최대 10분 지연된 가격으로 판정할 수 있음 → 체크 API 전용 조회는 `cache: "no-store"`로 실시간 조회하는 별도 함수(또는 옵션)로 설계.
- 발송 내용(초안): 제목 "종목 알림 — {종목명}", 본문에 충족 조건·현재가·기준값(수익률/신고가 대비/지수 동반 하락), 클릭 시 `/holdings` 열기.

#### 10.5 작업 목록 (구현은 승인 후)

| 그룹 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 1. PWA 기반 | `manifest.ts`·`sw.js`·아이콘(192/512 PNG), `sw.js` 응답 헤더, proxy matcher 예외 추가 | `src/app/manifest.ts`, `public/sw.js`, `public/icon-*.png`, `next.config.ts`, `src/proxy.ts` | ☐ 미착수 |
| 2. Web Push 구독 | `web-push` 설치, VAPID 키 생성·env 등록, 구독/해지 Server Actions + Redis 저장, 구독 토글·iOS 설치 안내 UI | `lib/push/store.ts`, `lib/push/send.ts`, 구독 UI(위치: `/holdings` 또는 홈 — 구현 시 확정) | ☐ 미착수 |
| 3. 신고가 추적·조건 판정 | `StockPeak` 저장소, 조건 3종 평가 로직, KIS 현재가 응답 확장(등락률·시장 구분 — **라이브 실측 검증 포함**), no-store 실시간 조회 | `lib/alerts/store.ts`, `lib/alerts/evaluate.ts`, `lib/api/kis/client.ts`·`types.ts` (확장) | ☐ 미착수 |
| 4. 알림 체크 API | `/api/cron/check-alerts` 라우트 — `CRON_SECRET` 인증 공용 모듈 추출, 평가→발송→쿨다운 파이프라인 | `app/api/cron/check-alerts/route.ts`, `lib/cron/auth.ts` (추출) | ☐ 미착수 |
| 5. 맥미니 crontab 문서화 | Jump Desktop 접속 후 crontab 등록 절차, 장중 제한 스케줄 예시, `CRON_SECRET` 보관 방법 문서 | `docs/macmini-cron.md` (신규) | ☐ 미착수 |
| 6. 검증 | 로컬 HTTPS(`next dev --experimental-https`)에서 구독·수신 테스트, 체크 API 401/200, 조건별 발송·2시간 쿨다운·신고가 갱신 확인, iOS 실기기(홈 화면 설치) 수신 확인 | — | ☐ 미착수 |

**Phase 10 완료 조건:** ☐ PWA 설치 가능(manifest+아이콘+HTTPS), ☐ 푸시 구독/해지 동작 및 Redis 저장, ☐ 신고가 추적(지수 동시 저장) 동작, ☐ 조건 3종(OR) 판정 정확성, ☐ 1회 발송+2시간 쿨다운 동작, ☐ 맥미니 crontab 10분 주기 호출 동작 및 문서화, ☐ iOS 실기기 수신 확인.

**다음 단계:** 이 설계에 대한 승인 후 그룹 1부터 구현 시작. 구현 시작 시 KIS 현재가 응답 필드(`prdy_ctrt`·시장 구분) 라이브 실측을 먼저 수행(§10.1).

> **⚠️ Phase 11에 의한 대체 공지 (2026-07-10):** 본 Phase의 **호출 방식(맥미니 crontab + `/api/cron/check-alerts` + no-store 실시간 조회)은 Phase 11로 전면 대체**된다. Web Push 기반(PWA·VAPID·구독 저장), 신고가 추적, 알림 조건 3종, 쿨다운 정책 등 나머지 설계는 그대로 유효하며 Phase 11 갱신 잡 안에서 실행된다(§11.8.3 참고).

---

### Phase 11 — 데이터 갱신 구조 전면 재설계 (Pull → Scheduled Push)

**목표:** `unstable_cache` 기반 "접속 시 갱신(pull)" 구조를 폐기하고, **정해진 시간에만 QStash 스케줄이 KIS를 호출해 Redis에 저장(push)하고, 화면은 저장된 값만 읽는** 구조로 전환한다. **설계 최종 확정(2026-07-10, `phase9.request.md` 확정 지시문 — §11.10의 결정 6건·갱신 상태 UI 반영, 같은 날 2차 개정: 배지 정책 대안 A+심각도 2단계). 구현 미착수(소스 파일 생성·수정 안 함) — 진행 순서 재확정(2026-07-10 2차): Phase 12(보유종목 암호화, 완료) → Phase 13(보유종목 페이지 개선) 완료 후 착수.**

**요청 원문 요지 (`phase9.request.md`):**

1. **KIS 호출 허용 시간 3종 — 이 외에는 절대 호출 금지** (밤·새벽·15:30~15:40·15:40~18:10·18:10 이후·주말 전부 금지):
   - **평일 09:00~15:30, 10분마다:** 코스피/코스닥/환율/금리 조회 → Redis 저장. 등록된 모든 사용자의 보유종목을 **종목코드 기준 중복 제거해 한 번씩만** KIS 조회 → Redis 저장. 저장된 데이터로 **알림 조건 판정 → 필요시 발송**.
   - **평일 15:40, 1회:** 15:35 종가 확정 반영 (동일 전체 갱신 로직 재사용).
   - **평일 18:10, 1회:** 거래량 정정 확정 반영 (동일 전체 갱신 로직 재사용). → **확정 지시문에서 18:15로 변경** — 18:10 정정 확정치를 포함해 조회하도록 5분 여유(§11.10-A1).
2. 대시보드/홈/상세 페이지는 KIS를 직접 호출하지 않고 **Redis에 저장된 값만 읽는다**.
3. QStash 스케줄 3개(장중 `*/10 9-15 * * 1-5`, `40 15 * * 1-5`, `10 18 * * 1-5`)로 구성. 기존 `unstable_cache` 관련 코드는 제거 검토, **Vercel Cron(`vercel.json`)은 전부 QStash로 이전하고 cron 설정 제거**.

#### 11.1 새 아키텍처 개요

```
[쓰기 경로 — QStash만 KIS를 호출]
QStash 스케줄 (평일 09:00~15:30 10분 / 15:40 / 18:15 KST)
        │ POST + Upstash-Signature
        ▼
/api/jobs/refresh-market-data (신규 Route Handler)
        │ ① 서명 검증 ② KST 허용 시간 가드
        ▼
refreshMarketData() 파이프라인 (lib/jobs/, 3개 스케줄이 동일 로직 재사용)
  1. 지수·환율·금리 4종 KIS 조회 (cache: "no-store")
  2. 전체 허용 이메일의 보유종목 union → 종목코드 중복 제거 → 종목별 1회 KIS 조회
  3. 1·2 결과를 Redis에 스냅샷 저장 (키별 독립 + fetchedAt)
  4. 변동성 records upsert (1의 KOSPI 응답 재사용)
  5. 사용자별 포트폴리오 평가(3의 저장 가격 사용) → holdings history upsert
  6. (Phase 10 구현 후) 거래일 확인(KIS 응답 basDt == KST 오늘) 후 알림 조건 판정
     → Web Push 발송 → 쿨다운 SET (휴장일이면 이 단계만 skip — §11.10-A5)

[읽기 경로 — KIS 호출 없음]
page.tsx / 상세 페이지 [Server] ──► lib/market/store.ts (Redis 리더)
                                        │ 저장된 스냅샷 + fetchedAt
                                        ▼
                              UI (fetchedAt 기반 staleness 표시)
```

- 쓰기와 읽기가 완전히 분리된다. `unstable_cache`·`revalidateTag`·fetch `next.revalidate`는 전부 불필요해져 제거한다(§11.7).
- 파이프라인은 **단계별 실패 격리**(기존 cron 라우트 패턴 재사용): 한 지표/종목 실패가 나머지 저장을 막지 않고, 실패 항목은 Redis의 이전 값이 유지된다.
- 모든 저장은 **멱등**(SET 덮어쓰기 + 날짜 기준 upsert)이라 재시도·중복 실행에 안전하다.

#### 11.2 Redis 데이터 모델 (신규 + 기존 유지)

| 키 | 값 | 비고 |
|---|---|---|
| `market:detail:{kospi\|kosdaq\|usdkrw\|us10y}` | 기존 `IndexDetailData` 상당(스냅샷+히스토리+dailyRows) + `fetchedAt` | 신규 — 상세 페이지가 그대로 읽음. 홈 카드도 이 키의 스냅샷 부분만 사용 (대시보드용 별도 키는 두지 않음 — 이중 저장 방지) |
| `market:stock:{symbolCode}` | `{ price, changeRate, marketName, fetchedAt }` | 신규 — 사용자 무관 공용. `changeRate`(당일 등락률)·`marketName`(소속 시장)은 Phase 10 알림 조건 3용으로 함께 저장(§10.1 실측 검증 항목 유지) |
| `market:lastRefreshAt` | `{ at, trigger, ok }` | 신규 — 마지막 갱신 잡 성공 시각. staleness 판단·수동 점검용 |
| `holdings:{email}` / `holdings:{email}:history` | 기존 그대로 | Phase 9 모델 유지 — 단, `holdings:{email}`의 `Holding` 페이로드는 Phase 13에서 `avgPrice`→`totalCost`로 변경 예정(§13.5) |
| `stock:{symbolCode}:history` | 종목별 일별 종가 시계열 (최근 1~2년) | Phase 13 신설(§13.3) — 사용자 무관 공용(공개 시세 데이터, 암호화 대상 아님). 갱신 잡에서 보유 전 종목 upsert 연계 |
| `kospiVolatility:history` | 기존 그대로 | Phase 9 모델 유지 |
| `alerts:{email}:peaks` / `alerts:{email}:cooldown:{symbol}` / `push:subs:{email}` | 기존 Phase 10 설계 그대로 | 호출 주체만 QStash 잡으로 변경 |

#### 11.3 QStash 조사 결과 (2026-07-10, 공식 문서 확인)

| 항목 | 확인 내용 | 출처 |
|---|---|---|
| cron 타임존 | 기본 UTC, **`CRON_TZ=` 접두사로 IANA 타임존 지정 가능** → KST로 직접 표기 가능 | docs `features/schedules` |
| 스케줄 로딩 지연 | 최초 등록 후 활성 노드 반영까지 **최대 60초** — 첫 회차가 정각보다 늦을 수 있음(수용) | docs `features/schedules` |
| 재시도 | 실패 시 지수 백오프 `min(86400, e^(2.5n))초` ≈ 1차 12초, 2차 2분28초, 3차 30분. 최대 횟수는 플랜별 상이(기본은 플랜 최대치, `Upstash-Retries` 헤더로 하향 가능) | docs `features/retry` |
| 재시도 소진 후 | **DLQ로 이동**(Free 플랜 3일 보존) — 수동 재발송 가능. `Upstash-Failure-Callback`으로 실패 통지 URL 지정 가능 | docs `features/retry`, `overall/pricing` |
| 인증 | 요청마다 `Upstash-Signature` 헤더(JWT). `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` 2개로 검증(키 로테이션 대응). TS SDK `@upstash/qstash`의 `Receiver` 제공 — **raw body 문자열 그대로** 검증해야 함 | docs `howto/signature` |
| Free 플랜 한도 | **1,000 메시지/일**(재시도도 1건씩 과금), 활성 스케줄 10개, 응답 대기 최대 15분 | docs `overall/pricing` |

**용량 검토:** 장중 40회(09:00~15:30, 10분 간격) + 15:40 + 18:15 = **평일 42메시지/일**. 확정 재시도 정책(§11.4: 장중 1회·15:40 0회·18:15 1회)상 최악에도 +41건 = 83건 — Free 한도(1,000/일)의 9% 이내. 스케줄도 4개로 한도(10개) 내. **Free 플랜으로 충분.**

**의존성:** `@upstash/qstash` 미설치 → 추가 필요. env 추가: `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` (스케줄은 Upstash 콘솔에서 생성하므로 `QSTASH_TOKEN`은 앱 코드에 불필요).

#### 11.4 스케줄 설계 — 요청서 cron 표현식의 문제와 수정안

**요청서의 `*/10 9-15 * * 1-5`는 15:40·15:50 실행을 포함한다** (`9-15`시 × `*/10`분 = 09:00~15:50). 이는 ① 허용 시간(09:00~15:30) 밖 호출이라 요청서 자신의 "절대 금지" 원칙과 모순되고, ② 15:40 전용 스케줄과 중복 실행된다. 따라서 장중 표현식을 둘로 나눠 **스케줄 4개**로 등록한다:

| # | 스케줄 (QStash, `CRON_TZ=Asia/Seoul`) | 실행 시각 (KST) | 목적 |
|---|---|---|---|
| 1 | `CRON_TZ=Asia/Seoul */10 9-14 * * 1-5` | 09:00~14:50, 10분마다 | 장중 갱신 + 알림 판정 |
| 2 | `CRON_TZ=Asia/Seoul 0,10,20,30 15 * * 1-5` | 15:00~15:30, 10분마다 | 장중 갱신 마지막 구간 |
| 3 | `CRON_TZ=Asia/Seoul 40 15 * * 1-5` | 15:40 | 종가 확정 반영 |
| 4 | `CRON_TZ=Asia/Seoul 15 18 * * 1-5` | **18:15 (확정 — §11.10-A1)** | 거래량 정정 확정 반영 (18:10 정정치 포함 조회, 5분 여유) |

- 4개 모두 **같은 엔드포인트**를 호출한다(로직 재사용 — 요청서 명시).
- **재시도 정책 (확정 — §11.10-A2·A3):**
  - 스케줄 1·2 (장중): `Upstash-Retries: 1` — 1차 재시도 +12초(창 내). 그 이상은 10분 뒤 다음 회차가 자연 복구하므로 불필요.
  - 스케줄 3 (15:40): `Upstash-Retries: 0` — **실패 시 재시도 없이 포기.** 18:15 회차가 최종 확정치를 커버하므로 문제없음.
  - 스케줄 4 (18:15): `Upstash-Retries: 1` — 실패 시 **전체(부분 아님) 1회 재실행.** 그래도 실패하면 포기하고 **다음 영업일 09:00 정규 스케줄까지 대기**(별도 부분 재시도 로직 없음). → **개정(2026-07-11, 콘솔 등록 시): Upstash 콘솔에서 Retry-Delay 값 저장이 안 되는 문제로 고정 5분 지연은 폐기 — Retries 1만 유지하고 지연은 QStash 기본 백오프(1차 ≈ +12초)에 맡긴다.** 재실행 시각이 18:20 → 약 18:15+12초로 앞당겨질 뿐, 18:10 정정치 이후라는 전제는 동일하게 성립.
- **KST 허용 시간 가드(이중 방어):** 잡 시작부에서 "KST 평일 && 09:00~18:40" 밖이면 KIS를 호출하지 않고 no-op 200을 반환한다(200이어야 QStash가 재시도하지 않음). 스케줄 오설정·수동 오호출로 밤·주말에 KIS가 호출되는 것을 코드 레벨에서 차단한다. 상한 18:40은 18:15 회차의 확정 재시도(≈18:20 + 처리 여유)를 가드가 막지 않기 위한 값.

#### 11.5 엔드포인트·인증·미들웨어

- **신규 라우트:** `POST /api/jobs/refresh-market-data` (QStash publish는 POST — 기존 cron GET과 다름).
- **인증(권장): QStash 서명 검증** — `@upstash/qstash` `Receiver`로 `Upstash-Signature` JWT 검증. Bearer 시크릿 단일 비교보다 스푸핑에 강하고(요청 URL·body 해시·만료가 JWT claim에 포함) 키 로테이션을 지원한다.
- **`CRON_SECRET` Bearer 경로 병행 유지:** 로컬 검증·최초 시딩·장애 시 수동 재실행용(서명 검증 실패 시 Bearer 검사로 폴백). 수동 트리거도 §11.4의 KST 가드를 동일하게 통과해야 한다.
- **`src/proxy.ts` matcher 수정:** 인증 예외에서 `api/cron/revalidate-indices`를 제거하고 `api/jobs/refresh-market-data`를 추가 (Phase 8 보안 검토 방침대로 라우트 단위 최소 예외 유지).

#### 11.6 읽기 경로 변경 — `unstable_cache` 제거

| 대상 | 현재 | 변경 후 |
|---|---|---|
| `lib/indices/getDashboard.ts` | `unstable_cache` + KIS 4종 직접 호출 | `market:detail:*` 4키 Redis 읽기로 대체 (`unstable_cache` 제거) |
| `lib/indices/getIndexDetail.ts` / `getOverseasDetail.ts` | `unstable_cache` + KIS 직접 호출 | `market:detail:{indicator}` Redis 읽기로 대체 |
| `lib/holdings/valuation.ts` `getPortfolioValuation` | 종목별 `fetchKisStockPrice` 직접 호출 (사용자 접속·홈 카드 렌더마다) | `market:stock:{symbol}` Redis 읽기로 대체 — **접속 시 KIS 호출 완전 제거** |
| `lib/api/kis/client.ts` | `next: { revalidate: 600, tags }` fetch 캐시 | `cache: "no-store"` — 호출 주체가 갱신 잡뿐이므로 캐시 불필요. `KIS_CACHE_REVALIDATE_SECONDS`·`KIS_CACHE_TAGS` 상수 제거 |
| `app/page.tsx` | `export const revalidate = 600` | 제거 (`auth()` 사용으로 이미 dynamic — Redis를 매 요청 읽음) |
| `app/api/cron/revalidate-indices/route.ts` | 18:15 Vercel Cron: `revalidateTag` + 변동성/보유종목 upsert | **라우트 삭제** — upsert 로직은 `lib/jobs/` 파이프라인으로 이전, `revalidateTag`는 소멸 |
| `vercel.json` | crons 1개 (`15 9 * * 1-5`) | **crons 설정 제거** (요청서 명시) |
| `asOf` 의미 | "캐시 miss로 KIS를 호출한 시각" | "QStash 잡이 KIS에서 받아온 시각(`fetchedAt`)" — 표시 방식은 **§11.10-B(확정·2차 개정)**: 홈 카드 2단계 배지(장중 한정, 경고 20분~1시간/심각 1시간+) + 상세 페이지 「마지막 갱신: YYYY-MM-DD HH:mm」 상시 표시 |

#### 11.7 기존 Phase 8/9/10과의 충돌 지점 정리

**Phase 8 (시간대별 캐시 최적화) — 구조 전체가 대체됨:**

| 충돌 지점 | Phase 8 설계 | Phase 11 |
|---|---|---|
| 갱신 트리거 | 접속 시 10분 `unstable_cache` 자동 재검증 + 확정 시각 `revalidateTag` cron | 접속과 무관한 QStash 스케줄 push. **접속 시 갱신은 "밤·주말에도 캐시 miss면 KIS 호출"이라 새 원칙(허용 시간 외 절대 금지)과 정면 충돌** — 폐기 |
| cron 인프라 | Vercel Cron + `CRON_SECRET` Bearer | QStash + 서명 검증 (`CRON_SECRET`은 수동 트리거용으로만 잔존) |
| `revalidateTag(tag, { expire: 0 })` (8-2에서 검증한 핵심 메커니즘) | 확정 시각 강제 무효화 | Next 캐시 자체가 없어져 소멸 |
| 8-6 (배포 후 cron 확인) | 남은 작업 | **폐기** — Phase 11 배포 확인으로 대체 |
| 정정 반영 시각 | **18:15** (실측 "18:10경 정정"에 5분 여유) | **18:15로 확정**(§11.10-A1 — Phase 8과 동일 근거 유지, 충돌 해소) |

**Phase 9 (지표 확장·보유종목) — 데이터·UI 설계는 유지, 갱신·캐시 부분만 대체:**

| 충돌 지점 | Phase 9 설계 | Phase 11 |
|---|---|---|
| cron 통합 (§9.4.3·그룹 6, 사용자 결정) | 평일 18:15 단일 cron에서 revalidate + 변동성/보유종목 upsert | QStash 스케줄 4개로 분산, upsert는 매 회차 실행(멱등이라 안전 — 오히려 당일 기록이 장중에도 갱신되는 이점). **18:15 단일 통합 결정은 번복됨** |
| 종목 현재가 조회 주체 | 사용자 접속 시 본인 보유종목만 조회 (§9.5: 종목코드 태그 fetch 캐시 전략) | 갱신 잡이 **전체 사용자 union·중복 제거 후 1회씩** 조회(요청서 명시) — 사용자별 조회·태그 캐시 전략 폐기 |
| 보유종목 저장 시 실존 검증 (그룹 4: "저장 시 KIS 현재가 조회로 자연스럽게 검증") | 저장 액션이 KIS 즉시 호출 | **사용자 액션은 임의 시각 발생 → 허용 시간 규칙 위반.** §11.10-A4로 해소 확정 — KIS 검증 제거, 형식 검증만 |
| 홈 `revalidate = 600` | 세그먼트 캐시 | 제거 (§11.6) |
| 변동성 upsert 시점 | 18:15 1회 | 매 회차 (당일 고저가 장중에 갱신됨 — 홈 카드의 당월 평균이 장중에도 최신) |

**Phase 10 (알림) — 호출 방식만 대체, 판정·발송 설계는 유효:**

| 충돌 지점 | Phase 10 설계 | Phase 11 |
|---|---|---|
| 체크 트리거 | **맥미니 crontab이 10분마다 `/api/cron/check-alerts` curl** (Jump Desktop 수동 설정, §10.5 그룹 5 문서화 포함) | **폐기** — 장중 QStash 잡 6단계에 통합(요청서 명시). 맥미니 의존·수동 설정 절차 자체가 사라짐 |
| 판정용 시세 | `cache: "no-store"` 실시간 조회 전용 함수 (§10.4) | 잡이 같은 실행에서 **방금 저장한** 데이터로 판정 — 신선도 동일, 별도 함수 불필요 |
| 판정에 필요한 필드 | 체크 API가 그때그때 조회 | `market:stock:{symbol}` 스냅샷에 `prdy_ctrt`(등락률)·시장 구분을 **미리 포함**해야 함(§11.2) — 라이브 실측 검증 항목(§10.1)은 그대로 유효 |
| 장외 반복 알림 방지 (§10.2 "crontab 장중 제한 권장") | crontab 시간대로 해결 | 스케줄 자체가 장중에만 존재 — 자동 해결. 단 **공휴일 문제는 잔존**(§11.9 시나리오 7) |
| `StockPeak`·조건 3종·쿨다운·Web Push/PWA | — | **변경 없음.** Phase 10 구현 시 갱신 잡의 6단계에 끼워 넣는 방식으로 연결 |

#### 11.8 KIS 호출량 비교 (근거)

- **현재(pull):** 캐시 TTL 600초 기준 최악의 경우 접속 패턴에 따라 무제한 분산(밤·주말 포함) + 보유종목은 사용자·종목별 개별 캐시 miss.
- **변경 후(push):** 평일 42회 × (지수 4 + 종목 N) 고정. 종목 10개 가정 시 **일 588콜, 밤·주말 0콜** — 호출량이 예측 가능해지고 KIS 유량 제한(계정당 초당 호출 제한) 관리도 잡 내부의 병렬도 제어(예: 종목 fetch를 청크 단위 `Promise.all`)로 일원화된다. 토큰은 기존 Redis 토큰 캐시(Phase 6)를 그대로 재사용.

#### 11.9 데이터 일관성·장애 시나리오 및 대응

| # | 시나리오 | 영향 | 대응 |
|---|---|---|---|
| 1 | **장중 회차 1회 실패** | 데이터 최대 20분 stale, 해당 회차 알림 판정 skip(알림 최대 10분 지연) | QStash 재시도 1회(+12초, `Upstash-Retries: 1` — §11.4 확정). 그래도 실패 시 **다음 회차가 자연 복구**. 모든 저장이 멱등이라 재시도 중복 실행 무해 |
| 2 | **재시도와 정규 회차 경합** (예: 15:00 회차 재시도가 15:10 회차보다 늦게 성공) | 이론상 out-of-order 쓰기 | 재시도는 "옛 데이터 재전송"이 아니라 **잡 재실행 → KIS를 그 시점에 새로 호출**이므로 나중에 쓴 쪽이 항상 더 신선하거나 동등 — last-write-wins 수용. (동시 실행 겹침도 10분 간격·값 차이 미미로 수용, 필요 시 `fetchedAt` 비교 가드는 과설계로 미채택) |
| 3 | **15:40 회차 실패** (종가 확정 미반영) | 15:30 장중 값이 유지 — 종가와 거의 동일하나 "확정치 아님" | **재시도 없이 포기 (확정 — §11.10-A2, `Upstash-Retries: 0`).** 18:15 회차가 최종 확정치(종가+거래량 정정)를 동일 로직으로 커버. 실패는 DLQ에만 기록 |
| 4 | **18:15 회차 실패** (최종 확정치 미반영) | 재실행까지 실패하면 **다음 영업일 09:00까지 stale 지속** — 요청서가 우려한 최장 구간. 단 가격은 15:40 반영치와 사실상 동일, 거래량 정정만 영향이라 심각도 낮음 | **QStash 기본 백오프로 전체 1회 재실행 (§11.10-A3 — 2026-07-11 개정: 콘솔 Retry-Delay 저장 불가로 고정 5분 대신 기본 백오프 1차 ≈ +12초).** 그래도 실패하면 포기하고 다음 영업일 09:00 대기(부분 재시도 없음). 실패 인지는 **DLQ**(3일 보존, 수동 재발송 가능) + **Failure Callback**(Phase 10 Web Push 구현 후 자체 알림 채널로 통지, 그 전에는 콘솔 모니터링). 배지는 장중 판정(§11.10-B1)이라 저녁 실패 자체는 표시되지 않으며, 다음 영업일 09:00 회차까지 실패가 이어지면 09:20부터 경고로 드러남 |
| 5 | **전 회차 연속 실패** (KIS 전산 점검 — 7/4~7/5 실제 전례, 토큰 장애 등) | Redis에 마지막 성공 데이터가 계속 표시됨 — **사용자가 낡은 데이터를 최신으로 오인할 위험** (구 구조는 에러가 났고, 신 구조는 조용히 낡음) | ① 홈 카드 **2단계 배지**(§11.10-B 개정): 장중 20분 경과 = 경고, **1시간 경과 = 심각** — 정확히 이 시나리오(여러 회차 연속 실패)가 시각적으로 구분되어 드러남. + 상세 페이지 「마지막 갱신」 상시 표기. ② `market:lastRefreshAt`으로 수동 점검. ③ DLQ + Failure Callback. **"조용한 성공처럼 보이는 실패"를 UI가 반드시 드러내는 것이 이 구조의 필수 안전장치** |
| 6 | **Redis(Upstash) 장애** | 구 구조는 KIS 직접 호출이라 화면은 살았지만(토큰 캐시 제외), 신 구조는 **읽기 경로가 Redis 단일 의존 → 화면 전체 에러** | 기존 에러 UI 재사용 + Upstash 가용성 수용. 2차 캐시(메모리 등)는 과설계로 미채택 — 단일 의존 증가는 이 재설계의 **의식적 트레이드오프**로 명기 |
| 7 | **공휴일(평일이지만 휴장)** | 스케줄은 실행됨 → KIS가 직전 거래일 데이터 반환 → 같은 값 덮어쓰기(멱등이라 데이터는 무해). **알림은 문제**: 조건 충족 상태가 지속되면 쿨다운(2h) 만료마다 재알림 — Phase 10 맥미니 설계에도 있던 문제가 잔존 | **확정(§11.10-A5):** 별도 공휴일 API 없이, KIS 응답의 기준일(`basDt`)이 KST 오늘과 다르면 휴장으로 간주해 **알림 판정 단계만 skip** (데이터 저장·upsert는 멱등이라 그대로 수행) |
| 8 | **최초 배포 / 빈 Redis** | 첫 갱신 회차 전까지 화면에 데이터 없음 | empty state UI + 배포 직후 **허용 시간 내 수동 1회 트리거**(`CRON_SECRET` 경로)로 시딩. 마이그레이션은 장중 배포 권장 |
| 9 | **잡 실행 시간 초과** | 종목 수 증가 시 Vercel 함수 시간 제한(Hobby 기본 10초대) 초과 위험 | QStash는 응답을 15분(Free)까지 기다리므로 병목은 Vercel — `maxDuration` 상향 + 종목 fetch 청크 병렬화. 종목 ~수십 개 규모에선 여유 |
| 10 | **QStash 자체 지연** | 스케줄 등록 후 반영 최대 60초(문서 명시) — 09:00 첫 회차가 수십 초 늦을 수 있음 | 수용 (10분 주기 데이터에 무의미한 오차) |

#### 11.10 확정 결정사항 (2026-07-10, `phase9.request.md` 확정 지시문 반영)

**A. 재시도·실패 정책 (확정):**

| # | 사안 | 확정 내용 |
|---|---|---|
| A1 | 정정 반영 회차 | **18:15** — 기존 18:10 정정 확정치를 **포함해서** 조회하도록 5분 여유 (Phase 8 실측 근거와 동일, 요청서 초안의 18:10에서 변경) |
| A2 | 15:40 스케줄 실패 시 | **재시도 없이 포기** (`Upstash-Retries: 0`) — 18:15가 최종 확정치를 커버하므로 문제없음 |
| A3 | 18:15 스케줄 실패 시 | **한 번 더 전체(부분 아님) 재실행** (`Upstash-Retries: 1`). 그래도 실패하면 **포기하고 다음 영업일 09:00 정규 스케줄까지 대기** — 별도 부분 재시도 로직은 만들지 않음. **개정(2026-07-11): 콘솔에서 Retry-Delay 저장 불가 → 고정 5분(≈18:20) 대신 QStash 기본 백오프(1차 ≈ +12초)로 재실행** |
| A4 | 보유종목 등록 시 검증 | **KIS 실존 검증 제거** — 형식(숫자 6자리 등) 검증만 수행. 잘못된 코드는 다음 갱신 회차에서 해당 종목만 조회 실패 → 화면에 「시세 없음」 표기 (실패 격리로 다른 종목 무영향) |
| A5 | 공휴일 판단 | **별도 공휴일 API 없이**, KIS 응답의 기준일(`basDt`)이 KST 오늘 날짜와 다르면 휴장으로 간주해 **알림 판정을 건너뜀** (데이터 저장·upsert는 그대로 수행 — 멱등) |
| A6 | 부분 실패 시 응답 정책 | **지수/보유종목 데이터 갱신 실패 → 500** (QStash 재시도 트리거 — 전체 재실행되지만 멱등이라 무해). **알림 발송만 실패 → 로그만 남기고 200** (재시도 없음) |

**B. 갱신 상태 표시 UI (확정 — 2026-07-10 2차 개정: 대안 A + 심각도 구분. 최초 확정안의 "상시 판정 — 장외·주말 배지 상시 표시" 동작을 대체):**

| # | 사안 | 확정 내용 |
|---|---|---|
| B1 | 홈 카드 배지 — 판정 시간 | **장중(KST 평일 09:00~18:20, 정규+재시도 창)에만 배지 판정.** 장외(18:20~다음날 09:00, 주말 포함)에는 배지 자체를 표시하지 않음 — "밤마다 배지 상시 표시"였던 최초안의 부작용 제거 |
| B2 | 홈 카드 배지 — 심각도 2단계 | 홈 화면 **카드 6개 각각의 아이콘 우측 상단**, `fetchedAt` 경과 기준: **경고** = 20분~1시간 미만(단순 실패 1회 이상 추정, 예: 노란색·작은 느낌표) / **심각** = 1시간 이상(장중인데 여러 회차 연속 실패 추정, 예: 빨간색·강조된 느낌표). 두 단계는 시각적으로 구분. 원천: 코스피/코스닥/환율/금리 카드는 해당 `market:detail:*`의 `fetchedAt`, 보유종목·변동성 카드는 `market:lastRefreshAt` |
| B3 | 상세 페이지 갱신 시각 | 각 상세 페이지(`/indices/*`, `/holdings`) **상단 구석**에 「마지막 갱신: YYYY-MM-DD HH:mm」(KST, `fetchedAt`) 작게 표시 — **배지와 별개로 항상 표시(장외 포함, 개정에서도 유지)** |
| B4 | 스타일 | 배지·갱신 시각 모두 기존 디자인 토큰(`tokens.css`) 색상 체계 안에서 매핑 — **다크/라이트 모드 모두 가독성 확보.** 경고(노랑 계열)/심각(빨강 계열)에 맞는 기존 토큰이 없으면 시맨틱 토큰 추가 |

> (설계 검토 단계에서 논의했던 "창 밖 재시도 허용 범위" 쟁점은 A2·A3 확정으로 소멸 — 재시도가 전부 QStash 기본 백오프 1차 ≈ +12초뿐이라(2026-07-11 개정: 18:15 회차의 고정 5분 지연 폐기) KST 가드 envelope 09:00~18:40 안에 여유 있게 들어온다. §11.4 참고.)

#### 11.11 작업 목록 (설계 확정 완료 — 구현은 착수 지시 후, 소스 파일 생성·수정 금지 상태)

| 그룹 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 1. QStash 셋업 | `@upstash/qstash` 설치, 서명 키 env 등록(로컬·Vercel), Upstash 콘솔에서 스케줄 4개(`CRON_TZ=Asia/Seoul`) 등록 — **재시도 헤더 포함(§11.4 확정: 장중 1회 / 15:40 0회 / 18:15 1회+5분 지연)**, Failure Callback 설정 검토 | `package.json`, `.env.local`, Upstash 콘솔 | ◐ 코드 측 완료 (2026-07-11, `@upstash/qstash@2.11.1` 설치) — **서명 키 env 등록(로컬·Vercel)·콘솔 스케줄 4개 등록은 배포 시 사용자 작업(§11.11 하단 배포 체크리스트)** |
| 2. Redis 스토어·잡 파이프라인 | `market:detail:*`/`market:stock:*`/`market:stockInfo:*`(추가)/`market:lastRefreshAt` 리더·라이터, staleness 판정 유틸, `refreshMarketData()` 파이프라인(6단계, 실패 격리, KST 가드 09:00~18:40, 거래일 가드 — `basDt` 기준 §11.10-A5), 변동성·holdings upsert 이전 + **종목명 채움(A4)·종목 히스토리(신규 즉시 백필/기존은 15:40·18:15 확정 회차 갱신)·정보 블록 4종(확정 회차 1일 1회) 통합** | `lib/market/store.ts`, `lib/market/staleness.ts`, `lib/jobs/refreshMarketData.ts` (신규) | ✅ 완료 (2026-07-11) |
| 3. 잡 엔드포인트 | `POST /api/jobs/refresh-market-data` — QStash 서명 검증 + `CRON_SECRET` 수동 폴백, 부분 실패 응답 정책(§11.10-A6 확정: 데이터 갱신 실패 500 / 알림 발송만 실패 로그+200), `maxDuration = 300` | `app/api/jobs/refresh-market-data/route.ts` (신규) | ✅ 완료 (2026-07-11 — 무인증 401·KST 가드 no-op 200 실측) |
| 4. 읽기 경로 전환 | `getDashboard`/`getIndexDetail`/`getOverseasDetail`/`valuation`/`stockInfo`(getStockInfo 읽기 전용화 — **상세 정보 블록 4종도 잡 이관, 2026-07-11 사용자 승인**)를 Redis 리더로 교체, `unstable_cache`·fetch 캐시 옵션·`revalidate` export 제거, KIS client `no-store` 전환, 보유종목 저장 검증 변경(§11.10-A4: 형식 검증만 — 종목명은 빈 값 저장 후 잡이 채움, 시세 없는 종목 「시세 없음」 표기·합계 제외) | `lib/indices/*`, `lib/holdings/valuation.ts`·`stockInfo.ts`, `lib/api/kis/client.ts`·`constants.ts`, `app/page.tsx`, `app/holdings/*`, `app/indices/*` | ✅ 완료 (2026-07-11) |
| 5. 레거시 제거 | `app/api/cron/revalidate-indices/route.ts` 삭제, `vercel.json` 삭제(crons만 있었음), `proxy.ts` matcher 예외 교체 | 해당 파일 | ✅ 완료 (2026-07-11) |
| 6. 갱신 상태 UI | 홈 카드 6개 **2단계 배지** — 장중(09:00~18:20)에만 판정, 경고(20분~1시간, `--color-warning`)/심각(1시간+, `--color-critical`) 시각 구분, 장외·주말 미표시. 상세 페이지(지수 4종·보유종목·종목 상세) 상단 「마지막 갱신」 상시 표기. `tokens.css` 시맨틱 토큰 추가(다크 모드 warning 별도값), 빈 Redis empty state 안내 문구 | `SummaryCard.tsx`, `IndexDashboard.tsx`, `IndexDetailScreen.tsx`, 페이지들, `tokens.css` | ✅ 완료 (2026-07-11) |
| 7. 검증 | 로컬: lint·tsc·build 통과, KIS import가 잡 경로 3파일(`lib/jobs`·`stockHistory`·`stockInfo` 쓰기부)뿐임을 grep 확인, `unstable_cache`/`revalidateTag`/`revalidate` export 0건, 엔드포인트 무인증 401·주말 KST 가드 no-op 200 실측, staleness 경계 12케이스 단위 검증 통과. **배포 후: 시딩(장중 수동 1회), 스케줄 4개 실행 로그, 15:40·18:15 확정 반영, DLQ 확인 (§11.11 하단 체크리스트)** | — | ✅ 로컬 완료 (2026-07-11) — 배포 검증 남음 |
| 8. (Phase 10 연동 지점) | 알림 판정·발송을 잡 6단계에 연결하는 인터페이스만 정의(빈 훅 `evaluateAlertsHook` — 거래일 가드 통과 시에만 호출, 실패 시 로그+200) | `lib/jobs/refreshMarketData.ts` 내 훅 | ✅ 완료 (2026-07-11) |

**구현 중 확정 사항 (2026-07-11):**

- **종목 상세 정보 블록 4종도 잡으로 이관 (사용자 승인):** Phase 13이 상세 페이지 렌더 시 KIS 5종을 호출하던 것을 폐기 — 잡이 `market:stockInfo:{code}`(순위·배당·실적, 가격 무관 부분)를 저장하고, 화면은 `market:stock:{code}` 스냅샷(현재가·투자지표·시가총액 원천)과 조합만 한다. 시가배당률 등 가격 의존 값은 읽기 시 계산. 밤·주말에 상세 페이지를 열어도 KIS 0콜.
- **갱신 주기 차등:** 현재가 스냅샷은 매 회차(42회/일), 종가 히스토리·정보 블록(배당·실적·순위)은 **15:40·18:15 확정 회차에만** 갱신(확정 종가 의미 유지 + 호출량 절감). 신규 등록 종목은 어느 회차든 즉시 백필·시딩.
- **A4 구체화:** 등록 액션은 `name: ""`으로 저장 → 다음 회차에 잡이 CTPF1002R로 채움(그 전까지 화면은 종목코드 표시). 시세 스냅샷 없는 종목은 평가 null(「시세 없음」)로 격리하고 합계에서 제외(`PortfolioValuation.missingPriceSymbols`).
- `market:lastRefreshAt`은 **성공한 실행만** 기록 — 실패가 이어지면 배지가 정확히 낡은 시각 기준으로 판정된다.

**배포 체크리스트 (남은 사용자 작업):**

1. Vercel env에 `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` 등록 (Upstash 콘솔 → QStash → Signing Keys). 로컬 `.env.local`에도 추가(로컬 서명 검증 테스트용 — 없으면 `CRON_SECRET` 폴백으로 동작).
2. ✅ Upstash 콘솔 → QStash → Schedules 4개 등록 **완료(2026-07-11)**, Destination은 전부 `https://{배포 도메인}/api/jobs/refresh-market-data` (POST):
   - `CRON_TZ=Asia/Seoul */10 9-14 * * 1-5`, Retries **1**
   - `CRON_TZ=Asia/Seoul 0,10,20,30 15 * * 1-5`, Retries **1**
   - `CRON_TZ=Asia/Seoul 40 15 * * 1-5`, Retries **0**
   - `CRON_TZ=Asia/Seoul 15 18 * * 1-5`, Retries **1** — **콘솔에서 Retry-Delay 값이 저장되지 않는 문제로 고정 5분 지연은 폐기, 재실행 지연은 QStash 기본 백오프(1차 ≈ +12초)에 맡김 (2026-07-11 사용자 결정, §11.10-A3 개정)**
3. 배포 직후 **장중(평일 09:00~18:40 KST)에 수동 1회 시딩**: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://{도메인}/api/jobs/refresh-market-data` — 그 전까지 홈·상세는 "아직 수집된 시세 데이터가 없습니다" empty state.
4. 첫 거래일: 스케줄 실행 로그·`market:lastRefreshAt`·15:40/18:15 확정 반영·DLQ 비어있음 확인.

**Phase 11 완료 조건:** ✅ 화면(홈·상세·보유종목)이 KIS를 직접 호출하는 경로 0건(코드 검색으로 확인 — KIS import는 잡 경로뿐), ✅ KIS 호출이 QStash 잡 + 허용 시간 가드 안에서만 발생(주말 no-op 200 실측), ☐ 스케줄 4개(재시도 정책 §11.4 포함) 실 실행 및 Redis 갱신 확인(**배포 후**), ✅ `unstable_cache`/`revalidateTag`/Vercel cron 완전 제거, ✅ 갱신 상태 UI 동작(카드 2단계 배지 — 장중 한정 판정·경고/심각 구분·장외 미표시, 상세 「마지막 갱신」 상시 표기, 다크/라이트), ◐ 장애 시나리오 핵심 3종 — 멱등성(저장 전부 SET/upsert)·빈 Redis empty state는 코드 확인, 회차 실패 자연 복구는 배포 후 확인.

---

### Phase 12 — 보유종목 데이터 암호화 저장 (at-rest encryption)

**목표:** Redis에 평문 JSON으로 저장 중인 보유종목 데이터(개인 자산 정보)를 **저장 전 암호화·조회 시 복호화**로 전환한다. 위협 모델: Upstash 콘솔·백업·REST 토큰 유출 시 평문 노출 방지(심층 방어 — 서버 자체가 뚫리면 키도 같은 곳에 있으므로 그 시나리오는 범위 밖). **설계 확정 후 승인되어 구현·로컬 검증 완료(2026-07-10) — 남은 작업은 §12.5 하단 "남은 작업" 참고.**

**확정사항 (사용자 결정, 2026-07-10):**

- **진행 순서: Phase 12를 Phase 11보다 먼저 진행** — Phase 12 완료 후 Phase 11 착수. (Phase 12가 작고 자기완결적이며, 평문 노출은 현재진행형 리스크. Phase 11 잡 파이프라인이 처음부터 암호화된 저장소 위에서 작성됨.) → **2026-07-10 2차 개정: 전체 착수 순서는 Phase 12(완료) → Phase 13 → Phase 11 (§13.5)**
- **암호화 대상: `holdings:{email}`(보유 목록) + `holdings:{email}:history`(일별 `totalCost`/`totalValue`) 둘 다** — history의 총 자산 평가액이 사실상 가장 민감한 값.
- Phase 10의 `alerts:{email}:peaks` 등 이후 추가되는 개인 데이터 키는 해당 Phase 구현 시 같은 유틸을 적용.

#### 12.1 조사 결과 — 암호화 방식 (2026-07-10)

- **`node:crypto` AES-256-GCM 채택.** 근거: ① 대칭키 256bit ② GCM은 인증 태그(authTag)로 위·변조 감지까지 되는 인증 암호화(AEAD) — CBC 대비 권장 ③ Node 내장이라 **외부 의존성 0** ④ 관련 라우트·라이브러리가 `runtime = "nodejs"`라 사용 제약 없음.
- **IV(nonce):** 암호화할 때마다 `crypto.randomBytes(12)` 새로 생성(GCM 권장 96bit). **같은 키로 IV 재사용 절대 금지**(GCM 보안 전제).
- **저장 포맷:** `enc:v1:{iv(base64)}:{authTag(base64)}:{ciphertext(base64)}` **단일 문자열.** 버전 프리픽스 `enc:v1:`이 두 가지를 동시에 해결: ① 평문/암호문 구분(마이그레이션, §12.4) ② 향후 키 로테이션(v2) 확장점.
- **Upstash 직렬화 특성:** 기존 평문 값은 `@upstash/redis`가 JSON 배열로 파싱해 반환하고, 새 값은 문자열 — **반환 타입만으로 신·구 데이터를 구분**할 수 있다.

#### 12.2 키 관리

- **`HOLDINGS_ENCRYPTION_KEY`** — 32바이트를 base64로 인코딩(`openssl rand -base64 32`). **서버 전용, `NEXT_PUBLIC_` 접두사 절대 금지**(§2 헌법과 동일 원칙). `.env.local`과 Vercel env **양쪽** 등록.
- **키 분실 = 암호화된 데이터 영구 복구 불가** — 키를 패스워드 매니저 등 배포 환경 밖에 별도 백업하는 것을 완료 조건에 포함.
- 키 로테이션: 이번 범위 밖 — 필요해지면 `enc:v2:` 프리픽스 + 이중 키 읽기로 별도 진행.

#### 12.3 설계 — `store.ts` 경계 캡슐화

- 신규 유틸 `src/lib/crypto/secureJson.ts`(가칭): `encryptJson(value): string` / `decryptJson<T>(stored): T` / 프리픽스 판별 함수. 도메인 무관 범용 — Phase 10 키에도 재사용.
- **적용 지점은 `lib/holdings/store.ts`의 4개 함수뿐** (`getHoldings`/`saveHoldings`/`getPortfolioHistory`/`upsertPortfolioHistory`) — 현재 모든 보유종목 읽기/쓰기가 이 4개를 경유하므로, 호출부(홈 카드 summary, `/holdings` 페이지·Server Actions, valuation, cron 및 향후 Phase 11 잡 파이프라인)는 **한 줄도 변경 없음**.
- **복호화 실패 시(키 불일치·값 손상): throw** — 기존 에러 처리 경로(카드 null/에러 UI)로 흐르게 한다. 조용히 빈 배열을 반환하면 사용자에게 "보유종목이 사라짐"으로 보이므로 하지 않는다.

#### 12.4 마이그레이션 (기존 평문 데이터)

- **읽기 하위호환:** 값이 배열이면 레거시 평문으로 그대로 사용, `enc:v1:` 프리픽스 문자열이면 복호화 — 양쪽 허용.
- **쓰기는 항상 암호화.**
- **자연 마이그레이션:** 두 키 모두 "배열 통짜 재저장" 패턴이므로 — `holdings:{email}`은 다음 CRUD 저장 시, `history`는 다음 일일 upsert(cron) 시 자동으로 암호문으로 전환된다.
- **즉시 완료(선택):** 허용 이메일을 순회하며 read→write 1회 수행하는 일회성 조치(임시 스크립트, 실행 후 삭제 — Phase 8의 debug-asof 임시 라우트 전례와 동일하게 처리). 완료 판정: Upstash 콘솔에서 두 키의 값이 `enc:v1:` 문자열인지 확인.
- **롤백 주의:** 암호화 저장이 시작된 뒤 코드를 Phase 12 이전으로 롤백하면 복호화 로직이 없어 데이터를 읽지 못한다 → **즉시 마이그레이션은 배포 안정 확인 후 실행**하고, 그 전까지는 자연 전환 상태(읽기 하위호환)로 두는 것을 권장.

#### 12.5 작업 목록 (구현은 착수 지시 후)

| 순서 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 12-1 | `HOLDINGS_ENCRYPTION_KEY` 발급(`openssl rand -base64 32`), `.env.local`·Vercel 양쪽 등록, 키 별도 백업 | `.env.local`, Vercel env | ⚠️ 로컬 완료 (2026-07-10) — **Vercel env 등록·별도 백업은 사용자 작업 남음** (`grep HOLDINGS_ENCRYPTION_KEY .env.local`로 값 확인) |
| 12-2 | `secureJson` 유틸 — AES-256-GCM encrypt/decrypt, `enc:v1:` 포맷 조립·판별, 키 로드·검증(없거나 길이 불일치 시 throw) | `src/lib/crypto/secureJson.ts` (신규) | ☑ 완료 (2026-07-10) |
| 12-3 | `store.ts` 4개 함수에 적용 — 읽기 하위호환(배열=평문/문자열=복호화, 공용 `readStoredArray` 헬퍼) + 쓰기 상시 암호화. 예상 외 타입은 throw | `src/lib/holdings/store.ts` | ☑ 완료 (2026-07-10) — 호출부 변경 0건 확인 |
| 12-4 | 기존 데이터 마이그레이션 — 자연 전환 확인 후 (선택) 일회성 재저장으로 즉시 완료, Upstash 콘솔에서 `enc:v1:` 포맷 확인 | 임시 스크립트(실행 후 삭제) | ⚠️ 자연 전환 코드 완료 — **즉시 마이그레이션은 §12.4 롤백 주의에 따라 배포 안정 확인 후 실행** (배포 전에 실데이터를 암호화하면 평문 리더인 현 배포본이 읽지 못함) |
| 12-5 | 검증 — 로컬 `build`+`start`: 보유종목 CRUD 왕복(암호화→복호화 동일성), 레거시 평문 읽기, 잘못된 키로 기동 시 에러 UI(빈 배열 아님), cron upsert 후 저장값 암호문 확인, 홈 카드·`/holdings` 차트 정상 | — | ☑ 완료 (2026-07-10, 로컬) — lint·`tsc --noEmit`·`next build` 통과. 임시 스크립트(`npx tsx`, 실행 후 삭제)로 **12건 전부 PASS**: 왕복 동일성·암호문 평문 미노출·IV 랜덤(동일 평문 상이 암호문)·변조 시 throw·잘못된 키 throw·`isEncrypted` 판별·레거시 배열 읽기 하위호환·`saveHoldings`/`history` Redis 원시 값 `enc:v1:` 확인·upsert 멱등. 실제 Upstash에 테스트 이메일(`phase12-verify@example.com`, ALLOWED_EMAILS 밖) 키로 수행 후 삭제 — 운영 데이터 무접촉. UI(홈 카드·차트)는 Google 로그인 필요라 배포 후 확인 |

**Phase 12 완료 조건:** ☑ `holdings:{email}`·`history` 신규 저장값이 전부 `enc:v1:` 포맷(실측), ☑ 레거시 평문 읽기 하위호환 동작(실측), ☑ CRUD·차트·홈 카드·cron 기존 기능 무손상(빌드·typecheck 통과, 스토어 왕복 실측 — UI는 배포 후 확인), ☑ 복호화 실패 시 에러로 표면화(실측), ☐ **키가 `.env.local`+Vercel+별도 백업 3곳에 존재 (Vercel 등록·백업 남음)**. **완료 후 Phase 13 → Phase 11 순으로 착수(2026-07-10 2차 개정).**

**남은 작업 (배포 관련, 순서대로):** ① 사용자 — Vercel env에 `HOLDINGS_ENCRYPTION_KEY` 등록 + 키 별도 백업, ② push·배포, ③ 배포 후 홈 카드·`/holdings` 화면 확인(레거시 평문 읽기), ④ 배포 안정 확인 후 (선택) 일회성 재저장으로 즉시 마이그레이션 + Upstash 콘솔에서 `enc:v1:` 확인.

---

### Phase 13 — 보유종목 페이지 개선 (`totalCost` 모델 · 종목명 자동 조회 · 종목 상세 페이지 분리)

**목표:** `/holdings` 페이지를 ① 매입가 입력 방식 변경(총 매입금액+수량 입력, `totalCost` 저장), ② 종목명 입력 제거(KIS 조회 응답에서 자동 저장), ③ 종목별 상세 페이지(`/holdings/[symbolCode]`) 분리로 개선한다. **사용자 지시(2026-07-10, `phase9.request.md`) — 1~3번(§13.1~13.3)은 확정 계획, 4번(§13.4 재무/기업 정보)은 조사 항목이며 조사 결과에 따라 상세 페이지에 넣을 정보 범위를 다시 확정한다. 같은 날 추가 결정 3건 반영(2차, `phase9.request.md`): ① 종목 차트 데이터를 Redis 공용 키(`stock:{symbolCode}:history`)에 저장(§13.3 — 저장소는 Supabase 등 신규 도입 없이 기존 Upstash Redis 그대로 사용, 최종 확정), ② 종목명 조회 순서(§13.2), ③ 착수 순서 Phase 12(완료) → 13 → 11(§13.5). 계획만 수립 — 소스 파일 생성·수정 안 함.**

#### 13.1 확정 1 — 매입가 입력 방식 변경 (`avgPrice` → `totalCost`)

- **입력:** "총 매입금액"과 "수량"만 입력받는다. **1주당 평균 매입가는 저장하지 않고 화면 표시용으로만 계산**(`totalCost / quantity`) — 반올림 없이 정확하게 계산하고, 필요 시 소수점 둘째자리까지 표시.
- **데이터 모델:** `Holding.avgPrice`(1주당) 제거 → `totalCost`(총 매입금액, 원) 저장.

```ts
// 설계 스니펫 — 아직 파일 생성 안 함. §9.4.3의 Holding 모델을 대체
interface Holding {
  id: string;            // crypto.randomUUID()
  symbolCode: string;     // 종목코드 6자리, 예: "005930"
  name: string;           // 종목명 — KIS 조회 응답에서 자동 저장 (§13.2, 직접 입력 제거)
  quantity: number;       // 수량
  totalCost: number;      // 총 매입금액(원) — avgPrice 대체
  createdAt: string;
  updatedAt: string;
}
```

- **파생 계산식 변경 (`valuation`):** 매입금액 = `totalCost`(기존 `avgPrice × quantity`), 평가손익 = 평가금액 − `totalCost`, 수익률(%) = 평가손익 / `totalCost` × 100. 히스토리(`PortfolioDailyRecord.totalCost`)는 이미 총액 기준이므로 모델 변경 없음 — 집계식만 `Σ(avgPrice×quantity)` → `Σ totalCost`로 단순화.
- **기존 데이터 마이그레이션:** 저장된 `avgPrice × quantity = totalCost`로 **역산**해서 전환. 모든 읽기/쓰기가 `store.ts` 4함수를 경유하므로 Phase 12 암호화와 충돌 없음(복호화 → 필드 변환 → 재암호화 저장). 읽기 하위호환(레거시 `avgPrice` 필드 감지 시 즉석 변환) + 다음 저장 시 신 모델로 굳히는 방식을 기본으로 하되, 세부(일회성 재저장 병행 여부)는 구현 단계에서 판단 — Phase 12 §12.4 자연 마이그레이션 전례와 동일 패턴.

#### 13.2 확정 2 — 종목 추가 폼에서 "종목명" 입력 제거

- 종목 추가 폼 입력 필드: **종목코드 6자리 + 수량 + 총 매입금액** 3개만. 종목명 입력란 제거.
- 종목명은 저장 시 **KIS API 조회 응답에서 자동으로 가져와 `name`에 저장**. 기존에도 저장 시 KIS 현재가 조회로 종목코드 실존을 검증하던 흐름(§9.4.3)에 자연스럽게 결합된다.
- **종목명 조회 순서 (확정, 2026-07-10 2차) → 실측 완료(같은 날, 13-1 조사와 함께):**
  1. 현재가 응답(`FHKST01010100`) 실측 결과 **종목명 필드 없음** — 80개 필드 전수 확인, 한글 명칭은 `rprs_mrkt_kor_name`(시장명, "KOSPI200")·`bstp_kor_isnm`(업종명, "전기·전자")뿐.
  2. → **KIS 주식기본조회로 확정: `/uapi/domestic-stock/v1/quotations/search-stock-info` (TR `CTPF1002R`, `PRDT_TYPE_CD=300`, `PDNO=종목코드`) 응답의 `prdt_abrv_name`**(예: "삼성전자") 사용. 라이브 실측 HTTP 200 확인(005930). 종목 추가 시 1회만 호출해 `name`에 저장.
  3. 외부 API(공공데이터포털 등) 검토 불필요 — KIS 내에서 해결.

#### 13.3 확정 3 — 종목 상세 페이지 분리 (`/holdings/[symbolCode]`)

- **라우트:** `/holdings/[symbolCode]` — `/holdings`와 동일하게 로그인 필요(`auth()` 세션 + `isEmailAllowed`). 본인 보유 목록에 없는 `symbolCode` 접근 시 처리(404 또는 `/holdings` 리다이렉트)는 구현 단계에서 확정.
- **기본 화면(조회 전용):** 종목명, 현재가, 평가금액, 매입금액(`totalCost`), 평가손익, 수익률, 차트 1개 — 기존 수익률/원 단위 토글(§9.4.3 표) 재사용.
  - **차트 데이터 저장 방식 (확정, 2026-07-10 2차):** 브라우저 캐시·로컬 기기 저장이 아니라 **서버(Redis)에 종목코드 기준으로 한 번만 저장해 모든 사용자가 공유**한다. 저장소는 Supabase 등 신규 도입 없이 **기존 Upstash Redis 그대로 사용(최종 확정)**.
    - **키:** `stock:{symbolCode}:history` — 사용자 무관 공용 키. 공개 시세 데이터이므로 Phase 12 암호화 대상 아님.
    - **저장 범위:** "상장일부터 전부"가 아니라 **최근 1~2년 정도로 제한** — KIS 호출량과 저장 용량을 고려한 현실적 범위. → **실측 완료(2026-07-10, 13-1 조사와 함께):** 기간별시세 `FHKST03010100`(D)는 **1회 최대 100거래일** 반환(2년 범위 요청 시에도 100건). **저장 범위 2년 확정** — 2년 ≈ 490거래일이므로 신규 종목 백필 시 날짜 범위를 뒤로 옮겨가며 **종목당 약 5회 호출**(1회성), 이후는 cron에서 최신분만 upsert. 응답 행에 `stck_clpr`(종가) 포함 확인.
    - **재사용:** 이미 저장된 종목은 재사용하고, **처음 추가되는 종목만 신규로 히스토리를 백필**한다.
    - **갱신:** 기존 cron(Phase 11 갱신 잡과 연계) 시점에 함께 upsert 처리.
    - **화면 계산:** 저장된 종가 시계열로 수익률 모드 `(종가×수량−totalCost)/totalCost×100`, 원 단위 모드 `종가×수량`을 화면에서 계산 — 모드별 데이터 중복 저장 없음(§9.4.3 원칙 동일).
- **수정 모드:** 우측 상단에 작은 "수정" 아이콘 버튼 → 클릭 시 조회 영역이 **그 자리에서 입력 폼(수량, 총 매입금액, 저장/취소/삭제)으로 전환**. 종목코드·종목명은 수정 불가(변경하려면 삭제 후 재추가).
- **`/holdings` 메인 페이지 개편:** 종목 목록(요약)과 종목 추가 폼만 남기고, 각 종목 클릭 시 상세 페이지로 이동. 기존 인라인 수정/삭제 UI는 상세 페이지로 이전. 포트폴리오 전체 차트(수익률/원 단위 토글)·일별 리스트의 잔류 위치는 구현 단계에서 확정(기본안: 메인 유지).

#### 13.4 조사 — 재무/기업 정보 KIS API 제공 여부 (✅ 조사 완료 2026-07-10, 라이브 실측 — 정보 범위 사용자 재확정 대기)

**결론: 3개 항목 모두 KIS API로 가능 — 외부 API(공공데이터포털·DART 등) 불필요.** 단, 일부는 직접 제공이 아니라 응답값으로부터 계산이 필요하고, 시총 순위는 상위 30위 이내만 확인 가능하다. App Key/Secret 라이브 실측(005930 삼성전자, 전 건 HTTP 200 / `rt_cd=0`).

| # | 항목 | 결과 | 실측 근거 |
|---|---|---|---|
| 1a | 시가총액 | ✅ **직접 제공, 추가 호출 0** — 기존 현재가 응답(`FHKST01010100`)의 `hts_avls`(억원 단위) | `hts_avls: "16661894"`(= 약 1,666조 원) |
| 1b | 시총 순위 | ⚠️ **부분 제공** — 시가총액 상위 랭킹 API(`/uapi/domestic-stock/v1/ranking/market-cap`, TR `FHPST01740000`)가 **1회 상위 30건**(`data_rank`·`stck_avls`·시장 비중 `mrkt_whol_avls_rlim`) 반환. **30위 밖 종목은 순위 직접 조회 불가** → 표시 시 "30위권 밖" 처리 필요 | 30건 반환, 1위 삼성전자 확인 |
| 2 | 배당률·배당 방식 | ⚠️ **부분 제공+계산** — 예탁원 배당일정(`/uapi/domestic-stock/v1/ksdinfo/dividend`, TR `HHKDB669102C0`, 날짜 범위+`SHT_CD`)이 이벤트별 `divi_kind`(배당종류: "분기" 등)·`per_sto_divi_amt`(주당배당금)·`record_date`·`divi_pay_dt`(지급일) 반환. **배당 방식(월/분기/반기/연)은 `divi_kind`+이벤트 빈도로 판별** 가능. **시가배당률은 직접 제공 없음** — `divi_rate`는 액면가 기준이라 부적합, **최근 1년 주당배당금 합 ÷ 현재가로 계산** 필요. 미확정 회차는 금액 0으로 옴(주의) | 2025-01-01~오늘 6건, `divi_kind: "분기"` 확인 |
| 3 | 실적(매출/영업이익, 증감률) | ✅ **제공+일부 계산** — ① 손익계산서(`/uapi/domestic-stock/v1/finance/income-statement`, TR `FHKST66430200`, `FID_DIV_CLS_CODE=1` 분기)가 기간별 `sale_account`(매출)·`bsop_prti`(영업이익, 단위 억원) 30개 기간 반환. **값은 연중 누적(YTD)** — 분기 단독값은 직전 누적 차감으로 계산(1분기는 그대로). ② 재무비율(`financial-ratio`, TR `FHKST66430300`)이 `grs`(매출 증가율)·`bsop_prfi_inrt`(영업이익 증가율, 전년 동기 대비)를 **직접 제공**. 직전 분기 대비(QoQ) 증감률은 ①의 차감값으로 계산 | 202603 매출 1,338,734억·영업이익 572,328억 등 확인 |

- **보너스(비용 0):** 현재가 응답에 `per`/`pbr`/`eps`/`bps`, 52주 최고·최저(`w52_hgpr`/`w52_lwpr`+대비율), 상장주식수(`lstn_stcn`)도 포함 — 원하면 추가 호출 없이 표시 가능.
- **상세 페이지 정보 범위 확정 (사용자 승인, 2026-07-10):** **4개 블록 전부 포함** — ① 시가총액(+순위: 30위 이내 "n위", 밖이면 "30위권 밖"), ② 배당 정보(배당 방식 판별·최근 1년 주당배당금 합계·시가배당률 계산·최근 지급일), ③ 실적(최근 분기 매출/영업이익 — YTD 차감, 전년 동기 대비 증가율 직접 제공값 + 직전 분기 대비 계산값), ④ 투자지표(PER/PBR/EPS/BPS/52주 최고·최저 — 현재가 응답 재사용, 추가 호출 0). 13-5에서 구현.

#### 13.5 다른 Phase와의 상호작용

- **Phase 12 (암호화):** 적용 지점이 `store.ts` 경계로 캡슐화되어 있어(§12.3) `Holding` 페이로드 필드 변경은 암호화 유틸에 영향 없음. 마이그레이션 재저장도 자동으로 `enc:v1:` 포맷. 신설되는 `stock:{symbolCode}:history`는 사용자 무관 공용 시세 데이터이므로 **암호화 대상 아님**.
- **Phase 11 (QStash 재설계):** §11의 Redis 키 표에서 `holdings:{email}` "기존 그대로" 전제는 본 Phase의 `totalCost` 모델로 갱신된다. 갱신 잡의 히스토리 upsert 집계식도 `Σ totalCost`로 단순화. 신설 키 `stock:{symbolCode}:history`의 일별 갱신도 Phase 11 갱신 잡 파이프라인에 연계(§11 키 표에 행 추가됨). **착수 순서 확정(2026-07-10 2차, 사용자 결정): Phase 12(완료) → Phase 13 → Phase 11** — Phase 13이 Phase 11보다 먼저이며, Phase 13 구현 중 cron 갱신 연결은 현행 cron(18:15 KST 단일)에 우선 얹고 Phase 11 착수 시 갱신 잡으로 이관한다.
- **Phase 9 §9.4.3:** `Holding` 모델·종목명 직접 입력·`/holdings` 단일 페이지 UI 설계는 본 Phase로 대체(개정 예고 주석 추가됨). 히스토리 모델·차트 토글·cron 설계는 유효.

#### 13.6 작업 목록 (구현은 착수 지시 후)

| 순서 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 13-1 | **조사(§13.4)** — KIS 재무/기업 정보 제공 여부 실측, 대안 API 조사, 결과 보고 → **상세 페이지 정보 범위 재확정(사용자 승인)** 후 plan.md 갱신 | plan.md | ✅ 완료 (2026-07-10 실측, 4개 블록 전부 사용자 승인) |
| 13-2 | `Holding` 모델 `totalCost` 전환 — 타입·`store.ts` 읽기 하위호환(레거시 `avgPrice` 역산)·`valuation` 계산식 변경·1주당 평균 매입가 표시 전용 계산 | `types`, `lib/holdings/store.ts`, `lib/holdings/valuation.ts`, `lib/format/krw.ts` | ✅ 완료 (2026-07-11) |
| 13-3 | 종목 추가 폼 개편(종목코드+수량+총 매입금액) + 종목명 자동 조회·저장(§13.2 조회 순서 ①→②→③, 실측 검증 포함) | `app/holdings/page.tsx`, `app/holdings/actions.ts`, `lib/api/kis/*` | ✅ 완료 (2026-07-11 — CTPF1002R `fetchKisStockName`, 동일 종목코드 중복 등록 차단) |
| 13-4 | 종목 히스토리 공용 저장소(§13.3 확정) — `stock:{symbolCode}:history` 저장/조회 모듈, 신규 종목 백필(최근 2년, 1회 100거래일 페이징), 기존 저장분 재사용, 현행 cron(18:15 KST)에 일별 upsert 연결(Phase 11 착수 시 갱신 잡으로 이관) | `lib/holdings/stockHistory.ts` (신규), `app/api/cron/revalidate-indices/route.ts` (확장) | ✅ 완료 (2026-07-11 — 백필 485건/2년·재실행 skip·cron 갱신 멱등 실측) |
| 13-5 | 종목 상세 페이지 신설 — 조회 전용 화면+수정 모드 전환(`?edit=1`), 차트(13-4 저장 데이터 + 수익률/원 단위 토글 재사용, "최근 2년 추이"), `/holdings` 메인 요약 목록 개편(상세 링크 카드), 정보 블록 4종(§13.4 확정 범위) | `app/holdings/[symbolCode]/page.tsx` (신규), `lib/holdings/stockInfo.ts` (신규), `lib/api/kis/client.ts` (확장) | ✅ 완료 (2026-07-11) |
| 13-6 | 검증 — 로컬 `build`+`start`, 레거시 `avgPrice` 데이터 역산 표시·재저장 전환 실측, CRUD 왕복(암호화 유지), 신규 종목 백필·기존 종목 재사용(중복 백필 없음)·cron upsert 멱등성 실측, 상세 페이지 라우팅·수정 모드·미보유 종목코드 접근 처리 | — | ✅ 완료 (2026-07-11 — lint/tsc/build 통과, 백필·cron 멱등·정보 블록 4종 라이브 실측. 브라우저 CRUD 왕복·레거시 역산은 배포 후 확인 항목) |

**Phase 13 완료 조건:** ✅ 조사 결과 보고 및 상세 페이지 정보 범위 재확정(사용자 승인), ✅ `totalCost` 모델 CRUD·레거시 역산 마이그레이션 동작, ✅ 종목코드만으로 종목 추가(종목명 자동 저장) 동작, ✅ `stock:{symbolCode}:history` 신규 백필·기존 재사용·cron 갱신 동작(실측), ✅ `/holdings/[symbolCode]` 조회/수정 모드·차트 동작, ✅ `/holdings` 메인 요약 목록·상세 이동 동작, ✅ 로컬 검증(lint·tsc·build·라이브 실측). **완료 후 Phase 11 착수.**

---

### Phase 14 — 핫종목 (최근 1개월/분기/반기/연도 수익률 랭킹 TOP 100)

**목표:** 홈 화면에 "핫종목" 카드(7번째)를 추가하고, 상세 페이지에서 **코스피+코스닥 전 보통주를 순수 수익률로만 줄 세운 TOP 100**을 구간 4종으로 보여준다. **구현 완료(2026-07-11) — 14-1~14-7 코드 작성·검증(lint/tsc/build) 및 14-8 로컬 시딩 실측 완료. 남은 것: 배포 후 Upstash 스케줄 5번째 등록.**

**확정사항 (사용자 결정, 2026-07-11):**

- **구간은 "완결된 달력 구간" 4종으로 통일** — 실행 시점의 직전 완결 월(기준월 M)을 끝점으로 하는 **최근 1개월 / 최근 분기(3개월) / 최근 반기(6개월) / 최근 연도(12개월)**. 예(기준월 2026-06): 연도=2025-07~2026-06, 반기=2026-01~06, 분기=2026-04~06, 월=2026-06.
- **"1분기"·"상반기" 같은 고정 명칭 라벨 금지** — UI는 "최근 1개월/최근 분기/최근 반기/최근 연도" + 실제 구간(예: `2025.07 ~ 2026.06`) 병기.
- **매일 재계산 없음** — 네 구간 모두 월말에만 경계가 이동하므로 **매월 1일 근처 1회만 갱신**.
- 순위 기준: 시가총액 무관 **순수 수익률 내림차순**(요청서 원문 유지). TOP 100 그대로(월봉 방식 채택으로 호출량 문제 해소 — 축소 불필요).

#### 14.1 조사 결과 (2026-07-11, 라이브 실측)

| # | 항목 | 결과 | 실측 근거 |
|---|---|---|---|
| 1 | 전용 랭킹 API (`FHPST01700000` 등락률순위) | ❌ **부적합** — "N거래일 전 대비 현재가" 롤링만 가능(달력 고정 구간 불가), 1회 30건 고정·페이징 없음 | 2026-07-11 실측 (summary.md 조사 보고) |
| 2 | **월봉 조회** (`FHKST03010100`, `FID_PERIOD_DIV_CODE=M`) | ✅ **채택** — **종목당 1콜**로 요청 범위의 월말 종가 전부 반환(최신순, 최대 100행). `FID_ORG_ADJ_PRC=0`(수정주가)으로 액면분할/병합 왜곡 해소. `FID_INPUT_DATE_2`를 기준월 말일로 주면 진행 중인 달 미포함. output1에 `hts_kor_isnm`(종목명) 포함 | 005930, `20250601~20260630` 요청 → 13행(각 월 마지막 거래일 `stck_bsop_date`+`stck_clpr`), 넓은 범위 요청 시 100행 상한 확인 |
| 3 | 종목 유니버스 (마스터 파일) | ✅ 공개 다운로드(인증 불필요) `https://new.real.download.dws.co.kr/common/master/{kospi\|kosdaq}_code.mst.zip`. EUC-KR 고정폭 — 레코드 tail(KOSPI 228바이트 / KOSDAQ 222바이트)의 **[1:3] 오프셋이 증권그룹코드**(공식 파이썬 샘플의 [0:2]와 1바이트 차이 — **실측 우선**). `ST`(주권)만 필터 → ETF(`EF`)/ETN(`EN`)/ELW/리츠(`RT`)/수익증권(`BC`) 자연 제외 | KOSPI 2,561행 중 ST **917** (그룹 분포 EF=1145 ST=917 EN=385 BC=75 RT=23 …), KOSDAQ 1,822행 중 ST **1,803**(그중 이름에 "스팩" 73건). 005930 group=ST 확인 |
| 4 | 호출량 | ✅ 유니버스 ST 2,720 − 스팩 73 ≈ **2,647종목 × 월봉 1콜 ≈ 2,650콜, 매월 1회** — 초당 15건 스로틀 기준 약 3분. 이후 한 달간 추가 호출 0 | 20건/초 실전 제한 대비 여유 확보 |

#### 14.2 랭킹 정의

- **기준월 M** = 실행 시점 KST의 전월 (예: 7월 실행 → M=2026-06). 저장 시 `computedFor: "2026-06"`.
- **구간별 시작 기준가** = 구간 시작 직전 월말 종가(수정주가), **끝 기준가** = M월말 종가. 즉 월봉 종가 배열에서 M, M−1, M−3, M−6, M−12 월말 5개 지점만 사용 — **종목당 월봉 1콜(범위 M−13월초 ~ M월말)로 네 구간 전부 계산**.
- 수익률(%) = `(끝 종가 / 시작 종가 − 1) × 100`, 표시 소수 둘째 자리. 정렬: 수익률 내림차순, 동률 시 종목코드 오름차순(결정적).
- **제외 규칙:** ① 해당 구간 시작 월말 종가 없음(신규상장·장기 거래정지로 해당 월 월봉 행 부재) → **그 구간 랭킹에서만 제외**(1개월 랭킹엔 있고 연도 랭킹엔 없을 수 있음 — 정상), ② M월 종가 없음 → 전 구간 제외, ③ 스팩(종목명 "스팩" 포함, 실측 73건) 제외. 우선주는 ST 그룹에 포함되므로 **포함**(순수 수익률 원칙 — 원하면 단축코드 끝자리 필터로 제외 가능하나 기본 포함).
- **생존 편향 문서화:** 마스터 파일은 "현재 상장" 목록이므로 구간 중 상장폐지된 종목은 랭킹에 없음 — 허용(안내문에 명시).
- KOSDAQ 신형 단축코드는 영숫자 6자리(`0001A0` 실측) — 종목코드 처리를 숫자 6자리로 가정하지 말 것(보유종목 폼 검증과는 별개 경로).

#### 14.3 Redis 데이터 모델

| 키 | 값 | 비고 |
|---|---|---|
| `market:hotStocks` | `{ computedFor: "YYYY-MM", universeCount, windows: { "1m"\|"3m"\|"6m"\|"12m": { label, startMonth, endMonth, entries: [{ rank, code, name, market("KOSPI"\|"KOSDAQ"), startPrice, endPrice, returnRate }] ×100 } }, fetchedAt }` | 신규 — 사용자 무관 공용(공개 시세, 암호화 대상 아님). 통짜 SET(멱등). 크기 ≈ 4×100 엔트리 ≈ 수십 KB |
| `market:hotStocks:progress` | `{ computedFor, cursor(유니버스 인덱스), 구간별 상위 100 부분 결과 }` | 신규 — 배치 중단 시 이어받기용. 전 종목 값을 들고 가지 않고 **청크마다 구간별 상위 100만 유지**(온라인 선택)해 크기 고정. 완료 시 삭제 |

#### 14.4 갱신 잡 설계 (Phase 11 원칙 준수)

- **KIS 호출은 QStash 잡에서만, 화면은 Redis만 읽음** — Phase 11 원칙 그대로. 기존 `refresh-market-data` 잡에 얹지 않고 **별도 엔드포인트로 분리**(정기 회차는 10분 주기 경량, 핫종목은 월 1회 3분 중량 — 실행 시간·재시도 정책이 달라 섞지 않는다).
- **신규 엔드포인트** `POST /api/jobs/refresh-hot-stocks` — QStash `Receiver` 서명 검증 + `CRON_SECRET` Bearer timingSafeEqual 폴백(기존 라우트와 동일 패턴 — **검증 로직을 공용 모듈로 추출**해 중복 제거), `maxDuration = 300`, `proxy.ts` matcher 예외 추가.
- **QStash 스케줄 1개 (5번째):** `CRON_TZ=Asia/Seoul 35 10 1-7 * *`, Retries 1 — 매월 1~7일 10:35(정기 회차 :30/:40 격자와 어긋난 시각). 엔드포인트 가드가 실제 실행을 **매월 첫 평일 1회**로 좁힌다:
  1. `isWithinKisCallWindow`(평일 09:00~18:40) 밖 → no-op 200 (주말)
  2. `market:hotStocks.computedFor === 기준월` → 이미 완료, no-op 200
  3. 1~7일 중 평일은 최소 5일 보장되므로 놓칠 수 없음. 공휴일이어도 과거 월봉 조회라 데이터는 정상이나, 호출 창 원칙의 단순함을 위해 요일 가드는 동일 적용.
- **실행 파이프라인** (`refreshHotStocks()`):
  1. 마스터 파일 2종 다운로드 → 압축 해제 → EUC-KR 파싱 → ST 필터·스팩 제외 → 유니버스 확정(코드·종목명·시장). **주의: Vercel 서버리스에 `unzip` 바이너리 없음** — zip 해제는 경량 의존성 `fflate`(zero-dep, ~8KB) 사용 확정. EUC-KR 디코딩은 Node 내장 `TextDecoder("euc-kr")`(실측 동작).
  2. 종목 순차 루프: 월봉 1콜 → 5개 월말 종가 추출 → 구간 4종 수익률 계산 → 구간별 상위 100 부분 결과에 반영. **초당 15건 스로틀**(정기 회차와 겹쳐도 합산 20건/초 미만).
  3. **시간 예산 250초** 소진 시: `progress` 저장 후 200 반환 → 다음 날 스케줄(1~7일 매일)이 커서부터 이어받기. 새 env·QStash 발행 토큰 도입 없이 스케줄 자체가 재개 장치(정상 케이스는 1회 실행 내 완료 — 2,650콜 ≈ 3분).
  4. 전 종목 완료 시 `market:hotStocks` 통짜 SET + `progress` 삭제. 실패(마스터 다운로드 실패 등)는 500 → QStash 재시도 1회, 그래도 실패 시 다음 날 스케줄이 백스톱. 이전 달 데이터는 그대로 유지되므로 화면 공백 없음.
- **첫 시딩:** 배포 후 장중 수동 1회 `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://{도메인}/api/jobs/refresh-hot-stocks` (미완료 시 재호출로 이어받기 — 멱등).
- QStash Free 1,000msg/일 대비: 매월 1~7일 하루 1건 — 영향 없음.

#### 14.5 UI 설계

- **홈 카드(7번째):** 제목 "핫종목", 내용은 **최근 1개월 TOP 3**(순위·종목명·수익률) 미리보기 + "기준: 2026.06 월말" 표기. 클릭 시 상세 이동. **staleness 배지 미적용** — 10~20분 단위 갱신 전제인 기존 배지 정책(§11.10-B)과 맞지 않음. 대신 `computedFor`가 기대 기준월(KST 8일 이후인데 전월 미반영)보다 오래되면 "갱신 지연" 안내 텍스트.
- **상세 페이지 `/hot-stocks` (신규 라우트):** `/indices/*`는 지수·거시 지표 묶음이므로 별도 최상위 라우트(접근 제한은 기존 전역 정책 그대로 적용됨). 구간 전환은 **`?period=1m|3m|6m|12m` searchParams 링크 탭 4개** — Server Component 유지(클라이언트 상태 불필요, §4 헌법). 기본 `1m`.
- 테이블: 순위 / 종목명(코드) / 시장(KOSPI·KOSDAQ) / 구간 수익률 / 시작·끝 종가. 숫자는 `.numeric`, 등락색은 기존 rise/fall 토큰. 100행 — 페이지네이션 없이 단일 테이블(모바일은 가로 스크롤 컨테이너).
- 안내문: 구간 정의(직전 월말 기준·수정주가·월말 종가 비교), 매월 첫 평일 갱신, 스팩 제외·상장폐지 종목 미포함(생존 편향), 우선주 포함.
- 랭킹 행 → 종목 페이지 링크는 **범위 밖**(`/holdings/[symbolCode]`는 본인 보유 전제라 재사용 불가 — 필요 시 별도 Phase).

#### 14.6 작업 목록 (구현은 착수 지시 후)

| 순서 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 14-1 | 유니버스 모듈 — 마스터 파일 다운로드·`fflate` 해제·EUC-KR 파싱(tail[1:3]=ST 필터·스팩 제외), `fflate` 설치 | `src/lib/hotstocks/universe.ts` (신규), `package.json` | ✅ 실측 2,647종목(KOSPI 917 + KOSDAQ 1,730), 스팩 0건 |
| 14-2 | KIS 월봉 클라이언트 — `fetchKisStockMonthlyChart(symbolCode, from, to)` (`FHKST03010100` M·수정주가) | `src/lib/api/kis/client.ts` (확장) | ✅ |
| 14-3 | Redis 스토어 — `market:hotStocks`·`progress` 타입·리더/라이터 | `src/lib/hotstocks/store.ts` (신규) | ✅ 월 헬퍼는 `months.ts` 분리 |
| 14-4 | 배치 파이프라인 — `refreshHotStocks()` (기준월 산출·순차 루프·15건/초 스로틀·구간별 TOP 100 온라인 선택·시간 예산 250초·커서 이어받기) | `src/lib/jobs/refreshHotStocks.ts` (신규) | ✅ 종목 실패 1회 재시도 후 skip, 연속 10회 실패 시 progress 저장 후 중단(500) |
| 14-5 | 잡 엔드포인트 — QStash 서명 검증 공용 모듈 추출 + `POST /api/jobs/refresh-hot-stocks`(가드 2종·`maxDuration=300`), `proxy.ts` matcher 예외 | `src/lib/jobs/verifyJobRequest.ts` (신규, 기존 라우트 리팩터), `app/api/jobs/refresh-hot-stocks/route.ts` (신규) | ✅ |
| 14-6 | 홈 카드 — 7번째 "핫종목" 카드(최근 1개월 TOP 3·기준월 표기·갱신 지연 안내) | `app/page.tsx`, `components/indices/HotStocksCard.tsx`+css (신규), `lib/hotstocks/summary.ts` (신규) | ✅ |
| 14-7 | 상세 페이지 — `/hot-stocks` (`?period` 탭 4개·TOP 100 테이블·안내문) + CSS Module | `app/hot-stocks/page.tsx`+css (신규) | ✅ |
| 14-8 | 검증·배포 — lint·tsc·build, 로컬 수동 실행(CRON_SECRET)으로 2026-06 기준 전 구간 생성 실측, 배포 후 Upstash 콘솔 스케줄 5번째 등록(`CRON_TZ=Asia/Seoul 35 10 1-7 * *`, Retries 1) + 장중 수동 시딩 | Upstash 콘솔, — | ◐ 로컬 검증·시딩 완료(3패스 이어받기, 실패 0) — 배포 후 스케줄 등록만 남음 |

**Phase 14 완료 조건:** ☑ 유니버스 실측치 확보(2,647 — 예측 ±0) 및 스팩·비주권 제외 확인, ☑ 구간 4종 TOP 100이 `market:hotStocks`에 저장(2026-06 기준 로컬 시딩 실측 — 1m: 2026-06, 3m: 2026-04~06, 6m: 2026-01~06, 12m: 2025-07~2026-06 각 100행), ☑ 홈 카드·상세 페이지 구현(기준월·"최근 …" 라벨·고정 명칭 미사용 — 빌드 통과, 화면 시각 확인은 배포 후), ☑ 화면의 KIS 직접 호출 0건 유지(화면은 store 리더만 import), ☑ 잡 재실행 멱등·이어받기 동작(3패스 커서 재개 + 완료 후 재실행 no-op·progress 삭제 실측), ☐ 스케줄 등록 후 다음 달 첫 평일 자동 갱신 확인(배포 후).

---

### Phase 15 — 관심종목 + 시장 통합 카드

**목표:** ① 홈의 "원달러 환율"·"미국 10년물 금리" 카드 2개를 **"시장" 카드 1개로 통합**하고 유가(원유)를 추가, 상세 `/indices/market` 신설. ② 수량 없이 종목코드만 등록하는 **관심종목**(등록 기준일 종가 대비 수익률) — 목록·상세 페이지 + 기존 갱신 잡 통합. **구현 완료(2026-07-11, 15-1~15-9) — lint·tsc·build·로컬 실측(암호화 왕복·기준가 확정·잠정 승격·멱등 등 9건) PASS. 남은 실측은 §15.5 15-10 비고 참조.**

#### 15.1 조사 결과 A — 유가 (2026-07-11, 라이브 실측)

- **✅ 기존 해외 기간별시세(`FHKST03030100`)로 조회 가능 — 신규 엔드포인트 불필요.** 조합은 `FID_COND_MRKT_DIV_CODE="N"`(해외지수 분류) + `FID_INPUT_ISCD="WTIF"`:
  - `N`/`WTIF` → `hts_kor_isnm="WTI, 서부텍사스산 근월 (USD)"`, **output2 일자별 28행**(기존 usdkrw 29행·us10y 28행과 동일 형태), 최신 20260710 종가 71.41 — 스냅샷+히스토리 모두 정상.
  - `N`/`DUBAIF`(두바이유 현물, 29행)도 동일하게 가능 — **대표 유가는 WTI 채택**(국제 통용 기준), 두바이유는 필요 시 같은 방식으로 추가만 하면 됨.
  - 코드 출처: KIS 해외지수 종목 마스터 `frgn_code.mst.zip`(공개 다운로드, 12,776행) — 행 첫 글자가 분류 접두사(X=환율, B=금리, C/E=상품 등)이고 나머지가 코드. 현행 `Y0202`(미10년)는 `BY0202` 행, `FX@KRW`는 `XFX@KRW` 행으로 교차 확인.
  - **주의(실측):** `S`(금선물 분류)+`M0401/M0402/M0403`(WTI 현물/근월물·두바이유 선물) 조합도 rt_cd=0으로 응답하지만 **output2(일자별)가 항상 비어 있고**(D/W/M·기간 변경 전부 실측) 현물 값(105.24)이 근월물(81.62)·`N`/`WTIF`(71.41)와 크게 어긋남 — **사용 금지, `N`/`WTIF`만 사용.**
- **Redis 키 구조 변경 불필요 (조사 항목 2 결론):** `market:detail:oil`을 기존 `market:detail:{usdkrw|us10y}`와 동일 구조(snapshot+history+dailyRows+fetchedAt)로 **추가**만 한다. 지표별 키 분리가 Phase 11의 실패 격리(지표별 allSettled)·멱등 SET와 그대로 맞물리므로 "통합"은 저장이 아니라 **읽기(UI) 레벨에서 mget 3키**로 한다.

#### 15.2 설계 A — 시장 통합 카드

- **데이터 계층 (확장만, 구조 변경 없음):**
  - `KIS_OVERSEAS_INDICATOR`에 `OIL: { marketDivCode: "N", code: "WTIF" }` 추가, `OverseasIndicator` 타입에 `"OIL"` 추가(라벨 "국제유가 WTI(USD/배럴)"), `MarketDetailKey`에 `"oil"` 추가.
  - `refreshMarketData()`의 `refreshIndices` tasks 배열에 oil 태스크 1개 추가(기존 4종과 동일한 개별 실패 격리) — **회차당 +1콜**(하루 약 +44콜, §11.8 산식 내 미미).
- **홈 카드:** usdkrw·us10y 카드 2개 제거 → **"시장" 카드 1개** — 대표값은 **원/달러 환율 + 등락률**(요청서 예시안), 링크 `/indices/market`. staleness 배지는 **3개 지표 fetchedAt 중 가장 오래된 값** 기준으로 기존 `resolveStaleness` 재사용. 카드 수: 6개 → 통합으로 5개 → Phase 14 핫종목·Phase 15 관심종목 추가 시 7개.
- **상세 `/indices/market`:** 원달러/미국금리/유가 3개 **미니 카드 세로 나열** — 각각 현재값·전일 대비 등락률·미니 차트(최근 7거래일, 기존 `IndexLineChart` 재사용). 각 미니 카드는 기존 개별 상세(`/indices/usdkrw`, `/indices/us10y`, 신설 `/indices/oil`)로 링크 — 일자별 리스트 등 깊은 정보는 개별 페이지가 담당(기존 `IndexDetailScreen` 재사용, 삭제하지 않음). 데이터는 `getMarketDetails(["usdkrw","us10y","oil"])` mget 1회.
- 표기: WTI는 USD/배럴, 소수 둘째 자리(응답 "71.41" 그대로) — 원화 지표가 아니므로 단위 라벨 필수.

#### 15.3 조사 결과 B — 관심종목 재사용성·잡 통합 (2026-07-11, 코드 확인)

| 조사 항목 | 결과 |
|---|---|
| Phase 13 상세 컴포넌트 재사용 | ⚠️ **데이터 리더는 그대로, UI는 추출 필요** — `getStockInfo(symbolCode)`·`getStockHistory(symbolCode)`는 사용자 무관 공용 리더라 즉시 재사용. 반면 정보 블록 4종(시총/배당/실적/투자지표) UI는 `/holdings/[symbolCode]/page.tsx`에 **인라인 JSX(약 170줄)** — 공용 Server Component `StockInfoBlocks`로 추출하고 보유종목 상세도 이를 쓰도록 리팩터(동작 불변) |
| 차트 재사용 | ✅ `HoldingsChartClient`(수익률%↔원 단위 토글) 재사용 가능 — points 계산만 다름: `totalValue` 자리에 **종가**, `returnRate`는 **등록 기준가 대비**. 표시 범위는 등록 기준일 이후로 잘라 "등록일 이후 추이" |
| 갱신 잡 통합 | ✅ **가능·권장** — `collectHoldings`와 나란히 `collectWatchlists` 추가 후 종목코드 union에 합류하면 스냅샷(`market:stock:*`)·종가 히스토리(`stock:*:history`)·정보 블록(`market:stockInfo:*`)·종목명 채움(A4)을 **전부 공유**(보유종목과 겹치는 종목은 추가 호출 0). 신규 단계는 기준가 확정(§15.4) 하나뿐. 호출량: 관심종목 고유 종목 수 × 회차당 1콜 |
| 암호화 적용 여부 | ✅ **적용** — 어떤 종목을 언제부터 지켜보는지는 투자 의향을 드러내는 개인 데이터. Phase 12 `secureJson` 유틸이 도메인 무관 범용(§12.3)이라 적용 비용 0, `holdings:{email}`과 동일한 "배열 통짜 재저장" 패턴이므로 신규 키는 처음부터 암호문으로 시작(마이그레이션 불필요) |

#### 15.4 설계 B — 관심종목

- **데이터 모델 (요청서 모델에 확정 보조 필드 2개 추가):**

```ts
// 설계 스니펫 — 아직 파일 생성 안 함
interface WatchItem {
  id: string;                          // crypto.randomUUID()
  symbolCode: string;                  // 종목코드 6자리
  name: string;                        // 등록 직후 "" → 갱신 잡이 채움 (§11.10-A4 패턴)
  registeredAt: string;                // 등록 기준일 "YYYY-MM-DD" — 사용자가 나중에 수정 가능
  priceAtRegistration: number | null;  // 기준일 종가 — null이면 「기준가 확정 중」, 잡이 확정
  priceBasisDate: string | null;       // 실제 사용한 종가의 날짜 — 잠정→확정 승격 판단용 (아래)
  createdAt: string;
  updatedAt: string;
}
```

- **Redis 키:** `watchlist:{email}` — `WatchItem[]`을 Phase 12 `secureJson`으로 **암호화 저장**(§15.3 판단). 스토어는 `lib/holdings/store.ts`와 동일 패턴의 4함수 경계(`getWatchlist`/`saveWatchlist` 등).
- **기준가(priceAtRegistration) 확정 — KIS 직접 호출 없이 공용 히스토리에서 (Phase 11 원칙 유지):**
  - 등록·기준일 수정 **액션은 형식 검증만**(§11.10-A4와 동일): 코드 6자리·중복 차단·`registeredAt`은 오늘 이하 & 최근 2년 이내(`STOCK_HISTORY_WINDOW_DAYS` — 히스토리 저장 범위 밖 날짜 차단). 저장 시 `priceAtRegistration: null`로 초기화(수정 시에도 null로 리셋).
  - **잡의 신규 단계 `fillRegistrationPrices`:** `stock:{code}:history`에서 `date ≤ registeredAt`인 마지막 종가로 확정하고 그 날짜를 `priceBasisDate`에 기록. 같은 회차에서 신규 종목 백필이 먼저 실행되므로(§refreshStocks 순서) 등록 후 첫 회차에 대부분 확정된다.
  - **잠정→확정 승격:** `priceBasisDate < registeredAt`(기준일 당일 종가가 아직 없어 직전 거래일로 잠정 확정된 상태 — 예: 오늘 날짜로 등록)이면, 이후 회차에서 히스토리에 `registeredAt` 당일 종가가 생겼는지 재확인해 갱신한다. 당일 종가는 18:15 확정 회차 후 생기므로 자동 수렴하며, 기준일이 휴일이면 당일 행이 영원히 없어 직전 거래일 종가로 남는다(의도된 동작). 멱등.
- **수익률 계산(화면):** `(스냅샷 price − priceAtRegistration) / priceAtRegistration × 100` — 수량·금액 없이 비율만. 스냅샷·기준가 어느 쪽이든 없으면 「-」.
- **갱신 잡 통합(§15.3):** `collectWatchlists`(이메일별 실패 격리) → union 합류 → 기존 파이프라인 공유 + `fillMissingNames`를 watchlist에도 확장 + `fillRegistrationPrices`. `RefreshMarketDataReport`에 `watchlists`·`registrationPriceFills` 필드 추가. 실패 정책은 §11.10-A6 그대로(데이터 갱신 실패 500).
- **화면:**
  - **`/watchlist` (목록):** 추가 폼(종목코드 + 등록 기준일, 기본값 오늘) + 항목 리스트(종목명(코드)·기준일·기준가·현재가·수익률, 「기준가 확정 중」 표시) + 항목별 기준일 수정/삭제(보유종목 메인과 동일 패턴). 로그인 `ensureAllowedSession` 재사용.
  - **`/watchlist/[symbolCode]` (상세):** 요약(현재가·등락률 / 기준일·기준가 / 등록 기준 수익률) + 차트("등록일 이후 추이" — `HoldingsChartClient` 재사용, §15.3) + **정보 블록 4종(추출한 `StockInfoBlocks` 공용 컴포넌트)** + 「마지막 갱신」. 미등록 종목코드는 `/watchlist`로 redirect(보유종목 상세와 동일 정책).
  - **홈 카드(형태 제안, 확정):** "관심종목" 카드 — **개수 + 평균 수익률**(기준가 확정된 항목의 단순 평균) **+ 최고 수익률 1종목**(종목명·수익률) 미리보기. 기준가 미확정 항목은 평균에서 제외. 링크 `/watchlist`. staleness 배지는 보유종목 카드와 동일하게 `market:lastRefreshAt` 기준.
- **경계·엣지:** 보유종목과 같은 종목 등록 허용(독립 목록, 데이터는 공용 키라 이중 비용 없음). 관심종목 삭제해도 공용 키(`market:stock:*` 등)는 건드리지 않음. 알림(Phase 10)은 보유종목 대상 설계 그대로 — 관심종목 확장은 범위 밖.

#### 15.5 작업 목록 (2026-07-11 구현 완료)

| 순서 | 작업 | 파일 | 상태 |
|---|---|---|---|
| 15-1 | 유가 지표 추가 — `OIL`(`N`/`WTIF`) 상수·타입·라벨, `market:detail:oil` 키, 갱신 잡 tasks에 oil 추가 | `lib/api/kis/constants.ts`, `types/indices.ts`, `lib/market/store.ts`, `lib/jobs/refreshMarketData.ts` | ✅ oil은 신규 키라 첫 갱신 전 null 허용(`getDashboard` — 배포 직후 홈 무중단) |
| 15-2 | 상세 페이지 — `/indices/market`(미니 카드 3종+미니 차트) 신설, `/indices/oil` 개별 상세(기존 `IndexDetailScreen` 재사용) | `app/indices/market/page.tsx`+css (신규), `app/indices/oil/page.tsx` (신규) | ✅ `IndexDetailScreen`이 지표 제네릭이라 `getOverseasDetail` 수정 불필요 |
| 15-3 | 홈 "시장" 통합 카드 — usdkrw·us10y 카드 2개 → 1개(대표값 원달러+등락률, staleness는 3종 중 가장 오래된 fetchedAt), 링크 `/indices/market` | `app/page.tsx`, `components/indices/IndexDashboard.tsx` | ✅ |
| 15-4 | 관심종목 스토어 — `WatchItem` 타입, `watchlist:{email}` 리더/라이터(`secureJson` 암호화) | `types/watchlist.ts` (신규), `lib/watchlist/store.ts` (신규) | ✅ |
| 15-5 | 관심종목 액션 — 추가/기준일 수정/삭제 (형식 검증만: 6자리·중복·기준일 오늘 이하 & 2년 이내, `priceAtRegistration` null 초기화) | `app/watchlist/actions.ts` (신규) | ✅ |
| 15-6 | 갱신 잡 통합 — `collectWatchlists`·종목 union 합류·`fillMissingNames` 확장·`fillRegistrationPrices`(잠정→확정 승격 포함)·report 필드 | `lib/jobs/refreshMarketData.ts` | ✅ `fillRegistrationPrices`는 KIS 무호출 순수 Redis 로직이라 export(로컬 실측용) |
| 15-7 | 정보 블록 공용 컴포넌트 추출 — `StockInfoBlocks`(+`formatRatio` 이동), 보유종목 상세를 이를 쓰도록 리팩터(동작 불변) | `components/stocks/StockInfoBlocks.tsx`+css (신규), `app/holdings/[symbolCode]/page.tsx` | ✅ |
| 15-8 | `/watchlist` 목록 페이지 + 홈 "관심종목" 카드(개수·평균 수익률·최고 1종목) | `app/watchlist/page.tsx`+css (신규), `lib/watchlist/summary.ts` (신규), `app/page.tsx`, `components/indices/IndexDashboard.tsx` | ✅ |
| 15-9 | `/watchlist/[symbolCode]` 상세 — 요약·등록일 이후 추이 차트(`HoldingsChartClient` 재사용)·`StockInfoBlocks`·미등록 redirect | `app/watchlist/[symbolCode]/page.tsx`+css (신규) | ✅ |
| 15-10 | 검증 — lint·tsc·build, 관심종목 CRUD 왕복(암호문 확인)·기준가 확정/승격 실측, 보유종목 상세 리팩터 무손상 확인 | — | ◐ lint·tsc·build·라우트 스모크(신규 4라우트 마운트·인증 게이트)·로컬 실측 9건 PASS(암호화 왕복, 거래일 기준가 확정, 멱등 재실행 0건, 휴장일 잠정 확정, 수익률 계산). **남은 실측(배포 후·평일): oil 잡 갱신 저장, 브라우저 CRUD 왕복, 오늘 등록→직전 거래일 잠정→18:15 당일 승격** |

**Phase 15 완료 조건:** ☑ 홈에서 환율·금리 카드가 "시장" 카드 1개로 통합되고 `/indices/market`에서 3지표(원달러/미10년/WTI) 미니 카드+차트 표시(빌드·라우트 통과, oil은 첫 갱신 전 「준비 중」 — 화면 시각 확인은 배포 후), ☐ `market:detail:oil`이 갱신 잡에서 저장(실측 — 평일 갱신 회차 필요), ☑ 관심종목 CRUD·기준일 수정 동작 및 `watchlist:{email}` 값이 `enc:v1:` 암호문(스토어 레벨 실측 PASS — 브라우저 왕복은 배포 후), ☑ 기준가 자동 확정·잠정→확정 승격 동작(로컬 실측 — 거래일 당일 종가 확정·휴장일 직전 거래일 잠정·멱등 PASS, 18:15 실시간 승격은 평일 확인), ☑ 관심종목 상세가 보유종목 상세와 동일한 정보 블록 4종·차트 표시(공용 컴포넌트), ☑ 화면의 KIS 직접 호출 0건 유지(client import는 잡 경로 4파일뿐 — grep 확인), ☑ 홈 관심종목 카드(개수·평균 수익률) 구현(빌드 통과).

---

### Phase 16 — 핫종목 상세 테이블: 시장 구분 위첨자 전환

**목표:** `/hot-stocks` 상세 테이블에서 열이 많아 생기는 가로 스크롤을 줄이기 위해 **"시장"(KOSPI/KOSDAQ) 열을 제거**하고, 종목명 뒤에 **위첨자(코스피 ᴷ / 코스닥 ᴰ)** 로 시장 구분을 표시한다. 추가로 **종목코드·종목명을 별도 열로 분리**해 각자 독립적으로 정렬되게 한다 (요청서: `phase9.request.md` 2026-07-12 + 추가 요구 2026-07-12, 셀 분리 방식으로 변경 2026-07-12).

#### 16.1 요구사항 요약 (요청서 반영)

- **열 제거:** 테이블 6열(순위/종목명/시장/수익률/시작 종가/끝 종가) 중 "시장" 열 삭제 → 5열.
- **위첨자 표기:** 종목명 뒤에 코스피 → `ᴷ`, 코스닥 → `ᴰ` (예: "삼성전자ᴷ", "넷마블ᴰ"). 위첨자는 약한 색(회색조 토큰)·작은 폰트로 종목명 가독성을 해치지 않게 처리.
- **접근성:** 위첨자에 `title="코스피"`/`title="코스닥"` 부여 + 스크린리더용 `aria-label` 또는 sr-only 텍스트로 "코스피 종목"/"코스닥 종목" 명시(위첨자 기호만으로는 의미 전달 불가).
- **데이터:** 기존 `entry.market`(`"KOSPI" | "KOSDAQ"`, `market:hotStocks` 저장분) 필드 그대로 사용 — **추가 API 호출 없음** (코드 확인 완료: `src/app/hot-stocks/page.tsx`의 `marketHead`/`marketCell`).
- **적용 범위:** 핫종목 상세 화면 한정. 보유종목·관심종목 등 다른 화면의 기존 시장 표시 방식은 변경하지 않음.
- **종목코드·종목명 별도 열 분리 (추가 요구, 셀 분리 방식):** 종목코드와 종목명을 같은 셀에 두지 않고 **각각 독립된 열**(`<th>종목코드</th>` / `<th>종목명</th>`, 별도 `<td>`)로 나눈다. **종목코드 열은 기존 표기·정렬 방식 그대로 유지**(작은 크기·약한 색, `.table td` 기본 정렬), **종목명 열은 왼쪽 정렬**(위첨자 ᴷ/ᴰ·sr-only 텍스트 포함). 서로 다른 셀이므로 정렬이 서로 영향을 주지 않는다. 열이 하나 늘어나는 만큼 테이블 `min-width` 균형 조정 — 가로 스크롤이 다시 심해지지 않게 확인.

**추가 조정 (2026-07-12, `phase9.request.md` 2차 요구 — 미구현):**

- **정렬 통일:** 모든 열 헤더(`th`)와 값(`td`)을 가운데 정렬로 통일. **예외: 종목명 열의 값(td)만 왼쪽 정렬 유지.**
- **종목코드 헤더명 비우기:** 종목코드 열(컬럼) 자체는 유지하되, 헤더 텍스트("종목코드")만 빈 문자열로 변경 (열 구조·정렬 유지).
- **종목코드 값 시인성 보완:** 종목코드 값에 작은 폰트 크기 + 옅은 색(회색조 텍스트 컬러 토큰)을 적용해 종목명과 시각적으로 구분 (기존 방식대로 — 현재는 종목명과 스타일 차이가 없음).
- **열 순서 변경:** 종목코드 → 종목명 순서를 **종목명 → 종목코드**로 변경 (`th`/`td` 모두).

**3차 추가 (2026-07-12, `phase9.request.md` — 종목명 열 폭 고정·가로 스크롤 제거, 미구현):**

- **종목명 열 고정 최대 폭:** 종목명 셀(`.nameCell`)에 `max-width` 지정 — 다른 열 폭과 균형을 맞춰 테이블 전체가 뷰포트 안에 들어오는 값으로 결정. 초과분은 말줄임표로 표시 (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`).
- **잘린 종목명 접근 보완:** 종목명 셀에 `title` 속성으로 전체 종목명 제공(마우스 오버 시 확인 가능). sr-only 텍스트는 잘리지 않은 전체 종목명 유지 — 시각적으로만 자르고 의미는 보존. (주의: 셀 안에 위첨자 ᴷ/ᴰ `title="코스피/코스닥"`이 이미 있으므로 `title` 부여 위치·중첩을 구현 시 정리.)
- **가로 스크롤 제거 확인:** 종목명 열 폭 조정 후 테이블 `min-width`(현재 500px) 재계산 — 일반적인 화면 폭에서 가로 스크롤이 발생하지 않게 함. 소수의 긴 종목명이 잘리는 것은 허용.

**4차 추가 (2026-07-12, `phase9.request.md` — "끝종가" 열 가림 해결·셀 폭 최적화, 미구현):**

- **배경:** 종목명 열 폭 고정(3차)에도 "끝종가" 열이 화면 오른쪽으로 밀려 가려짐 → 테이블 전체 폭을 줄여 모든 열이 가로 스크롤 없이 화면 안에 들어오게 조정.
- **항목값(td) 폰트 크기 축소:** 항목명(`th`) 스타일·크기는 그대로 유지하고, 항목값(`td`) 텍스트의 폰트 크기만 줄여 "끝종가" 열까지 전부 노출. 종목명 왼쪽 정렬·위첨자(ᴷ/ᴰ)·종목코드 값 스타일 등 기존 개별 스타일은 색상·정렬 유지, 크기만 비례 조정.
- **셀 여백(padding) 최적화:** 폰트 축소만으로 부족하거나 가독성이 떨어지면 각 셀 좌우 padding을 타이트하게 축소. `th` padding도 필요 시 함께 조정하되 헤더 텍스트 크기는 불변.
- **그 외 폭 확보 방법 자유 적용(필요 시):** 열 폭 재배분(숫자 열 축소), 종목명 `max-width` 추가 축소, 숫자 포맷 축약(표시 의미 불변 전제, 신중 검토) 등 — 적용한 방법과 이유를 보고에 명시.
- **최종 목표:** 일반 데스크톱 화면 폭에서 순위/종목명/종목코드/시작종가/끝종가 등 모든 열이 가로 스크롤 없이 한 화면에 노출. 긴 종목명은 기존대로 ellipsis 유지.

**5차 추가 (2026-07-12, `phase9.request.md` — 수익률/시작종가/끝종가 값 오른쪽 정렬, 구현 완료):**

- **배경:** 전체 항목명·항목값이 가운데 정렬로 통일된 상태에서, 숫자 데이터인 수익률/시작종가/끝종가는 자릿수 비교가 쉽도록 **값(td)만 오른쪽 정렬**로 변경.
- **대상 열:** 수익률, 시작 종가, 끝 종가 3개 열의 값(`td`)만. 항목명(`th`)은 기존 가운데 정렬 그대로 유지.
- **그 외 열 무변경:** 순위·종목명·종목코드 열의 정렬은 기존 그대로(순위·종목코드 가운데, 종목명 왼쪽). 폰트 크기·색상·padding 등 다른 스타일 속성도 변경하지 않음.
- **구현 방식:** 3개 `td`에 공용 클래스(예: `.numCell`)를 부여하고 `.table .numCell { text-align: right; }`로 명시도 보정(§16-6과 동일하게 `.table td`의 가운데 정렬을 덮어야 하므로 `.table .numCell` 형태 필수). 수익률 td의 기존 등락 방향 클래스(`up`/`down`/`flat`)·`numeric`은 그대로 유지.

#### 16.2 작업 목록 (구현은 착수 지시 후)

| 순서 | 작업 | 파일(예정) | 상태 |
|---|---|---|---|
| 16-1 | 테이블 "시장" 열 제거(`th`/`td`) + 종목명 셀에 위첨자 마크업(`title`·sr-only 접근성 포함) | `src/app/hot-stocks/page.tsx` | ☑ |
| 16-2 | 종목코드·종목명 열 분리 — `<th>종목코드</th>`/`<th>종목명</th>` 및 별도 `<td>`로 나눔. 종목코드 열은 기존 표기·정렬 유지, 종목명 열은 왼쪽 정렬(위첨자·sr-only 포함) | `src/app/hot-stocks/page.tsx` | ☑ |
| 16-3 | 위첨자·정렬 스타일(약한 색·작은 크기, 기존 토큰 사용) 추가, 불필요해진 `marketHead`/`marketCell`·`stockName` 스타일 정리, sr-only 유틸 추가, 열 증가분 `min-width` 균형 조정(480→500px) | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-4 | 검증 — lint·tsc·build, 코스피/코스닥 혼재 상태에서 위첨자 확인, 종목코드·종목명 열 정렬 확인, 가로 스크롤이 다시 심해지지 않는지 확인 | — | ◐ lint·tsc·build PASS · 화면 시각 확인(위첨자·정렬·스크롤)은 사용자 확인 대기 |
| 16-5 | 열 순서 변경 — 종목코드→종목명을 **종목명→종목코드**로 (`th`/`td` 모두), 종목코드 헤더 텍스트 빈 문자열로 변경(열 구조 유지, sr-only 텍스트로 접근성 보존) | `src/app/hot-stocks/page.tsx` | ☑ |
| 16-6 | 정렬 통일 — 모든 `th`·`td` 가운데 정렬, 종목명 값(td)만 왼쪽 정렬 예외 유지 (`rankHead`/`nameHead`/`rankCell` 왼쪽 정렬 제거) | `src/app/hot-stocks/page.module.css` (필요 시 `page.tsx`) | ☑ |
| 16-7 | 종목코드 값 스타일 — 작은 폰트 + 옅은 색(회색조 텍스트 컬러 토큰)으로 종목명과 시각적 구분 (`.codeCell` → `.table .codeCell`로 명시도 보정 — 기존엔 `.table td` 색상에 덮여 무효였음) | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-8 | 검증 — lint·tsc·build, 열 순서·정렬·헤더 비움·종목코드 스타일 4개 항목 확인 | — | ◐ lint·tsc·build PASS · 화면 시각 확인은 사용자 확인 대기 |
| 16-9 | 종목명 열 `max-width` + ellipsis — 위첨자 ᴷ/ᴰ가 함께 잘려나가지 않도록 셀이 아닌 이름 텍스트 전용 `.nameText` span(inline-block)에 `max-width: 120px`·`overflow: hidden`·`text-overflow: ellipsis` 적용 | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-10 | 잘린 종목명 접근 보완 — 종목명 셀(`td`)에 전체 종목명 `title` 부여(안쪽 위첨자 `title="코스피/코스닥"`이 해당 영역에서 우선 적용되어 중첩 충돌 없음), ellipsis는 시각 전용이라 접근성 트리·sr-only 모두 전체 이름 유지 | `src/app/hot-stocks/page.tsx` | ☑ |
| 16-11 | 테이블 `min-width` 재계산 — 종목명 폭 고정으로 자연 폭 상한이 min-width 근처(~520px)로 묶여 500px 유지가 적정으로 판단, 일반 화면 폭 스크롤 미발생·500px 미만 모바일만 §14.5대로 스크롤 | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-12 | 검증 — lint·tsc·build, ellipsis 표시·title 툴팁·sr-only 전체 이름·가로 스크롤 미발생 4개 항목 확인 | — | ◐ lint·tsc·build PASS · 화면 시각 확인(ellipsis·툴팁·스크롤)은 사용자 확인 대기 |
| 16-13 | 항목값(td) 폰트 크기 축소 — `th` 스타일·크기 불변(--text-micro 11px 유지), `td` 텍스트만 13→12px 축소(종목명·위첨자·종목코드 등 개별 스타일은 색상·정렬 유지, 종목코드·위첨자는 11px 그대로라 비례 관계 유지) | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-14 | 셀 padding 최적화 — `td` 좌우 padding 12→5px, `th` 좌우 padding 12→5px(세로 padding·헤더 텍스트 크기 불변) | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-15 | 추가 폭 확보 — **근본 원인**: 컨테이너 `--layout-max-width` 480px의 내부 가용 폭이 ~446px인데 테이블 `min-width`가 500px라 데스크톱에서도 스크롤이 구조적으로 강제됨 → `min-width` 500→440px로 재계산, 종목명 `.nameText` `max-width` 120→96px(12px 폰트 기준 한글 8자). 숫자 포맷 축약은 불필요해 미적용 | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-16 | 검증 — lint·tsc·build PASS. 헤드리스 Chrome으로 CSS 재현 목업 실측: 극단 케이스(수익률 4자리·시작/끝 종가 모두 7자리 백만원대)에서도 테이블 자연 폭 ≤ 446px로 가로 스크롤 미발생(overflow=false), 항목명 스타일 불변·ellipsis 유지 | — | ◐ 실측 PASS · 실제 화면 시각 확인은 사용자 확인 대기 |
| 16-17 | 수익률/시작 종가/끝 종가 3개 `td`에 공용 클래스(`numCell`) 부여 — 수익률 td의 기존 `numeric`·등락 방향 클래스는 유지 | `src/app/hot-stocks/page.tsx` | ☑ |
| 16-18 | `.table .numCell { text-align: right; }` 추가 — `.table td` 가운데 정렬을 덮는 명시도 보정, 폰트·색·padding 등 다른 속성 무변경 | `src/app/hot-stocks/page.module.css` | ☑ |
| 16-19 | 검증 — lint·tsc·build PASS, 3개 열 값만 오른쪽 정렬·항목명(th) 및 순위/종목명/종목코드 열 정렬 무변경(코드 확인) | — | ◐ lint·tsc·build PASS · 화면 시각 확인은 사용자 확인 대기 |

**Phase 16 완료 조건:** ☑ "시장" 열이 제거되고 종목명 뒤 위첨자(ᴷ/ᴰ)가 올바르게 표시(코드 반영·빌드 통과 — 화면 확인 대기), ☑ `title` + 스크린리더 텍스트 접근성 보완 적용, ☑ 종목코드·종목명 별도 열 분리(각각 독립된 `<th>`/`<td>` — 종목명 왼쪽 정렬, 종목코드 기존 표기·정렬 유지), ☑ 추가 API 호출 없이 기존 `entry.market` 필드만 사용, ☑ 다른 화면(보유종목·관심종목)의 시장 표시 무변경(핫종목 파일 2개만 수정), ☐ 가로 스크롤이 다시 심해지지 않는지 확인(min-width 560→480→500px, 열 분리 반영 — 화면 확인 대기), ☑ lint·tsc·build 통과. **[추가 조정 2026-07-12]** ☑ 종목명 열 값만 왼쪽 정렬·나머지 헤더/값 전부 가운데 정렬, ☑ 종목코드 헤더 텍스트 비움(열 구조 유지, sr-only로 접근성 보존), ☑ 종목코드 값 작은 폰트+옅은 색으로 종목명과 구분(명시도 보정), ☑ 열 순서 종목명→종목코드로 변경, ☑ lint·tsc·build 통과(추가분 반영 후) — 화면 시각 확인은 사용자 확인 대기. **[3차 추가 2026-07-12 — 종목명 열 폭 고정]** ☑ 종목명 열이 고정 `max-width`(이름 텍스트 120px)를 가지며 초과 시 ellipsis로 잘림(위첨자 ᴷ/ᴰ는 잘리지 않게 이름 텍스트만 제한), ☑ 잘린 종목명은 셀 `title`로 전체 이름 확인 가능, ☑ sr-only·접근성 트리는 전체 이름 유지(ellipsis는 시각 전용), ☑ 일반 화면 폭에서 가로 스크롤 미발생(자연 폭 상한 ~520px, min-width 500px 유지 — 화면 확인 대기), ☑ lint·tsc·build 통과(3차분 반영 후). **[4차 추가 2026-07-12 — 끝종가 가림 해결·셀 폭 최적화]** ☑ 항목명(th) 스타일·크기 변경 없음(--text-micro 11px 유지, padding만 좌우 축소), ☑ 항목값(td) 폰트 크기 13→12px 축소로 가독성 유지하며 폭 확보, ☑ 셀 padding 최적화(th·td 좌우 12→5px), ☑ min-width 500→440px·nameText 120→96px — 근본 원인(컨테이너 가용 폭 446px < min-width 500px) 해소, ☑ "끝종가" 포함 모든 열이 가로 스크롤 없이 노출(헤드리스 Chrome 목업 극단 케이스 실측 PASS — 실제 화면 시각 확인은 사용자 확인 대기), ☑ lint·tsc·build 통과(4차분 반영 후). **[5차 추가 2026-07-12 — 수익률/시작종가/끝종가 값 오른쪽 정렬]** ☑ 수익률/시작 종가/끝 종가 3개 열의 값(td)만 오른쪽 정렬(`.table .numCell` 명시도 보정), ☑ 항목명(th)은 가운데 정렬 그대로 유지, ☑ 다른 열(순위/종목명/종목코드) 정렬·스타일 무변경, ☑ 폰트 크기·색상·padding 등 다른 스타일 속성 무변경(text-align만 추가), ☑ lint·tsc·build 통과(5차분 반영 후) — 화면 시각 확인은 사용자 확인 대기.

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
| PR-8 | 9 | 홈 화면 카드 6개 그리드 리팩토링, 코스피/코스닥/환율/금리/보유종목/변동성 지수 상세 페이지 신설, 보유종목 CRUD(수동 입력)·수익률·히스토리, 코스피 변동성 지수 계산·히스토리, cron 통합 |
| PR-9 | 10 | PWA(manifest·sw)·Web Push(VAPID)·구독 저장, 신고가 추적·알림 조건 3종·쿨다운 — ~~`/api/cron/check-alerts`·맥미니 crontab~~(Phase 11로 대체, 갱신 잡 훅으로 연결) |
| PR-10 | 11 | QStash 스케줄 4개(확정 재시도 정책)·서명 검증, Redis 스냅샷 스토어·갱신 잡 파이프라인, 읽기 경로 Redis 전환(`unstable_cache` 제거), Vercel cron/`vercel.json` 제거, 갱신 상태 UI(장중 한정 2단계 배지·「마지막 갱신」 표기), 허용 시간·거래일 가드 |
| PR-11 | 12 | `secureJson` 유틸(AES-256-GCM·`enc:v1:` 포맷), `store.ts` 4함수 적용(읽기 하위호환+쓰기 암호화), 키 관리(`HOLDINGS_ENCRYPTION_KEY`), 평문 마이그레이션 — **구현·머지 순서는 PR-11(Phase 12)이 PR-10(Phase 11)보다 먼저** |
| PR-12 | 13 | `Holding` `totalCost` 모델 전환·레거시 역산 마이그레이션, 종목 추가 폼 개편(종목명 자동 조회), 종목 히스토리 공용 저장소(`stock:{symbolCode}:history`, 최근 1~2년·cron 갱신), 종목 상세 페이지(`/holdings/[symbolCode]`) 신설·`/holdings` 메인 개편 — **재무/기업 정보 블록은 §13.4 조사·범위 재확정 후. 머지 순서는 PR-12(Phase 13)가 PR-10(Phase 11)보다 먼저** |

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

*문서 버전: 2.4 (2026-07-10: ① Phase 12 "보유종목 데이터 암호화 저장" 신설 — `holdings:{email}`+`history`(totalValue 포함) 둘 다 `node:crypto` AES-256-GCM으로 저장 전 암호화(`enc:v1:{iv}:{authTag}:{ciphertext}` 버전 프리픽스 포맷, IV 12바이트 매회 생성), 키는 `HOLDINGS_ENCRYPTION_KEY`(32바이트, 서버 전용, .env.local+Vercel+별도 백업), 적용 지점은 `store.ts` 4개 함수 경계로 한정(호출부 무변경 — Phase 11 파이프라인에 투명), 마이그레이션은 읽기 하위호환(배열=평문/`enc:v1:`=복호화)+쓰기 상시 암호화로 자연 전환 후 선택적 일회성 재저장, 복호화 실패는 throw로 표면화. **진행 순서 확정: Phase 12 완료 후 Phase 11 착수.** ② Phase 11 배지 정책 2차 개정(대안 A+심각도 구분) — 배지 판정을 장중(KST 평일 09:00~18:20, 정규+재시도 창)으로 한정하고 장외·주말은 미표시(최초안의 "밤마다 상시 배지" 부작용 제거), 장중 판정을 경고(20분~1시간, 노랑·작은 느낌표)/심각(1시간+, 빨강·강조 느낌표) 2단계로 구분(`tokens.css` 색상 매핑, 필요 시 시맨틱 토큰 추가), 상세 페이지 「마지막 갱신」은 배지와 별개로 상시 표시 유지. 이전 2.3: Phase 11 **최종 확정** — `phase9.request.md` 확정 지시문 반영. 재시도·실패 정책 6건 확정: ① 정정 회차 18:15(18:10 정정치 포함 조회, 5분 여유) ② 15:40 실패 시 재시도 없이 포기(18:15가 커버) ③ 18:15 실패 시 18:20에 전체 1회 재실행 후 실패하면 다음 영업일 09:00 대기(부분 재시도 없음) ④ 보유종목 등록 시 KIS 실존 검증 제거(형식 검증만) ⑤ 공휴일은 KIS `basDt` ≠ KST 오늘로 판단해 알림 판정 skip ⑥ 데이터 갱신 실패 500/알림 발송만 실패 로그+200. 갱신 상태 UI 3건 확정: 홈 카드 6개 아이콘 우측 상단 「!」 배지(`fetchedAt` 20분 경과 시), 상세 페이지 「마지막 갱신: YYYY-MM-DD HH:mm」 표기, `tokens.css` 토큰으로 다크/라이트 대응. KST 가드 envelope 09:00~18:40로 조정(창 밖 재시도 쟁점 소멸). 구현 미착수 — 착수 지시 대기. 이전 2.2: Phase 11 "데이터 갱신 구조 전면 재설계" 설계 추가 — `phase9.request.md` 반영. `unstable_cache` 기반 접속 시 갱신(pull)을 폐기하고 QStash 스케줄 4개(`CRON_TZ=Asia/Seoul`, 장중 10분×2 분할 표현식 + 15:40 + 18:1x)가 KIS를 호출해 Redis(`market:detail:*`/`market:stock:*`)에 저장하는 push 구조로 전환, 화면은 Redis만 읽음. 요청서 cron 표현식(`*/10 9-15`)의 15:40/15:50 초과 문제를 표현식 분할로 수정. Phase 8(캐시+revalidateTag cron 전면 대체, 8-6 폐기), Phase 9(18:15 단일 cron 번복, 사용자별 종목 조회→전체 union 1회 조회, 저장 시 KIS 실존 검증 충돌), Phase 10(맥미니 crontab·check-alerts 폐기, 판정을 갱신 잡에 통합)과의 충돌 지점 및 장애 시나리오 10종(회차 실패·재시도 경합·연속 실패 시 staleness 표시·Redis 단일 의존·공휴일 알림·빈 Redis 등) 문서화. QStash 공식 문서 확인(CRON_TZ 지원·지수 백오프 재시도·DLQ·서명 검증·Free 1,000msg/일). 결정 필요 5건(18:10 vs 18:15, 창 밖 재시도 유예, 실존 검증 제거, 공휴일 skip, 부분 실패 응답 정책) 명시. 구현 미착수·승인 대기. 이전 2.1: Phase 10 "보유종목 알림 기능" 조사·설계 추가 — 신고가 추적(단일 값+그 시점 코스피/코스닥), 알림 조건 3종 OR, 맥미니 crontab 10분 주기 `/api/cron/check-alerts` 호출, 1회 발송+2시간 쿨다운, Web Push(VAPID)+`src/app/manifest.ts`+`public/sw.js` 신규 필요(현재 저장소에 PWA 자산 없음 확인). 구현 미착수·승인 대기. 이전 2.0: Phase 9 그룹 1~7 구현·로컬 검증 완료. cron을 15:40/18:15 두 개에서 평일 18:15 KST 단일로 통합(사용자 결정) — 기존 `/api/cron/revalidate-indices` 확장으로 캐시 재검증+변동성/보유종목 히스토리 upsert 일원화, `vercel.json` cron 1개. 이전 1.9: Phase 9 최종 통합 확정 — 이전의 모든 개정판(1.6 최초안: 지수(연초=100) 채택안 / 1.7: 지수 항목 제외·`prevValue` 단일 값 단순화안 / 1.8: 지수 재도입 없이 `history` 시계열+추이 차트·단위 토글)을 전부 대체하는 최종 버전. 홈 화면을 "KOSPI/KOSDAQ 카드+차트 직결" 구조에서 **요약 카드 6개 그리드(코스피·코스닥·원달러 환율·미국 10년물 금리·보유종목 수익률·코스피 변동성 지수) + 지표별 상세 페이지**(`/indices/kospi`, `/indices/kosdaq`, `/indices/usdkrw`, `/indices/us10y`, `/holdings`, `/indices/kospi-volatility`) 구조로 재구성. 홈에는 차트를 두지 않고 전부 상세 페이지로 이전. 보유종목은 `holdings:{email}`(현재 보유)·`holdings:{email}:history`(일별 `{date, totalCost, totalValue}` 시계열)로 유지하되 CRUD·차트(수익률/원 단위 토글)·일별 리스트를 `/holdings` 상세 페이지 하나로 통합. 신규 "코스피 변동성 지수"(일일 (고가-저가)/저가×100)를 `kospiVolatility:history`에 시계열 저장, 홈에는 당월 평균·전월 대비 증감만, 상세 페이지에는 최근 6개월 월별 평균 차트 하나만(토글·목록 없음) 표시. 작업 목록을 홈 리팩토링→코스피/코스닥 상세→환율/금리→보유종목→변동성 지수→cron 통합→검증의 7개 그룹으로 재편. 구현은 승인 대기)·공공 API 국내 지수 대시보드 최종 구현 계획*
