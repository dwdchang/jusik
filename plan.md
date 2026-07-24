# jusik 구현 계획서 — KIS API 연동 국내 지수 대시보드

> **문서 상태:** 운영 중 — Phase 이력 관리 문서 (2026-07-17 기준: Phase 1~17 구현 완료, QStash 스케줄 7개 등록·활성 확인)  
> **기준 문서:** [`research.md`](./research.md) (코드 구조 사전 조사, 2026-07-12) — 구세대 원본은 [`research.legacy.md`](./research.legacy.md)로 보존  
> **스택:** Next.js 16.2.6 · React 19.2.4 · Recharts · CSS Modules (Tailwind 없음)  
> **제약:** 새 Phase 계획은 `research.md`와 대조해 승인받은 뒤 구현한다. 전반부 §0~§6(Phase 1~8)은 구세대 설계 이력 보존 구간 — 각 섹션 상단 배너 참고.  
> **문서 조직 원리:** plan.md는 Phase 단위로 시간순 작업 이력을 기록하는 문서다. research.md(구조 기준 §1~10, 항상 최신 유지)와는 조직 원리가 다르므로, 코드 구조 조사 내용을 여기에 Phase로 추가하지 말고 research.md에 반영할 것.

---

## 요약 (현재 상태, 2026-07-17)

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
| 11 — 데이터 갱신 구조 전면 재설계 (QStash Scheduled Push) | ✅ **구현 완료(2026-07-11, 그룹 1~8)** — KIS 호출을 QStash 잡(`/api/jobs/refresh-market-data`) 단일 경로로 이관(허용 시간 가드 09:00~18:40), 화면은 `market:*` Redis만 읽음(상세 정보 블록 4종 포함 — 같은 날 사용자 승인), `unstable_cache`/`revalidateTag`/Vercel cron 전부 제거, 2단계 staleness 배지·「마지막 갱신」 표기. lint·tsc·build·가드/staleness 실측 통과. **콘솔 스케줄 4개 등록 완료(2026-07-11) — §11.11 참고** |
| 12 — 보유종목 데이터 암호화 저장 (AES-256-GCM) | ⚠️ **구현·로컬 검증 완료(2026-07-10, 12건 실측 PASS)** — 남은 작업: Vercel env 등록·키 백업(사용자), 배포 후 화면 확인·즉시 마이그레이션. **Phase 11보다 먼저 진행** |
| 13 — 보유종목 페이지 개선 (`totalCost` 모델·종목명 자동 조회·종목 상세 페이지) | ✅ **구현 완료(2026-07-11, 13-1~13-6)** — `totalCost` 모델 전환(레거시 `avgPrice` 역산 하위호환), 종목명 CTPF1002R 자동 조회, `stock:{symbolCode}:history` 공용 저장소(2년 백필·cron 갱신), `/holdings/[symbolCode]` 상세 페이지(수정 모드·2년 차트·정보 블록 4종: 시가총액/배당/실적/투자지표), `/holdings` 메인 개편. lint·tsc·build·라이브 실측 통과. **다음: Phase 11 착수** |
| 14 — 핫종목 (최근 1개월/분기/반기/연도 수익률 TOP 100) | ✅ **구현 완료(2026-07-11) · Upstash 스케줄 등록 완료(2026-07-17).** 완결된 달력 구간 4종(직전 월말 기준 최근 1/3/6/12개월) 수익률 랭킹, 매월 첫 평일 1회 배치(월봉 종목당 1콜 × 유니버스 2,647 실측 = 약 2,650콜), 홈 7번째 카드 + `/hot-stocks` 상세(구간 탭 4개). 2026-06 기준 전 구간 로컬 시딩 실측(3패스 이어받기·실패 0건) |
| 15 — 관심종목 + 시장 통합 카드 | ✅ **구현 완료(2026-07-11, 15-1~15-9 + 로컬 실측 9건 PASS)** — ① 유가(WTI `N`/`WTIF`) 지표 추가, 홈 "시장" 통합 카드, `/indices/market`(미니 카드 3종)·`/indices/oil`. ② 관심종목 `watchlist:{email}` 암호화 저장(`enc:v1:` 실측), 갱신 잡 통합(union 합류·이름 채움·기준가 확정/잠정 승격·멱등 — 전부 로컬 실측), `/watchlist` 목록·상세, 공용 `StockInfoBlocks` 추출(보유종목 상세 리팩터). lint·tsc·build·라우트 마운트 스모크 통과. **남은 실측(배포 후·평일 — §15.5 15-10): oil 첫 갱신 회차 저장, 브라우저 CRUD, 오늘 등록→18:15 승격** |
| 16 — 핫종목 상세 테이블 시장 구분 위첨자 전환 | ✅ **구현 완료(16-1~16-19, §16.2 전 항목 ☑)** — "시장" 열 제거 + 종목명 뒤 위첨자(ᴷ/ᴰ)로 대체해 가로 스크롤 해소(`hot-stocks/page.tsx`의 `MARKET_SUP`·`page.module.css`의 `.marketSup`). 기존 `entry.market` 필드만 사용(추가 API 호출 없음), 핫종목 상세 화면 한정. 남은 것은 화면 시각 확인뿐(§16.2 검증행 ◐) |
| 17-1 — 공시 수집 (DART OpenAPI) | ✅ **구현 완료(2026-07-12)** — 신규 잡 `refresh-feeds`(시간창 가드 없음 — KIS 아님), `corpCode.xml`→`dart:corpCodeMap` 매핑(30일 주기·재다운로드 1일 1회 상한·`unmappable` 제외), 종목별 `market:disclosures:{code}`(최근 90일 최대 10건). QStash 스케줄 `0 8-22 * * *` 등록 완료(2026-07-12). A안(상세 페이지 공시 섹션)은 17-2에서 철회 |
| 17-2 / 17-2b — 피드 UI (홈 요약 카드 + `/feeds` 상세) | ✅ **구현 완료(2026-07-13)** — 17-2: 홈 통합 카드(뉴스·공시·수출입 탭, 공시만 실동작)·A안 철회. 17-2b: 홈은 핫종목형 3줄 요약 카드(당일 건수만, `getTodayFeedCounts`)로 축소하고 탭+게시판+아코디언은 `/feeds`로 이동. 당일 판정은 `rceptDt===KST 오늘` 문자열 비교. lint·tsc·build + 실브라우저 E2E PASS |
| 17-3 — 뉴스 백엔드 (네이버 검색 API) | ✅ **구현 완료(2026-07-14)** — `refreshFeeds`에 `refreshNews` 스텝 증분(신규 잡 없음), 종목명 키워드·`sort=date`·상위 10건 → `market:news:{code}`, 제목+요약 종목명 필터로 오탐 제거, `pubDate`는 저장 시점에 KST "YYYYMMDD"로 고정. 라이브 API 프로브로 전 경로 실데이터 확인 |
| 17-4 — 수출입 백엔드 (관세청 GW API) | ✅ **구현 완료(2026-07-14)** — `getNewtradeList` 실측 확정(USD 원값·`총계`행 제외·조회 최대 12개월·현재월 미완결). `market:tradeStats`에 13개월 연속 저장(월 1회성 가드·잡 `ok` 게이팅 제외), `/feeds` 수출입 탭 + `/indices/market` 미니 카드(최신 확정월 3지표+YoY). 라이브 E2E·Redis read-back·사용자 화면 확인 완료(2026-07-15) |
| 17-5 — 수출입 상세 (`/indices/trade/[yyyymm]`) | ✅ **구현 완료(2026-07-15)** — 별도 잡 `refresh-trade-detail`(97개 류 전수·동시성 4·51초, 일부 실패 시 저장 생략), `market:tradeDetail:{yyyymm}` + `months` 인덱스. 품목 HS 4단위·상위 8개국+기타·국가 클릭 팝업(네이티브 `<dialog>`, 클릭당 API 0회). QStash 월 1회 스케줄 `0 3 5 * *` 등록 완료(2026-07-15). 부수 수정: `proxy.ts` matcher를 `api/jobs/` 접두사로 통합. **한계: 상세는 잡이 도는 달부터 누적(현재 202606~) — 백필은 1,164콜이라 하지 않음** |

**남은 작업 (6-6):** 프로덕션(Vercel) 배포 후 다중 인스턴스 환경에서 토큰 발급 횟수가 실제로 줄었는지 Vercel 로그로 확인.
**이력 (2026-07-04):** KIS 서버 7/4~7/5 전산 점검 기간에 대시보드에서 "fetch failed"(KIS API 연결 실패)가 발생했었음 — 코드 문제 아니었고, 점검 종료 후 정상 동작 확인됨.

이하는 각 Phase의 상세 계획·근거·작업 단위 원문이다.

---

## 0. 앱 목표 및 완료 정의

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 공공데이터포털 시절 설계이며 현재 코드와 다름. 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

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

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 공공데이터포털 시절 설계이며 현재 코드와 다름. 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

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

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 공공데이터포털 시절 설계이며 현재 코드와 다름. 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

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

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 공공데이터포털 시절 설계이며 현재 코드와 다름(`unstable_cache`·`revalidateTag`는 Phase 11에서 전부 제거됨). 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

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

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 공공데이터포털 시절 설계이며 현재 코드와 다름(컴포넌트 구성은 Phase 9 이후 재편됨 — research.md §2.3 참고). 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

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

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 초기 설계 스니펫이며 현재 코드와 다름(현행 `tokens.css`는 다크모드 `html[data-theme="dark"]` 오버라이드·차트 CSS 변수 등 포함 — research.md §2.4 참고). 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

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

> ⚠️ **구세대 구간 포함** — 이 섹션 앞부분(Phase 1~8)은 Phase 5 이전 구세대(공공데이터포털) 설계에서 출발한 이력이며 현재 코드와 다른 서술이 있음. **현행 정본은 Phase 9 이후 절**(research.md 연계). 내용은 이력 보존용으로 수정하지 않음.

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
| 6-6 | 프로덕션(Vercel) 배포 후 다중 인스턴스에서 토큰 발급 횟수 감소 확인 | Vercel 로그 | **폐기**(2026-07-20, 사용자 결정) — 운영에서 토큰 발급이 정상 동작 중이라 로그 대조 검증 불필요 |

**Phase 6 완료 조건:** ☑ 인스턴스 재시작/스케일아웃 시에도 토큰이 재사용되어 `1분당 1회` 제한에 걸리지 않음.
(로컬 6-1~6-5 검증 완료. 프로덕션 확인(6-6)은 2026-07-20 폐기 — 운영 정상 동작으로 갈음. 캐시·락 로직과
`[KIS][auth]` 진단 로그는 그대로 유지한다.)

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

> **⚠️ Phase 11에 의한 대체 공지:** 본 Phase의 캐시 + `revalidateTag` cron 구조는 Phase 11(QStash 갱신 잡)로 전면 대체되었고, 남은 작업이던 8-6(배포 후 cron 확인)도 폐기됨 (§11.7 참고 — 요약 테이블과 동일 내용).

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

> ※ **현행 정정 (2026-07-12):** 위 표의 「불필요」는 이 절 작성 시점(공개 데이터 전제) 기준 — 현재는 미들웨어(`src/proxy.ts`)가 전 경로를 보호하고, 모든 상세 페이지가 이메일 화이트리스트 인증(`ensureAllowedSession`)을 요구한다 (research.md §7.1).

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

- **보안:** 코스피/코스닥/환율/금리/변동성 지수는 로그인 불필요(기존과 동일, 공개 데이터). 보유종목만 로그인 필요(`session.user.email` + 기존 `isEmailAllowed()`) — 새 인증 로직 불필요, 기존 패턴 재사용. *(※ 현행 정정 2026-07-12: 지금은 미들웨어가 전 경로를 보호하고 지수 상세 페이지도 전부 이메일 화이트리스트 인증 필요 — research.md §7.1)*
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
| 1 | 매입가 대비 종목 수익률 ≤ −10% | `(현재가 − avgPrice) / avgPrice × 100` — holdings + 현재가 *(※ 현행: Phase 13에서 totalCost 모델로 전환 — 계산은 `(현재가×수량 − totalCost)/totalCost` 기준)* |
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

#### 10.6 재검증·3단계 재편 및 1단계 구현 (2026-07-18)

**설계 재검증 결과 (Phase 11~18 이후 기준):** §10.2~10.3(Web Push·StockPeak·조건 3종·2시간 쿨다운·Redis 키 형태)은 유효. §10.4(check-alerts 라우트)·§10.5 그룹 4~5(cron auth 추출·맥미니 문서)는 폐기 확정. §10.5 그룹 3의 "KIS 응답 확장"은 이미 구현됨 — `StoredStockSnapshot.changeRate`/`marketName`이 Phase 11부터 저장 중(잔여 검증은 `marketName` 실값→코스피/코스닥 매핑뿐). 신규 반영: ① 개인 키(`push:subs`·`alerts:{email}:peaks`)는 Phase 12 `secureJson` 암호화 적용(쿨다운 키는 TTL 기반 평문 유지) ② VAPID 공개키는 `NEXT_PUBLIC_` 금지 규칙에 따라 서버 env `VAPID_PUBLIC_KEY`를 Server Component가 읽어 클라이언트에 prop으로 전달 ③ proxy matcher에 PWA 자산(`sw.js`·`manifest.webmanifest`·`icons/`·`apple-icon.png`) 예외 추가.

**알림 범위 확정 (사용자 승인):** 시세 알림 = 기존 조건 3종(보유종목 한정). 공시 알림 = 4개 유형만 제한 허용 — 상장폐지·회계감사 관련(감사의견 등)·관리종목/투자주의 지정·배당금 관련. 뉴스·등록가 승격·수출입 알림은 제외.

**DART 필터링 실측 검증 (2026-07-18):** `list.json` 응답 행에 `pblntf_ty` **없음**(요청 필터 전용, 응답 필드는 corp_code/corp_name/stock_code/corp_cls/report_nm/rcept_no/flr_nm/rcept_dt/rm) → 필터링은 저장된 `DisclosureItem.reportNm` 키워드 매칭으로 수행(추가 API 호출 불필요). 최근 60일 + 사업보고서 시즌(2026-03~05) 총 3만 건 실스캔 결과: 배당="배당"(현금ㆍ현물배당결정 등), 상장폐지="상장폐지"+"상장적격성"(기타시장안내 괄호 주석 포함 — 주석은 report_nm 안에 포함됨), 관리종목="관리종목"(내부결산시점관리종목지정…·주권매매거래정지(관리종목지정사유발생) 등), 감사="감사보고서"+"감사의견"+"회계처리"로 전부 포착 확인. **한계:** KRX 시장경보(투자주의/투자경고/투자위험 지정)는 DART 미공시라 포착 불가 — DART로 잡히는 것은 투자주의환기종목·관리종목 계열("환기" 키워드 포함)뿐.

**3단계 재편:** 1단계 = PWA 기반+구독 등록(발송 인프라·테스트 발송까지) / 2단계 = 시세 알림(StockPeak·조건 3종·쿨다운·`evaluateAlertsHook` 실구현, 지수 등락률은 훅 내 `market:detail:{kospi|kosdaq}` MGET) + 종목별 알림 on/off / 3단계 = 공시 알림(`refreshFeeds`에 별도 훅 — 시세 잡은 거래일 가드로 주말 공시를 놓치므로 feeds 잡(매시 08~22, 주말 포함)에 연동, 종목별 마지막 통지 `rceptNo` 비교로 중복 차단·쿨다운 불필요). 발송 유틸(`lib/push/send.ts`)은 두 잡 공유.

**1단계 구현 완료 (2026-07-18):**
- PWA: `src/app/manifest.ts`(standalone·아이콘 3종), `public/icons/icon-192/512.png`+`src/app/apple-icon.png`(Node 스크립트 자체 생성 — 브랜드 블루+상승 차트 라인, maskable 안전영역 준수), `public/sw.js`(push·notificationclick 리스너, 오프라인 캐싱 없음, 페이로드 계약 `{title, body, url?, tag?}`), `next.config.ts` `/sw.js` `Cache-Control: no-cache` 헤더, `src/proxy.ts` matcher PWA 자산 예외.
- 발송 인프라: `web-push`+`@types/web-push` 설치, VAPID 키 생성·`.env.local` 등록(`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` — **Vercel env 등록은 사용자 작업 필요**), `lib/push/store.ts`(`push:subs:{email}` — `secureJson` 암호화, endpoint 기준 dedup/제거/prune), `lib/push/send.ts`(`sendPushToEmail` — 구독별 실패 격리, 410/404 자동 정리, VAPID env 검증).
- UI: `/alerts` 페이지(`ensureAllowedSession` 가드, VAPID 공개키 prop 전달, 등록 기기 수 표시) + `components/alerts/PushSubscriptionManager.tsx`(`'use client'` — 지원 감지, iOS 미설치 시 홈 화면 추가 안내, 구독/해지/테스트 발송) + Server Actions(`app/alerts/actions.ts` — 구독 입력 형식 검증, `requireEmail` 가드). 햄버거 사이드바에 "알림 설정" 메뉴 추가(전체 허용 사용자 노출).
- 검증: lint·tsc·build PASS(26 라우트, `/manifest.webmanifest`·`/apple-icon.png` 정적 생성). `next start` 스모크 — 미인증으로 `/manifest.webmanifest`·`/sw.js`·`/icons/*`·`/apple-icon.png` 전부 200(307 안 됨), `/alerts`는 307→/login, `sw.js` no-cache 헤더 확인. 실기기(iOS 홈 화면 설치)·실발송 검증은 배포 후 수행.

**2단계 구현 완료 (2026-07-18):**
- `lib/alerts/store.ts` — `alerts:{email}:peaks`(`StockPeakMap`, `secureJson` 암호화)·`alerts:{email}:muted`(음소거 종목코드 배열, 암호화 — 시세·공시 알림 공유 예정)·`alerts:{email}:cooldown:{code}`(발송 시각 ISO, `EX 7200` 평문). 매도한 종목의 신고가는 저장 시 보유종목만 남겨 자연 정리.
- `lib/alerts/evaluate.ts` — 순수 판정부 `evaluateHolding`(신고가 갱신 + 조건 3종 OR: 매입가 대비 ≤−10%(totalCost 모델)/신고가 대비 ≥10% 하락/소속 시장 지수 ≤−2% AND 종목 ≤−12%) + 파이프라인 `evaluatePriceAlerts`(지수는 `market:detail:{kospi|kosdaq}` MGET 1회, 이메일 단위 실패 격리, 음소거→쿨다운 순 체크, **발송 성공(sent>0) 시에만 쿨다운 SET** — 전송 실패면 다음 회차 재시도). `marketIndexOf`: `rprs_mrkt_kor_name`에 KOSDAQ/코스닥 포함 시 코스닥, 그 외(null 포함) 코스피 폴백 — 실측값 "KOSPI"/"KOSPI200" 확인.
- `refreshMarketData.ts` — `evaluateAlertsHook` no-op을 `evaluatePriceAlerts` 호출로 교체, 리포트 `alerts.summary`(evaluated/sent/cooldownSkipped/mutedSkipped) 추가. 거래일 가드·실패 시 로그+200은 기존 그대로.
- 종목별 on/off UI — `/alerts`에 "종목별 알림" 카드(`StockAlertToggles` Client 컴포넌트, 보유종목 목록+토글) + `setStockAlertEnabledAction`(6자리 형식 검증 + **내 보유종목만 허용**).
- 검증: lint·tsc·build PASS. 판정 로직 esbuild 번들 실측 10 시나리오 전부 PASS(최초 신고가 초기화·조건 1/2/3 및 −10% 경계·신고가 경신 시 미발송·코스닥 매핑·지수 결측 시 조건 3 skip·복수 사유). 실발송·쿨다운 동작은 배포 후 거래일 잡 회차에서 확인.

**공시 알림 유형 확장 실측 (2026-07-18, 3단계 반영 예정 — 최근 60일 전체 상장사 21,135건·distinct 보고서명 1,148종 전수 스캔):**
- **무상증자** = "무상증자" 키워드로 전부 포착 — `주요사항보고서(무상증자결정)`, `주요사항보고서(유무상증자결정)`(부분 문자열로 매칭됨), `권리락 (무상증자)` 등.
- **유상증자** = "유상증자"+"일반공모증자" 2키워드 — `주요사항보고서(유상증자결정)` 계열, `유상증자1차발행가액결정`·`최종발행가액확정`, `증권발행결과(자율공시) (제3자배정 유상증자)` 등. 단독 예외 `증권발행결과(자율공시) (일반공모증자-소액공모)` 1건 때문에 "일반공모증자" 보조 키워드 필요. 한계: 공모 유상증자의 `증권신고서(지분증권)`은 키워드 미포함이지만 선행하는 `유상증자결정` 주요사항보고서가 항상 잡히므로 이벤트 누락은 없음.
- **회사채 발행** = "사채"+"채무증권" 2키워드 — CB/BW/EB(`전환사채권발행결정` 등)와 `사채원리금미지급발생`은 "사채", 일반 공모 회사채(`증권신고서(채무증권)`)·신종자본증권(`자본으로인정되는채무증권발행결정`)은 "채무증권"으로 포착. **주의(노이즈):** `일괄신고추가서류(파생결합사채…)`(60일 660건+)는 증권사 ELB/DLB 상품 발행이라 "파생결합" 포함 시 제외 권장. 사모 일반회사채는 공시 의무 자체가 없어 원천적으로 포착 불가.
- **대출(채무보증 등)** = "채무보증"+"담보제공"+"대여"+"차입"+"대출" 5키워드 — `타인에대한채무보증결정`, `타인에대한담보제공결정`, `최대주주변경을수반하는주식담보제공계약체결`, `금전대여결정`, `단기차입금증가결정`, `특수관계인에대한자금대여/담보제공`, `대출원리금연체사실발생` 등 전부 포착. 60일 내 오탐(무관 보고서명 매칭) 0건.

**KRX 시장경보(투자주의·투자경고·투자위험) 데이터 소스 조사 (2026-07-18):**
- KRX 공식 Open API(openapi.krx.co.kr) — 지수/주식/채권 등 6개 카테고리 시세·기본정보뿐, **시장경보 서비스 없음**. data.go.kr 금융위 API 102종에도 시장경보 지정 데이터셋 없음. KIND·KRX 정보데이터시스템은 웹 화면/CSV 다운로드만(공식 API 아님).
- **대안 실측 확인:** 이미 저장 중인 KIS 현재가 스냅샷 `raw`에 `mrkt_warn_cls_code`(00 없음/01 투자주의/02 투자경고/03 투자위험)·`invt_caful_yn`(투자주의환기)·`mang_issu_cls_code`(관리종목)·`short_over_yn`(단기과열)·`temp_stop_yn`(거래정지)·`sltr_yn`(정리매매) 필드 존재(프로덕션 Redis 9종목 실측). **보유·관심종목 한정이면 신규 API 없이 회차 간 상태 변화 감지로 시장경보 알림 구현 가능** — 3단계 범위 결정 시 반영.

**3단계 구현 완료 (2026-07-18, 공시 8유형 + KRX 시장경보 — 사용자 범위 확정 승인):**
- `lib/alerts/feedAlerts.ts` (신규) — feeds 잡 훅 전용 파이프라인 `evaluateFeedAlerts` + 순수 판정부 3종 분리:
  - `matchDisclosureCategories` — 공시 8유형 키워드 분류(위 실측 확정 그대로): 상장폐지("상장폐지"+"상장적격성")·회계·감사("감사보고서"+"감사의견"+"회계처리")·관리종목·환기("관리종목"+"환기")·배당·무상증자·유상증자(+"일반공모증자")·회사채("사채"+"채무증권", **"파생결합" 포함 시 제외**)·대출·채무보증(5키워드).
  - `extractMarketWarnState`/`diffMarketWarnStates` — 저장된 `market:stock:{code}` 스냅샷 `raw`의 경보 필드 6종(`mrkt_warn_cls_code`·`invt_caful_yn`·`mang_issu_cls_code`·`short_over_yn`·`temp_stop_yn`·`sltr_yn`)을 회차 간 비교해 지정·해제 문구 생성 — **신규 API 호출 없음**. 결측은 "경보 없음"으로 정규화(양쪽 결측이면 diff 없음 — 오탐 방지), 관리종목 필드는 Y/N·코드형("00"=없음) 둘 다 수용.
- 중복 방지: 종목별 **전역** 커서 `alerts:disclosure:last:{code}`(마지막 통지 접수번호, 14자리 문자열 비교=시간순)·`alerts:marketwarn:last:{code}`(경보 상태) — 공개 데이터 파생이라 평문. 첫 회차는 기준점만 저장하고 발송 안 함(배포 직후 과거 공시 알림 폭주 방지). 커서는 발송 결과와 무관하게 전진 — 일시 발송 실패 시 중복 재발송보다 1회 누락을 택함. 쿨다운 불필요.
- 잡 연결: `refreshFeeds.ts` 스텝 5로 훅 추가 — `refreshDisclosures`가 방금 받아온 공시를 `itemsBySymbol`로 메모리 전달(Redis 재조회 없음), 리포트 `alerts`(evaluated/summary — baselined·matched·changed·sent·mutedSkipped) 추가, 훅 실패는 로그만 남기고 잡 ok 게이팅 안 함(시세 잡과 동일).
- 발송: 대상 = 각 사용자 **보유+관심종목**(피드 수집 범위와 동일), 음소거 `alerts:{email}:muted` 공유, 이메일 단위 실패 격리. 공시 클릭 → `/feeds`, 시장경보 클릭 → 보유면 `/holdings/{code}` 아니면 `/watchlist/{code}`. tag는 `disclosure-{code}-{rceptNo}`(공시별)·`marketwarn-{code}`.
- 종목별 토글 확장: 공시·시장경보 알림은 관심종목도 대상이라 `/alerts` 토글 목록을 보유+관심 union으로 확장(보유 이름 우선), `setStockAlertEnabledAction` 소유 검증도 보유∪관심으로 확장 — 안 그러면 관심종목 알림을 끌 방법이 없음.
- `KisStockPriceOutput`에 경보 필드 6종 명시 추가(기존 인덱스 시그니처로 저장은 이미 되고 있었음).
- 검증: lint·tsc·build PASS. 판정 로직 esbuild 번들 실측 31 시나리오 전부 PASS(8유형 매칭·유무상증자 부분매칭·파생결합 제외·무관 공시 미매칭·결측 정규화·경보 지정/격상/해제·코드형 관리종목·복수 변화). 실발송은 배포 후 feeds 잡 회차에서 확인.

**시세 알림 관심종목 확장 + 인라인 토글 (2026-07-18):**
- 시세 알림 대상을 보유종목 한정 → **보유+관심종목 union**으로 확장 — 공시·시장경보(3단계)와 대상 일치. `lib/alerts/evaluate.ts`의 `evaluateHolding`을 `evaluateTarget`으로 일반화하고 `collectAlertTargets` 신설: 사용자별 보유·관심을 종목 단위로 dedupe(같은 종목 보유 내역 여러 건은 totalCost·quantity 합산, 보유·관심 중복은 보유 우선 — 매입가 기준 유지).
- 조건 1(−10% 손실)의 기준가만 다름: 보유 = 매입가(totalCost 모델, 문구 "매입가 대비"), 관심 전용 = **등록 기준가 `priceAtRegistration`**(화면의 "등록 기준 수익률"과 동일 기준, 문구 "등록가 대비"). 등록가 미확정(null)이면 조건 1만 skip — 조건 2(신고가)·3(지수 동반 급락)은 기준가 무관이라 그대로 적용. 신고가 맵(`alerts:{email}:peaks`)도 보유+관심 union 기준으로 유지(관심 해제 시 자연 정리). 푸시 링크: 보유 `/holdings`(기존 유지) / 관심 전용 `/watchlist`. 스냅샷은 이미 보유+관심 union으로 수집되므로(§15.3) **KIS 추가 호출 0**. `refreshMarketData.ts` `evaluateAlertsHook`에 `watchlistsByEmail` 전달.
- 인라인 알림 토글 — 보유·관심종목 상세의 "알림 설정" 링크(/alerts 이동)를 그 자리 토글로 교체: `components/alerts/AlertToggleButton.tsx`(Client, 단일 종목 on/off) 신설, 기존 `setStockAlertEnabledAction` 재사용(보유∪관심 소유 검증 기존 그대로). 서버 컴포넌트가 `getMutedSymbols`로 초기 상태 전달. watchlist 상세의 미사용 `.alertsLink` 스타일 제거.
- 검증: lint·tsc·build PASS.

**남은 작업:** iOS 실기기 수신 확인, 배포 후 거래일 잡 회차에서 시세 알림 실발송(관심종목 포함)·feeds 잡 회차에서 공시 알림 기준점 저장(baselined) 확인.

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

**의존성:** `@upstash/qstash` 미설치 → 추가 필요. env 추가: `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` (스케줄은 Upstash 콘솔에서 생성하므로 `QSTASH_TOKEN`은 앱 코드에 불필요). ~~`QSTASH_TOKEN` 불필요~~ — Phase 18에서 DLQ 읽기 전용 조회(`/dlq`)에 서버 전용으로 도입.

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

**배포 체크리스트 (2026-07-17 기준 — 1~4 전부 처리됨):**

1. ◐ Vercel env에 `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` 등록 (Upstash 콘솔 → QStash → Signing Keys). 로컬 `.env.local`에는 등록 완료. **현재 등록된 스케줄 7개는 전부 `Authorization` 헤더(`CRON_SECRET` Bearer)로 호출돼 서명 검증 폴백 경로로 정상 동작 중** — Vercel 등록 여부는 콘솔에서만 확인 가능하며, 미등록이어도 운영에 지장 없음.
2. ✅ Upstash 콘솔 → QStash → Schedules 4개 등록 **완료(2026-07-11)**, Destination은 전부 `https://{배포 도메인}/api/jobs/refresh-market-data` (POST):
   - `CRON_TZ=Asia/Seoul */10 9-14 * * 1-5`, Retries **1**
   - `CRON_TZ=Asia/Seoul 0,10,20,30 15 * * 1-5`, Retries **1**
   - `CRON_TZ=Asia/Seoul 40 15 * * 1-5`, Retries **0**
   - `CRON_TZ=Asia/Seoul 15 18 * * 1-5`, Retries **1** — **콘솔에서 Retry-Delay 값이 저장되지 않는 문제로 고정 5분 지연은 폐기, 재실행 지연은 QStash 기본 백오프(1차 ≈ +12초)에 맡김 (2026-07-11 사용자 결정, §11.10-A3 개정)**
3. ✅ 시딩 완료 — 프로덕션 Redis에 시세·공시(7)·뉴스(9)·수출입 스냅샷 적재 확인(2026-07-17). empty state 해소.
4. ✅ 스케줄 실행 확인 — `market:lastRefreshAt` = `{at:"2026-07-17T06:40:11Z"(15:40 KST), trigger:"qstash", ok:true}`로 QStash 트리거 성공 실증(2026-07-17). (DLQ 잔여 확인은 Upstash 콘솔 육안 확인 항목으로 남음.)

**Phase 11 완료 조건:** ✅ 화면(홈·상세·보유종목)이 KIS를 직접 호출하는 경로 0건(코드 검색으로 확인 — KIS import는 잡 경로뿐), ✅ KIS 호출이 QStash 잡 + 허용 시간 가드 안에서만 발생(주말 no-op 200 실측), ✅ 스케줄 4개(재시도 정책 §11.4 포함) 실 실행 및 Redis 갱신 확인 — 프로덕션 `market:lastRefreshAt` = `{at:"2026-07-17T06:40:11Z"(15:40 KST), trigger:"qstash", ok:true}`(2026-07-17 확인), ✅ `unstable_cache`/`revalidateTag`/Vercel cron 완전 제거, ✅ 갱신 상태 UI 동작(카드 2단계 배지 — 장중 한정 판정·경고/심각 구분·장외 미표시, 상세 「마지막 갱신」 상시 표기, 다크/라이트), ◐ 장애 시나리오 핵심 3종 — 멱등성(저장 전부 SET/upsert)·빈 Redis empty state는 코드 확인, 회차 실패 자연 복구는 배포 후 확인.

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

**Phase 12 완료 조건:** ☑ `holdings:{email}`·`history` 신규 저장값이 전부 `enc:v1:` 포맷(실측), ☑ 레거시 평문 읽기 하위호환 동작(실측), ☑ CRUD·차트·홈 카드·cron 기존 기능 무손상(빌드·typecheck 통과, 스토어 왕복 실측 — UI는 배포 후 확인), ☑ 복호화 실패 시 에러로 표면화(실측), ☑ **키가 `.env.local`+Vercel+별도 백업 3곳에 존재**. **완료 후 Phase 13 → Phase 11 순으로 착수(2026-07-10 2차 개정).**

**남은 작업 (배포 관련):** **없음 — 2026-07-20 사용자 확인으로 Phase 12 전체 완료.** (당초 목록: ① Vercel env `HOLDINGS_ENCRYPTION_KEY` 등록 + 키 별도 백업, ② push·배포, ③ 배포 후 홈 카드·`/holdings` 화면 확인, ④ 선택 마이그레이션 — 모두 처리됨.)

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

**목표:** 홈 화면에 "핫종목" 카드(7번째)를 추가하고, 상세 페이지에서 **코스피+코스닥 전 보통주를 순수 수익률로만 줄 세운 TOP 100**을 구간 4종으로 보여준다. **구현 완료(2026-07-11) — 14-1~14-8 완료. Upstash 스케줄 5번째 등록 완료(2026-07-17).**

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
| 14-8 | 검증·배포 — lint·tsc·build, 로컬 수동 실행(CRON_SECRET)으로 2026-06 기준 전 구간 생성 실측, 배포 후 Upstash 콘솔 스케줄 5번째 등록(`CRON_TZ=Asia/Seoul 35 10 1-7 * *`, Retries 1) + 장중 수동 시딩 | Upstash 콘솔, — | ☑ 로컬 검증·시딩 완료(3패스 이어받기, 실패 0) + Upstash 스케줄 `CRON_TZ=Asia/Seoul 35 10 1-7 * *`(Retries 1) 등록·활성 확인(2026-07-17, QStash API 조회) |

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

**추가 조정 (2026-07-12, `phase9.request.md` 2차 요구 — → Phase 21에서 구현 완료):**

- **정렬 통일:** 모든 열 헤더(`th`)와 값(`td`)을 가운데 정렬로 통일. **예외: 종목명 열의 값(td)만 왼쪽 정렬 유지.**
- **종목코드 헤더명 비우기:** 종목코드 열(컬럼) 자체는 유지하되, 헤더 텍스트("종목코드")만 빈 문자열로 변경 (열 구조·정렬 유지).
- **종목코드 값 시인성 보완:** 종목코드 값에 작은 폰트 크기 + 옅은 색(회색조 텍스트 컬러 토큰)을 적용해 종목명과 시각적으로 구분 (기존 방식대로 — 현재는 종목명과 스타일 차이가 없음).
- **열 순서 변경:** 종목코드 → 종목명 순서를 **종목명 → 종목코드**로 변경 (`th`/`td` 모두).

**3차 추가 (2026-07-12, `phase9.request.md` — 종목명 열 폭 고정·가로 스크롤 제거, → Phase 21에서 구현 완료):**

- **종목명 열 고정 최대 폭:** 종목명 셀(`.nameCell`)에 `max-width` 지정 — 다른 열 폭과 균형을 맞춰 테이블 전체가 뷰포트 안에 들어오는 값으로 결정. 초과분은 말줄임표로 표시 (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`).
- **잘린 종목명 접근 보완:** 종목명 셀에 `title` 속성으로 전체 종목명 제공(마우스 오버 시 확인 가능). sr-only 텍스트는 잘리지 않은 전체 종목명 유지 — 시각적으로만 자르고 의미는 보존. (주의: 셀 안에 위첨자 ᴷ/ᴰ `title="코스피/코스닥"`이 이미 있으므로 `title` 부여 위치·중첩을 구현 시 정리.)
- **가로 스크롤 제거 확인:** 종목명 열 폭 조정 후 테이블 `min-width`(현재 500px) 재계산 — 일반적인 화면 폭에서 가로 스크롤이 발생하지 않게 함. 소수의 긴 종목명이 잘리는 것은 허용.

**4차 추가 (2026-07-12, `phase9.request.md` — "끝종가" 열 가림 해결·셀 폭 최적화, → Phase 21에서 구현 완료):**

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

### Phase 17 — 뉴스·공시·정부자료 자동 수집 (17-1 공시 / 17-2 뉴스 / 17-3 정부자료)

- **요청 근거**: `phase9.request.md`(뉴스/공시/정부자료 수집 요청). 사전 조사 보고는 `summary.md`(2026-07-12)로 제출·승인 완료.
- **사용자 승인 (2026-07-12)**: ① 정부자료 소스 **C-1(관세청 수출입실적 오픈API)** 채택, ② UI **A안**(종목 상세 페이지에 뉴스·공시 섹션 — 보유/관심 상세 공용), ③ 단계 분리 **17-1(공시) → 17-2(뉴스) → 17-3(정부자료)** 승인.
- **뉴스 저장 전제 확인 (사용자 확정)**: 뉴스는 `market:news:{code}`에 **최신 N건 스냅샷 덮어쓰기** — 과거 뉴스 히스토리는 저장하지 않으며, 향후 "지난 뉴스 히스토리 조회" 기능 추가 계획 없음(네이버 검색 API 약관의 대량 저장·재배포 제한 대응과도 일치).

#### 17.1 데이터 소스 확정 (조사 상세는 summary.md 2026-07-12판)

| 단계 | 소스 | 방식 | 인증 |
|---|---|---|---|
| 17-1 공시 | DART OpenAPI (`opendart.fss.or.kr/api/list.json`) | 종목코드→고유번호(`corpCode.xml` zip) 매핑 후 공시검색. 일 20,000건 한도 | `DART_API_KEY` |
| 17-2 뉴스 | 네이버 검색 API 뉴스 (`openapi.naver.com/v1/search/news.json`) | 종목명 키워드 검색, 최신 N건 스냅샷. 일 25,000콜 | `NAVER_CLIENT_ID`/`_SECRET` |
| 17-3 정부자료 | 관세청 수출입실적 오픈API (공공데이터포털) | 월별 수출입 통계 수치 (월 1회 갱신 데이터) | `DATA_GO_KR_SERVICE_KEY` |

- 세 소스 모두 **KIS 같은 호출 시간창 제약 없음** — 공시·뉴스는 장 마감 후·주말에도 발생.

#### 17.2 아키텍처 — 신규 잡 `refresh-feeds` (기존 QStash→Redis→화면 패턴 준수)

- **신규 잡 1개** `POST /api/jobs/refresh-feeds`: 공시(17-1)를 골격으로 만들고, 뉴스(17-2)·정부자료(17-3)를 같은 파이프라인에 소스별 실패 격리로 증분 추가.
- **기존 `refresh-market-data`에 얹지 않는 사유**: 그 잡은 `isWithinKisCallWindow`(평일 09:00~18:40)에 묶여 저녁·주말 공시/뉴스 수집 불가 — §8.13 "얹을 수 있으면 신설 금지" 원칙의 예외 사유.
- **잡 신설 3곳 동기화 (research.md §8.13)**: ① `proxy.ts` matcher 제외 추가 ② `verifyJobRequest` 재사용 — 단 **시간창 가드는 적용하지 않음**(KIS 아님) ③ QStash 스케줄 등록.
- **스케줄**: `CRON_TZ=Asia/Seoul 0 8-22 * * *` (매일 08~22시 정시, 15콜/일 — QStash Free 1,000/일 내 기존 42콜+15콜 여유).
- **수집 대상 종목** = 전체 허용 이메일의 holdings+watchlist union·중복 제거 — 기존 `refreshMarketData`의 `collectHoldings`/`collectWatchlists`를 **공용 모듈 `lib/jobs/collectTargets.ts`로 추출**해 두 잡이 공유(§8 중복 방지 원칙 — 로직 복제 대신 이동).
- **corpCode 매핑**: `corpCode.xml`(zip, 인증키 필요) → 상장사(6자리 종목코드 보유)만 `{stockCode: corpCode}`로 `dart:corpCodeMap`에 저장. **30일 주기 저빈도 갱신** + 매핑에 없는 신규 종목 발견 시 보정 갱신. 캐시가 있으면 재다운로드는 **성공·실패 무관 1일 1회로 제한**한다 — 시도 시각을 `attemptedAt`으로 `fetchedAt`과 분리해 남기므로, 다운로드가 계속 실패해도 매 회차 수 MB zip을 받지 않는다. 다운로드에 성공한 map에도 없던 관심종목 코드는 `unmappable`에 적어 보정 갱신 트리거에서 제외한다 — DART corpCode.xml은 **보통주만** 담아 우선주(예: 005935)는 영구 미매핑이라, 없으면 매 회차 보정 갱신이 재발한다. zip 해제는 기존 의존성 fflate 재사용(신규 의존성 0). 이 다운로드는 배포 환경에서 30초 타임아웃(`DART_CORP_CODE_TIMEOUT_MS`)에 계속 걸렸는데, 함수가 기본 리전 `iad1`(버지니아)에서 돌아 서울의 DART까지 3.5MB를 받아야 했던 것이 원인으로 보인다 — 같은 다운로드가 국내에서는 0.9초에 끝난다. `vercel.json`으로 리전을 `icn1`(서울)에 고정해 대응했다(research.md §1).
- 모든 저장은 멱등(SET 덮어쓰기) · 종목별 try-catch 실패 격리 · 실패 시 report `ok:false` → 500(QStash 재시도).

#### 17.3 Redis 키 (신규, 전부 비암호화 — 공개 데이터)

| 키 | 값 | 갱신 |
|---|---|---|
| `market:disclosures:{code}` | 최근 90일 공시 최대 10건 `{reportNm, rceptNo, rceptDt, flrNm, rm}` + fetchedAt | feeds 잡, SET 덮어쓰기. DART 뷰어 링크는 `rcept_no`로 조립 |
| `dart:corpCodeMap` | `{map: {stockCode: corpCode}, fetchedAt, attemptedAt?, unmappable?}` | feeds 잡, 30일 주기(+신규 종목 보정, 재다운로드 1일 1회 상한) |
| `market:news:{code}` | (17-2) 최신 기사 N건 스냅샷 | 17-2에서 설계 확정 |
| `market:govReports` | (17-3) 수출입 통계 수치 | 17-3에서 설계 확정 |

#### 17.4 신규 환경변수

- 17-1: `DART_API_KEY` (opendart.fss.or.kr 발급, 서버 전용 · `NEXT_PUBLIC_` 금지).
- Vercel Sensitive 이슈: 값 정본은 로컬 `.env.local`(및 개인 금고), Vercel 대시보드에 수동 등록 — CLI로는 `vercel env ls`로 존재만 확인.

#### 17.5 UI (A안)

- 공용 Server Component `components/stocks/StockDisclosures`(+ 전용 CSS Module) — 보유종목 상세·관심종목 상세의 "종목 정보"(StockInfoBlocks) 섹션 아래 "공시" 섹션으로 2곳 공용 적용.
- 데이터는 페이지가 `getDisclosures(symbolCode)`(Redis 리더)로 읽어 프로프로 전달 — StockInfoBlocks와 동일 패턴. 실패는 `.catch(() => null)` 격리.
- 각 공시는 DART 뷰어(`dart.fss.or.kr/dsaf001/main.do?rcpNo=…`) 외부 링크 + 출처 표기.
- 17-3 정부자료는 시장 요약(`indices/market`) 미니 카드로 추가 예정(17-3에서 확정).

#### 17.6 작업 목록

**17-1 공시 (구현 완료 — 2026-07-12):**

| 순서 | 작업 | 파일 | 상태 |
|---|---|---|---|
| 17-1-1 | DART API 클라이언트 — `corpCode.xml` zip 다운로드·파싱(fflate)·상장사 매핑, 공시검색 `list.json` 래퍼(status 000/013 처리, 15초 타임아웃) | `src/lib/api/dart/client.ts` | ☑ |
| 17-1-2 | feeds Redis store — `market:disclosures:{code}`·`dart:corpCodeMap` 타입·리더·라이터 | `src/lib/feeds/store.ts` | ☑ |
| 17-1-3 | 수집 대상 공용화 — `collectHoldings`/`collectWatchlists`를 `collectTargets.ts`로 추출(동작 불변), `refreshMarketData`가 import로 전환 | `src/lib/jobs/collectTargets.ts`, `src/lib/jobs/refreshMarketData.ts` | ☑ |
| 17-1-4 | feeds 갱신 잡 파이프라인 — corpCode 매핑 확보(30일 주기+신규 종목 보정) → 종목별 순차 공시 조회(유량 제한)·저장·실패 격리·report | `src/lib/jobs/refreshFeeds.ts` | ☑ |
| 17-1-5 | 잡 라우트 신설 — `verifyJobRequest` 재사용, 시간창 가드 미적용, `maxDuration 300` + `proxy.ts` matcher 제외 추가 | `src/app/api/jobs/refresh-feeds/route.ts`, `src/proxy.ts` | ☑ |
| 17-1-6 | 공시 섹션 UI — `StockDisclosures` 공용 컴포넌트(+CSS Module), 보유·관심 상세 2곳에 "공시" 섹션 추가 | `src/components/stocks/StockDisclosures.tsx`·`.module.css`, `src/app/holdings/[symbolCode]/page.tsx`, `src/app/watchlist/[symbolCode]/page.tsx` | ☑ |
| 17-1-7 | 검증 — lint·tsc·build | — | ☑ PASS |
| 17-1-8 | 운영(사용자 액션) — ① `DART_API_KEY` 발급 후 `.env.local`+Vercel 등록 ② QStash 스케줄 `0 8-22 * * *`(Asia/Seoul) 등록 ③ `?force` 불필요(시간창 없음), CRON_SECRET 수동 트리거로 최초 시딩 | — | ☑ 완료 — `DART_API_KEY` 등록, QStash 스케줄 `CRON_TZ=Asia/Seoul 0 8-22 * * *`(Retries 1) 등록·활성 확인(2026-07-12 등록, 2026-07-17 QStash API로 재확인) |

**17-2 뉴스 / 17-3 정부자료:** 17-1 골격 완성 후 착수(승인된 순서). 17-2는 종목명 키워드 검색 품질(동명이의어 오탐)을 실데이터로 확인 후 보정, 17-3은 C-1 확정에 따라 관세청 API 응답 구조 실측 후 설계.

**Phase 17-1 완료 조건:** ☑ KIS 외 신규 소스(DART)도 "잡만 쓰고 화면은 Redis만 읽는" 대원칙 유지, ☑ 잡 신설 3곳 동기화 중 코드 2곳(proxy matcher·verifyJobRequest) 반영 — QStash 스케줄 등록은 사용자 액션, ☑ 공시 섹션이 보유·관심 상세 2곳에 공용 적용(A안), ☑ 신규 의존성 0(fflate 재사용), ☑ lint·tsc·build 통과, ☑ `DART_API_KEY` 등록·스케줄 등록 후 실데이터 확인 — 프로덕션 Redis에 `market:disclosures:{code}` 7건 적재 확인(2026-07-17).

#### 17.7 UI 설계 변경 — 홈 통합 카드(뉴스·공시·수출입 탭) — Phase 17-2 (2026-07-13)

- **요청 근거**: `phase9.request.md`(Phase 17-2로 갱신). **17-1의 A안(보유·관심 상세 페이지 공시 섹션)을 철회**하고, 홈 화면에 뉴스/공시/수출입 3탭 통합 카드를 신설한다. 종목별이 아니라 **로그인 사용자의 보유+관심 종목 전체를 시간순 병합한 통합 뷰**.
- **범위 결정 (사용자 승인 2026-07-13)**: "**UI 먼저, 백엔드는 단계별**". 이번 Phase 17-2는 ① 새 홈 카드 UI + ② **공시 탭만 실동작**(기존 `market:disclosures` 재사용) + ③ 상세 페이지 공시 섹션 제거까지. **뉴스·수출입 탭은 "준비 중" 자리표시자** — 데이터 백엔드(네이버 클라이언트·`market:news`, 관세청 클라이언트·`market:tradeStats`)가 아직 없어 후속 Phase로 분리.
  - 후속 **17-3 뉴스 백엔드**: 네이버 검색 API 클라이언트 + `market:news:{code}` writer + `refreshFeeds` 증분 + `NAVER_CLIENT_ID/SECRET` 발급 → 뉴스 탭 활성화.
  - 후속 **17-4 수출입 백엔드**: 관세청 `getNewtradeList` 클라이언트 + `market:tradeStats` + `refreshFeeds` 증분 + `DATA_GO_KR_SERVICE_KEY` 발급 → 수출입 탭 활성화.
- **아키텍처**: 데이터 계층 무변경(잡·store 골격 재사용). 홈 조회 로직만 신규 — 종목별 원본은 수집 잡이 **SET 덮어쓰기(쓰기 시점 최대 10건)**라 누적되지 않으므로, 홈 병합 상위 컷(40건)은 **조회 시점 계산만**으로 충분하고 별도 삭제 로직이 없다(사용자 확인).
- **관세청 API 실측(17-4용 기록)**: 엔드포인트 `http://apis.data.go.kr/1220000/Newtrade/getNewtradeList` (params `serviceKey`/`strtYymm`/`endYymm`, XML). GW 계열 표준 응답 필드 `year`·`expDlr`(수출 천달러)·`impDlr`(수입)·`balPayments`(무역수지)·`expWgt`/`impWgt`. `DATA_GO_KR_SERVICE_KEY` 미발급이라 live 실측은 17-4 착수 시 첫 호출로 필드명·단위 확정. 표시안: 최신 확정월 수출/수입/무역수지 + 전년 동월 대비(YoY) 요약 카드(환율·금리·유가 미니 카드 형태).

##### 백로그 (추후 정리 과제 — 17-2 범위 아님)

- **종목 삭제 시 관련 Redis 키 미정리**: 보유·관심종목을 삭제해도 `market:disclosures:{code}`
  (및 `market:stock:{code}`·`market:stockInfo:{code}`·`stock:{code}:history` 등 종목코드 단위
  공용 키)가 정리되지 않고 잔존한다. Phase 17-1부터 있던 기존 동작이며 17-2가 만든 문제가
  아니다. 화면 노출 영향은 없음 — 조회 경로(homeFeed·평가·상세)가 모두 **현재 보유/관심 코드만**
  읽어 고아 키는 표시되지 않는다. 다만 Redis에 사용되지 않는 키가 누적되므로, 삭제 Server Action
  (holdings/watchlist `deleteAction`) 또는 갱신 잡에서 **더 이상 어느 사용자도 보유/관심하지 않는
  종목코드의 공용 키를 정리**하는 로직을 추후 검토한다. (주의: 공용 키라 여러 사용자가 공유 —
  전체 union에서 빠진 코드만 삭제 대상. 잘못 삭제하면 다른 사용자 화면에서 재수집 전까지 공백.)
  **17-2에서는 코드 변경 없이 기록만 남긴다 (사용자 지시 2026-07-13).**

**17-2 작업 목록 (구현 완료 — 2026-07-13):**

| 순서 | 작업 | 파일 | 상태 |
|---|---|---|---|
| 17-2-1 | 홈 통합 피드 리더 — 세션 사용자 보유+관심 `{code→name}` → `market:disclosures:{code}` MGET 병합·접수번호 내림차순·상위 40건 컷 | `src/lib/feeds/homeFeed.ts` (신규) | ☑ |
| 17-2-2 | 탭 전환 + 아코디언 Client 셸(최소 Client 예외) — 공시 탭 실동작, 뉴스·수출입 자리표시자 | `src/components/feeds/FeedTabsClient.tsx`·`.module.css` (신규) | ☑ |
| 17-2-3 | 홈 배치 — `page.tsx` `Promise.all`에 `getDisclosureBoard` 합류, `IndexDashboard`가 7카드 그리드 아래 전체폭 섹션으로 렌더 | `src/app/page.tsx`, `src/components/indices/IndexDashboard.tsx`·`.module.css` | ☑ |
| 17-2-4 | A안 철회 — 상세 2곳 공시 섹션·import·`getDisclosures` 호출 제거 | `src/app/holdings/[symbolCode]/page.tsx`, `src/app/watchlist/[symbolCode]/page.tsx` | ☑ |
| 17-2-5 | 미사용 코드 정리 — `StockDisclosures.tsx`·`.module.css` 삭제, `getDisclosures` 리더 제거(homeFeed가 MGET로 대체), `disclosuresKey` export해 store↔homeFeed 공유(§8 키 중복 방지) | `src/components/stocks/StockDisclosures.*`(삭제), `src/lib/feeds/store.ts` | ☑ |
| 17-2-6 | 검증 — lint·tsc·build + 실브라우저 E2E(세션 민팅·헤드리스 Chrome로 탭 전환·아코디언·병합 정렬 실측) | — | ☑ PASS |

**Phase 17-2 완료 조건:** ☑ A안 철회(상세 공시 섹션 제거)·홈 통합 카드 신설, ☑ 공시 탭이 보유+관심 종목 공시를 시간순 병합·상위 40건 표시(누적 없음 — 조회 시점 컷), ☑ 뉴스·수출입 탭 자리표시자(후속 17-3/17-4), ☑ Client 컴포넌트 1개 추가는 최소 Client 예외로 명시, ☑ 신규 의존성 0, ☑ lint·tsc·build 통과, ☑ 실브라우저 E2E로 탭 전환·아코디언·병합 정렬·null-row skip 확인.

#### 17.8 피드 UI 재배치 — 그리드 요약 카드 + `/feeds` 상세 페이지 — Phase 17-2b (2026-07-13)

- **요청 근거**: `phase9.request.md`(Phase 17-2b로 갱신). 17-2의 전체폭 3탭 카드를 코스피·코스닥과 동일한 **그리드 요약 카드**(당일 업로드 건수만)로 축소하고, 탭+게시판+아코디언 전체는 **별도 페이지 `/feeds`**로 이동(핫종목 카드→페이지 패턴).
- **사용자 승인 (2026-07-13)**: ① 홈 카드 형태 = **핫종목형 3줄 카드**(공시/뉴스/수출입 건수 나열), ② 상세는 `/feeds` 경로, ③ "당일" = 병합 데이터 중 `rceptDt===KST 오늘`만 카운트(스냅샷에 과거 항목이 섞일 수 있어 필터 필수).
- **당일 판정**: DART 접수일 `rceptDt`("YYYYMMDD")·`todayKstDate()` 모두 **KST 캘린더 문자열**이라 시간대 변환 없이 문자열 비교. 오늘 0건도 "0건" 정상 표시. 뉴스 `pubDate`(RFC822 타임존)는 17-3에서 KST 날짜 변환 후 비교 예정.
- **성능**: 홈은 게시판을 더 이상 렌더하지 않으므로 40건 전체를 만들지 않고 **경량 카운트 전용 `getTodayFeedCounts`** 신설(같은 MGET 1회, sort/slice/종목명 결합 생략). 뉴스·수출입은 백엔드 전이라 `null`("준비 중" 표기 — 0건과 구분).
- **무변경 재사용**: `FeedTabsClient`·`getDisclosureBoard`·`FeedBoardItem` 그대로. 홈에선 전체폭 `feedSection` 제거 + 그리드 카드 1개(8번째) 추가.

**17-2b 작업 목록 (구현 완료 — 2026-07-13):**

| 순서 | 작업 | 파일 | 상태 |
|---|---|---|---|
| 17-2b-1 | 경량 카운트 리더 `getTodayFeedCounts(email)` — 오늘 공시 건수만 집계(뉴스·수출입 null), `collectOwnedStocks` 공유 | `src/lib/feeds/homeFeed.ts` | ☑ |
| 17-2b-2 | 홈 "새 소식" 그리드 카드(핫종목형 3줄) — 카드 전체가 `/feeds` 링크, SummaryCard 골격 composes | `src/components/indices/FeedSummaryCard.tsx`·`.module.css` (신규) | ☑ |
| 17-2b-3 | `/feeds` 상세 페이지 신설 — `ensureAllowedSession` + `getDisclosureBoard` + `FeedTabsClient` 재사용, back 헤더 | `src/app/feeds/page.tsx`·`page.module.css` (신규) | ☑ |
| 17-2b-4 | 홈 배선 교체 — `getDisclosureBoard`→`getTodayFeedCounts`, 전체폭 `feedSection`+`FeedTabsClient` 제거하고 `FeedSummaryCard`를 그리드에 편입, `.feedSection` CSS 제거 | `src/app/page.tsx`, `src/components/indices/IndexDashboard.tsx`·`.module.css` | ☑ |
| 17-2b-5 | 검증 — lint·tsc·build + 실브라우저 E2E(홈 카드 당일 건수·과거 제외·준비 중 표기·카드 클릭→`/feeds` 이동·게시판 재사용) | — | ☑ PASS |

**Phase 17-2b 완료 조건:** ☑ 홈 피드가 그리드 요약 카드(핫종목형 3줄)로 편입, ☑ 당일(`rceptDt===KST 오늘`) 공시 건수만 카운트(과거 항목 제외 실측), ☑ 뉴스·수출입은 "준비 중"(0건과 구분), ☑ 탭+게시판+아코디언이 `/feeds`로 이동(FeedTabsClient·homeFeed 무변경 재사용), ☑ 홈 카드 클릭→`/feeds` 이동 확인, ☑ 신규 의존성 0, ☑ lint·tsc·build 통과, ☑ 실브라우저 E2E PASS.

#### 17.9 stale 배지 스케줄 인지화 — 정상 휴지 구간 오경보 제거 (2026-07-13)

- **증상**: 시세 카드에 매 거래일 16:00~18:20 빨간/주황 느낌표가 상시 노출. 원인은 배포가 아니라 **배지 판정 로직**이었다(15:40 잡 정상 성공·다음 스케줄 18:15 확인, 읽기 경로 격리 정상, 배포 Ready).
- **근본 원인**: `market/staleness.ts`의 `resolveStaleness`가 실제 갱신 스케줄을 모른 채 **"마지막 fetchedAt로부터 20분(warn)/1시간(critical) 경과"**만으로 판정 + `isWithinBadgeWindow`(~18:20)로 창만 제한. 스케줄상 **15:40→18:15는 갱신이 없는 정상 휴지 구간**인데 16:00부터 오경보가 떴다.
- **수정 (사용자 승인)**: 시세 잡 스케줄을 코드 상수화(`SCHEDULE_MINUTES`: 09:00~15:30 10분 + 15:40 + 18:15). `now` 기준 "이미 완료됐어야 할 최근 슬롯"(`lastDueRefreshMs`, 유예 `SLOT_GRACE_MS=20분`)을 구해 **fetchedAt이 그 슬롯보다 오래됐을 때만** 배지(심각도는 `now−lastDue` 지연으로 warn/critical). 고정 배지 창(`isWithinBadgeWindow`)은 폐기 — 스케줄이 주말·야간까지 자연 처리, 진짜 누락은 시각과 무관하게 표시.
- **파일**: `src/lib/market/staleness.ts`(단일 수정 — 홈 6개 카드 배지 전부 교정). `page.tsx` 호출부·잡·다른 화면 무변경. `SCHEDULE_MINUTES`는 외부 QStash 등록과 동기화 필수(§8.13 결합점).
- **검증**: 순수 로직 9개 시나리오(정상 휴지·장중·15:40/18:15 누락·주말·이른 아침) 전부 PASS + 실브라우저 E2E(실제 16:54 KST·fetchedAt 15:40에서 배지 미표시, 카드 정상 렌더) PASS.

#### 17.10 핫종목 페이지 "당일 등락률" 모드 신설 (2026-07-14)

- **요청**: 핫종목 카드/페이지에 "당일 등락률 순위 100위"를 추가.
- **실측으로 뒤집힌 범위 (2026-07-14, 토큰 캐시 훼손 없는 읽기 프로브)**: KIS 등락률 순위 API(`FHPST01700000`, `/uapi/domestic-stock/v1/ranking/fluctuation`)는 **1콜 상위 30건이 상한**. `fid_input_cnt_1`을 키워도 30건 고정, `tr_cont="N"` 연속조회도 1페이지로 리셋돼 31위 이하가 안 온다(공식 예제의 `tr_cont=="M"` 분기는 이 엔드포인트에선 발동 안 함). → **100위 불가**, 100위를 하려면 Phase 14식 전체(~2,650) 스캔뿐인데 10분 라이브엔 부적합. **사용자 결정: 상위 30위·장중 라이브 채택**(월간 핫종목처럼 저빈도 100위 배치는 보류).
- **확정 파라미터·필드 (실측)**: `fid_rank_sort_cls_code` **"0"=상승률순 / "1"=하락률순**. 필드 `stck_shrn_iscd`(코드)·`data_rank`(순위)·`hts_kor_isnm`(종목명)·`stck_prpr`(현재가)·`prdy_ctrt`(등락률)+`prdy_vrss_sign`(부호). 부호는 `applyKisSign`으로 적용.
- **구현**: ① `constants.ts` 엔드포인트/TR_ID/`KIS_FLUCTUATION_RANKING_SIZE=30` ② `client.ts` `fetchKisFluctuationRanking(sort)` — 페이지네이션 없이 1콜 ③ `market/store.ts` `StoredDailyFluctuation`/`DailyFluctuationItem` + `market:dailyFluctuation` 키(단일 SET 덮어쓰기·누적 없음) + get/set ④ `refreshMarketData` 잡에 `refreshDailyFluctuation` 스텝(부수 데이터라 실패 격리·잡 전체 `ok` 미영향, 보고서 `dailyFluctuation` 필드) — 기존 시세 갱신 잡(10분+15:40/18:15)에 얹어 장중 갱신 ⑤ `/hot-stocks`에 서버 모드 탭 `?mode=daily` 신설(`[월간 핫종목 | 당일 등락률]`, Link 기반·클라 JS 없음), 당일 뷰는 30행 테이블(순위/종목명/종목코드/등락률/현재가)+`resolveStaleness(fetchedAt)` 배지. 홈 카드·월간 뷰 무변경.
- **검증**: tsc·lint·build(16/16) PASS. Redis 시드(상위 30) + 세션 쿠키 + 헤드리스 크롬 E2E로 `/hot-stocks?mode=daily` 렌더 확인(모드 탭 활성·30행·등락률 내림차순·상승 색상·원화 포맷), `/hot-stocks` 월간 뷰 하위호환 확인. 시드한 가짜 키는 검증 후 삭제(다음 실제 잡이 채움).

#### 17.11 보유·관심종목 등록을 종목명 검색으로 전환 (2026-07-14)

- **요청**: 등록 폼의 종목코드 6자리 직접 입력을 종목명 검색 + 탭 선택으로 교체.
- **데이터 소스**: `hotstocks/universe.ts`의 `fetchHotStockUniverse()`(공개 KIS 종목 마스터·인증 불필요) 재사용 — 코스피/코스닥 보통주 코드↔종목명(~2,650). DART corpCode는 상장·비상장 혼재라 부적합해 배제.
- **아키텍처 (서버 검색)**: 규모(직렬화 ~150KB)상 클라 전량 전송보다 서버 검색이 유리(페이로드 최소·KIS 미노출). ① 잡: `refreshMarketData`에 `refreshStockMaster` 스텝 추가 — 마스터를 파싱해 `market:stockMaster`(`{items:[{code,name,market}], fetchedAt}`)에 저장. 마스터는 거의 안 변하므로 저장된 `fetchedAt`의 KST 날짜가 오늘이면 다운로드 skip(**1일 1회**). 부수 데이터라 실패 격리·잡 전체 `ok` 미영향(보고서 `stockMaster` 필드). ② 검색 액션: `lib/stocks/search.ts`의 `searchStocks(query)` Server Action — `auth()`+`isEmailAllowed` 가드 후 `market:stockMaster`를 종목명(또는 2~6자리 코드) 부분일치로 필터, 접두 일치 우선·가나다 안정 정렬해 상위 20 반환. KIS 직접 호출 없음. ③ 컴포넌트: `components/stocks/StockSearchInput.tsx`(`'use client'`) — 디바운스 250ms 후 `searchStocks` 호출, 결과 드롭다운(키보드 ↑↓/Enter/Esc·마우스), 선택 시 hidden `symbolCode` 채우고 종목 배지 표시, 미선택 시 검색 입력 `required`로 빈 제출 차단. 그리드 한 줄 전체 차지.
- **폼 배선**: `holdings/page.tsx`·`watchlist/page.tsx`의 `<input name="symbolCode">`를 `<StockSearchInput />`로 교체(수량·매입금액·기준일 인풋 유지). **`addHoldingAction`·`addWatchItemAction`은 무변경** — 제출값은 여전히 `symbolCode`뿐이고, 종목명은 기존대로 갱신 잡 `fillMissingNames`가 채운다. 폼 힌트 문구만 검색 안내로 갱신.
- **설계 유지 근거**: 등록 액션의 "형식 검증만·종목명은 잡이 채움" 철학(§11.10-A4)을 그대로 유지. 검색 실패·미선택 시에도 서버 액션이 `invalid_code`로 재차 방어.
- **검증**: tsc·lint·build(20/20 라우트) PASS. `market:stockMaster` 시드(10종) + 세션 쿠키 + 헤드리스 크롬 E2E — `/holdings`에서 "삼성" 입력 → 드롭다운 4종(삼성물산/삼성바이오로직스/삼성전자/삼성SDI, 가나다 정렬) → 삼성물산 선택 → hidden `symbolCode="028260"`·배지 렌더 확인. 시드 키는 검증 후 삭제(fetchedAt=오늘이라 안 지우면 잡이 실제 다운로드를 skip하므로 필수).

#### 17.12 화면 확인 수정 4건 (2026-07-14) — 17-3/17-4 착수 전 정리

- **요청 근거**: `phase9.request.md`(화면 확인 중 발견). 17-3(뉴스)·17-4(수출입) 백엔드 착수 전 UI 수정 4건.
- **1) 등록 폼 취소 UI 누락**: 보유·관심 목록의 "+ 종목 추가" `<details>` 폼에 취소(접기) 경로가 안 보였다. summary에 라벨 2개(`addToggleOpenLabel`="+ 종목 추가" / `addToggleCloseLabel`="✕ 취소")를 두고 `details[open]`으로 전환 — 열리면 summary 자체가 "✕ 취소" 버튼이 되어 클릭 시 폼이 접힌다. 클라이언트 상태 없이 순수 CSS(열림 hover는 `--color-rise`로 취소 성격 강조). `holdings/page.tsx`·`watchlist/page.tsx` + 각 `page.module.css`.
- **2) 핫종목 탭 순서**: `[월간 핫종목 | 당일 등락률]` → `[당일 등락률 | 월간 핫종목]`. `MODES` 배열 순서 교체 + 기본 모드를 `daily`로(무 param → 당일). `daily`=`/hot-stocks`, `monthly`=`/hot-stocks?mode=monthly`. `hot-stocks/page.tsx`.
- **3) 홈 핫종목 카드 → 당일 등락률 위주**: 월간 1개월 TOP 3 → 당일 등락률 TOP 3. `lib/hotstocks/dailyCard.ts`(신규 `getDailyHotCardSummary` — `getDailyFluctuation` 스냅샷 상위 3) + `HotStocksCard` 재작성(당일 등락률·`resolveStaleness(fetchedAt)` 지연 표기·footnote "당일 등락률 TOP 3 · 전일 종가 대비"). `summary.ts`의 `getHotStocksCardSummary`/`HotStocksCardSummary` 제거(`isHotStocksStale`은 월간 뷰가 계속 사용해 유지). `page.tsx`·`IndexDashboard.tsx` 배선 교체. 카드는 여전히 `/hot-stocks`(이제 기본=당일)로 이동해 2)와 정합.
- **4) 당일 등락률 목록 빈 공간**: 원인 = 당일 뷰가 5열(순위/종목명/**종목코드**/등락률/현재가)뿐이라 `width:100%` 테이블에서 좌측 정렬 종목명 열이 슬랙을 크게 흡수 → 종목명↔종목코드 사이 빈 폭. 별도 종목코드 열을 없애고 **종목명 뒤 인라인**(`codeInline`, 보유·관심 목록의 코드 표기와 동일 패턴)으로 붙여 4열로 축소 — 슬랙이 라벨(종목명)↔숫자 사이 자연스러운 여백으로 흡수돼 어색한 빈 공간 소멸. 월간 뷰(6열) 무변경. `hot-stocks/page.tsx`·`page.module.css`.
- **검증**: tsc·lint PASS. (실브라우저 E2E는 사용자 화면 확인으로 대체 — 시각 확인 대기.)

#### 17.13 뉴스 백엔드 (17-3) — 네이버 검색 API (2026-07-14)

- **요청 근거**: `phase9.request.md`(17-3). §17.7에서 예고한 뉴스 탭 활성화. **홈 "뉴스·공시" 카드에서는 수출입 줄 제외**(월간 데이터라 "오늘 N건" 모델에 안 맞음 — 사용자 지시). 수출입은 17-4에서 `/indices/market`·`/feeds` 탭에만 노출 예정.
- **구조**: 공시(17-1)와 1:1 대응 — 종목별 스냅샷 키 + MGET 병합 + FeedTabsClient 탭. 신규 잡·라우트 없이 기존 `refreshFeeds` 파이프라인에 스텝만 증분.
- **소스·필터 (실데이터 확인)**: `openapi.naver.com/v1/search/news.json`, 종목명 키워드·`sort=date`·display 20. `sort=date`만으로는 본문에만 종목명이 스친 저관련 기사가 섞여(예: "삼성전자" 검색에 "국산 체리" 매칭) **제목+요약에 종목명이 실제로 포함된 기사만** 남기는 경량 필터를 client에 둔다. 네이버가 이미 검색어를 매칭하므로 대부분 통과하고 오탐만 제거되는 안전망. 상위 10건 저장. `<b>`·HTML 엔티티 제거, `pubDate`(RFC822 `+0900`)는 **저장 시점에 `kstYyyyMmDd`로 KST "YYYYMMDD"로 굳혀**(§17.8 방침) 읽기 경로가 문자열 비교만 하게 함.
- **구현**: ① `lib/api/naver/client.ts` `fetchNaverNews(query, display)` — 인증키(`NAVER_CLIENT_ID/SECRET`) 헤더·15초 타임아웃·필터·pubDate ms 파싱 ② `feeds/store.ts` `NewsItem`/`StoredNews` + `newsKey(code)=market:news:{code}` + `setNews` ③ `jobs/collectTargets.ts` `unionSymbolNames`(code→name, 뉴스 검색어용) ④ `jobs/refreshFeeds.ts` `refreshNews` 스텝 — 종목명 union 순회·150ms 유량제한·종목별 실패 격리·`report.news[]`·잡 `ok`에 합류(종목명 미확정은 `skipped:"no_name"`) ⑤ `feeds/homeFeed.ts` `getNewsBoard(email)`(MGET→pubDateMs 내림차순 병합→상위 40, `FeedBoardItem` 재사용, id=종목코드+링크로 유일화, meta=출처 호스트) + `getTodayFeedCounts`에 뉴스 오늘 건수 추가하고 **`trade` 필드 제거** ⑥ `FeedTabsClient` 뉴스 탭 실동작(`NewsBoard` 아코디언, 기본 선택 탭을 뉴스로) + `/feeds` 페이지가 `getNewsBoard` 합류 ⑦ `FeedSummaryCard`에서 수출입 행·`.pending` 제거(공시·뉴스 2행, 값은 항상 number).
- **env**: `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` — 사용자 발급·`.env.local`+Vercel 등록 완료. 신규 의존성 0.
- **검증**: tsc·lint·build(20/20 라우트) PASS. **라이브 API 프로브**(로컬 `.env.local` 키)로 fetch→`<b>`/엔티티 제거→종목명 필터(체리 등 오탐 drop 확인)→pubDate→KST 날짜 변환→출처 호스트까지 전 경로 실데이터 확인(삼성전자·SK하이닉스·한화오션·삼성물산, 각 10건 저장 형태). 화면 렌더는 다음 `refresh-feeds` 잡 회차가 `market:news:{code}`를 채운 뒤 `/feeds` 뉴스 탭에서 확인(사용자 화면 확인 대기).

#### 17.14 수출입 백엔드 (17-4) — 관세청 수출입총괄(GW) API (2026-07-14)

- **요청 근거**: §17.7/§17.13 예고. 관세청 GW API 활용신청 승인(엔드포인트 `https://apis.data.go.kr/1220000/Newtrade`). **홈 "뉴스·공시" 카드엔 수출입 줄 추가 안 함**(월간 데이터, §17.13 지시 유지) — `/indices/market` 미니 카드 + `/feeds` 수출입 탭에만 노출.
- **라이브 실측 확정 (2026-07)**: `getNewtradeList`(소문자 t), params `serviceKey`/`strtYymm`/`endYymm`(YYYYMM), **XML** 응답(`<resultCode>00</resultCode>`=정상).
  - `<item>` 필드: `year` 문자열 **"YYYY.MM"**, 매 응답 끝에 **`<year>총계</year>` 합계행**이 붙어 파싱 시 제외. `expDlr`·`impDlr`·`balPayments`는 모두 **USD 달러 원값**(`bal = exp - imp` 전 행 산술 검증). `expCnt`/`impCnt`는 신고 건수. plan 이전 추정의 `expWgt/impWgt` 중량 필드는 **실응답에 없음**.
  - **단위 판정**: 2025.07~2026.02가 607·582·659…억 달러($58~70B)로 한국 월 수출 실규모와 일치 → USD 확정(표시는 **억 달러 = 1e8 USD** 환산).
  - **조회 범위 최대 12개월(inclusive)** — 13개월↑는 `resultCode 99`("조회기간은 1년이내") 거부. `end=현재월`이면 **부분월**(월중 집계, 예 2026.07 미완결)이 섞여 나옴 → 필터 필요.
  - **현재 KST 월은 미완결** → "최신 확정월"은 **직전 달**로 판정.
- **구현**: ① `lib/api/customs/client.ts` `fetchTradeStats(strt,end)` — `DATA_GO_KR_SERVICE_KEY` 서버 전용·15초 타임아웃·XML 정규식 파싱(`parseNum` 경유)·`총계`/비정형 year 제외·`year "YYYY.MM"→"YYYYMM"` 정규화·`resultCode≠00` throw. ② `date/kst.ts` `currentKstMonth()`/`subtractMonths(ym,n)`(연 경계). ③ `feeds/store.ts` `TradeStatMonth`/`StoredTradeStats` + `tradeStatsKey="market:tradeStats"`(종목 무관 단일 키) + `getTradeStats`/`setTradeStats`. ④ `feeds/tradeStats.ts` `buildTradeStatsView`(순수: 최신월 + 전년동월 `find`로 YoY %)/`getTradeStatsView`(리더). ⑤ `jobs/refreshFeeds.ts` `refreshTradeStats` 스텝 — **월 1회성 가드**(스냅샷 최신월 ≥ 직전 완결월이면 skip). 12개월 한도 때문에 **2회 호출**: A) 최근 12개월(전월까지, 부분월 방어 필터), B) 전년동월 1개월(YoY용, 실패 무시) → 월별 dedupe·최신순 **13개월 연속** 저장. **잡 전체 `ok` 게이팅 제외**(월간 소스 실패로 뉴스·공시 재실행 안 시킴 — 다음 회차 가드가 자연 재시도). ⑥ `FeedTabsClient` 수출입 탭 실동작(`TradeBoard`: 최신월 수출/수입/무역수지+YoY 요약 + 최근 13개월 표, 아코디언 없음) — 자리표시자 제거. ⑦ `/indices/market`에 수출입 미니 카드(최신 확정월 3지표+YoY, `/feeds` 링크) + `format/trade.ts`(억 달러·YoY·YYYYMM 포맷).
- **env**: `DATA_GO_KR_SERVICE_KEY` — 사용자 발급·`.env.local`+Vercel 등록 완료(64자 hex, dotenv가 따옴표 자동 제거). 신규 의존성 0.
- **검증**: tsc·lint·build(20/20 라우트) PASS. **라이브 E2E**: dev 서버 → `refresh-feeds` 잡 실호출(`CRON_SECRET` Bearer) → `tradeStats {refreshed:true, latest:202606}`·`report.ok:true`, 재실행 시 가드 `refreshed:false` skip 확인. **실 Redis read-back**으로 13개월 연속(202606~202506)·`bal=exp-imp`·YoY(전년동월 202506, 수출 +70.7%·수입 +30.0%) 검증. 인증 UI 렌더는 Google OAuth 때문에 헤드리스 미구동(라우트는 307→/login 정상, 컴포넌트 prop 타입은 build 검증) — **사용자 화면 확인 완료(2026-07-15)**.

---

#### 17.15 수출입 상세 (17-5) — 월별 클릭 → 품목별·국가별 (2026-07-15)

- **요청 근거**: 사용자 지시 — `/feeds` 수출입 탭의 월을 클릭하면 상세로. 범위를 **앱·서버·API 호출 부담 최소화** 방향으로 좁힘: ① 품목별은 **국가 구분 없이**(국가 정보 제외) ② 국가별은 **상위 N개국 + 나머지 전부 "기타" 한 줄** ③ 상위 국가 클릭 시 **그 나라 품목을 미니멀한 팝업으로 아주 간단히**. 조사·계획 보고 후 승인: **상위 8개국 · 품목 97개 류 전수 · 경로 `/indices/trade/[yyyymm]`**.
- **라이브 실측 확정 (2026-07)**: `nitemtrade/getNitemtradeList`(품목별 국가별 수출입실적 GW, **이미 활용승인**. `Itemtrade`는 403 미승인이라 이 API가 유일한 상세 소스).
  - **`hsSgn`·`cntyCd` 중 최소 하나 필수** — 둘 다 없으면 code 99("품목코드 혹은 국가코드 중 1개 이상은 입력"). `cntyCd=ALL`도 거부. **전체 조회 모드가 없어** 반드시 팬아웃해야 한다. `hsSgn`은 **2·4·6·10자리만** (0 → code 99).
  - **`numOfRows`/`pageNo` 무시** — 조건에 해당하는 전 행이 통째로 온다(CN 2.0MB/7,964행). 총계행만 싸게 받을 방법이 없다.
  - **핵심 발견 — 류 조회 1회가 (국가 × HS 4단위) 행렬을 통째로 준다**(27류 = 125개국). 따라서 **97개 류 전수만으로 국가별 집계·국가별 품목까지 전부 파생**된다 — 계획서의 국가별 8회 추가 호출은 불필요해져 뺐다(승인 범위 내 호출 축소, 방향과 일치). 팝업도 파생이라 **클릭당 API 0회**.
  - **`item`행 합 = `총계`행 정확히 일치**(27류 exp/imp 둘 다 검증) → 총계행은 버려도 무손실.
  - **품목명은 API 제공값**(`statKor`, hsCd별 충돌 0건 실측) → **계획서의 "97개 류명 정적 매핑"이 불필요해짐**. 손으로 쓸 이름이 없어져 오기 위험 제거. 대신 4단위 실명이라 표시 입도를 류(2단위)→**HS 4단위**로 올렸다(더 정확·더 유용). XML 엔티티는 미사용(7개 류 표본) → 기존 정규식 파싱 그대로.
  - **비용 실측**: 97개 류·동시성 4 = **51~61초 / 13.5MB** (계획서 추정 48MB보다 크게 저렴). `maxDuration=300` 안에 여유.
  - **합계 정합**: 97류 합 1021.3억 vs 수출입총괄 1021.7억(**0.03% 차이**). 98·99류는 빈 응답이라 못 메운다 → 출처를 섞지 않고 자체 정합 유지 + 화면 각주로 명시.
- **구현**: ① `api/customs/client.ts` `fetchNitemTradeChapter(hsSgn, yyyymm)`(30초 타임아웃, 총계·비정형 제외) + `assertOk` 공통화. ② `feeds/store.ts` `TradeDetailItem`/`TradeDetailCountry`/`StoredTradeDetail` + `market:tradeDetail:{yyyymm}`(월별 키·자연 누적, ~8KB) + `market:tradeDetail:months`(인덱스 — 어느 달에 링크를 걸지 판단, SCAN 회피). ③ `jobs/refreshTradeDetail.ts` — 월 1회성 가드, 동시성 4 워커풀, 집계(품목 15·국가 8·국가별 품목 5). **일부 류 실패 시 저장 생략**(왜곡 영구 고착 방지 — 저장하면 가드에 걸려 재시도가 막힌다). ④ `api/jobs/refresh-trade-detail/route.ts` **별도 라우트**(61초 전수 조회를 매일 도는 뉴스·공시 잡의 시간 예산·실패 범위와 분리). ⑤ `feeds/tradeDetail.ts` 뷰 빌더 — "기타"=전체−Σ상위N 복원(잔차 1달러 미만이면 생략). ⑥ `components/indices/CountryTradeTable.tsx` **최소 Client**(네이티브 `<dialog>` — 포커스 트랩·Esc·백드롭을 브라우저가 처리, 신규 의존성 0. 데이터는 props로 이미 내려와 팝업 fetch 0). ⑦ `/indices/trade/[yyyymm]` Server Component + `tradeStats.ts`에 `detailMonths` 추가 → 탭 월 링크(상세 있는 달만).
- **부수 수정**: `proxy.ts` matcher가 잡 라우트를 **하나씩 열거**해 신규 라우트가 307→/login으로 샘(실제 발생). `api/jobs/` 접두사로 묶어 재발 차단 — 잡 4개 전부 `verifyJobRequest`로 자체 인증함을 확인 후 변경. research.md §8-13의 "3곳 동기화"도 갱신.
- **검증**: tsc·lint·build(22/22 라우트) PASS. **라이브 E2E**: 미인증 401·기존 잡 401·보호 페이지 307 확인 → 잡 실호출 `{ok:true, refreshed:true, yyyymm:202606, failed:0}` **51초**, 재실행 가드 `refreshed:false` **0.34초**. **실 Redis read-back**: 8.2KB·상위8국(CN 200.0억 등)·기타=279.5억(=전체−Σ상위8)·중국 팝업 5품목. **실브라우저 E2E(Chrome 390×844)**: 탭 전환 → 13개월 중 202606만 링크 → 상세 진입 → 중국 클릭 시 dialog open true·품목 5행 → Esc 닫힘 → 재클릭 정상, **JS 에러 0**. 다크 모드 정상. 스크린샷으로 발견해 고친 것: 품목명 우측 정렬(`.table th` 특이도에 짐)·금액 줄바꿈·제목 "2026.06 수출/입" 분리.
- **한계(명시)**: 상세는 **잡이 도는 달부터 쌓인다** — 현재 202606 하나뿐이고, 백필은 12개월×97콜=1,164콜이라 하지 않는다. 상세 없는 달은 링크를 걸지 않고, 직접 URL 진입 시 안내문을 보여준다.
- **운영**: QStash 월 1회 스케줄 **등록 완료** — `CRON_TZ=Asia/Seoul 0 3 5 * *`(매월 5일 03:00 KST, Retries 1) → `/api/jobs/refresh-trade-detail`. 2026-07-15 등록, 2026-07-17 QStash API로 활성 재확인. 스케줄과 별개로 `CRON_SECRET` Bearer 수동 트리거도 가능.

---

### Phase 18 — 홈 헤더 햄버거 메뉴·사이드바 + QStash DLQ 조회 화면 (2026-07-17)

- **요청 근거**: 사용자 지시 — 홈 헤더 우측의 테마 토글·로그아웃 아이콘 2개를 햄버거(☰) 1개로 교체, 우측 슬라이드 사이드바에 ① 화면 모드 토글(위) ② "DLQ 확인" 메뉴(중간) ③ 로그아웃(아래) 배치. DLQ는 그간 Upstash 콘솔 육안 확인 항목(§11.11)이었던 것을 앱 내 **읽기 전용** 화면으로 전환.
- **사이드바 구조** — Server/Client 경계 때문에 2단 조립: `components/nav/HeaderMenu.tsx`(Server, 조립 전용)가 `<MenuSidebar themeSlot={<ThemeToggle/>} logoutSlot={<SignOutButton/>}/>`로 슬롯 주입 — 로그아웃 폼의 서버 액션은 Client Component 안에서 정의 불가하기 때문. `components/nav/MenuSidebar.tsx`(`'use client'`) — `useState` 열림 상태, 오버레이+우측 패널(`translateX(100%)→0` transition, 닫힘 시 `visibility: hidden`으로 포커스 진입 차단), 닫기 4경로(오버레이 클릭·ESC·× 버튼·DLQ 링크 클릭). `ThemeToggle` 무변경 재사용, `SignOutButton`은 아이콘+텍스트 행 스타일로 조정(서버 액션 무변경). `IndexDashboard.tsx` headerActions는 `<HeaderMenu/>` 하나로 교체(토글·로그아웃 사용처는 홈뿐이라 스코프 홈 한정).
- **DLQ 조회 — API 라우트 없이 Server Component 직접 조회**: `/api/dlq` 같은 공개 엔드포인트를 만들지 않고 `app/dlq/page.tsx`(Server)가 `lib/qstash/dlq.ts` `listDlqMessages(cursor)`를 직접 호출 — 토큰이 구조적으로 클라이언트에 못 가고, 인증 누락 위험 자체가 없음. `ensureAllowedSession()` 가드(미로그인 →/login, 허용 외 →/). SDK `Client.dlq.listMessages({cursor, count:50})` → 뷰 모델(`dlqId`/`messageId`/`url` pathname/`responseStatus`/실패사유 `responseBody` 300자/`createdAt` KST/`maxRetries`) 매핑. 페이지네이션은 `?cursor=` searchParam + "다음 페이지" 링크. 재발송·삭제 없음(읽기 전용). 빈 목록·토큰 미설정·조회 실패는 각각 안내 박스.
- **env**: `QSTASH_TOKEN` 신규 (서버 전용, `.env.local`+Vercel — 사용자 등록 필요). `NEXT_PUBLIC_` 금지 준수.
- **검증**: lint·tsc·build(23/23 라우트, `/dlq` dynamic) PASS. `.next/static` 클라이언트 번들에 `QSTASH_TOKEN` grep 0건.

---

### Phase 19 — 핫종목 "주간 등락률" 탭 (2026-07-18)

- **요청 근거**: 사용자 지시 — 지난 조사(§16.1 대안 1은 달력 고정 구간 기준으로 ❌였음)와 달리 **N거래일 전 대비 롤링·상위 30위**로 채택 확정(보류했던 "주간 100위"의 축소 진행 — memory `pending-decisions` 갱신 대상). 탭 순서 일별 → 주간 → 월별, 신규 API·배치 없이 기존 등락률 순위 API(FHPST01700000) 재사용 + 기존 10분 시세 잡에 회차당 1콜 증분.
- **구현 전 라이브 프로브 (2026-07-18, 토큰 캐시 훼손 없는 읽기 프로브 — §17.10과 동일 절차)**:
  - `fid_input_cnt_1="5"`는 **정확히 5거래일 전 종가 대비 현재가 등락률순**을 반환 — 정상 종목 2개(씨피시스템·에넥스)의 일봉과 교차 검증, 역산 지정일 종가가 5거래일 전 종가와 원 단위 일치.
  - 5거래일 등락률은 `prdy_ctrt`(여전히 **당일** 등락률)가 아니라 **`dsgt_date_clpr_vrss_prpr_rate`**(지정일 종가 대비 현재가 비율, 부호 직접 포함)에 담기며, 30행 전부 이 값 내림차순 정렬 실측. 당일 30위와 겹침 11/30 — 파라미터 실제 반영 확인.
  - **주의(블로커 아님)**: 지정일 종가가 **원주가(수정주가 미반영)**라 감자·액면병합이 구간에 낀 종목은 왜곡 상위 가능(실측: 인산가 dsgt +687.5% vs 수정주가 기준 실제 −21.3%, 한탑 +549.7% vs 실제 +30.0%). KIS HTS 순위와 동일한 원천 특성이라 보정 없이 진행하고 UI 각주로 안내.
- **구현**: ① `client.ts` `fetchKisFluctuationRanking(sort, compareDays)` — `fid_input_cnt_1`만 파라미터화("0" 당일 / "5" 주간), 신규 함수 없음 ② `types.ts` `dsgt_date_clpr_vrss_prpr_rate` 필드 추가 ③ `market/store.ts` `market:weeklyFluctuation` 키 + `StoredWeeklyFluctuation`/`WeeklyFluctuationItem`(당일 타입 alias — 구조 동일, changeRate 의미만 5거래일 대비) + get/set ④ `refreshMarketData` 잡 1b' 스텝 `refreshWeeklyFluctuation` — 회차당 1콜, `parseNum`만 적용(부호 내장이라 `applyKisSign` 불필요), changeRate 내림차순 재정렬·재순위, 실패 격리·보고서 `weeklyFluctuation` 필드 ⑤ `/hot-stocks` 탭 `[당일 등락률 | 주간 등락률 | 월간 핫종목]`(`?mode=weekly`) — 기존 `DailyView`를 공용 `FluctuationView`(variant="daily"|"weekly", 데이터 소스·문구만 교체)로 일반화, 신규 테이블 없음. **주간 탭 라벨 아래 보조 설명 "최근 5거래일 대비"**(`tabSub`, `--text-micro`) + 푸터에 달력 주 아님·공휴일 영향·원주가 기준 왜곡 가능성 명시. 홈 카드·월간 뷰 무변경.
- **검증**: tsc·lint·build(20/20 라우트) PASS. 라이브 프로브 3회(상승률순 cnt=0/cnt=5 비교, 전 행 정렬 필드 확인, 일봉 교차 검증)로 API 동작 확정. 화면 데이터는 다음 시세 잡 회차가 `market:weeklyFluctuation`을 채운 뒤 확인 가능.

### Phase 20 — 핫종목 등락률 뷰 월간 폼 통일 + 월간 구간 링크 회귀 수정 (2026-07-18)

- **요청 근거**: 사용자 지시 3건 — ① 주간 탭의 보조 문구 "최근 5거래일 대비" 제거 ② 당일/주간 순위 표를 월간 뷰와 동일한 폼으로(A안 — 코드 별도 열 + ᴷ/ᴰ 위첨자 + 기준가 열까지 전체 통일, 사용자 확정) ③ 월간의 기준 문구("최근 1개월 (…) · 기준: … · 대상 …종목")를 모든 탭에 표시하고 구간 서브탭 전환 시에도 유지. 당일/주간의 "대상"은 종목 수 미제공(KIS 순위 API에 universe count 없음)이라 **"대상 전체시장"** 텍스트로 확정.
- **회귀 발견·수정**: 월간 구간 서브탭 링크가 `/hot-stocks?period=…`로 `mode=monthly` 누락 — §17.12에서 기본 모드가 월간→당일로 바뀔 때 갱신 안 된 회귀로, 구간 탭 클릭 시 당일 뷰로 떨어지며 기준 문구·월간 표가 통째로 사라졌다. `?mode=monthly&period=…`로 수정(③의 "문구가 사라진다" 원인).
- **구현**: ① `MODES`에서 weekly `sub` 제거 + `tabSub` 렌더·CSS 삭제(5거래일 롤링 설명은 기준 문구·푸터 안내로 유지) ② `DailyFluctuationItem.basePrice?: number` 추가(optional — 이전 스냅샷 호환, 없으면 "—" 표시) — 시세 잡에서 당일은 `현재가 − applyKisSign(prdy_vrss)`로 정확 산출, 주간은 응답에 기준가 금액이 없어 `price / (1 + rate/100)` 역산(1원 단위 오차 가능, −100% 분모 방어) ③ `FluctuationView` 표를 월간과 동일 6열(순위/종목명+ᴷ·ᴰ/코드 별도 열/등락률/기준 종가/현재가)로 — §17.12-4의 인라인 코드 결정은 5열 여백 문제가 이유였으므로 6열 복귀로 해소, `codeInline` CSS 삭제. 시장 위첨자는 `market:stockMaster` 스냅샷을 화면에서 읽어 코드→시장 매핑(`loadMarketByCode`, 마스터 조회 실패·미등재 종목은 위첨자 생략 폴백 — 화면은 Redis만 읽는 원칙 유지) ④ 기준 문구를 월간 형식으로 통일: "{당일|주간} 등락률 상위 30종목 · 기준: {전일|5거래일 전} 종가 · 대상 전체시장 · 갱신: …".
- **검증**: tsc·lint PASS. `basePrice`·위첨자는 다음 시세 잡 회차부터 채워짐(그 전 스냅샷은 기준 종가 "—").

### Phase 21 — 핫종목 표 열 폭 고정 + 종목코드·종목명 미세 조정 (2026-07-19)

- **요청 근거**: 사용자 지시 3건 조사(코드 구현 보류) — ① 당일/주간 등락률 표의 폼 길이가 미세하게 다른 원인 ② 종목코드 값 폰트 1pt 축소 ③ 종목명 열 폭 축소 가능 여부.
- **① 원인 — 열 폭이 내용 의존(`table-layout: auto`)**: 당일/주간은 같은 `FluctuationView`·같은 `.table` CSS(6열 폼)를 쓰지만, `.table`에 `table-layout`이 미지정(기본 auto)이라 **열 폭이 각 탭의 행 내용**(종목명 길이·가격 자릿수·기준 종가 "—" 여부·등락률 자릿수 — 주간은 원주가 왜곡으로 +600%대 4자리 가능)에 따라 브라우저가 자동 배분한다. 표 전체는 `width: 100%`로 같아도 **열 경계가 탭마다 미세하게 다르게** 보이는 것이 정체. 내용 최소 폭이 가용 폭(≈446px)을 넘는 탭만 표가 100%를 넘어 늘어나며(overflow-x 스크롤) 전체 폭까지 달라질 수도 있다. **해결 방향**: `.table`에 `table-layout: fixed` + 열별 고정 폭(첫 행 `th` width 또는 `<colgroup>`) — 6열 합계를 min-width 440px 안에서 설계. 월간 뷰도 같은 `.table` 클래스라 함께 고정되어 **3개 탭 전부 완전히 동일한 폼**이 된다(§20 폼 통일의 마무리).
- **② 종목코드 값 폰트 1pt 축소 — 가능**: 현재 `.table .codeCell`이 `--text-micro`(11px) → **10px 직접 지정**(토큰에 10px 없음 — td 값 12px 직접 지정 선례(§16 4차)를 따르고, 10px 토큰 신설은 사용처 1곳뿐이라 과함). 헤더는 sr-only라 값만 영향. 월간 뷰도 같은 클래스 공유라 함께 적용됨(폼 통일 관점에서 오히려 바람직).
- **③ 종목명 열 폭 축소 — 가능하나 ①과 묶어야 확실**: 현재 `.nameText` `max-width: 96px`(12px 폰트 한글 8자, §16 4차). 88px(약 7자)로 축소 제안 — 단 auto layout에서는 96px에 달하는 긴 이름 행이 있을 때만 열이 줄어드는 **간접 효과**라, ①의 fixed 열 폭 도입 시 종목명 열 폭 자체를 지정하는 것이 확실하다. `.nameText`의 max-width+ellipsis는 fixed에서도 셀 내 잘림 처리로 유지. 줄어든 폭은 기준 종가·현재가 열에 배분(§16 4차 "끝종가 가림" 재발 방지).
- **구현**: `src/app/hot-stocks/page.module.css`만 수정(`<colgroup>` 불필요 — `th:nth-child` 폭 지정으로 page.tsx 무변경). ① `.table`에 `table-layout: fixed` + th 고정 폭 6열 34/108/48/74/84/84px(box-sizing: border-box라 padding 10px 포함, 합 432px ≤ min-width 440px — 잔여 폭은 비례 배분이라 폼 불변) ② `.table .codeCell` 11px→10px 직접 지정 ③ `.nameText` max-width 96→88px(한글 약 7자).
- **검증**: lint·tsc PASS. **헤드리스 Chrome 목업 실측**(§16 4차와 동일 절차, 480px 컨테이너): 극단 대비 두 표(짧은 이름·1,234원·기준가 "—" vs 최장 이름·+687.50%·1,034,000원)의 6열 렌더 폭이 **완전 일치**(35.09/111.50/49.55/76.39/86.72/86.75), 표 폭 446px(가로 스크롤 없음)·셀 넘침 0건. 실제 화면 시각 확인은 사용자 확인 대기.

### Phase 22 — 핫종목 갱신 시각 표기 월간 방식으로 통일 (2026-07-19)

- **요청 근거**: 사용자 지적 — 월간 탭은 "갱신: …"이 구간 탭 위 별도 줄인데, 당일/주간 탭은 기준 문구 한 줄에 "… · 갱신: …"까지 합쳐져 있어 탭 간 표기가 다름. 월간 방식 통일 또는 추천 요청.
- **결정 — 월간 방식(갱신 별도 줄) 채택**: ① 갱신 시각은 순위·기준과 성격이 다른 메타 정보라 분리가 읽기 좋고 ② 당일/주간의 합쳐진 한 줄은 길어 480px에서 줄바꿈되며 ③ 월간의 갱신 시각은 구간 탭 4개 전체에 걸치는 값이라 역방향(월간을 rangeInfo로 합침) 통일이 불가.
- **구현**: `FluctuationView`에서 `rangeInfo`의 "· 갱신: {시각}"을 분리해 `lastRefresh` 줄(월간과 같은 클래스)로 rangeInfo 위에 표시. CSS는 `.lastRefresh + .rangeInfo { margin-top: var(--space-8) }`만 추가 — 당일/주간은 갱신 줄 바로 아래 기준 문구가 와서 간격이 필요하고, 월간(갱신 줄 다음이 구간 탭)은 인접 선택자에 안 걸려 무영향.
- **검증**: lint·tsc PASS. 실제 화면 시각 확인은 사용자 확인 대기.

### Phase 23 — 관심종목 편집 폼 숨김 + `?edit=1` 토글 (2026-07-19)

- **요청 근거**: 사용자 지시 — `/watchlist` 각 종목 행에 항상 노출되던 날짜란·"기준일 변경"·"삭제" 버튼을 숨기고, 보유종목 상세(`/holdings/[symbolCode]`)의 조그만 "수정" 버튼처럼 토글로 전환.
- **구현**: 보유종목 상세의 `?edit=1` 서버 사이드 토글 패턴 이식(클라이언트 상태 없음, 서버 컴포넌트 유지). ① `watchlist/page.tsx` — `searchParams.edit` 읽어 `isEditMode` 판정, 섹션 제목을 `.sectionHead`(flex space-between)로 감싸고 우측에 "수정"(`?edit=1`)/"취소"(쿼리 제거) `editToggle` 링크(목록 비면 미표시), 기준일 변경·삭제 폼 2개는 `isEditMode`일 때만 렌더("상세 보기 →"는 상시 유지), 추가 폼 `<details open>` 조건에 `!isEditMode` 추가(편집 오류 시 추가 폼이 엉뚱하게 펼쳐지던 동작 방지) ② `watchlist/actions.ts` — `fail()` 쿼리 결합을 `?`/`&` 분기로 수정하고 update/delete의 오류 basePath를 `/watchlist?edit=1`로 전달해 검증 오류 시 편집 모드 유지(성공 redirect `/watchlist`는 그대로 → 저장·삭제 시 편집 모드 자동 종료 — 보유종목과 동일 UX) ③ `page.module.css` — `.sectionHead`·`.editToggle`을 보유종목 상세 CSS에서 이식, `.sectionTitle`의 margin-bottom은 `.sectionHead`로 이동.
- **검증**: lint·tsc PASS. 실제 화면 시각 확인은 사용자 확인 대기.

### Phase 24 — 홈 관심종목 카드 평균 → 종목별 3행 표시 (2026-07-19)

- **요청 근거**: 사용자 지시 — 홈 관심종목 카드의 평균 수익률 표시를 없애고 관심종목 3개의 등락률을 각각 조회되게. 표시 기준은 "등록일 기준 수익률 + 괄호로 전일 대비 등락률" 확정, 3개 초과 시 수익률 상위 3개(핫종목 카드 방식).
- **구현**: ① `watchlist/summary.ts` — `WatchlistCardSummary`를 `{ count, top3: WatchlistCardEntry[] }`로 개편(`avgReturnRate`·`best` 제거 — 소비처는 홈 카드뿐). 항목별 `returnRate`(등록 기준일 종가 대비, `computeWatchReturnRate` 재사용)·`dailyChangeRate`(스냅샷 `changeRate` 그대로 — 추가 API 호출 없음)를 계산해 수익률 내림차순 상위 3개(null은 `-Infinity`로 뒤 순위) ② **신규** `components/indices/WatchlistCard`(.tsx+.module.css) — HotStocksCard 폼(3행 리스트)을 본떠 행마다 `종목명 +12.34% (+1.20%)`, 수익률·괄호 등락률 각각 등락 색상, 기준가 확정 전은 「-」(tertiary), staleness 배지는 SummaryCard와 동일 마크업(`STALENESS_LABELS`를 SummaryCard에서 export해 재사용, CSS는 composes). footnote "등록 기준일 대비 · 괄호는 전일 대비"(4종목 이상이면 "N종목 중 수익률 상위 3 ·" 접두). 관심종목 없음/조회 실패(summary null)는 같은 카드 안 placeholder "종목을 등록해보세요" ③ `IndexDashboard` — 관심종목 자리의 SummaryCard 분기를 `<WatchlistCard summary staleness>`로 교체.
- **검증**: lint·tsc PASS. 실제 화면 시각 확인은 사용자 확인 대기.

### Phase 25 — 홈 "배당 일정" 카드 + 상세 화면 + 지급일 당일 알림 (2026-07-19, 구현 완료)

- **요청 근거**: 사용자 지시 — 홈에 배당 정보 항목 신설(항목명 "배당 일정" 채택). 배당 지급일이 확정되면 상세 화면에 종목명·배당금액·지급일 등을 **한 줄씩** 추가하고, 지급일 당일 푸시 알림 발송. 대안으로 조사한 **폰 기본 캘린더 연동(webcal:// ICS 구독 피드)은 사용자가 포기 확정** — 재제안 금지.
- **후속 수정 (2026-07-19 같은 날 확정)**: ① 홈 카드 요약은 건수형이 아니라 **다가오는 배당일 3행**(종목명 포함) ② 상세 화면에 **주당배당금·보유수량·예상 지급액(주당배당금 × 수량)** 표시 ③ **대상은 보유종목만 — 관심종목은 배당 일정 항목 전부(홈 카드·상세 목록·지급일 당일 알림)에서 제외**. 기존 공시 알림 8유형의 "배당" 카테고리(보유+관심 대상, Phase 10 3단계)는 별개 기능이라 무변경.
- **조사 결과 (2026-07-19, 코드 열람 + 실측 주석 근거)**:
  - 최초 아이디어였던 "DART 공시에서 지급일 추출"은 부적합 — `list.json`은 보고서명·접수번호만 주고 배당금액·지급일 구조화 데이터가 없어 원문 문서 파싱이 필요(취약). 대신 **이미 사용 중인 KIS 예탁원 배당일정 API**(HHKDB669102C0, `fetchKisDividends`)가 기준일(`record_date`)·배당종류(`divi_kind`)·주당배당금(`per_sto_divi_amt`)·**현금배당 지급일(`divi_pay_dt`)**을 구조화 제공. 지급일 미정이면 빈 문자열 → 공시로 확정되면 이후 조회에 채워짐(예탁원 데이터가 공시를 반영하므로 "공시에 지급일 나오면 추가"와 결과 동일).
  - 시세 잡이 이미 보유+관심 종목별로 이 API를 호출 중(확정 회차 1일 1회 + 신규 등록 시). 현재는 `stockInfo.ts` `buildDividendBlock`이 요약(연간 합계·최근 지급일)만 저장하고 **회차별 원본 행은 버림** — 행을 저장하도록 확장하면 **KIS 추가 호출 0건**.
  - 조회 범위는 기준일 기준 최근 365일(`DIVIDEND_LOOKBACK_DAYS`) — 결산배당(기준일 과거·지급일 미래)의 미래 지급일은 이 범위로 커버됨.
  - 공시 알림 8유형에 "배당" 키워드가 이미 있어 배당 **결정 공시** 알림은 기존 발송 중 — 본 Phase의 지급일 **당일** 알림은 별개 추가.
  - 보유수량은 `Holding.quantity`(types/holdings.ts)로 이미 저장 — 예상 지급액은 화면 읽기 시 곱셈만으로 계산 가능하고, 공용 `rounds`에 개인 수량을 섞지 않는다(쓰기/읽기 분리 유지). 동일 종목 중복 등록은 액션이 차단하므로 종목당 수량 단일·합산 불필요. 보유종목 한정이라 수량 없는 행("—" 처리)도 발생하지 않는다.
- **구현 계획 (파일 단위)**:
  1. `lib/market/store.ts` — `StoredStockInfoBlocks.dividend`에 회차별 행 `rounds?: { recordDate, kind, amountPerShare, payDate: string | null }[]` 추가(별도 키 신설 대신 기존 `market:stockInfo:{code}` 확장 — 쓰기 주체·갱신 주기 동일). optional이라 구 스냅샷 호환(없으면 화면·알림에서 빈 취급). 시세 잡의 갱신 대상은 기존대로 보유+관심 union — **저장은 공용 무변경, 보유종목 필터는 배당 일정 리더·알림(3·6번)에서만** 적용.
  2. `lib/holdings/stockInfo.ts` `buildDividendBlock` — 확정 회차(주당배당금 > 0) 행을 `rounds`로 함께 저장. 기존 요약 필드 유지 — 정보 블록 4종 화면 무변경.
  3. **신규** `lib/dividends/summary.ts` — **보유종목만**(`getHoldings(email)` 기반 — 관심종목 제외)의 `market:stockInfo:*` MGET → 지급일 있는 행 병합·지급일순 정렬 + 수량 맵 합류(**예상 지급액 = 주당배당금 × 보유수량**, 읽기 시 계산). 상세 목록 빌더 + 홈 카드 요약(지급일 ≥ KST 오늘 행 오름차순 **상위 3** — `{종목명, 지급일, 주당배당금}`) 함수. 실패 시 null(홈 격리 관례).
  4. **신규** `app/dividends/page.tsx`(+`page.module.css`) — `ensureAllowedSession` + 한 줄씩(종목명·배당종류·기준일·지급일·**주당배당금·보유수량·예상 지급액**, 지급일 미정 행은 "미정" 표기) 목록. 각주 2건 필수: ① 예상 지급액은 **현재 보유수량 기준**(실제 수령 자격은 배당 기준일 시점 보유 여부로 결정 — 수량 변경 이력 미보관) ② **세전 금액**(배당소득세 15.4% 원천징수 전). `/feeds` 게시판 폼·페이지 골격 관례 참고.
  5. 홈 카드 — **3행 리스트 패턴**(HotStocksCard·WatchlistCard 폼)의 **신규** `components/indices/DividendCard`(가칭): **다가오는 배당일 상위 3행**(종목명+지급일+주당배당금), 3건 미만이면 있는 만큼·0건은 placeholder(기존 카드 관례). 카드 전체 `/dividends` 링크, staleness 배지는 SummaryCard 관례. `IndexDashboard`에 배치, 요약 조회는 홈 `Promise.all`에 `.catch(() => null)` 격리로 합류.
  6. 알림 — **피드 잡(`refreshFeeds`) 훅에 추가**(매일 08~22시 매시 실행 · KIS 시간창 무관 · 첫 회차 08시에 당일 발송): Redis `rounds`에서 `payDate === KST 오늘`인 종목을 **보유 사용자에게만**(관심종목 제외) `sendPushToEmail`. 중복 방지는 `alerts:dividend:sent:{code}:{payDate}` 마커(EX 2일, 평문 — 쿨다운 키 관례). `alerts:{email}:muted` 음소거 공유, 이메일 단위 실패 격리, 잡 `ok` 게이팅 제외(기존 알림 훅 관례).
- **실측 필요(운영 중 확인)**: ① `T_DT`를 미래로 지정하면 기준일이 미래인 예고 행도 오는지(오면 조회 종료일 연장 검토) ② `divi_pay_dt`가 지급일 대비 얼마나 미리 확정되는지(상세 화면 "다가오는 지급" 구간 설계 근거).
- **구현 결과 (2026-07-19)**: 계획 1~6번 전부 계획대로 구현 —
  1. `lib/market/store.ts`: `DividendRound` 타입 + `StoredStockInfoBlocks.dividend.rounds?`(optional — 구 스냅샷 호환) + `getStockInfoBlocksMap`(MGET 일괄 리더) 추가.
  2. `lib/holdings/stockInfo.ts` `buildDividendBlock`: 확정 회차(주당배당금>0)를 `rounds`(기준일 오름차순)로 함께 저장. 기존 요약 필드 무변경.
  3. **신규** `lib/dividends/summary.ts`: `getDividendSchedule`(상세 목록 — 보유종목만, 예상 지급액=주당배당금×보유수량 읽기 시 계산, 지급일 미정 먼저→내림차순) + `getDividendCardSummary`(지급일 ≥ KST 오늘 오름차순 상위 3, 실패 시 null).
  4. **신규** `app/dividends/page.tsx`(+module.css): 한 줄씩 목록 + 각주 2건(현재 보유수량 기준 / 세전 15.4% 원천징수 전 / 지급일 미정 자동 채움 안내).
  5. **신규** `components/indices/DividendCard`(+module.css): 다가오는 지급일 3행(종목명·MM/DD·주당배당금), SummaryCard composes·`STALENESS_LABELS` 재사용, `IndexDashboard`(관심종목 카드 다음)·홈 `Promise.all` 합류.
  6. **신규** `lib/alerts/dividendAlerts.ts` `evaluateDividendAlerts` + `refreshFeeds` 스텝 6 훅 + `alerts/store.ts` 마커 3함수(`alerts:dividend:sent:{code}:{payDate}` EX 2일). 같은 지급일 여러 회차는 주당배당금 합산 1건 발송. 훅 실패는 로그만 — 잡 `ok` 게이팅 제외.
- **상태**: 구현 완료(2026-07-19) — lint·tsc·프로덕션 빌드 통과, research.md §2·§4·§5·§9.5 갱신. `rounds` 데이터는 다음 확정 회차(15:40/18:15) 시세 잡부터 채워지므로 그 전까지 카드·상세는 빈 상태(placeholder)가 정상. 실제 화면·알림 확인은 사용자 확인 대기.

### Phase 26 — 홈 헤더 정리: 제목·설명 제거 확정 + 좌측 홈 아이콘 + 햄버거 우측 고정 (2026-07-19, 구현 완료)

- **요청 근거**: 사용자 지시 — 사용자가 `IndexDashboard.tsx`의 홈 상단 제목("시장 지표")·설명 문구 블록을 직접 주석 처리했더니 우측에 있던 햄버거 메뉴가 좌측으로 이동함. 햄버거 메뉴는 우측에 고정하고, 좌측에는 (원래 없던) 홈 버튼 아이콘을 신설. 주석 처리된 제목·설명 블록은 구현 시 **삭제 확정**(사용자 승인 완료).
- **원인**: `IndexDashboard.module.css`의 `.header`가 `display: flex; justify-content: space-between`인데, 제목 `<div>`가 주석 처리되면서 자식이 `.headerActions` 하나만 남아 flex 시작 위치(좌측)로 붙음. 자식 2개가 복원되면 `space-between`이 좌/우 배치를 자연 복원한다.
- **구현 계획 (파일 단위)**:
  1. `src/components/indices/IndexDashboard.tsx` — 주석 처리된 제목·설명 `<div>` 블록을 삭제하고, 그 자리에 기존 공용 컴포넌트 `NavIconLink`(`components/nav/NavIconLink.tsx` — House 아이콘·36px, 상세 페이지 헤더에서 이미 사용 중)를 `icon="home"` `href="/"` `label="홈"`으로 배치. 우측 `.headerActions`(HeaderMenu)는 무변경 — 좌측 홈 아이콘 + 우측 햄버거의 2자식 구조로 `space-between` 배치 복원. 신규 컴포넌트·CSS 없음.
  2. `src/components/indices/IndexDashboard.module.css` — 제목 블록 삭제로 미사용이 되는 `.title`·`.subtitle` 셀렉터 제거. `.header`의 `align-items: flex-start`는 양쪽 모두 36px 아이콘 버튼이 되므로 `center`로 조정(높이 정렬 자연화).
- **비고(a11y)**: 제목 삭제로 홈 화면에서 `<h1>`이 사라짐 — 문서 제목(`layout.tsx` metadata "투자의 공간")은 유지되므로 수용. 필요해지면 시각적으로 숨긴 h1을 추후 별도 논의.
- **상태**: 구현 완료(2026-07-19) — 계획 1·2번 그대로 구현(주석 블록 삭제 + `NavIconLink` home 배치, `.title`·`.subtitle` 제거 + `.header` `align-items: center`). lint·tsc 통과, research.md §2.3 갱신. 같은 커밋 흐름에 사용자 직접 수정분(문서 제목 "투자의 공간", `KIS_DATA_NOTICE` 문구 축약) 포함.

### Phase 27 — 변동성 상세: 차트 하단 당월 일별 기록 목록 추가 (2026-07-19)

- **요청 근거**: 사용자 지시 — `/indices/kospi-volatility` 상세에 차트만 있는데, 차트 밑에 **당월 일별 데이터 목록**을 추가. §9.4.4의 "차트 하나만, 하단 목록 없음(단순 유지)" 방침은 이 지시로 **변경 확정**.
- **조사 결과 (2026-07-19)**: 일별 기록은 Redis `kospiVolatility:history`(`KospiVolatilityRecord`: `date`·`dailyGapPercent`)에 이미 전량 저장돼 있고 페이지가 `getVolatilityHistory()`를 이미 호출 중 — **추가 페치·저장 변경 0건**, 당월 필터만 걸면 됨. 목록 폼은 보유종목 상세의 "일별 기록" 패턴(`holdings/page.module.css`의 `.dailyList/.dailyRow`)을 이식.
- **구현 계획 (파일 단위)**:
  1. `app/indices/kospi-volatility/page.tsx` — `getVolatilityHistory()` 결과를 `records`로 보존 후 `aggregateMonthlyAverages` 호출. `todayKstDate().slice(0, 7)`로 당월 필터(`getVolatilityCardSummary`와 동일 패턴), 최신일 먼저(내림차순) 정렬해 차트 섹션 아래 "당월 일별 기록" 섹션 렌더 — 행: 날짜 + `dailyGapPercent.toFixed(2)%`(카드·차트 툴팁과 동일 포맷, `.numeric`). 당월 기록 0건이면 섹션 자체 미렌더(보유종목 관례). Server Component 유지(정적 목록 — Recharts 아님).
  2. `app/indices/kospi-volatility/page.module.css` — `.sectionTitle`·`.dailyList`·`.dailyRow`·`.dailyDate`·`.dailyValue`를 보유종목 상세 CSS에서 이식(등락 색상 불필요 — 변동성은 방향성 없는 값이라 rise/fall 미적용).
- **상태**: 구현 완료(2026-07-19) — 계획 1·2번 그대로 구현. lint·tsc 통과, research.md §2.3·§4.3 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 28 — 홈 원/달러 카드 분리 + 시장 카드 재편 + 달러 인덱스(DXY 근사) 추가 (2026-07-19)

- **요청 근거**: 사용자 지시 — ① 시장 상세의 원/달러 환율 항목을 따로 떼어 **홈에 원/달러 카드 신설**(`/indices/usdkrw` 직결) ② **시장 항목에서 원/달러 제외** ③ `/indices/usdkrw` 상세에 **달러 인덱스 항목 추가** — KIS에 DXY 종목이 없어 "우회 1(환율 6종 계산)" 방식 승인.
- **조사 결과 (2026-07-19 실측)**:
  - KIS 해외지표 마스터(`frgn_code.mst`, §9.1과 동일 소스) 전수 확인 — **달러 인덱스(DXY/USDX) 종목 없음**(P/W 해외지수 · C 상품 · B 금리 · X 환율 전 카테고리). FHKST03030100 단일 조회 불가 확정.
  - ICE DXY 공식의 6개 통화쌍은 전부 X 카테고리에 존재: `FX@EUR`(달러/유로) · `FX@JPY`(엔/달러) · `FX@GBP`(달러/파운드) · `FX@CAD`(캐나다달러/달러) · `FX@SEK`(크로나/달러) · `FX@CHF`(프랑/달러).
  - **라이브 실측**(FHKST03030100, X 카테고리, 2026-07-19): 6종 모두 `rt_cd=0` · 일별 21행 · 호가 방향이 공식과 일치(EURUSD 1.14 · USDJPY 162.45 · GBPUSD 1.35 · USDCAD 1.40 · USDSEK 9.65 · USDCHF 0.81), 계산값 DXY(20260718) = **100.76** — 정상 범위. FX 일별 행은 토요일(KST) 포함·일요일 결측 — 지표별 기준일 교집합으로 계산하므로 무관.
  - 공식: `DXY = 50.14348112 × EURUSD^−0.576 × USDJPY^0.136 × GBPUSD^−0.119 × USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036` — **ICE 공표값과 소수점 수준 오차가 있을 수 있는 근사치**(화면에 근사치 각주 표기).
- **구현 계획 (파일 단위)**:
  1. `types/indices.ts` — `IndicatorId`에 파생 지표 `"DXY"` 추가(`OverseasIndicator` 3종은 KIS 단일 조회 가능 지표로 유지), `INDICATOR_NAMES.DXY = "달러 인덱스"`.
  2. `lib/api/kis/constants.ts` — `KIS_DXY_BASE`(50.14348112) + `KIS_DXY_COMPONENTS`(코드·지수 6쌍, 실측 주석).
  3. `lib/api/kis/client.ts` — `fetchKisFxPairDaily(code)`(X 카테고리 기간별시세, 기존 `fetchKisOverseasDaily`와 동일 창).
  4. **신규** `lib/indices/dxy.ts` — 순수 계산 `computeDxyDetail(rawByCode)`: 6종 일별 종가의 **기준일 교집합**에서 DXY 산출(소수 2자리 반올림) → snapshot(전일 대비 차분)·history(최근 7)·dailyRows(최신순 7, 인접 차분) — `StoredMarketDetail` 동일 폼.
  5. `lib/market/store.ts` — `MarketDetailKey`에 `"dxy"` 추가, `INDICATOR_TO_DETAIL_KEY.DXY = "dxy"`.
  6. `lib/jobs/refreshMarketData.ts` — `refreshDxy(fetchedAt)`: 통화쌍 6종 **순차** 조회(유량 배려) → 계산 → `market:detail:dxy` 저장. **파생 부수 지표라 잡 전체 `ok` 게이팅 제외**(dailyFluctuation 관례 — 실패 시 로그만, 다음 회차가 자연 재시도). 리포트에 `dxy` 필드 추가.
  7. `lib/indices/getOverseasDetail.ts` — 파라미터를 `Exclude<IndicatorId, MarketIndex>`로 확장(DXY 읽기 허용).
  8. `lib/indices/getDashboard.ts` — `fetchedAtByKey` 타입을 `Exclude<MarketDetailKey, "dxy">`로 한정(홈은 DXY 미사용 — 추가 페치 없음).
  9. `components/indices/IndexDetailScreen.tsx` — `children` 슬롯(일별 시세 섹션과 푸터 사이 렌더).
  10. **신규** `components/indices/DollarIndexSection.tsx`(+module.css) — `getOverseasDetail("DXY")` → `IndexCard` + `IndexChartClient` + 근사치 각주. 데이터 없으면(첫 갱신 전) 준비 중 문구.
  11. `app/indices/usdkrw/page.tsx` — `IndexDetailScreen`에 `<DollarIndexSection />` children 전달, metadata에 달러 인덱스 반영.
  12. `components/indices/IndexDashboard.tsx` — ① 원/달러 SummaryCard 신설(코스닥 다음, `indexSummaryProps(data.usdKrw, "/indices/usdkrw", staleness.usdkrw)`) ② 시장 카드 대표값을 **미국 10년물 금리**로 교체(각주 "미국 10년물 금리 대표 표시 · 유가 포함") ③ `DashboardStaleness`에 `usdkrw` 추가.
  13. `app/page.tsx` — 시장 카드 staleness 기준을 **금리·유가 2종** 중 가장 오래된 fetchedAt으로 축소, `usdkrw` staleness 추가.
  14. `app/indices/market/page.tsx` — 미니 카드에서 usdkrw 제거(금리·유가 2종 + 수출입), metadata·aria 문구 갱신.
- **상태**: 구현 완료(2026-07-19) — 계획 1~14번 그대로 구현. lint·tsc·프로덕션 빌드 통과, `refreshDxy` 로컬 실측(tsx 단독 실행)으로 `market:detail:dxy` 저장 확인. research.md §2·§4·§5 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 29 — 보유종목 일별 기록: 접힘 기본 `<details>` + 월 단위 페이지네이션 (2026-07-19)

- **요청 근거**: 사용자 지시 — ① 일별 기록 목록을 평소 숨겼다가 클릭 시 펼침 ② 펼치면 **당월만** 표시, 게시판처럼 이전/다음 버튼으로 한 페이지 1개월씩 조회 ③ 보유종목 홈(`/holdings`)의 기존 목록에 적용 + 종목별 상세(`/holdings/[symbolCode]`)에는 목록 **신규 추가**.
- **방식 결정**: 접기는 네이티브 `<details>`/`<summary>`(방법 1 — JS 불필요·a11y 기본 제공), 월 페이지네이션은 **B안: 작은 클라이언트 컴포넌트**(`useState` 월 인덱스). URL 쿼리 방식(A안)은 월 넘김마다 서버 왕복 + `<details>` 접힘 리셋이라 기각. "현재 보는 월"은 순수 UI 상태로 클라이언트가 자연스럽고, `HoldingsChart`의 단위 토글과 같은 선례. 데이터는 서버가 전량 내려주므로 페칭 규칙(Server Component 우선) 위반 없음.
- **조사 결과 (2026-07-19)**: 홈은 `getPortfolioHistory`, 상세는 `getStockHistory`(2년)를 이미 호출·차트에 사용 중 — **추가 페치·저장 변경 0건**. 목록 폼·`<details>` 토글 CSS는 기존 `.dailyList` 계열·종목 추가 폼 `.addToggle` 패턴 이식.
- **구현 계획 (파일 단위)**:
  1. **신규** `components/holdings/DailyHistoryList.tsx`(`'use client'`) — props `rows: {date, close?, totalValue, returnRate}[]`. `<details>`(기본 접힘) + summary "일별 기록" + 월 내비(`← 이전 | YYYY년 M월 | 다음 →`) + 월별 목록(최신일 먼저). 기록 있는 달만 최신순 배열로 만들어 빈 달 자동 건너뜀, 양 끝에서 버튼 disabled, 기본은 최신 달(=당월). `close` 전달 시에만 종가 열 렌더. rise/fall 판정은 로컬 3줄 사본(`resolveDirection` 의미 동일 — KIS mapper를 클라이언트 번들에 안 넣기 위함).
  2. **신규** `components/holdings/DailyHistoryList.module.css` — `.toggle`(addToggle 이식+쉐브론 회전)·`.monthNav`/`.monthButton`/`.monthLabel`·`.dailyList` 계열(page.module.css 이식+`.dailyClose`)·rise/fall/flat.
  3. `app/holdings/page.tsx` — 기존 "일별 기록" 섹션(인라인 `<ol>`)을 `<DailyHistoryList rows={dailyRows}/>`로 교체. rows는 **연도 필터 없이 전체 히스토리**(월 페이지네이션이 과거 달까지 커버 — 기존 올해 한정에서 확장). 차트는 기존 `yearHistory` 유지.
  4. `app/holdings/page.module.css` — 이식 후 미사용이 된 `.dailyList`/`.dailyRow`/`.dailyDate`/`.dailyValue`/`.dailyRate` 제거.
  5. `app/holdings/[symbolCode]/page.tsx` — 차트 섹션과 종목 정보 섹션 사이에 "일별 기록" 섹션 신규(2년 히스토리 → `{date, close, totalValue: close×수량, returnRate}`, 0건이면 미렌더).
- **상태**: 구현 완료(2026-07-19) — 계획 1~5번 그대로 구현. lint·tsc·프로덕션 빌드 통과, research.md §2·§4.3 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 30 — 시장 상세: 수출입 제거 + 금 현물(국제) + 비트코인(원/달러 토글) 추가 (2026-07-19)

- **요청 근거**: 사용자 지시 — ① `/indices/market`(시장 상세)에서 **수출입 카드 제거**(`/feeds`·관세청 수집 잡은 유지) ② **금 현물 시세(국제)** 항목 추가 — `GOLDLNPM` 확정 ③ **비트코인 시세** 항목 추가 — 업비트 원화/달러 **둘 다**, 보유종목 상세 차트의 수익률/원 단위 토글처럼 **원화↔달러 전환** ④ 주말 갱신은 하지 않음 — **평일 개장 시간 갱신 창을 그대로 사용**(스케줄 변경 없음).
- **조사 결과 (2026-07-19 실측)**:
  - **금**: KIS 해외지표 마스터(`frgn_code.mst`) C(상품) 카테고리에 금 3종 존재 — `GOLDLNPM`(LBMA 런던 금 현물)·`XAUUSDCOMP`(Tenfore 국제금가격)·`NYGOLD`(COMEX 뉴욕 금). **라이브 실측**(FHKST03030100, `N` 분류): 3종 모두 `rt_cd=0`·일자별 20~21행 정상 — §15.1의 "S 분류 output2 빈 응답" 케이스 아님. 응답 필드가 유가(`N`/`WTIF`)와 동일해 `kisOverseasMapper` 3종 그대로 재사용. **`N`/`GOLDLNPM` 채택**(국제 금 현물 대표 벤치마크, 사용자 확정).
  - **비트코인**: KIS 마스터 전수 검색 — 비트코인 지수·시세 없음. 추정 코드 4종(`BTCUSD`·`BTC`·`XBTUSD`·`NYXBT`) 라이브 조회도 전부 빈 응답(값 0.00·0행) — **KIS 불가 확정**. **업비트 공개 시세 API**(인증·키 불필요) 실측: `GET /v1/ticker?markets=KRW-BTC`·`USDT-BTC`(현재가·전일 종가 대비·KST 기준시각), `GET /v1/candles/days`(일봉 시가·고가·저가·종가·`prev_closing_price`) 모두 정상 — 원화/달러(USDT) 두 마켓을 **한 소스**로 커버. 유량 여유 커서 회차당 4콜 무해. 일봉 경계는 KST 09:00(UTC 자정).
  - **갱신 창**: 비KIS 소스지만 기존 시세 갱신 잡(`refresh-market-data`, 평일 09:00~18:40 가드) 안에서만 호출 — 주말·야간 미갱신 요건이 스케줄 변경 없이 자동 충족. 비트코인은 24시간 거래 자산이라 주말 화면은 금요일 마지막 회차 시세로 표시(각주 안내).
- **구현 계획 (파일 단위)**:
  1. `lib/api/kis/constants.ts` — `KIS_OVERSEAS_INDICATOR.GOLD = { marketDivCode: "N", code: "GOLDLNPM" }`(실측 주석).
  2. `types/indices.ts` — `OverseasIndicator`에 `"GOLD"`(KIS 단일 조회 가능 4종으로 확장), `IndicatorId`에 외부(업비트) 지표 `"BTCKRW" | "BTCUSD"` 추가, `INDICATOR_NAMES` 3건 추가.
  3. `lib/market/store.ts` — `MarketDetailKey`에 `"gold" | "btcKrw" | "btcUsd"`, `INDICATOR_TO_DETAIL_KEY` 3건 추가.
  4. **신규** `lib/api/upbit/client.ts` — 업비트 공개 시세 API(서버 전용, 키 없음): `fetchUpbitTicker(market)`·`fetchUpbitDayCandles(market, count)` + 응답 타입. 15초 타임아웃·HTTP 오류 throw(KIS 클라이언트 관례).
  5. **신규** `lib/indices/upbitMapper.ts` — `mapUpbitDetail(indicator, ticker, candles)`: 티커→스냅샷(전일 종가 대비 직접 제공), 일봉→history(최근 7 오름차순)·dailyRows(최신순 7, `prev_closing_price` 차분) — `StoredMarketDetail` 동일 폼.
  6. `lib/jobs/refreshMarketData.ts` — ① `refreshIndices` tasks에 `gold` 추가(KIS 6종, 잡 `ok` 게이팅 포함 — oil 관례) ② `refreshBtc(fetchedAt)`: 업비트 2마켓 순차 조회 → `market:detail:btcKrw`·`btcUsd` 저장. **외부 부수 지표라 잡 전체 `ok` 게이팅 제외**(dxy 관례 — 실패 시 로그만, 다음 회차 자연 재시도). 리포트에 `btc` 필드.
  7. `lib/indices/getDashboard.ts` — `fetchedAtByKey`의 `Exclude`에 신규 3키 추가(홈 미사용 — 추가 페치 없음).
  8. **신규** `app/indices/gold/page.tsx` — `IndexDetailScreen market="GOLD"`(oil 미러).
  9. **신규** `components/indices/BtcLineChart.tsx`(+module.css) — Recharts 차트, `currency` prop으로 축·툴팁 포맷 분기(원화 축은 M/B 축약, 달러 축은 소수 2자리).
  10. **신규** `components/indices/BtcChartClient.tsx` — `dynamic` + `ssr: false` 래퍼(IndexChartClient 관례).
  11. **신규** `components/indices/BtcDetailSection.tsx`(+module.css) — `'use client'`, **원화↔달러 토글**(HoldingsChart 토글 패턴): 스냅샷 카드 + 차트 + 일별 시세 목록이 선택 통화로 함께 전환. 통화별 포맷(원: 정수 `…원`, 달러: 소수 2자리). 데이터 없으면(첫 갱신 전) 준비 중 문구.
  12. **신규** `app/indices/btc/page.tsx`(+module.css) — `getMarketDetails(["btcKrw","btcUsd"])` → `BtcDetailSection`, 푸터에 업비트 출처·평일 장중 갱신·주말 시세 각주.
  13. `app/indices/market/page.tsx` — ① 수출입 카드·`getTradeStatsView`·무역 포맷 import·`signClass` 제거 ② `MARKET_ITEMS`에 `gold` 추가(미니 카드 3종) ③ 비트코인 커스텀 카드(원화 대표값+달러 병기, 원화 차트, `/indices/btc` 링크) ④ metadata·aria·푸터 문구 갱신.
  14. `app/indices/market/page.module.css` — 미사용이 된 `.tradeStats`/`.tradeRow` 제거, 비트코인 카드 보조 값 스타일 추가.
  15. `components/indices/IndexDashboard.tsx` — 홈 시장 카드 각주 "유가 포함" → "유가·금·비트코인 포함".
- **상태**: 구현 완료(2026-07-19) — 계획 1~15번 그대로 구현. lint·tsc·프로덕션 빌드 통과(`/indices/gold`·`/indices/btc` 라우트 마운트 확인), 로컬 실측(tsx 단독 실행)으로 `market:detail:gold`(close 3,995.35·7행)·`btcKrw`(95,275,000원)·`btcUsd`(64,690.75) 저장 확인 — 첫 갱신 회차 전에도 화면 표시 가능. research.md §2·§3·§4·§5·§6·§9 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 31 — 시장: 카드별 일별 기록 접힘 목록 + 개별 상세 페이지 4종 제거 (2026-07-19)

- **요청 근거**: 사용자 지시 — 시장(`/indices/market`) 카드의 "일별 시세 보기 →"가 개별 상세 화면으로 이동하는 대신, 보유종목 상세의 일별 기록(§29)처럼 카드 안에서 **펼치기/닫기**로 본다. 개별 상세 페이지 4종(`/indices/us10y`·`oil`·`gold`·`btc`)은 **제거**하고 시장 페이지 하나로 유지. 비트코인 원화↔달러 토글은 상세 화면 제거로 소멸(카드의 원화 대표값+달러 병기는 유지, 일별 목록은 원화) — 사용자 확인.
- **조사 결과 (2026-07-19)**: ① 시장 페이지가 이미 `getMarketDetails` MGET(5키)으로 `dailyRows`(항목당 최근 7행)까지 받고 있어 **추가 페치 0건** — 접힘 UI만 붙이면 된다. ② 상세 4종으로의 링크는 시장 페이지에만 존재(전역 grep) — 삭제해도 다른 화면 영향 없음. `IndexDetailScreen`은 코스피·코스닥·원달러 3종이 계속 사용, `BtcChartClient`/`BtcLineChart`는 시장 카드 차트가 사용 — 유지. `BtcDetailSection`만 고아가 되어 함께 삭제. ③ 행이 7개뿐이라 §29의 월 페이지네이션·클라이언트 상태는 불필요 — 순수 `<details>`(JS 무관)로 충분, 페이지는 Server Component 유지.
- **구현 계획 (파일 단위)**:
  1. `app/indices/market/page.tsx` — ① `MARKET_ITEMS`에서 `href` 제거(키 배열화)·`Link` import 제거 ② 카드 제목 링크 → 평문 ③ "일별 시세 보기 →" 링크 → `<details>` 접힘(summary "일별 기록"+쉐브론, §29 토글 폼): KIS 3종은 `<IndexDailyList rows={stored.dailyRows}/>` 재사용, 비트코인은 원화 목록 인라인 렌더(`formatBtcValue`/`formatBtcChange`, BtcDetailSection 목록 폼 이식).
  2. `app/indices/market/page.module.css` — 미사용이 되는 `.cardLink`/`.detailLink` 제거, `.dailyDetails`/`.dailyToggle`/`.chevron`(DailyHistoryList 토글 이식) + 비트코인용 `.dailyList` 계열(IndexDailyList 폼 이식) 추가.
  3. **삭제** `app/indices/us10y/page.tsx`·`oil/page.tsx`·`gold/page.tsx`·`btc/page.tsx`(+`btc/page.module.css`), `components/indices/BtcDetailSection.tsx`(+module.css).
- **상태**: 구현 완료(2026-07-19) — 계획 1~3번 그대로 구현. lint·tsc·프로덕션 빌드 통과(상세 라우트 4종 언마운트 확인). research.md §2 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 32 — 홈 시장 카드: 금·비트코인 보조 시세 표시 (2026-07-19)

- **요청 근거**: 사용자 지시 — 홈 "시장" 카드 요약에 금리·금 시세·비트코인 시세를 간략하게 표시. 금리(미국 10년물)는 이미 카드 대표값이라, 금·비트코인(원화) 보조 줄 2개만 추가.
- **조사 결과 (2026-07-19)**: ① `gold`·`btcKrw` 스냅샷은 §30에서 이미 `market:detail:*`에 저장 중 — 시장 페이지가 읽는 것과 동일 키를 홈 `getDashboardData` MGET에 추가하기만 하면 되고 **새 API 호출·잡 변경 0건**. ② `getDashboard.ts`의 `fetchedAtByKey` 주석이 "gold·btcKrw·btcUsd는 홈 카드가 없어 제외"라고 명시 — 이번에 gold를 포함으로 전환. ③ `SummaryCard`는 value 1개+change 1줄 구조라 보조 줄을 받는 prop이 없음 — 옵셔널 `subItems` 추가가 유일한 구조 변경 지점(미지정 카드 렌더 불변).
- **구현 계획 (파일 단위)**:
  1. `types/indices.ts` — `IndexDashboardData`에 `gold`·`btcKrw` 스냅샷 추가(§30 추가 키라 첫 갱신 전 null 허용 — oil 관례).
  2. `lib/indices/getDashboard.ts` — MGET에 `gold`·`btcKrw` 추가(7키), asOf 최솟값 계산에 합류, `fetchedAtByKey`에 gold 추가(시장 카드 배지 판정 합류). btcKrw는 잡 `ok` 게이팅 제외 외부 지표(§30 dxy 관례)라 배지 판정에서 제외 유지.
  3. `components/indices/SummaryCard.tsx` — 옵셔널 `subItems`(label·value·change) prop 추가, change와 footnote 사이 목록 렌더.
  4. `components/indices/SummaryCard.module.css` — `.subItems`/`.subItem`/`.subLabel` 스타일 추가.
  5. `components/indices/IndexDashboard.tsx` — 시장 카드에 금(`formatIndex`+등락률)·비트코인(원화 `formatBtcValue`+등락률) subItems 전달(null이면 해당 줄 생략), 각주 "유가·금·비트코인 포함" → "유가 포함"으로 정리.
  6. `app/page.tsx` — 시장 카드 staleness 판정(`marketFetchedAt`)에 gold 합류(금리·유가·금 3종 중 최솟값), 주석 갱신.
- **상태**: 구현 완료(2026-07-19) — 계획 1~6번 그대로 구현. lint·tsc·프로덕션 빌드 통과. research.md §2·§4·§9 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 33 — 홈 시장 카드 리스트형 전환(비트코인 USD) + 리스트 카드 4행 통일 (2026-07-19)

- **요청 근거**: 사용자 지시 — ① §32의 시장 카드(금리 대표값+보조 줄)가 아니라 관심종목 카드처럼 **모든 항목 동등한 행 리스트**로: 금리·유가·금·비트코인 4행, 비트코인은 **달러 표시**. ② 시장이 4행이 되므로 다른 리스트 카드(핫종목·관심종목·배당)도 **4행으로 통일**.
- **조사 결과 (2026-07-19)**: ① `btcUsd` 스냅샷은 §30부터 저장 중 — 홈 MGET 키만 `btcKrw`→`btcUsd` 교체, 표기는 시장 페이지 병기 폼(`formatBtcValue(…, "USD") + " USD"`). ② 리스트 카드 3종은 전부 `slice(0, 3)` 상수 하나 — 핫종목은 상위 30 저장이라 항상 4행, 관심종목·배당은 있는 만큼(최대 4). ③ 관심종목 카드가 이미 "골격은 SummaryCard composes + 자체 리스트" 패턴 — 시장도 동일 패턴의 전용 컴포넌트로 분리하고, §32에서 SummaryCard에 넣은 `subItems` prop은 되돌려 프리미티브 복원. ④ 지수 3종·보유·변동성(단일 지표)·뉴스공시(2종뿐)는 대상 아님.
- **구현 계획 (파일 단위)**:
  1. `types/indices.ts` — `IndexDashboardData.btcKrw` → `btcUsd`로 교체.
  2. `lib/indices/getDashboard.ts` — OPTIONAL_KEYS `btcKrw`→`btcUsd`, 반환 필드 교체. `fetchedAtByKey`(금리·유가·금 배지 기준)는 불변.
  3. `components/indices/SummaryCard.tsx`(+module.css) — §32 `subItems` prop·`SummaryCardSubItem`·`.subItems` 계열 스타일 제거(프리미티브 복원).
  4. **신규** `components/indices/MarketCard.tsx`(+module.css) — WatchlistCard 패턴(골격 composes + 자체 리스트): 미국 10년물 금리·국제유가 WTI·금 현물·비트코인(USD) 4행, 행 폼 `지표명(좌) + 값(numeric) + 등락률(색상)`. null 지표는 행 생략(첫 갱신 전), 각주 기준일+USDT≈USD 안내, staleness 배지 동일 정책.
  5. `components/indices/IndexDashboard.tsx` — 시장 `SummaryCard` → `MarketCard` 교체, `formatBtcValue` import 이동.
  6. `lib/hotstocks/dailyCard.ts` + `components/indices/HotStocksCard.tsx` — `top3`→`top4`(slice 4), 각주 "TOP 3"→"TOP 4".
  7. `lib/watchlist/summary.ts` + `components/indices/WatchlistCard.tsx` — `top3`→`top4`(slice 4), 각주 분기 `count > 3`→`> 4`·"상위 3"→"상위 4".
  8. `lib/dividends/summary.ts` — `slice(0, 3)`→`(0, 4)`, 주석 갱신 (+`DividendCard` 주석).
- **상태**: 구현 완료(2026-07-19) — 계획 1~8번 그대로 구현. lint·tsc·프로덕션 빌드 통과. research.md §2·§4·§9 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 34 — 홈 시장 카드 지표명 축약 + 각주 한 줄 (2026-07-19)

- **요청 근거**: 사용자 지시 — §33 시장 카드에서 ① 지표명이 길어 말줄임으로 가려지고 ② 각주가 두 줄로 넘침. 지표명을 축약하고, 각주는 기준일만 남기고 통화(USD) 표기를 뺀다.
- **조사 결과 (2026-07-19)**: 라벨·값·각주 문자열이 전부 `MarketCard.tsx` 한 파일에 상수로 있고, `.name`은 이미 `flex:1 + text-overflow: ellipsis`라 CSS 수정 없이 라벨 길이만 줄이면 해소됨. 값 열의 `" USD"` 접미사를 라벨(`BTC($)`)로 옮기면 값 열은 숫자만 남아 폭도 준다. 각주의 "비트코인 USDT≈USD" 안내는 상세 화면(`/indices/market` 하단)에 동일 설명이 남아 정보 손실 없음.
- **구현 계획 (파일 단위)**:
  1. `components/indices/MarketCard.tsx` — 라벨 4종 축약(`미국 10년물 금리`→`美 금리`, `국제유가 WTI`→`WTI`, `금 현물`→`GOLD`, `비트코인`→`BTC($)`), BTC 값에서 `" USD"` 접미사 제거, 각주를 `기준일 …` 한 줄로 축소, 헤더 주석에 §34 근거 추가.
- **상태**: 구현 완료(2026-07-19) — lint·tsc 통과. research.md §4 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 35 — 홈 카드 각주 전면 제거 + 여백·등락률 축소 (2026-07-19)

- **요청 근거**: 사용자 지시 3건 — ① 기준일 문구를 포함한 홈 카드 하단 각주 8개를 전부 제거 ② §34 축약 후에도 시장 카드 등락률이 가려져 등락률만 1pt 축소 ③ 관심종목 전일 대비 등락률의 괄호 제거. 추가로 카드 안쪽·바깥쪽 여백을 1mm(≈4px)씩 축소.
- **조사 결과 (2026-07-19)**: 각주 8개의 출처는 `IndexDashboard.tsx`(지수 3종 `기준일 …` + 보유종목·변동성 2건) · `MarketCard`/`WatchlistCard`/`HotStocksCard`/`FeedSummaryCard`/`DividendCard` 각 1건. `footnote`는 `SummaryCard`의 optional prop이고 전용 카드 5종은 `.footnote`를 composes만 하고 있어, 전 카드에서 빠지면 prop·CSS 모두 사용처가 사라진다(`grep` 결과 `components/indices/` 밖 사용 없음). 카드 골격은 5종이 `SummaryCard.module.css`의 `.card`를 composes 하므로 패딩은 한 곳 수정으로 전 카드 반영. CSS `mm`는 `1mm = 3.78px`라 실질 4px이며, spacing 토큰이 4px 계단(8·12·16·20·24)이라 각각 한 칸씩 내리면 정확히 맞는다.
- **구현 계획 (파일 단위)**:
  1. `components/indices/IndexDashboard.tsx` — `indexSummaryProps`의 `footnote`(기준일) 제거 + `formatBasDtDisplay` import 삭제, 보유종목·변동성 `footnote` prop 제거.
  2. `components/indices/SummaryCard.tsx`(+module.css) — `footnote` prop·렌더 블록·`.footnote` 스타일 제거(프리미티브에서 완전 삭제). `.change:last-child { margin-bottom: 0 }` 추가 — 각주가 빠져 등락률이 마지막이 되면 12px가 헛돌기 때문.
  3. `MarketCard`/`WatchlistCard`/`HotStocksCard`/`FeedSummaryCard`/`DividendCard` `.tsx` — 각주 `<p>` 제거(+`MarketCard`의 `formatBasDtDisplay` import 삭제). 각 `.module.css` — 죽은 `.footnote` composes 블록 제거 + `.list:last-child { margin-bottom: 0 }` 추가(HotStocks는 `staleNotice`가 있을 때만 리스트 아래 여백 유지).
  4. `components/indices/WatchlistCard.tsx` — 전일 대비 등락률의 괄호 제거(`({rate})`→`{rate}`), 헤더·CSS 주석 갱신. `.daily`가 이미 `--text-micro`(11px)라 괄호 없이도 메인 수익률과 구분된다.
  5. `styles/tokens.css` — `--text-caption-sm: 12px` 신설(caption 13px보다 1pt 작은 보조 수치용). `MarketCard.module.css` `.rate`에 적용 — 지표명·값은 13px 유지.
  6. `components/indices/SummaryCard.module.css` `.card` 패딩 `--space-20`→`--space-16`, `IndexDashboard.module.css` `.dashboard` 패딩 `--space-16`→`--space-12` · `.cards` gap `--space-12`→`--space-8`.
- **부수 효과 (사용자 고지)**: 각주 한 줄(≈15px) + 상하 패딩 8px로 카드당 높이가 20px 남짓 줄어, 4행 리스트 카드와 값 한 줄 카드 간 행별 높이 편차가 지금보다 도드라질 수 있다. 우선 적용 후 실제 화면을 보고 조정하기로 함.
- **상태**: 구현 완료(2026-07-19) — 계획 1~6번 그대로 구현. lint·tsc 통과. research.md §4 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 36 — 페이지 제목 누락 보강 + 제목 굵기·크기 하향 (2026-07-19)

- **요청 근거**: 사용자 지시 — ① 상세 화면 대부분에 `<h1>` 제목이 있는데 홈·코스피·코스닥에는 없다 ② 홈 제목은 영어 `Dashboard` ③ 모든 페이지 제목을 굵게(700) 대신 보통(400)으로 ④ 제목 글씨 크기도 2pt 축소. 원/달러 화면에도 제목을 추가할지 확인 후 "추가" 확정.
- **조사 결과 (2026-07-19)**: 제목이 있는 화면 12곳은 전부 `<h1 className={styles.title}>` + 각 `page.module.css`에 동일한 `.title` 블록(`--text-title` 22px / `--weight-bold`)이 복붙되어 있다. 제목이 없는 화면은 두 곳뿐 — 코스피·코스닥·**원/달러**가 공유하는 `IndexDetailScreen.tsx`(한 곳 수정으로 3화면 동시 해결)와 홈의 `IndexDashboard.tsx`(제목은 Phase 26에서 의도적으로 제거했던 것을 이번에 영어 제목으로 복원). `--text-title`은 `.errorTitle`·`CountryTradeTable`·`IndexDetailScreen` 섹션 제목 등 h1이 아닌 곳도 쓰므로 토큰 값을 바꾸면 안 되고, 페이지 제목 전용 토큰을 새로 두는 편이 안전하다. 굵기 400 토큰(`--weight-regular`)도 기존 계단(500/600/700)에 없어 신설 필요.
- **구현 계획 (파일 단위)**:
  1. `styles/tokens.css` — `--text-page-title: 20px`(title 22px에서 2pt 축소, 페이지 h1 전용)·`--weight-regular: 400` 신설. 기존 `--text-title`·`--weight-bold`는 다른 용도가 있어 그대로 둔다.
  2. `page.module.css` 12개(`hot-stocks`·`indices/market`·`indices/kospi-volatility`·`indices/trade/[yyyymm]`·`holdings`·`holdings/[symbolCode]`·`feeds`·`alerts`·`dividends`·`watchlist`·`watchlist/[symbolCode]`·`dlq`) — `.title`의 `font-size`→`--text-page-title`, `font-weight`→`--weight-regular`.
  3. `components/indices/IndexDetailScreen.tsx`(+module.css) — 헤더에 `<h1 className={styles.title}>{data.snapshot.name}</h1>` 추가(코스피·코스닥·원/달러 3화면 동시 적용). `.header`를 `justify-content: space-between`에서 `gap: --space-12`로 바꾸고 `.lastRefresh`에 `margin-left: auto` — 다른 상세 화면(`hot-stocks`)과 동일한 배치 관례.
  4. `components/indices/IndexDashboard.tsx`(+module.css) — 헤더에 `<h1 className={styles.title}>Dashboard</h1>` 추가. `.header`도 같은 방식으로 `gap` + `.headerActions { margin-left: auto }`로 전환해 좌(홈 아이콘)–제목–우(햄버거) 배치 유지.
- **상태**: 구현 완료(2026-07-19) — 계획 1~4번 그대로 구현. lint·tsc 통과. research.md §2 갱신. 실제 화면 확인은 사용자 확인 대기.

### Phase 37 — "시장" → "글로벌 지표" 개명 + BTC 라벨에서 ($) 제거 (2026-07-19)

- **요청 근거**: 사용자 지시 2건 — ① 홈 시장 카드의 `BTC($)` 라벨이 모바일에서 값을 가려 `BTC`로 축약 ② "시장"이라는 이름이 카드 내용(해외 금리·원자재·BTC)과 맞지 않아 개명 — 후보 4종(글로벌 지표/매크로/시장 지표/해외 지표) 제시 후 **"글로벌 지표" 확정**.
- **조사 결과 (2026-07-19)**: ① 최초 검토에서 "($)를 빼면 통화 단서가 사라진다"고 보고했으나, **사용자 지적대로 오판** — 같은 카드의 WTI·GOLD도 `formatIndex()`로 숫자만 출력하며 둘 다 USD 기준이라 통화 표기가 없다. BTC에만 ($)를 붙인 §34 결정이 오히려 불일치였고, 제거가 카드 안 표기를 일관되게 만든다. 통화 상세는 상세 화면 각주(`USD/배럴`·`USD/트로이온스`·업비트 마켓 안내)에 남아 정보 손실 없음. ② "시장" 문자열은 홈 카드 `<h2>`·상세 `<h1>`·`metadata.title`·`aria-label` 4곳 + 주석 2곳뿐 — 햄버거 메뉴·다른 화면에 `/indices/market` 링크가 없어(전역 grep: `MarketCard`의 카드 링크 1건) 개명 파급 없음. ③ 라우트 `/indices/market`·컴포넌트명 `MarketCard`·Redis 키 `market:detail:*`는 **변경하지 않는다** — 표시명만 바뀌는 건이라 URL·스토어 스키마를 건드릴 이유가 없다.
- **구현 계획 (파일 단위)**:
  1. `components/indices/MarketCard.tsx` — 라벨 `BTC($)`→`BTC`, 카드 제목 `시장`→`글로벌 지표`, 헤더 주석에 §37 근거(WTI·GOLD와 동일하게 값 열은 숫자만) 반영.
  2. `components/indices/MarketCard.module.css` — 머리말 주석의 카드명 갱신.
  3. `app/indices/market/page.tsx` — `metadata.title` `시장 — jusik`→`글로벌 지표 — jusik`, `<h1>`·섹션 `aria-label` 갱신. 하단 각주(통화 단위 안내)는 그대로 유지.
- **상태**: 구현 완료(2026-07-19) — 계획 1~3번 그대로 구현. lint·tsc·build 통과. research.md §1·§2·§4 갱신. 실제 화면 확인은 사용자 확인 대기.

---

### Phase 38 — 홈·상세 화면 컨테이너 정렬 통일 (2026-07-19)

- **요청 근거**: 사용자 지적 — "홈화면 UI와 각 항목 상세화면 UI의 위치가 미묘하게 다르다". 조사 후 1안(상세 화면 기준으로 홈을 맞춤) 확정.
- **조사 결과 (2026-07-19)**: 상세 화면 13종(`holdings`·`holdings/[symbolCode]`·`watchlist`·`watchlist/[symbolCode]`·`hot-stocks`·`feeds`·`dividends`·`alerts`·`dlq`·`indices/market`·`indices/kospi-volatility`·`indices/trade/[yyyymm]`·`IndexDetailScreen`)의 `.page`+`.container` 블록은 **완전히 동일**(`max-width: --layout-max-width` 480px, `margin: 0 auto`, `padding: --space-16`, 헤더 `gap: --space-12`·`margin-bottom: --space-16`). 예외는 `trade/[yyyymm]` 하나뿐인데 헤더 `margin-bottom` 대신 컨테이너 `gap: --space-16`을 쓰는 방식이라 결과 간격은 같다. 어긋난 건 홈 `IndexDashboard.module.css`의 **두 값뿐** — `.dashboard` 패딩 `--space-12`(§35에서 축소), `.header` 아래 `--space-24`. 홈 아이콘+`h1` 배치·`--text-page-title`·`--weight-regular`·max-width·정렬은 §36에서 이미 일치. 체감되는 어긋남은 주로 패딩(좌우 정렬선 4px 밀림)에서 온다.
- **구현 계획 (파일 단위)**:
  1. `components/indices/IndexDashboard.module.css` — `.dashboard` 패딩 `--space-12`→`--space-16`, `.header` `margin-bottom` `--space-24`→`--space-16`. 상세 화면 `.container`와 같은 블록임을 머리말 주석에 명시(같이 고치라는 표식).
- **부작용 인지**: §35에서 홈 카드 여백을 한 칸씩 줄이며 컨테이너 패딩도 12로 내렸는데, 이 중 **컨테이너 패딩만 되돌린다**(카드 패딩 16·gap 8은 유지). 카드 그리드 가용 폭이 좌우 8px 줄지만, 화면 간 정렬 일관성을 우선한 사용자 결정.
- **상태**: 구현 완료(2026-07-19) — 계획 1번 그대로 구현. lint·tsc·build 통과. research.md §1 타이포/여백 항목 갱신. 실제 화면 확인은 사용자 확인 대기.

---

### Phase 39 — 카드 내부 여백 한 칸 축소 + `--card-padding` 토큰 통합 (2026-07-19)

- **요청 근거**: §38로 홈 컨테이너 패딩을 12→16으로 올린 뒤 사용자가 모바일에서 "카드 폭이 줄었다"고 확인. 카드 안/밖 여백을 1mm쯤 줄여달라는 요청에 A안(**안 여백만** 축소, 밖=컨테이너 패딩은 §38 정렬 유지를 위해 불변) 확정. CSS 1mm=3.78px이라 토큰 한 칸(16→12px=약 1.06mm)이 요청과 거의 정확히 일치 — 새 스케일 값 불필요.
- **조사 결과 (2026-07-19)**:
  1. **적용 범위는 홈만으로 끝나지 않는다.** `SummaryCard`(홈 카드 6종 공용 프리미티브)는 홈 전용이고, 상세 화면은 `.card`·`.stat`·`.item`·`.addForm`·`.emptyNotice`·`.footer`·`.chart` 등 **각자 정의한 카드 블록**을 쓴다. `SummaryCard`만 12로 내리면 홈 카드와 상세 카드의 도형 여백이 어긋나 §38에서 없앤 종류의 불일치가 재발한다 → **홈·상세 동시 적용이 필수**.
  2. 판별 기준을 `padding: var(--space-16)` + `border-radius` + `color-surface` 세 조건 동시 충족(=실제 카드 도형)으로 잡아 전수 조사 → **23개 파일 39곳**. 화면 가장자리용 `.container`/`.dashboard`는 `border-radius`가 없어 자동 제외되므로 §38 정렬은 안전하게 보존된다.
  3. 같은 값이 39곳에 복붙돼 있어(§36 `.title` 14곳과 동일한 드리프트 구조) 값만 일괄 치환하면 다음 조정 때 또 39곳을 찾아야 한다 → **의미 토큰으로 통합**.
- **구현 계획 (파일 단위)**:
  1. `styles/tokens.css` — `--card-padding: var(--space-12)` 신설(Spacing 블록 하단). 주석에 적용 범위와 "컨테이너 패딩은 §38 소관이라 별개"를 명시.
  2. 카드 도형 39곳(23개 파일) — `padding: var(--space-16)` → `padding: var(--card-padding)`. 블록 단위 스크립트로 치환하고, 치환 후 "세 조건 동시 충족 + `--space-16`" 잔여 0건을 재검증.
- **효과**: 카드 내부 가용 폭이 카드당 좌우 8px 증가(2열 기준 텍스트 폭 186→194px). 컨테이너 패딩·카드 간 gap·§38 정렬선은 불변.
- **상태**: 구현 완료(2026-07-19) — 계획 1~2번 그대로 구현, 39곳 치환·잔여 0건 확인. lint·tsc·build 통과. research.md §1 갱신. 실제 화면 확인은 사용자 확인 대기.

---

### Phase 40 — `loading.tsx` 도입으로 화면 전환 체감 속도 개선 (2026-07-19)

- **요청 근거**: 사용자 질문 — "prefetch 기능 활용해 빠른 페이지 이동 가능한가". 조사 결과 **현재 prefetch가 사실상 무효**임을 확인하고, 이를 되살리는 1안(`loading.tsx` 추가)으로 확정.
- **조사 결과 (2026-07-19)**:
  1. `<Link>`는 15개 파일에서 쓰고 `prefetch` 프롭은 어디에도 없다 → 프로덕션 기본값(뷰포트 진입 시 자동 prefetch)이 이미 켜져 있다. **끄고 있어서 느린 게 아니다.**
  2. 그런데 라우트가 **전부 동적**이다(`page.tsx`의 `auth()`·`ensureAllowedSession()`이 쿠키에 접근 → 정적 생성 불가). `next/dist/docs/01-app/02-guides/prefetching.md`의 정적/동적 대조표: 동적 페이지는 **`loading.js`가 없으면 prefetch 대상이 아니다**(Client Cache TTL도 Off, 클릭 시 서버 왕복 발생).
  3. `find src -name "loading.tsx"` → **0개**. 즉 자동 prefetch가 가져오는 건 JS 청크뿐이고 RSC 페이로드는 클릭 후에야 요청된다. Redis 조회+렌더 시간이 그대로 흰 화면으로 노출되는 구조.
  4. `loading.tsx`가 생기면 "레이아웃~첫 loading 경계"까지가 prefetch되고 클릭 즉시 스켈레톤이 그려진다. 부수 효과로 해당 경계의 클라이언트 캐시 TTL 30초가 붙는다.
  5. **prefetch 부작용 검토**: prefetch는 방문 전에 서버 렌더를 돌리므로 순수하지 않은 레이아웃/페이지는 부작용이 앞당겨진다. 본 저장소의 해당 후보는 `page.tsx`의 `auth()` → `redirect("/login")` 하나인데, prefetch는 응답을 캐시에 담을 뿐 라우터를 이동시키지 않고 `redirect()`는 제어 흐름이라 문서가 경고하는 부작용(분석 전송·로그·DB 쓰기)에 해당하지 않는다 → **차단 요인 없음**. 저장소에 분석/로깅 호출을 하는 레이아웃도 없음(확인 완료).
- **구현 계획 (파일 단위)**:
  1. `components/ui/PageSkeleton.tsx`(신규) — 공용 스켈레톤. Server Component(클라이언트 JS 0). props `variant: "dashboard" | "detail"` · `count` · `chart`. `role="status"`+`aria-label`로 스크린리더 대응, 내부 막대는 `aria-hidden`.
  2. `components/ui/PageSkeleton.module.css`(신규) — §6.4 페이지 골격 관례(`page > container > header/section`)와 §38·§39 여백 토큰(`--space-16` 컨테이너, `--card-padding` 카드)을 그대로 따라 **실제 화면과 같은 자리에 같은 크기**로 배치. shimmer 애니메이션은 `prefers-reduced-motion: reduce`에서 정지.
  3. `loading.tsx` 9개 신설 — 라우트 중첩 상속을 이용해 **파일 수를 최소화**한다:
     - `app/loading.tsx` — 홈(dashboard 변형, 카드 8). 하위 라우트 중 자기 `loading.tsx`가 없는 곳의 폴백도 겸함
     - `app/login/loading.tsx` — 홈 스켈레톤 상속을 끊는 최소 변형(데이터 없는 화면)
     - `app/indices/loading.tsx` — kospi·kosdaq·usdkrw·market·kospi-volatility·trade/[yyyymm] **6개를 한 파일로** 커버(전부 detail 골격)
     - `app/holdings/loading.tsx` — 목록·`[symbolCode]` 상세 2개 커버
     - `app/watchlist/loading.tsx` — 목록·`[symbolCode]` 상세 2개 커버
     - `app/hot-stocks` · `app/feeds` · `app/dividends` · `app/alerts`(dlq는 `app/loading.tsx` 폴백으로 충분하나 목록형이라 별도 검토) 각 1개
- **효과**: 동적 라우트가 prefetch 대상이 되어 클릭 시 흰 화면 대신 즉시 스켈레톤 → 최초 페인트가 서버 왕복 앞으로 당겨진다. 실제 데이터 도착 시각 자체는 변하지 않음(체감 개선이 목적).
- **범위 밖(후속 후보)**: `experimental.staleTimes.dynamic`(기본 0초 → 뒤로가기마다 전량 재요청)은 "얼마나 낡은 시세를 보여줄 것인가"라는 도메인 결정이 필요해 이번 Phase에서 제외. 목록 화면의 hover-prefetch 전환도 속도가 아닌 요청량 절감 사안이라 제외.
- **상태**: 구현 완료(2026-07-19) — 계획 1~3번 구현. lint·tsc·build 통과. research.md 갱신. 실제 화면 확인은 사용자 확인 대기.

---

### Phase 41 — 코스피/코스닥 상세 차트에 거래량 막대 추가 (2026-07-20, 계획)

- **요청 근거**: 사용자 요청 — 코스피/코스닥 상세 차트에 거래량 막대그래프 추가.
- **조사 결과 (2026-07-20, KIS 실측)**:
  1. **추가 API 호출이 불필요하다.** 이미 쓰는 `inquire-index-daily-price`(FHPUP02120000) **output2에 거래량·거래대금이 이미 들어온다** — `acml_vol`(거래량)·`acml_tr_pbmn`(거래대금)·`acml_vol_rlim`(거래량 비중). output1에는 `prdy_vol`·`prdy_tr_pbmn`(전일)도 포함.
  2. 응답은 **최근 100거래일**이 오는데 `KIS_HISTORY_POINT_COUNT = 7`로 잘라 저장 중이다. 차트 구간을 늘리려면 이 상수만 조정하면 되고 호출량은 불변.
  3. **KIS 단위는 천주/백만원**이다(원단위 아님). 같은 날(20260715) 대조 검증: KIS `prdy_vol=397854`(천주) ↔ 금융위 `trqu=397853705`(주), KIS `prdy_tr_pbmn=34488296`(백만원) ↔ 금융위 `trPrc=34488295746773`(원). 축 라벨·툴팁 포맷에 이 단위를 반영해야 한다.
  4. 원단위 정밀값이 필요하면 **금융위 지수시세정보**(`GetMarketIndexInfoService/getStockMarketIndex`)가 대안이며 **기존 `DATA_GO_KR_SERVICE_KEY`로 추가 신청 없이 즉시 동작함을 실측 확인**(`trqu`·`trPrc`·`lstgMrktTotAmt`, `beginBasDt`/`endBasDt` 구간 조회 지원). 다만 신규 클라이언트+갱신 잡이 붙는 부담 대비 차트 표시용으로는 이득이 없어 **KIS 유지로 확정**.
- **구현 계획 (파일 단위)**:
  1. `lib/api/kis/types.ts` — `KisIndexDailyOutput`에 `acml_vol`·`acml_tr_pbmn` 주석 필드 추가(현재 인덱스 시그니처로만 통과 중).
  2. `types/indices.ts` — `IndexChartPoint`에 `volume`·`tradeValue` 추가. 기존 스냅샷에는 없는 필드라 **`number | null`로 두고 첫 갱신 회차 전 호환**(§15·§30 신규 키 관례와 동일).
  3. `lib/indices/kisMapper.ts` — `parseNum` 경유로 두 필드 매핑(AGENTS.md §2 준수).
  4. `components/indices/IndexLineChart.tsx` — Recharts `LineChart` → `ComposedChart` 교체. 좌축 지수(`Line`)·우축 거래량(`Bar`, `yAxisId="volume"`), 거래량 축은 `domain={[0, dataMax*3]}`류로 눌러 지수선과 겹치지 않게. 툴팁에 거래량·거래대금 행 추가(단위 표기 필수, `.numeric`).
  5. `lib/format/` — 천주/백만원 → 사람이 읽는 단위(억/조) 포맷터. 기존 `format/trade.ts`(`formatUsdEok`) 패턴 참고.
- **범위 밖**: 차트 구간 7→N거래일 확대(별도 결정 사안), 일별 시세 리스트에 거래량 열 추가(토글 Phase와 함께 판단).
- **상태**: **Phase 50에 흡수·구현 완료(2026-07-23)** — 거래량 막대는 거래대금 토글과 함께 `ComposedChart`로, 일별 시세 거래량·거래대금 열은 `IndexDailyTable`로 구현됨.

---

### Phase 42 — 일별 기록 지수↔수급 토글 (2026-07-20 · **2026-07-22 재설계** — KIS 단독 확정)

- **요청 근거**: 사용자 요청 — 일별 기록에 토글을 넣어 지수/수급 전환, 수급 항목은 개인·외국인·기관(연기금·금투 등)·거래량·거래대금.

- **⚠️ 2026-07-22 정정 — KIS 단독으로 시장 전체 수급이 확보된다 (아래 2026-07-20 "확보 불가" 결론은 파라미터 오류였음)**:
  - 사용자가 키움 키를 발급한 뒤 KIS `FHPTJ04040000`을 다시 실측한 결과, **정합 파라미터 조합에서 코스피·코스닥 모두 실값이 정상 수신**된다. 이전 조사의 "48개 조합 전수 0"은 **`FID_INPUT_ISCD_2`를 시장 지수코드와 정합시키지 못한 파라미터 버그**였던 것으로 강하게 시사된다(현재도 어긋난 조합은 `rt_cd=0`이면서 전 필드 0을 반환함을 재현 확인).
  - **엔드포인트**: `GET /uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market`, `tr_id=FHPTJ04040000`, `custtype=P`. (경로는 KIS 공식 예제 `koreainvestment/open-trading-api`의 `inquire_investor_daily_by_market`에서 확인.)
  - **정합 파라미터 (핵심 — `FID_INPUT_ISCD_2`가 시장 지수코드와 일치해야 함)**:
    - 코스피: `FID_COND_MRKT_DIV_CODE=U` · `FID_INPUT_ISCD=0001` · `FID_INPUT_ISCD_1=KSP` · `FID_INPUT_ISCD_2=0001` · `FID_INPUT_DATE_1=FID_INPUT_DATE_2=YYYYMMDD`
    - 코스닥: `…ISCD=1001` · `ISCD_1=KSQ` · `ISCD_2=1001`
    - `ISCD_2`를 어긋나게 주면(예: 코스닥에 `0001`/`2001`) 응답은 성공(rt_cd=0)이나 **전 수급 필드가 0**으로 온다 — 2026-07-20 조사가 걸린 함정.
  - **응답 (2026-07-22 실측)**: 한 콜에 **지정일 기준 최근 300거래일** 일별 시계열(`output` 300행, `stck_bsop_date` 내림차순), 행마다 **39필드**. 각 투자자 주체별 **순매수 수량(`_ntby_qty`/`_vol`) + 금액(`_ntby_tr_pbmn`/`_pbmn`)** 양쪽 제공:
    - 지수 OHLC·등락 9필드(`bstp_nmix_*`, `stck_prdy_clpr`)
    - **개인** `prsn` · **외국인** `frgn`(+ 등록 `frgn_reg` / 미등록 `frgn_nreg`) · **기관계** `orgn`
    - **기관 세부 7종**: 금융투자 `scrt` · 투신 `ivtr` · 사모 `pe_fund` · 은행 `bank` · 보험 `insu` · 종금 `mrbn` · 연기금 `fund`
    - 기관계 밖 별도: 기타법인 `etc_corp` · 기타 `etc`/`etc_orgt`
  - **정합성 검증**: 코스피·코스닥 각 4거래일에서 **기관 세부 7종 순매수 합 = 기관계(±1, 천주 단위 반올림)** 일치 확인 → 값이 실데이터임을 교차검증. 값도 일자별로 변동(정적 더미 아님).
  - **결론**: 사용자가 원한 "개인·외국인·기관 + 기관 세부(연기금·금투 등)" 시장 전체 수급이 **KIS 단독으로, 코스피·코스닥 모두, 300거래일 히스토리까지** 확보된다. 아래 대안(키움/LS/코스콤)은 **전부 불필요** — 사용자 결정으로 **KIS 단독 진행 확정(2026-07-22)**. 키움 키는 본 Phase 설계에서 사용하지 않는다.
  - **단위 확정 (2026-07-23 실측 완료)**: 금액/수량 비율 역산으로 **수량 `_qty`=천주 · 금액 `_pbmn`=백만원** 확정(코스피·코스닥 각 3거래일, 비율 40~250 → 평균단가 15,000~230,000원/주로 실제 주가대와 정합. Phase 41 지수 거래량과 동일 단위). 화면은 원값(천주/백만원) 그대로 표시 — 변환 없음.

- ~~**조사 결과 (2026-07-20) — 공개 API 3종 모두에서 시장 전체 수급 확보 불가**~~ (위 2026-07-22 정정으로 **① KIS 항목은 무효**. 나머지 외부 소스 조사 기록은 이력 보존 목적으로 남김):
  1. ~~**KIS**: 시장별 투자자매매동향(일별) `FHPTJ04040000` … **전 필드 값이 0**…~~ → **정정됨**: 파라미터 정합 시 정상 수신(위 참조). 종목 단위 `FHKST01010900`은 개인/외국인/기관 3분류로 정상 동작(종목 상세용으로 별도 활용 가능).
  2. **KRX OpenAPI**(`data-dbg.krx.co.kr`): 키 없이도 401(존재)/404(부재)가 구분돼 카탈로그 확인 가능 — 투자자 관련 경로 후보 14종 **전부 404**. 공식 목록도 지수 5·주식 7·증권상품 3·채권 3·파생 6·일반상품 3·ESG 3 = **33종 전부 시세 계열, 투자자별 없음**.
  3. **data.go.kr 금융위**: 증권 계열 전체가 시세/기본정보뿐. 투자자별 거래실적 API **없음**.
  4. **KRX 웹 스크래핑(pykrx 방식)**: `getJsonData.cmd` 재시도 시 대조군까지 전부 `LOGOUT` 400 — 차단 상태이며 비공식 경로라 프로덕션 비권장.
- **더 이상 필요 없는 외부 대안 (이력 보존 — KIS 단독 확정으로 폐기)**: 키움 REST API(`ka10051`/`ka10058` 등), LS증권 OPEN API, 코스콤 오픈API. 이들은 KIS `FHPTJ04040000`이 0을 준다는 잘못된 전제에서 검토됐던 후보다.
- **구현 (KIS 단독 — 2026-07-23 완료)**:
  - `lib/api/kis/constants.ts` — `INVESTOR_DAILY_BY_MARKET` 엔드포인트·`tr_id`(`FHPTJ04040000`)·정합 파라미터(`KIS_INVESTOR_MARKET_PARAMS`: 코스피 `0001/KSP/0001`, 코스닥 `1001/KSQ/1001`)·표시 거래일 수(`KIS_INVESTOR_ROW_COUNT=20`) 상수.
  - `lib/api/kis/types.ts` — `KisInvestorDailyResponse`/`KisInvestorDailyOutput`(사용 10주체 순매수 금액 `_ntby_tr_pbmn` 필드).
  - `lib/api/kis/client.ts` — `fetchKisInvestorDaily(market)`. 화면·Server Action 직접 호출 금지 → **KIS 담당 잡(`refreshMarketData`) 경유**(AGENTS.md §2)로 Redis 스냅샷 적재.
  - `lib/indices/investorMapper.ts` — `mapKisInvestorRows`(최신순 20행, `parseNum`만; KIS가 부호 포함 반환이라 `applyKisSign` 불요).
  - `lib/market/store.ts` — `StoredInvestorFlows`·`market:investor:{kospi|kosdaq}` 키·`get/setInvestorFlows`.
  - `lib/format/krw.ts` — `formatNetBuyMillion`(백만원 부호 표기, 단위는 헤더).
  - `lib/jobs/refreshMarketData.ts` — `refreshInvestorFlows`(코스피·코스닥 각 1콜, **부수 데이터·실패 격리**로 합류). **신규 잡 없이 기존 잡 확장 → AGENTS.md §2 "6종" 불변.**
  - `lib/indices/getIndexDetail.ts` — 상세 데이터에 `investorRows` 병합(스냅샷 없으면 생략).
  - `components/indices/InvestorFlowTable.tsx`(+CSS) — 개인·외국인·기관계+기관 7종 순매수 금액 가로 스크롤 표(날짜 열 고정, 부호 색상). `IndexDetailScreen`에 "일별 수급" 섹션 추가(토글 대신 별도 섹션 — 사용자 확정).
- **표시 결정(사용자 확정, 2026-07-23)**: 단위는 원값 그대로 **천주/백만원**(만주·억 환산은 검토 후 철회), 탭 명칭 **"일별 수급"**, 표시는 **순매수 금액(백만원)**.
- **상태**: **구현 완료(2026-07-23)**. lint·tsc·build 통과. 최초 데이터는 다음 `refresh-market-data` 회차(KIS 시간창 내)에 시딩된다. Phase 41(거래량 차트)은 이 Phase와 무관하게 선행 가능.

---

### Phase 43 — 배당률 순위 (전 종목 TOP 100) + "배당 일정" → "배당" 개칭 (2026-07-20)

- **요청 근거**: 사용자 요청 — 배당 화면에 배당률 순위를 추가. 순위는 **전 종목 대상**, 표시는 **TOP 100**(그 이상은 불필요 — 사용자 확정).
- **개칭**: 순위 기능이 같은 화면에 붙으므로 "배당 일정"은 범위가 좁아짐 → 다른 메뉴(`보유종목`·`관심종목`·`핫종목`)와 결을 맞춰 **`배당`**으로 통일(사용자 확정). 페이지 내부 섹션 제목(`보유종목 확정 배당`)·`aria-label="배당 일정 목록"`은 실제로 일정 목록이라 유지 — 순위 섹션과 자연 구분된다.
- **조사 결과 (2026-07-20)**:
  1. **KIS 배당률 순위 API(`ranking/dividend-rate`, HHKDB13470100)는 탈락.** 이유 둘. ① **정렬 기준이 틀림** — 응답 `divi_rate`는 같은 예탁원(KSD) 계열인 배당일정 API와 필드명이 동일한데, 이 프로젝트가 이미 실측해 박아둔 주석이 **"액면가배당률(%) — 시가배당률 아님"**(`lib/api/kis/types.ts:195`)이다. 액면 기준 순위는 사용자가 기대하는 배당률 순위가 아니다(액면 500원·배당 250원이면 시가배당률 2%여도 액면 50%로 1위). ② **전 종목 커버리지 불확실** — `UPJONG`(업종구분)이 필수 파라미터라 업종 단위 스코프 가능성이 높고(공식 샘플조차 `GB1="0"`(전체)과 `UPJONG="0001"`(코스피 종합)을 동시에 넘기는 모순 조합), 무엇보다 **같은 계열인 등락률 순위(`FHPST01700000`)가 30건 고정·`tr_cont` 연속조회 미지원으로 실측된 전례**(§2026-07-14, `constants.ts:32`)가 있다. 공식 샘플의 연속조회 코드도 연속 키 `CTS_AREA`를 응답에서 받아 재전송하지 않고 최초값(공백)을 그대로 보내는 구조라 검증된 것으로 보기 어렵다.
  2. **채택: 전 종목 스캔 + 시가배당률 자체 계산** — Phase 14 핫종목 잡과 동일 패턴. 커버리지 100% 보장에 더해, 기존 종목 상세의 `annualDividendPerShare` 계산(`lib/holdings/stockInfo.ts:144`)과 기준이 완전히 같아져 **화면 간 숫자 불일치가 원천 소멸**한다(순위 API를 썼다면 남았을 문제).
  3. **유니버스는 KIS 호출 0건** — `fetchHotStockUniverse()`(`lib/hotstocks/universe.ts`)가 공개 마스터 zip에서 코드+종목명+시장을 ~2,650종목 주므로 종목명 조회가 불필요하다.
  4. **현재가는 멀티시세 1콜 30종목** — 관심종목(멀티종목) 시세조회 `FHKST11300006`(`/uapi/domestic-stock/v1/quotations/intstock-multprice`)이 `FID_COND_MRKT_DIV_CODE_1~30`으로 최대 30종목을 받고 `inter2_prpr`(현재가)를 준다. 2,650종목 = **89콜**.
  5. **10분 정기 잡 재사용 불가** — 정기 잡의 갱신 범위는 전 종목이 아니라 **전 사용자 보유+관심종목 union**(`refreshMarketData.ts:736`)이라 상위 100위(대부분 미보유 고배당주)는 거의 미스다. 다만 89콜은 전체 2,740콜의 3%라 최적화 가치가 낮아 **자체 확보로 확정**.
  6. **연속 배당 연수는 추가 콜 0건** — 예탁원 배당일정은 `F_DT`~`T_DT` 범위 조회라 종목당 1콜을 유지한 채 범위만 1년→10년으로 넓히면 된다(응답이 종목당 최대 40회차로 커질 뿐).
- **총 비용**: 배당 이력 2,650콜 + 현재가 89콜 ≈ **2,740콜, 15콜/초 스로틀로 약 3분**. 핫종목 잡과 동일 규모라 시간 예산 250초 + 커서 재개로 커버된다.
- **표시 컬럼 8종 (사용자 확정)**: 순위 · 종목명 · 현재가 · 배당률 · 주당배당금 · 지급 주기(`divi_kind`+회차 수) · 현금/주식(`stk_kind`) · 연속 배당 연수.
  - 8컬럼은 모바일 한 줄에 안 들어감 → **가로 스크롤**(사용자 확정, `overflow-x: auto` 순수 CSS). 순위·종목명 열은 `position: sticky; left: 0`으로 고정해 오른쪽 끝을 볼 때도 행 식별이 유지되게 한다.
- **미확정 (구현 중 방어적으로 처리)**: KIS 예탁원 배당일정의 **과거 조회 상한이 명세에 없다.** 10년을 요청해도 3년만 올 수 있으므로, 응답의 가장 이른 회차가 조회 시작일 경계에 닿으면 **상한에 걸린 것으로 보고 `yearsCapped: true`**를 세워 화면에서 "12년" 대신 **"10년+"**로 표기한다. 실측 없이도 양쪽 결과에서 옳게 동작한다.
- **구현 계획 (파일 단위)**:
  1. `lib/api/kis/constants.ts` — `MULTI_PRICE` 엔드포인트·TR_ID(`FHKST11300006`), 멀티시세 배치 크기 30, 배당 이력 조회 연수 10 상수.
  2. `lib/api/kis/types.ts` — `KisMultiPriceRow`(`inter_shrn_iscd`·`inter2_prpr`)·`KisMultiPriceResponse`.
  3. `lib/api/kis/client.ts` — `fetchKisMultiPrice(codes[])`(최대 30종목). 배당은 기존 `fetchKisDividends(code, from, to)` 그대로 재사용(범위만 넓게 전달).
  4. `lib/dividends/ranking/store.ts` — `market:dividendRanking`(TOP 100+`fetchedAt`)·`market:dividendRanking:progress`(커서). 공개 시세 기반이라 미암호화(핫종목과 동일).
  5. `lib/jobs/refreshDividendRanking.ts` — 핫종목 잡과 동형: 완료 가드(기준일 동일 시 no-op) → 유니버스 → **전 종목 현재가 89콜 선확보** → 커서 재개 → 종목당 배당 1콜 → 시가배당률 계산 → 상위 100 온라인 선택 → 시간 예산 250초 소진 시 progress 저장.
     - **구현 중 정정 (설계 결함)**: 초안은 "스캔 중엔 주당배당금 순으로 후보를 좁히고 TOP 100 확정 후 현재가 4콜만" 이었으나 **틀렸다.** 배당률 = 배당금 ÷ 현재가라 배당금만으로 상위를 고르면 **고가주에 편향**된다(50만원 주식의 1만원 배당 2%가 5천원 주식의 400원 배당 8%를 이김). 상위 N을 고르는 시점에 이미 현재가가 있어야 하므로 **스캔 시작 전에 전 종목 현재가를 받는다**(89콜, 계획 조사 결과 4와 동일).
     - 가격 스냅샷은 `progress.prices`에 함께 저장해 **분할 실행이 같은 기준을 공유**한다 — 이어받기마다 새로 받으면 앞뒤 회차의 배당률 기준이 달라져 한 순위표 안에서 정렬이 어긋난다. ~2,650종목 ≈ 50KB.
     - 현재가가 없는 종목(상장폐지·거래정지 등)은 배당 조회 자체를 건너뛴다 — 어차피 배당률을 계산할 수 없어 콜을 아낀다.
  6. `app/api/jobs/refresh-dividend-ranking/route.ts` — 핫종목 라우트와 동일 가드(`verifyJobRequest` + `isWithinKisCallWindow` + `force`), `maxDuration = 300`.
  7. `app/dividends/page.tsx` — 기존 "보유종목 확정 배당" 아래에 "배당률 순위 TOP 100" 섹션 추가. h1·metadata를 `배당`으로 개칭.
  8. `app/dividends/page.module.css` — 가로 스크롤 테이블 + sticky 2열.
- **범위 밖**: 순위 화면 현재가의 실시간(10분) 갱신 — 배당률이 현재가의 함수라 현재가만 갱신하면 배당률과 어긋나고, 배당률까지 재계산하면 순위가 역전되어 정렬이 뒤죽박죽으로 보인다. **산출 시점의 현재가·배당률·순위를 한 세트로 고정**하고 "마지막 갱신" 표시로 대체(기존 화면 관례와 동일).
- **운영 (사용자 수동 조치 필요)**: QStash 콘솔에 신규 스케줄 등록 — `/api/jobs/refresh-dividend-ranking`, 월 1회 권장(예: 매월 1~7일 11:05 KST, 핫종목 10:35와 어긋나게). 등록 전까지는 `CRON_SECRET` 수동 트리거(`?force=true`)로만 동작한다.
- **AGENTS.md 개정**: §2의 "QStash 갱신 잡 라우트는 4종" → **5종**(신규 라우트 추가). KIS 호출은 잡 경유만이라는 원칙 자체는 불변.
- **상태**: 구현 완료.

---

### Phase 44 — 배당률 순위 정교화 (비고 컬럼·평균간격 주기·액면분할 보정·폭배 DART) (2026-07-20)

- **요청 근거**: Phase 43 시딩 후 사용자 검증 중 4건 확정. 라이브 KIS/DART 실측으로 필드 의미·가용성을 전수 확인한 뒤 착수(구현 전 프로브 5종).
- **배경 실측 (라이브 확인 완료)**:
  1. **`stk_kind`는 "배당 형태"가 아니라 "주식 종류"** — 값이 `보통`/`우선`으로 옴(실측: 삼성전자우·현대차우·LG화학우·신영증권우 = `우선`, 보통주 = `보통`). 기존 `payoutForm`(현금/주식) 매핑은 오해였고 전 종목 "—"로 표시됐다. **현금/주식 병행 구분은 `stk_divi_rate`**(주식배당률 %)로 판정 — 실측: 미래에셋증권 2026-03 결산행 `per_sto_divi_amt=300`·`stk_divi_rate=0.73`(현금+주식 병행).
  2. **배당 주기(월/분기/반기/연)는 `divi_kind`로 불가** — 값이 `분기`/`결산`/`반기` 혼재라 주기를 못 가린다(연말 배당은 주기 무관하게 "결산"). **배당 기준일(`record_date`) 사이 평균 간격으로 판정** — 실측: SK하이닉스/POSCO/신한/KB(분기 4회)·LG/KT&G(반기 2회)·기아(연 1회) 전부 회차 수와 일치.
  3. **액면분할 착시** — 배당률 상위가 분할 종목으로 오염. 실측: INVENI(015360) 앱 38.74% → 배당 당시 액면가 5,000, **현재 액면가 1,000(5:1 분할)** → 5,400원은 구주 기준, 신주 환산 1,080원 → 실제 7.75%. 대한제분(001130)도 5,000→500(10:1). 분할은 **마지막 배당락 이후** 발생해 배당 이력의 `face_val`엔 안 잡히고 현재가만 반영돼 생기는 **분모·분자 기준 불일치(계산 오류)**. 멀티시세엔 액면가 없음(실측) → **현재 액면가는 주식기본조회(CTPF1002R `papr`) 별도 1콜** 필요.
  4. **폭배(비경상 급증)** — 분할 아님(액면가 불변)인데 전년 대비 배당이 급증하는 케이스. 실측: 이지홀딩스(035810) 250→1,361원(5.4배), 기준일이 12월→3월로 이동(2025-12 자리 0원 placeholder)해 **결산기 변경 정황**. KIS `divi_kind`엔 "특별" 구분이 없어(실측: 분기/결산/반기 3종뿐, 현대차 2024 특별배당분도 "결산") **경상/특별 분리는 원리적으로 불가** → 값 보정 대신 **감지·표기**만 한다.
- **확정 결정 (사용자)**:
  - **① 비고 컬럼 신설·"배당 형태" 컬럼 제거** — 특이사항 있을 때만 채우고 평범하면 빈칸. `우`(우선주) · `현+주0.75%`(주식배당 병행) · `폭배`(비경상 급증). 여러 개는 `·`로 이어 붙임(예: `우 · 현+주0.75% · 폭배`).
  - **② 지급 주기 = 배당 기준일 평균(중앙값) 간격** — ≤45일 월 · ≤135일 분기 · ≤270일 반기 · 그 외 연.
  - **③ 액면분할 보정(A안)** — 배당률 상위 이상치(>12%)만 현재 액면가 조회 → `분할비율 = 배당당시 액면가 ÷ 현재 액면가`로 주당배당금·배당률 재계산(`splitAdjusted`). 정확한 계산 오류 교정.
  - **④ 폭배 감지 + DART 연동(B안)** — 전년 대비 급증(직전 정상연도 중앙값의 ≥3배·직전 2년 이상 존재) 감지. 최종 TOP 100 중 폭배 종목만 corp_code 매핑 → **현금·현물배당결정 공시** 검색·본문 파싱(표준 서식) → 비고 `폭배`에 DART 원문 딥링크 + 수치 요약(주당배당금·공식 시가배당율·기준일). 실측 파싱 성공: 이지홀딩스 rcpt 20260220900866 → 주당 1,361원·시가배당율 23.8%·기준일 2026-03-10.
- **정확도·한계 (박제)**:
  - 폭배는 원인(특별배당/결산기 변경/영구 증배)까지 자동 판별하지 못한다 — "비경상 급증" 사실만 표기하고 원인은 DART 원문으로 넘긴다. 임계값(3배)은 튜닝 대상.
  - 평균 간격 주기는 배당 기준일이 12개월 롤링 경계에 걸리면 회차가 ±1 흔들릴 수 있어(실측: 삼성전자 분기인데 최근1년 3회) 회차 수 대신 **간격 중앙값**을 쓴다.
  - DART 공식 시가배당율(23.8%)과 앱 배당률(31%)은 분모(KRX 기준가 vs 산출 시점 현재가)가 달라 다르다 — 순위는 전 종목 일관성 위해 앱 방식 유지, DART값은 폭배 툴팁에 참고로 병기.
- **구현 계획 (파일 단위)**:
  1. `lib/api/kis/types.ts` — `KisStockBasicInfoResponse.output.papr`(액면가) 추가.
  2. `lib/api/kis/client.ts` — `fetchKisStockFaceValue(code)`(CTPF1002R `papr`, 분할 보정용 1콜).
  3. `lib/api/dart/client.ts` — `fetchDartDividendDecision(corpCode, {bgnDe,endDe})`: list.json에서 "현금·현물배당결정"(본사) 찾기 → `document.xml`(zip) 받아 태그 제거 후 표준 서식 파싱(주당배당금·시가배당율·기준일). `fetchDartDocumentText` 헬퍼.
  4. `lib/dividends/ranking/store.ts` — 엔트리에서 `payoutForm`/`DividendPayoutForm` 제거. `payoutCycle`을 `"월"|"분기"|"반기"|"연"|null`로 변경. `preferred`·`stockDividendRate`·`splitAdjusted`·`surge`(DART 수치)·`surgeCandidate`·`dividendFaceValue` 추가.
  5. `lib/jobs/refreshDividendRanking.ts` — `buildEntry`에 우선주·주식배당률·평균간격 주기·폭배 후보·액면가 산출 추가. 온라인 선택 버퍼를 TOP 100 → **500으로 확대**(분할 보정으로 상위가 강등돼도 진짜 상위가 버퍼에 남게). 완료 시 finalize: 이상치(>12%) 액면가 조회로 분할 보정 → 재정렬·TOP 100 절단 → 폭배 종목 DART enrichment. corp_code 맵은 폭배 있을 때 1회 다운로드.
  6. `lib/dividends/ranking/summary.ts` — `formatPayoutForm` 제거. `formatPayoutCycle`을 라벨 직접 반환으로 변경. `stockDividendLabel`·`dartDisclosureUrl`·`surgeTooltip` 추가.
  7. `app/dividends/page.tsx` — "배당 형태" 컬럼 제거, 맨 끝 "비고" 컬럼 추가(우·현+주·폭배 링크). 배당률 셀에 `splitAdjusted` 시 title 표기. 각주에 비고·분할 보정 설명 추가.
  8. `app/dividends/page.module.css` — 비고 셀·DART 링크 스타일.
- **아키텍처 메모**: 원래 KIS 담당인 `refresh-dividend-ranking` 잡의 finalize 단계에서 **폭배 한정 DART 호출**이 섞인다(소수라 비용 작음). 헌법 §2 "KIS 호출은 잡 경유" 원칙은 유지되며, DART는 원래 무제약(feeds와 동일).
- **상태**: 구현 완료.

### Phase 45 — 배당률 순위 표를 핫종목 순위 폼과 통일 (스타일 통일·종목명 링크 제거·시장 위첨자) (2026-07-20)

- **요청 근거**: 배당 화면 "배당률 순위" 표의 시각 폼을 핫종목 순위 표와 통일하고 싶다는 사용자 요청. 확인 결과 배당 고유 8열(순위·종목명·현재가·배당률·주당배당금·지급주기·연속배당·비고)은 유지하고 **스타일만** 핫종목과 맞추는 방향(옵션 1)으로 확정. 6열 완전 동일화(옵션 2)는 배당 고유 정보를 버려야 해 기각.
- **확정 결정 (사용자)**:
  - **① 스타일만 통일, 열 구성 유지** — 헤더 가운데 정렬·`--text-micro`/medium/tertiary 톤, 값 기본 가운데+숫자 열만 우측(`.numCell`)·종목명/비고 좌측 등 핫종목 `page.module.css` 관례를 배당 표에 이식. 8열이라 sticky(순위·종목명) 가로 스크롤 폼은 그대로 유지(핫종목 6열 `table-layout: fixed`는 미적용 — 열 수가 달라 그대로 못 옮김).
  - **② 종목명 링크 제거** — 기존 `/watchlist/[code]` 링크가 관심종목으로 이동해 맥락상 의미 없다는 판단. 핫종목처럼 순수 텍스트로 변경(`.rankName` 제거).
  - **③ 시장 위첨자 추가** — 핫종목 목록처럼 종목명 뒤 ᴷ(코스피)/ᴰ(코스닥) 위첨자. **`DividendRankingEntry.market`(`"KOSPI"|"KOSDAQ"`)이 이미 저장돼 있어** 핫종목 당일/주간 뷰의 `loadMarketByCode`(stockMaster 재조회) 없이 `entry.market` 직접 사용 — 핫종목 월간 뷰와 동일한 상황.
- **구현 계획 (파일 단위)**:
  1. `app/dividends/page.tsx` — 핫종목과 동형의 `MARKET_SUP` 상수 도입. 종목명 셀에서 `<Link>` 제거 → `.nameText`(ellipsis, `title`) + `.marketSup`(ᴷ/ᴰ) + `.srOnly`(스크린리더용). 숫자 열(현재가·배당률·주당배당금·연속배당)에 `.numCell` 부여.
  2. `app/dividends/page.module.css` — `.rankTable` 헤더/값 정렬·톤을 핫종목 관례로 재정비, `.numCell`·`.nameText`·`.marketSup`·`.srOnly` 추가, 미사용된 `.rankName` 제거. `.tableScroll`·sticky·`.rankYield`·`.adjMark`·`.remarkCell`·`.dartLink`는 유지.
- **범위 밖**: 종목코드 별도 열(핫종목엔 있으나 배당 8열엔 없음 — 추가 안 함), 핫종목 `table-layout: fixed` 열 폭 고정(열 수가 달라 미적용), 배당률 방향 색상(배당률은 항상 양수라 무의미).
- **상태**: 구현 완료.

---

### Phase 46 — 배당률 순위 「일반종목 / 배당상품」 2탭 + 유니버스 확장(ETF·리츠·인프라펀드) (2026-07-20, 계획)

- **요청 근거**: 사용자 요청 — 배당률 순위 목록에 탭을 추가해 **일반종목**과 **배당상품**(ETF·리츠·인프라펀드 등)을 나눠 보고 싶다. 사용자가 예로 든 `ACE 리츠부동산인프라액티브 월배당`처럼 **월배당 가능 종목 + 같은 유형**을 함께 확인하려는 의도. 탭 구성은 조사 후 **일반종목 / 배당상품 2탭**(배당상품 = 지급주기 무관 전부 포함)으로 확정.
- **조사 결과 (2026-07-20, 라이브 실측 — Redis 읽기 + KIS/마스터 조회)**:
  1. **`ACE 리츠부동산인프라액티브`(단축코드 `0153P0`)는 증권그룹코드 `EF`(ETF)** — 현재 유니버스 `fetchHotStockUniverse`가 `groupCode === "ST"`(주권)만 남기므로(`lib/hotstocks/universe.ts`) **처음부터 스캔 대상이 아니다.** 현재 순위에 없는 게 구조상 확정.
  2. **현재 TOP 100에 `payoutCycle === "월"` 종목이 0개** (Redis `market:dividendRanking` 실측, computedFor 2026-07-20, universeCount 2646). → **기존 데이터를 필터만 하는 안(A안)은 지금 빈 탭이 된다** → 유니버스 확장이 필수.
  3. **현재 유니버스는 배당상품을 전부 누락** — 실측 그룹코드: 롯데리츠(330590)·신한알파리츠(293940)·제이알글로벌리츠(348950) = **`RT`(리츠)**, 맥쿼리인프라(088980) = **`IF`(인프라펀드)**, ETF 전부 = **`EF`**. 즉 리츠·인프라펀드·ETF가 모두 ST가 아니라 현재 순위에서 빠져 있다(현 순위는 순수 보통주/우선주뿐).
  4. **예탁원 배당일정 API(`ksdinfo/dividend`, HHKDB669102C0)가 ETF·펀드 분배금을 주식과 동일 스키마로 반환** (실측: `0153P0` 5건·매월 말 record_date·주당 54원, `329200` TIGER 리츠부동산인프라 30건·매월 33원). 필드(`record_date`·`per_sto_divi_amt`·`face_val`·`stk_kind` 등)가 주식과 동일해 **기존 `fetchKisDividends` + `buildEntry` + `derivePayoutCycle` 로직을 그대로 재사용 가능**(새 API·데이터 소스 불필요). ETF는 `divi_kind`가 비어 오지만 주기 판정은 이미 기준일 간격 기반이라 자동으로 "월" 처리된다.
  5. **그룹코드 분포 실측** (마스터 zip): ST 2719 · EF 1147 · RT 23 · IF 2 · EN 386(ETN) · 기타. **배당상품 후보 = EF+RT+IF ≈ 1,172종.** ETN(`EN`)은 채무증권 성격이라 이번 범위에서 제외.
- **확정 결정 (사용자)**: **일반종목 / 배당상품 2탭.** 배당상품 = `EF`+`RT`+`IF` 그룹, **지급주기 무관 전부**(월배당뿐 아니라 분기·반기 리츠·인프라펀드 포함 — "같은 유형" 요구 충족).
- **설계 쟁점 (구현 시 반드시 처리)**:
  1. **⚠️ 유니버스 함수 공유** — `fetchHotStockUniverse`는 배당률 잡뿐 아니라 **핫종목 잡 + 종목명 검색(`market:stockMaster`, `refreshStockMaster`)** 3곳이 공유한다. 여기서 `"ST"` 필터를 바꾸면 핫종목·검색까지 ETF로 오염된다. → **기존 함수는 불변으로 두고**, 배당률 잡 전용 유니버스(그룹코드 파라미터화 `fetchUniverse(groups[])` 또는 신규 `fetchDividendUniverse`)를 추가한다. 구현 중 어느 형태로 갈지 확정.
  2. **카테고리별 독립 TOP N** — 현재 TOP 100 단일 버퍼. 2탭이면 배당상품이 일반종목에 묻히지 않게 **카테고리별 독립 버퍼·finalize·TOP 100**(일반 100 + 배당상품 100)으로 나눈다. `DividendRankingEntry`에 유형 구분 필드(`instrumentType: "stock" | "fund"` 또는 그룹코드) 추가. `StoredDividendRanking`도 두 목록을 담도록 확장(구 스키마 하위호환 고려).
  3. **주식 전용 로직의 배당상품 예외**:
     - **액면분할 보정**(`SPLIT_CHECK_YIELD` 12%, Phase 44)은 ETF/펀드에 부적절(액면분할 개념이 주식과 다름) → 배당상품엔 스킵하거나 별도 처리.
     - **폭배(surge)·우선주(preferred) 비고**는 펀드에 무의미 → 배당상품 탭 비고 컬럼 의미 재정의(또는 비움).
     - **"시가배당률"** 명칭 — ETF는 사실상 "분배율" → 배당상품 탭 각주 문구 조정.
  4. **콜 예산** — +1,172종 → 가격 선확보 +~40콜(멀티시세 30/콜), 배당 스캔 +~78초(15콜/초). 기존 250초 시간 예산 + `progress` 이어받기 설계로 흡수되나 실측 튜닝 필요. QStash 스케줄·잡 라우트 구조는 불변(같은 `refresh-dividend-ranking` 잡이 두 카테고리를 함께 계산).
  5. **화면** — `app/dividends/page.tsx`에 서버 모드 탭 추가(핫종목 `?mode=` 서버 탭 패턴 재사용), 배당률 순위표를 2탭으로. 기존 8열 폼(Phase 45 통일)은 일반종목 탭에 그대로 유지.
- **구현 결정 (2026-07-20 반영)**:
  1. **유니버스 확장 방식** — 그룹코드 파라미터화. `parseMasterRecords(records, market, allowedGroups)` + 내부 `fetchUniverse(groups)`로 리팩터링하고, 공개 함수 2종만 노출: `fetchHotStockUniverse`(ST-only, 불변) · **신규 `fetchDividendRankingUniverse`**(ST+EF+RT+IF를 **한 번의 다운로드로** 받아 코드 오름차순). `UniverseStock`에 `group: UniverseGroup`(`"ST"|"EF"|"RT"|"IF"`) 추가, 배당상품 그룹은 `DIVIDEND_PRODUCT_GROUPS`(EF/RT/IF) 상수로. 마스터 다운로드는 한 번만.
  2. **카테고리별 독립 TOP N** — 잡이 `isFundStock(stock)`(group∈EF/RT/IF)으로 `entries`(일반)·`productEntries`(배당상품) 두 버퍼에 분기 offer, 각각 독립 finalize·TOP 100. `DividendRankingEntry`에 `instrumentType: "stock"|"fund"` 추가. `StoredDividendRanking`은 `entries`/`universeCount`(일반, 하위호환) + `productEntries?`/`productUniverseCount?`(배당상품, 구 스키마 `?? []`·`?? 0` 폴백). `DividendRankingProgress`는 `productEntries` 추가 — 구 progress(필드 없음)는 이어받기 무효 처리 후 처음부터.
  3. **주식 전용 로직의 배당상품 예외** — 배당상품은 `buildEntry`에서 `preferred`·`stockDividendRate`·`surgeCandidate`를 강제 비활성(`fund ? … : …`), `finalizeEntries(entries, computedFor, isFund)`에서 `isFund=true`면 액면분할 보정①·폭배 DART③을 스킵(정렬②·순위④만). → 배당상품 탭 비고는 자연히 항상 "—".
  4. **화면** — `app/dividends/page.tsx`에 `?mode=`(stock/product) 서버 탭(`RANK_MODES`) 추가, 핫종목 탭 CSS(`.tabs/.tab/.tabActive`)를 `dividends/page.module.css`에 이식. 기존 8열 폼 그대로 두 탭 공용, 대상 수 문구·빈 안내만 탭별로.
  5. **재시딩 편의** — `?force=true` 수동 트리거가 시간창뿐 아니라 **완료 가드까지 우회**하도록 `refreshDividendRanking(trigger, { force })`로 전달. 같은 기준일에 키 삭제 없이 재계산 가능(구 스키마 데이터를 새 2탭 스키마로 갈아끼울 때 사용). 진행 중 `progress`는 그대로 이어받아 여러 번 호출 시 커서부터 완주.
- **검증**: tsc·lint·`npm run build` 통과. QStash 스케줄·잡 라우트 구조 불변(같은 `refresh-dividend-ranking` 잡이 두 카테고리 동시 산출).
- **범위 밖**: 배당상품 **유형별 세부 그룹핑**(리츠/인프라/월배당 하위 분류) — ETF 종목명에 깔끔한 유형 코드가 없어 이름 휴리스틱이 필요하다. 이번엔 단일 "배당상품" 탭으로 통합하고, 세분화는 후속 과제로 남긴다. ETN(`EN`) 포함도 범위 밖. "시가배당률" 명칭은 이번엔 공용 각주 유지(배당상품 전용 "분배율" 문구는 후속).
- **상태**: 구현 완료(tsc·lint·build 통과), 커밋·푸시 대기.

---

### Phase 47 — 배당 페이지 3탭 통합(일반종목/배당상품/내 배당) + 지급일 파싱 버그 수정 (2026-07-20)

- **요청 근거**: 사용자 — 재시딩 후 배당 페이지에 ① 배당률 순위표와 ② 보유종목 확정 배당 목록이 **따로 스크롤돼 보기 불편**하다. 순위 2탭(일반종목/배당상품)에 개인 일정을 세 번째 탭으로 합쳐 한 탭 바로 통합해 달라. 추가로 확정 배당 목록의 종목명 링크가 목록 터치 시 원치 않게 눌린다 → 링크 제거. 그리고 **삼성전자·현대차·미래에셋 등 지난 배당까지 전부 "지급일 미정"으로 뜨는 문제** 확인 요청.
- **지급일 미정 원인 (2026-07-20 KIS 라이브 실측)**: 예탁원 배당일정 API(HHKDB669102C0)는 지급일을 정상 반환하나 **같은 응답 안에서 필드마다 날짜 포맷이 다르다** — `record_date`="20260331"(8자리)인데 `divi_pay_dt`="2026/05/29"(슬래시 `YYYY/MM/DD`). 삼성전자 3회차·현대차 4회차·미래에셋증권 1회차 모두 `divi_pay_dt`에 슬래시 날짜가 실려 옴을 확인. `stockInfo.ts`의 `toIsoDate`가 `/^\d{8}$/`(순수 8자리)만 통과시켜 **슬래시 지급일을 전부 null로 떨어뜨려** 화면·홈 카드·지급일 알림에서 확정 지급일까지 "미정"으로 표시됐다(소스 한계도 필드 매핑 오류도 아닌 파싱 버그). 주당배당금 0인 최신 미확정 회차만 `divi_pay_dt=""`로 와 정상적으로 미정.
- **구현**:
  1. `lib/holdings/stockInfo.ts` — `toIsoDate`를 **구분자 제거(`replace(/\D/g,"")`) 후 8자리 판정**으로 수정(슬래시·비슬래시 둘 다 처리, `record_date`엔 무영향). 요약 `lastPayDate`도 구 `/^\d{8}$/` 필터 대신 같은 정규화로 산출(주식 상세 배당 블록 "최근 지급일"도 같은 버그로 항상 비어 있었음 — 함께 해소). **데이터는 다음 정보 블록 갱신(장 마감 후 confirmedRound 재조회 또는 `?force` 재시딩) 시점에 채워짐** — `rounds`를 통째로 덮어쓰는 구조라 배포만으로 소급되진 않음.
  2. `app/dividends/page.tsx` — 기존 2섹션(확정 배당 목록 + 순위 2탭)을 **헤더 아래 단일 탭 바 `DIVIDEND_TABS`**(`?mode=stock|product|schedule`, 기본 stock)로 통합. 순위 메타는 `RANK_META`로 분리. 활성 탭에 필요한 데이터만 로드(순위 탭=`getDividendRankingView`, 내 배당 탭=`getDividendSchedule`), **각주도 탭별로 분기**(순위 2건 vs 예상액·세전 1건). "내 배당" 탭의 **종목명 링크 제거**(`<Link>`→`<span>`, 오터치 방지).
  3. `app/dividends/page.module.css` — `.itemName`의 링크용 `text-decoration`·`:hover` 제거, 탭 주석을 3탭으로 갱신.
- **탭 이름**: 세 번째 탭은 개인 보유 기준임을 드러내려 **"내 배당"** 채택(사용자 결정 — "배당일정"은 순위 탭과 개인/전체 구분이 약해 탈락).
- **검증**: tsc·lint 통과. KIS 실측은 읽기 전용 일회성 스크립트(스크래치패드, 커밋 안 함)로 확인.
- **범위 밖**: `getDividendCardSummary`(홈 배당 카드)·`evaluateDividendAlerts`(지급일 당일 알림)는 같은 `rounds.payDate`를 읽으므로 파싱 수정으로 자동 정상화 — 별도 코드 변경 없음.
- **상태**: 구현 완료(tsc·lint 통과), 커밋·푸시 대기.

---

### Phase 48 — 동적 라우트 클라이언트 캐시 TTL 도입(`staleTimes.dynamic = 30`) (2026-07-20)

- **요청 근거**: Phase 40에서 후속 후보로 남겨둔 2건 중 하나. Phase 40으로 `loading.tsx`가 붙어 동적 라우트가 prefetch 대상이 됐으나, `staleTimes.dynamic` 기본값이 0초라 **뒤로가기/재방문마다 전량 서버 재요청**이 발생. "얼마나 낡은 시세를 재사용할지"를 결정해 캐시 TTL을 도입.
- **결정 근거**: 시세 원본이 QStash 갱신 잡으로 **10분마다만 갱신**되므로, 화면 숫자는 원래도 최대 10분 낡은 스냅샷이다. 30초 캐시의 신선도 손실은 사실상 0(같은 10분치 스냅샷 재사용)이고, 뒤로가기 시 Redis 조회+렌더 왕복을 건너뛰어 즉시 전환된다. 실시간 틱 원본이 아니므로 안전. `static`은 기본값(5분) 유지.
- **구현**: `next.config.ts`에 `experimental.staleTimes.dynamic: 30` 추가(`node_modules/next/dist/docs/.../staleTimes.md` 형식 확인). 한 줄 config 변경.
- **검증**: lint·tsc·build 통과(config 경고 없음).
- **범위 밖**: 목록 화면 hover-prefetch 전환(속도가 아닌 요청량 절감 사안)은 여전히 후속 후보로 유지.

---

### Phase 49 — 고아 종목 키 정리 잡 (매일 03:00 KST GC) (2026-07-20)

- **요청 근거**: Phase 17-2 백로그. `market:stock:{code}` 계열 per-종목 키는 "전 사용자 보유+관심 합집합"으로만 생성되는데(refreshMarketData/refreshFeeds), 어떤 사용자도 더 이상 갖지 않게 된 종목의 키는 갱신 잡이 다시 쓰지 않아 **고아로 남아 누적**된다. 안전하게 수거하는 GC 잡을 도입.
- **조사 결과 (2026-07-20)**:
  1. **고아 판정이 정확히 가능** — `market:stock:*` 유니버스는 코드상 정확히 `unionSymbolCodes(collectHoldings, collectWatchlists)` 하나이고, 소비처 3곳(보유·관심·피드 알림 warnCodes)도 전부 같은 합집합. 숨은 소비처 없음.
  2. **전 사용자 열거가 쉬움** — 사용자 목록은 `getAllowedEmails()`(ALLOWED_EMAILS)로 고정된 소수 allowlist. 기존 `collectHoldings/collectWatchlists/unionSymbolCodes` 재사용.
  3. **기존 키 나열 가능** — Upstash `@upstash/redis` v1.38 `redis.scan(cursor, {match, count})` 지원(`market:stock:*`는 `market:stockInfo:*`와 안 겹침). `del(...keys)` 다중 키 지원.
  4. **새벽 3시 스케줄 가능** — QStash `CRON_TZ=Asia/Seoul` cron. KIS 미호출이라 시세 호출창(09:00~18:40) 가드 무관.
- **결정 (사용자 승인 2026-07-20)**:
  - **동반 키 일괄 삭제**: 고아 종목의 per-종목 키 7종을 함께 삭제 — `market:stock`·`market:stockInfo`·`stock:{code}:history`·`market:disclosures`·`market:news`·`alerts:disclosure:last`·`alerts:marketwarn:last`. 각 키 빌더를 소유 store에서 export해 재사용(포맷 드리프트 방지). **제외**: `alerts:dividend:sent:{code}:{payDate}`는 payDate 복합 키 + 자체 TTL(2일)로 자동 정리되므로 대상 아님.
  - **대량 삭제 방어**: 허용 이메일 전체의 보유·관심 읽기가 하나라도 실패하거나(watchlist는 results.ok, holdings는 읽힌 수≠허용 수로 판정) 허용 이메일이 0이면 이번 회차 삭제 통째 skip(`ok:true, skipped`). 일시 장애로 "살아있는 집합"이 비어 전 종목을 지우는 참사 방지.
  - **경합 허용**: 정리 직후 재추가되면 다음 거래일 시세 잡이 스냅샷 복구. 그 사이 "데이터 없음" 표시일 뿐 오작동 아님.
- **구현**:
  1. `lib/market/store.ts`·`lib/holdings/stockHistory.ts`·`lib/alerts/store.ts` — 종목별 키 빌더 export(+`STOCK_KEY_PREFIX`).
  2. `lib/jobs/cleanupOrphanStocks.ts`(신규) — 살아있는 집합 계산 → 방어 가드 → `market:stock:*` SCAN → 고아 산출 → 패밀리 `del`. 리포트(live/scanned/orphan/deletedKeys).
  3. `app/api/jobs/cleanup-orphan-stocks/route.ts`(신규) — `verifyJobRequest` 인증, KIS 시간창 가드 없음, `ok?200:500`.
  4. `AGENTS.md` §2 — 잡 라우트 5종 → **6종** 개정(cleanup-orphan-stocks는 KIS 미호출 정리 잡 명기).
- **검증**: lint·tsc·build 통과, 새 라우트 등록 확인.
- **운영 남은 일**: QStash에 `0 3 * * *`(`CRON_TZ=Asia/Seoul`) 스케줄을 `/api/jobs/cleanup-orphan-stocks`로 사용자 등록 필요(다른 잡과 동일 방식).

---

### Phase 50 — 상세 화면 탭(일별 시세/수급/종목별 순위) + 거래량 열·차트 막대 + 억/만원 표기 (2026-07-23, 구현 완료)

- **요청 근거**: 사용자 요청 — ① 일별 시세와 일별 수급을 **탭**으로 나란히, ② 탭 하나 더 추가해 **종목별 수급 순위**, ③ 일별 시세에 **거래량·거래대금 열** 추가, ④ 모든 금액을 **억/만원 한글 표기**(상위 2단 축약), ⑤ 차트에 **거래량/거래대금 막대 토글**. Phase 41(거래량 차트) 계획을 흡수한다.
- **조사·결정 (2026-07-23 실측)**:
  - **종목별 수급 순위**: `GET /uapi/domestic-stock/v1/quotations/foreign-institution-total`, `tr_id=FHPTJ04400000`. `FID_COND_MRKT_DIV_CODE=V`·`FID_COND_SCR_DIV_CODE=16449`·`FID_INPUT_ISCD`(코스피 0001/코스닥 1001)·`FID_ETC_CLS_CODE`(외국인 1/기관 2)·`FID_RANK_SORT_CLS_CODE`(순매수상위 0/순매도상위 1). **1콜 상위 30종목**이 상한. 행마다 종목명·코드·현재가·등락률 + 투자자별 순매수 수량(주)·금액(백만원). 정렬 지표 `ntby_qty`는 조회 그룹의 순매수 수량과 일치, 순매도상위는 값이 음수. 외국인=`frgn_*`, 기관=`orgn_*` 필드 사용(4변형 전부 실측).
  - **거래량·거래대금**: 기존 `FHPUP02120000` output2에 `acml_vol`(천주)·`acml_tr_pbmn`(백만원) **이미 포함** — 추가 콜 없음(Phase 41 조사 확정).
  - **결정(사용자 확정)**: 투자자 그룹 **외국인+기관 둘 다**, 정렬 **순매수+순매도 둘 다**(그래서 시장당 4콜), 열 구성 **순위·종목명·현재가·등락률·순매수수량·순매수금액**. 금액 표기 **상위 2단 축약**(`12조 3457억원`, `1억 1000만원`). 거래량 표시 **만주/억주**(저장은 천주 원값). 차트 막대 **거래량/거래대금 토글**. 탭 빈 상태는 **B안(탭 항상 노출 + "준비 중")**.
- **구현 (KIS 단독)**:
  - `lib/api/kis/constants.ts` — `FI_TRADE_RANKING` 엔드포인트·`tr_id`(FHPTJ04400000)·`KIS_FI_RANKING_ISCD`·`KIS_FI_RANKING_SIZE(30)`.
  - `lib/api/kis/types.ts` — `KisIndexDailyOutput`에 `acml_vol`·`acml_tr_pbmn` 필드, `KisFiTradeRanking{Output,Response}`.
  - `lib/api/kis/client.ts` — `fetchKisFiTradeRanking(market, group, sort)`. 잡 경유만(AGENTS.md §2).
  - `lib/indices/kisMapper.ts` — `mapKisHistory`/`mapKisDailyRows`에 거래량·거래대금 매핑.
  - `lib/indices/fiRankingMapper.ts`(신규) — `mapKisFiRankingRows`(상위 30, 빈 응답도 throw 안 함 — 8콜 격리).
  - `lib/market/store.ts` — `StoredFiRanking`·`market:fiRanking:{kospi|kosdaq}` 키·`get/setFiRanking`.
  - `lib/jobs/refreshMarketData.ts` — `refreshFiRanking`(시장당 4콜, **부수 데이터·실패 격리**로 합류). **신규 잡 없이 기존 잡 확장 → 6종 불변.**
  - `lib/indices/getIndexDetail.ts` — 상세 데이터에 `fiRanking` 병합(없으면 생략).
  - `lib/format/krw.ts` — `formatEokFromMillion`(백만원→조/억/만원 상위 2단, signed)·`formatSharesKo`(주→억/만/주 2단)·`formatEokAxis`/`formatSharesAxis`(차트 축 초압축). `formatNetBuyMillion` 제거(대체).
  - `types/indices.ts` — `IndexChartPoint`/`IndexDailyRow`에 `volume`·`tradingValue`, `FiFlowStock`/`FiFlowDirectionLists`/`FiFlowRanking`, `IndexDetailData.fiRanking`.
  - `components/indices/` — `DetailTabs`(+CSS, 얇은 클라이언트 탭 래퍼, 서버 컴포넌트를 panel로 전달)·`IndexDailyTable`(+CSS, 거래량·거래대금 열)·`FiRankingTable`(+CSS, 외국인/기관·순매수/순매도 토글, 클라이언트)·`IndexLineChart`(ComposedChart 전환 + 막대 토글)·`InvestorFlowTable`(억/만원 포맷)·`IndexDetailScreen`(국내는 3탭, 해외는 기존 단일 목록).
- **아키텍처 준수**: KIS 직접 호출은 잡 경유만(화면은 Redis 스냅샷만 읽음), 신규 라우트 없이 잡 6종 불변. 탭 래퍼는 서버 컴포넌트를 props로 감싸므로 표는 서버 렌더 유지.
- **표시 결정 정정**: Phase 42에서 "천주/백만원 원값 표시"였던 것을, 사용자 재요청으로 **금액은 억/만원(상위 2단), 수량은 만주/억주** 한글 표기로 변경(저장은 원값 유지, 렌더 시 변환).
- **상태**: **구현 완료(2026-07-23)**. lint·tsc·build 통과. 종목별 순위 최초 데이터는 다음 `refresh-market-data` 회차(KIS 시간창 내)에 시딩된다.

---

### Phase 51 — 배당률 순위 종목명 클릭 시 지난 배당 기록 펼침 (2026-07-23, 구현 완료)

- **요청 근거**: 사용자 요청 — 홈 배당 상세의 배당률 순위(일반종목·배당상품)에서 **종목명을 클릭하면 지난 배당금 기록이 아래로 펼쳐지게**.
- **조사 결과**: 순위 스냅샷 엔트리는 집계값(연 주당배당금 합·연속연수·주기)만 담고 **회차별 원본은 버려지고 있었음**. 다만 잡(`refreshDividendRanking`)이 종목마다 예탁원 배당일정 **최근 10년치**(연속연수·폭배 계산에 필요, 축소 불가)를 이미 받아옴 → 그 중 표시분만 스냅샷에 함께 저장하면 **KIS 추가 호출 0**. 화면·Server Action의 KIS 직접 호출은 금지(AGENTS.md §2)라, 클릭 시점 조회(B안)는 배제하고 **잡이 저장 → 화면은 Redis만 읽어 펼침**(A안).
- **정책(사용자 확정)**: 표시 회차 부담을 6~12회로 균질화하려 **지급 주기별 보존 창** — 연 6년·반기 4년·분기 2년·**월 12개월**, 주기 판정 불가(null)는 연과 동일(폴백). 잡이 받는 10년치 중 이 창만 잘라 최신순 저장(용량 ~100KB 수준, 무시 가능).
- **구현**:
  - `lib/dividends/ranking/store.ts` — `DividendRoundRecord`(기준일·주당배당금·지급일·종류) 타입 + 엔트리 `history?`(구 스키마 폴백).
  - `lib/jobs/refreshDividendRanking.ts` — `buildEntry`에서 확정 회차 수집 → `HISTORY_WINDOW_MONTHS`(연72·반48·분24·월12) · `ymdMonthsBefore` · `toIsoDate`(예탁원 혼합 포맷 정규화, Phase 47 규칙 재사용)로 주기별 창 절단·최신순 부착. 회차 데이터는 이미 순회 중이라 추가 콜·유의미한 비용 없음.
  - `lib/dividends/ranking/format.ts`(신규) — `summary.ts`(Redis 리더)의 순수 포매터 5종(`formatPayoutCycle`·`formatConsecutiveYears`·`formatStockDividend`·`dartDisclosureUrl`·`surgeTooltip`) 이관 → 클라이언트 컴포넌트가 Redis 클라이언트를 번들에 딸려오지 않게 분리. `summary.ts`는 리더·타입만 유지.
  - `app/dividends/DividendRankRow.tsx`(신규 클라이언트) — 데이터 `<tr>` + 펼침 상세 `<tr colSpan=8>`. 종목명을 `<button aria-expanded>`로, 클릭 시 `entry.history`를 회차 표(기준일·주당배당금·지급일·종류)로 렌더. `MARKET_SUP`·`renderRemarks` 이 컴포넌트로 이관.
  - `app/dividends/page.tsx` — 순위 `<tbody>`를 `<DividendRankRow>` 위임으로 축소, 이관 헬퍼·import 정리, 순위 각주에 "종목명을 누르면 …" 안내 1줄 추가.
  - `app/dividends/page.module.css` — `.nameButton`(버튼 리셋)·`.expandIcon`(90° 회전)·`.detailCell`(페이지색 배경)·`.historyTable`(`.detailCell`로 스코프해 `.rankTable` 하향 상속 극복)·`.historyEmpty`.
- **아키텍처 준수**: KIS 직접 호출 잡 경유만·화면은 Redis 스냅샷만 읽음, 신규 잡·라우트 없이 6종 불변. 클라이언트 컴포넌트는 상호작용용(선례 `DetailTabs`·`FiRankingTable`)이며 데이터 페칭은 서버 유지.
- **상태**: **구현 완료(2026-07-23)**. lint·tsc·build 통과. 실제 기록 노출은 다음 `refresh-dividend-ranking` 회차(또는 `?force=true` 재시딩)부터 — 그 전 구 스키마 엔트리는 "기록 준비 중" 폴백.

---

### Phase 52 — 갱신 지연 인시던트 판정 + 헤더 상태 표시 (방법1+2) (2026-07-23, 구현 완료)

- **요청 근거**: 2026-07-23 15:00~16:06 KST QStash 스케줄링 공백으로 `refresh-market-data`의 15:10·15:20·15:30·15:40 회차가 발화조차 안 돼(전날들은 정상 — 스케줄·엔드포인트 문제 아님, 업스트림 일시 장애로 확정), 홈 카드가 일제히 stale → 느낌표 배지가 대부분 카드에 동시 표시된 사건. 자동 복구되는 지연이므로 **카드마다 배지를 흩뿌리지 말고, QStash 장애성 지연임을 사용자가 바로 인식하도록 헤더에 상태를 통합 표시**하자는 사용자 요청.
- **조사·결정**:
  - 홈 배지 8종(+핫종목 미리보기)은 **예외 없이 `refresh-market-data` 타임스탬프**(`market:lastRefreshAt`/`market:detail:*`/`market:dailyFluctuation`)에서 나옴 → 한 잡이 멈추면 전부 동시에 stale(=인시던트의 넓이 신호). 월간 `market:hotStocks`는 홈 배지 소스가 아님(의도적으로 오래된 데이터).
  - stale의 원인(A: QStash 미발화 / B: 엔드포인트 실패 / C: 일부 데이터 실패)은 스냅샷만으로 구분 불가. **`lastRefreshAt`은 성공 시에만 기록**돼 A·B가 동일하게 보임 → feeds에 이미 있는 `attemptedAt` 패턴을 이식해 "잡이 돌긴 했는지"를 남겨 구분(방법2).
  - 촉발체가 QStash면 장애 중 무의미하므로 **자동 재실행(워치독)은 이번 범위에서 제외** — 판정·표시(방법1+2)만.
- **구현 (KIS 무관, 화면·판정 로직만)**:
  - `lib/market/store.ts` — `LastRefreshRecord.attemptedAt?`(마지막 실행 시작, 선택 필드·구 스키마 폴백).
  - `lib/jobs/refreshMarketData.ts` — 잡 **시작 시** `attemptedAt` 기록(성공한 `at` 보존·`ok:false`), 완료 성공 시 `at`·`attemptedAt`·`ok:true` 갱신. 미실행 시 레코드가 통째로 낡아 `stalled`로 판별됨.
  - `lib/market/staleness.ts` — `resolveRefreshIncident`(예정 슬롯 누락 시 `stalled`/`failing`·`level`·`since`·`missedSlots`·`nextSlotMs`), `nextScheduledRefreshMs`(다음 예정 회차), `countMissedSlots`(연속 누락 수). 기존 `resolveStaleness`와 동일 임계(`lastDueRefreshMs`, 유예 20분) 재사용.
  - `lib/format/datetime.ts` — `formatKstTime`(HH:MM).
  - `app/page.tsx` — `resolveRefreshIncident(lastRefresh)` 계산 → 인시던트면 **per-card staleness 전부 null(배지 억제)** + `incident` prop 전달.
  - `components/indices/IndexDashboard.tsx`(+CSS) — 헤더를 `titleBlock`(세로 컬럼)으로: **제목 오른쪽=상황 이름 칩**(`갱신 지연`/`갱신 실패`), **제목 밑=설명**(`{HH:MM}부터 실시간 갱신 지연 · 보통 수 분 내 자동 복구 · 다음 {HH:MM} 예정`). 톤은 muted(실패만 경고색). `role="status"`.
  - `components/indices/HotStocksCard.tsx` — `suppressStale` prop(인시던트 시 자체 배지 억제).
- **아키텍처 준수**: KIS 직접 호출 없음(화면은 Redis만 읽고 판정), 잡 6종·라우트 불변. 외부 API(QStash Events 등) 렌더 경로 호출 없음.
- **동작 요약**: 정상·휴지 구간=표시 없음 · 예정 슬롯 누락 & 잡 미실행=`갱신 지연`(자동 복구 안내) · 실행됐으나 실패=`갱신 실패`(재시도 안내). 인시던트 중엔 카드 배지 억제.
- **상태**: **구현 완료(2026-07-23)**. lint·tsc·build 통과.

---

### Phase 53 — 지난 배당 기록 펼침에 회차 배당률 열 + 상세 행 들여쓰기 (2026-07-23, 구현 완료)

- **요청 근거**: 사용자 요청 — Phase 51 펼침 표에 ① 상세 행을 **순위 열을 침범하지 않게 약간 오른쪽**으로 이동하고 ② **회차별 배당률 열**을 추가(연 환산·지급 주기 괄호 표기).
- **정책(사용자 확정)**:
  - **계산 기준 = 현재가(①안)**: 회차 배당률 = `주당배당금 × 연환산배수 ÷ entry.price × 100`. 모든 회차가 같은 분모(현재가)라 회차끼리 바로 비교돼 **폭배 회차만 튀고 정상 배당률 수준이 한눈에** 들어온다(사용자 선택 근거). 당시 주가 기준(②안, 공식 시가배당률)은 회차별 과거 주가가 스냅샷에 없어 KIS 추가 호출이 필요해 배제.
  - **연 환산**: 월×12·분기×4·반기×2·연×1(판정 불가 null은 연과 동일). 괄호 라벨은 월"(1/12)"·분기"(1/4)"·반기"(1/2)", **연은 괄호 폐기**.
  - **특별배당 단독 표기("특배") 없음** — 예탁원 `divi_kind`가 분기/결산/반기만 담아(research.md §4.3 실측) 회차 단위 특별배당 판별이 불가. 추천했던 "특배" 안은 데이터 한계로 철회하고, 폭배는 기존 엔트리 단위 "폭배" 비고가 커버.
  - **액면분할 보정 포함(a안)**: ①안은 분모가 분할 後 현재가라 과거 raw 주당배당금과 기준이 어긋남 → 잡의 분할보정 루프에서 `entry.history[].perShare`도 같은 비율로 보정(신규 KIS 호출 0). 펼침 표의 주당배당금·회차 배당률이 헤더 배당률과 기준 일치. 창 안에서 분할 전후가 섞일 수 있으나 헤더 연간합과 같은 단순화를 따른다.
- **구현**:
  - `lib/dividends/ranking/format.ts` — `formatRoundYield(entry, perShare)` 신규: `{ percent, label }` 반환(연 환산·현재가 기준·주기 괄호). 클라이언트 안전 포매터라 서버·클라이언트 공용.
  - `lib/jobs/refreshDividendRanking.ts` — `finalizeEntries` ① 분할보정 블록에서 `annualDividendPerShare`·`dividendYield`에 더해 `entry.history[].perShare`도 `ratio`로 나눠 보정(같은 루프·추가 콜 없음).
  - `app/dividends/DividendRankRow.tsx` — 펼침 회차 표에 "배당률" 열 추가(기준일·주당배당금·**배당률**·지급일·종류), `formatRoundYield`로 계산·괄호 표기.
  - `app/dividends/page.module.css` — `.detailCell` 좌측 패딩을 `calc(52px + --space-12)`(순위 열 폭 + 종목명 열 패딩)로 늘려 상세 내용을 종목명 아래에서 시작시킴 · `.cycleFraction`(괄호 약한 톤).
- **아키텍처 준수**: 화면은 Redis 스냅샷만 읽음, 잡의 KIS 호출 증가 0, 잡 6종·라우트 불변. 계산은 클라이언트에서 스냅샷 값만으로 수행.
- **상태**: **구현 완료(2026-07-23)**. lint·tsc 통과. 분할 보정된 회차값·회차 배당률은 다음 `refresh-dividend-ranking` 회차(또는 `?force=true`)부터 — 그 전 구 스냅샷은 raw 주당배당금 기준으로 회차 배당률만 계산해 표시(분할 종목은 헤더와 다소 어긋날 수 있음, 다음 회차에 정정).

---

### Phase 54 — 펼침 상세 행 순위 열 비우기 + 회차 괄호를 "그해 순번"으로 (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 요청 — Phase 53 펼침 표에서 ① 종목 클릭 펼침 시 **순위 열 영역을 비운 칸으로** 보이게(Phase 53은 반대로 순위 열 침범 방지 들여쓰기로 반영돼 의도 불일치) ② 배당률 옆 괄호를 지급 주기 배수 힌트(1/12·1/4·1/2 고정)가 아니라 **한 해에 첫 번째·두 번째라는 순번(1/2·2/2)**으로.
- **정책(사용자 확정)**:
  - **① 순위 열 비우기 = 권장안(빈 셀 유지)**: 상세 행을 `빈 <td class=stickyRank>` 1칸 + `colSpan(COLUMN_COUNT-1)` 상세 셀로 나눠, 순위 열을 sticky 빈 셀로 남겨 **열 그리드를 유지한 채 비운다**(surface 배경이라 dimmer 상세 셀과 대비로 순위 열이 드러남). 상세는 종목명 열부터 시작(`.detailCell` 좌측 패딩=종목명 패딩만). Phase 53의 `calc(52px + --space-12)` 큰 들여쓰기는 폐기.
  - **② 그해 순번 = B안(그해 실제 관측 회차 수 분모) 확정**: `recordDate` 연도로 묶어 관측된 배당을 기준일 오름차순으로 세어 `순번/그해개수`(1/2·2/2). **그해 1회뿐이면 순번 무의미 → 괄호 폐기**(연·비정기는 자연히 괄호 없음). **한계 수용**: 예탁원이 중간 회차를 놓친 해는 분모가 실제보다 작게 나올 수 있으나 사용자가 자체 판단(A안=주기 기반 고정 분모는 그해 1회여도 1/2로 오해 소지라 배제). 지급 주기 무관이라 `formatRoundYield`(연 환산 배당률)와 분리.
- **구현**:
  - `lib/dividends/ranking/format.ts` — `formatRoundYield`를 `{ percent, label }` → **배당률 `number`만 반환**으로 축소(괄호 라벨 제거). `roundYearOrdinals(history): Map<recordDate, "순번/개수">` 신규(연도 그룹핑·오름차순 순번, 그해 1회면 미포함). `DividendRoundRecord` 타입 import 추가.
  - `app/dividends/DividendRankRow.tsx` — `roundYearOrdinals(history)`로 라벨 맵 산출, 회차 행에서 `roundLabels.get(round.recordDate)`로 괄호 표기(툴팁 "그해 N번째 / 총 M회"). 상세 행에 **빈 순위 셀 + colSpan(COLUMN_COUNT-1)** 구조 적용.
  - `app/dividends/page.module.css` — `.detailCell` 좌측 패딩 `calc(52px + --space-12)` → `--space-12` · `.cycleFraction` 주석 갱신(그해 순번).
- **아키텍처 준수**: 순수 클라이언트 표시 로직만 변경. 잡·KIS 호출·스냅샷 스키마·라우트 6종 전부 불변(`history`는 Phase 51부터 있던 필드 재사용).
- **상태**: **구현 완료(2026-07-24)**. lint·tsc 통과. 스냅샷 재시딩 불필요(기존 `history`로 즉시 반영).

---

### Phase 55 — 회차 실배당률 전환 + "종류" 열을 지급 주기로 + 연 배당 "(연)" 표기 (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 확인 — 신한글로벌액티브리츠(반기)에서 두 회차가 각각 25%로 떠 **합쳐 50%로 오해**되는 문제(실은 Phase 53 연 환산값이라 각 회차가 이미 연 25% 추정치). 또 반기인데 "종류"가 **결산**으로 떠 헷갈림(`divi_kind` 원문은 결산/중간 혼재라 주기 아님). → ① 회차 배당률을 **연 환산 없이 실배당률**로 ② "종류" 열을 **간격 중앙값 기반 지급 주기**(메인 표와 동일)로 ③ 그해 순번 괄호에서 연 배당은 지금까지 생략했는데 대신 **"(연)"**으로 표기.
- **정책(사용자 확정)**:
  - **① 실배당률**: `formatRoundYield` = `perShare × 100 / entry.price`(연 환산 배수 폐기). 반기 종목 회차가 25% → 약 12.5%로, 회차 합이 헤더 시가배당률과 자연히 일치해 합산 착시 제거. Phase 53의 "폭배 회차를 같은 연 눈금에서 튀게 보이기" 의도는 폐기.
  - **② "종류" → "지급 주기"**: 예탁원 `divi_kind`(결산/중간) 대신 `entry.payoutCycle`(월/분기/반기/연, 판정 불가 "—")을 `formatPayoutCycle`로 표시. **종목 단위 단일값이라 회차 행마다 같은 값이 반복**된다(사용자 확정). 열 헤더 "종류"→"지급 주기". `round.kind`는 데이터엔 남되 화면 미사용.
  - **③ 연 배당 "(연)" = B안(payoutCycle 기준) 확정**: `roundYearOrdinals`에 `payoutCycle`을 넘겨 **`payoutCycle === "연"`이면 회차마다 "연" 라벨**("(연)")을 붙인다. 그해 관측 회차 수(A안)가 아니라 간격 중앙값 판정을 기준으로 삼아, 데이터 누락으로 그해 1회만 잡힌 분기·반기 종목이 "(연)"으로 오표기되는 것을 막는다. 다회차 연도는 기존대로 1/2·2/2, 그해 1회(주기 연 아님)는 여전히 괄호 없음.
- **구현**:
  - `lib/dividends/ranking/format.ts` — `formatRoundYield` 연 환산 switch 제거(실배당률). `roundYearOrdinals(history, payoutCycle)`로 시그니처 확장, `payoutCycle==="연"`이면 전 회차 "연". `PayoutCycle` 타입 import 추가.
  - `app/dividends/DividendRankRow.tsx` — `roundYearOrdinals(history, entry.payoutCycle)` 호출, "종류" 열을 `formatPayoutCycle(entry)`로·헤더 "지급 주기", 괄호 툴팁을 "연"/순번 분기, 상단 주석 현행화.
  - `app/dividends/page.module.css` — `.cycleFraction` 주석에 "(연)" 반영.
- **아키텍처 준수**: 순수 클라이언트 표시 로직만 변경. 잡·KIS 호출·스냅샷 스키마(`history`·`kind` 필드 유지)·라우트 6종 전부 불변.
- **상태**: **구현 완료(2026-07-24)**. lint·tsc 통과. 스냅샷 재시딩 불필요(기존 `history`·`payoutCycle`로 즉시 반영).

---

### Phase 56 — 관심종목 화면을 3탭(모두/보유종목/관심종목) 순위표 폼으로 전환 (2026-07-24)

- **요청 근거**: 사용자 요청 — 홈 관심종목 카드로 들어가는 `/watchlist` 목록을 카드형 `<ul>`에서 **종목 순위 목록(핫종목·배당률 순위) 표 폼**으로 바꾸고, **[모두 | 보유종목 | 관심종목] 탭**을 붙여 한 화면에서 두 목록을 다 본다.
- **정책(사용자 확정)**:
  - **탭 3종**: `?mode=all|holdings|watchlist` 서버 탭(기본 `all`). 핫종목 `MODES`·배당 `DIVIDEND_TABS`와 동형 — 클라이언트 상태 없이 `<Link>`, 활성 탭 데이터만 로드.
  - **열 구성**: 모두·보유종목 탭 = 종목명 + **현재가·등락률(전일 대비)·수익률·수익금·평균단가·총 매입금액** 6열. 관심종목 탭 = 종목명 + **현재가·등락률·수익률·기준일** 4열. 모두 탭의 관심종목 행은 해당 없는 3열(수익금·평균단가·총 매입금액)을 `-`로 채운다.
  - **정렬**: 전 탭 **수익률 내림차순**, 수익률이 null인 행(시세·기준가 미확정)은 맨 뒤로.
  - **중복 종목**: 같은 종목을 보유·관심 둘 다 등록했으면 모두 탭에 **2행으로 따로** 표시(합치지 않음).
  - **보유종목 구분**: 모두 탭에서 **종목명 글자색만** 다르게(보유=강조색, 관심=기본색). 등락·수익 색(빨강/파랑)과 겹치지 않게 종목명 열에만 적용하고, 라이트/다크 각각의 대비를 위해 토큰 2벌로 정의한다.
  - **추가 폼**: 모두 탭에는 없음. 보유종목 탭 = `+ 보유종목 추가`(수량·총 매입금액), 관심종목 탭 = `+ 관심종목 추가`(등록 기준일) — 탭마다 고유 폼.
  - **펼침(행 클릭)**: 배당률 순위 `DividendRankRow` 패턴 재사용. 공통 = 52주 최고/최저(현재가 대비 괴리율)·PER/PBR·시가총액, 보유 = 수량·평가금액·오늘 손익, 관심 = 기준가(직전 거래일 잠정 표기)·등록 후 경과일 + **기준일 변경·삭제 폼**. 상세 보기 링크.
  - **`?edit=1` 편집 모드 폐지**: 관심종목 기준일 변경·삭제를 펼침 영역으로 흡수(Phase 23의 `editToggle` 링크 제거).
  - **`/holdings` 유지**: 보유종목 목록이 두 곳이 되지만 이번엔 그대로 둔다(통합 여부는 추후 결정 — 사용자 확정).
- **구현**:
  - `app/watchlist/rows.ts` (신규) — 화면 행 모델 `StockRow`(kind=holding|watch) + `buildHoldingRows`/`buildWatchRows`/`sortRowsByReturnRate`(수익률 내림차순·null 후순위). 펼침용 지표(52주·PER/PBR·시가총액)는 스냅샷 `raw`에서 뽑아 행에 실어 클라이언트가 KIS 원본 타입을 몰라도 되게 한다.
  - `app/watchlist/StockRowItem.tsx` (신규, `'use client'`) — 종목명 버튼 `aria-expanded` 토글 + colSpan 상세 행. 관심 행 펼침에 기준일 변경·삭제 Server Action 폼.
  - `app/watchlist/page.tsx` — 탭 바 + 탭별 데이터 로드(`getWatchlist`/`getHoldings`+`getPortfolioValuation`) + 표 렌더 + 탭별 추가 폼. 카드형 `<ul>`·`?edit=1` 분기 제거.
  - `app/watchlist/page.module.css` — 탭·표(sticky 종목명 열·가로 스크롤)·펼침 스타일 추가, 카드형 목록 스타일 제거.
  - `app/watchlist/actions.ts` — 리다이렉트를 탭 경로(`/watchlist?mode=…`)로. 폼의 `mode` 히든값은 화이트리스트 파싱 후 **경로를 서버가 직접 조립**(오픈 리다이렉트 차단).
  - `app/holdings/actions.ts` — `addHoldingAction`에 `from=watchlist` 히든값 지원(있으면 `/watchlist?mode=holdings`로 복귀, 없으면 기존 `/holdings`). 불리언 플래그라 경로 주입 없음.
  - `lib/holdings/stockInfo.ts` — `buildIndicators`를 `buildStockIndicators`로 export(52주·PER/PBR 파싱 재사용, 파서 중복 방지).
  - `styles/tokens.css` — `--color-holding-name` 라이트/다크 2벌.
  - **화면 이름**: 두 목록을 함께 담으므로 `<h1>`·metadata를 「관심종목」 → **「내 종목」**으로. 라우트(`/watchlist`)·홈 "관심종목" 카드 링크는 그대로이고, 카드로 들어오면 기본 탭(모두)에 도착한다.
- **아키텍처 준수**: 읽기 경로는 Redis 스냅샷만(KIS 직접 호출 없음). 잡 6종·스냅샷 스키마·Redis 키 전부 불변, 새 lib 없음. Redis 조회는 탭당 목록 키 1개 + 스냅샷 MGET 1회(보유가 있는 탭은 `getPortfolioValuation` 내부 MGET 1회 추가).
- **상태**: **구현 완료(2026-07-24)**. build·lint·tsc 통과. 데이터 변경 없음(기존 `holdings:{email}`·`watchlist:{email}`·시세 스냅샷 그대로 읽음).

---

### Phase 57 — 내 종목 화면 마감 4건(홈 카드 개명·열 구분선 제거·방향 색 회귀 수정·기준일 "수정" 버튼) (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 확인(Phase 56 배포분) — ① 홈 "관심종목" 카드 이름을 **내 종목**으로 ② 표의 **종목명과 현재가 사이 세로 구분선**이 핫종목·배당 표엔 없던 것이라 제거 ③ **수익률·수익금에 기존 색 규칙(상승 빨강/하락 파랑)이 안 먹음** ④ 관심종목 펼침의 **기준일 입력 상시 노출을 없애고 "수정" 버튼**으로.
- **정책(사용자 확정)**:
  - **③은 회귀가 아니라 CSS 특정도 버그**: 표 기본 규칙 `.stockTable td`(0,1,1)·`.detailItem dd`(0,1,1)가 단독 `.rise/.fall/.flat`(0,1,0)를 이겨 방향 색이 기본 글자색으로 덮였다. 등락률 열과 펼침 "오늘 손익"도 같은 이유로 죽어 있었으므로 함께 고친다. 배당률 순위 표(`.rankTable .rankYield`)가 같은 함정을 주석으로 남겨 둔 지점 — **셀 색은 반드시 표/셀 상위 클래스로 스코프**한다.
  - **④ = A안(펼침 안 2단계)**: 평상시엔 `수정`·`삭제` 버튼만, `수정`을 누르면 그 자리에서 기준일 입력 + `저장`/`취소`가 열린다. 행을 접으면 편집 상태도 초기화. B안(관심종목 상세 페이지로 이동해 편집)은 상세에 편집 UI가 아예 없어 새로 만들어야 하고 화면 이동이 늘어 배제.
  - **① 카드 본문은 그대로**: 홈 "내 종목" 카드는 이름만 바뀌고 내용은 여전히 **관심종목 수익률 상위 4종목**(보유종목은 별도 카드). 카드 내용까지 보유+관심으로 합칠지는 미결(사용자 판단 대기).
- **구현**:
  - `components/indices/WatchlistCard.tsx` — 카드 제목 "관심종목" → "내 종목"(링크·요약 소스 무변경).
  - `app/watchlist/page.module.css` — `.stickyName`의 `border-right` 제거 · `.rise/.fall/.flat`에 `.stockTable`·`.detailCell` 스코프 선택자 추가.
  - `app/watchlist/StockRowItem.tsx` — `editing` 상태 추가, 관심종목 펼침 액션을 `수정`/`삭제` → (수정 시) 기준일 입력+`저장`/`취소`로. 행 접기 시 `setEditing(false)`.
- **아키텍처 준수**: 표시 로직·스타일만 변경. Server Action 시그니처(`updateWatchItemAction`의 `id`·`mode`·`registeredAt`)·잡 6종·Redis 키 전부 불변.
- **상태**: **구현 완료(2026-07-24)**. build·lint·tsc 통과.

### Phase 58 — 잔고 탭 추가 + 보유/관심 경로 통합(`/stocks`) + 홈 보유종목 카드 삭제 (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 요청 — ① 내 종목 화면에 **잔고 탭**을 더하고, 그 안에 홈 "보유종목" 카드의 상세화면(`/holdings`) 본문을 그대로 넣는다 ② **홈 보유종목 카드는 삭제** ③ 리다이렉트가 아니라 **새 경로를 만들어 보유·관심 경로를 하나로 합친다** ④ 보유종목 탭의 추가 버튼 제거.
- **정책(사용자 확정)**:
  - **새 경로 `/stocks`**: 구 `/holdings`·`/watchlist`(목록·상세 4개 라우트)를 `/stocks`(4탭 목록) + `/stocks/[symbolCode]`(통합 상세)로 합친다. **구 경로는 리다이렉트 스텁 없이 삭제**(사용자 확정) — 북마크·기존 푸시 알림의 구 링크는 404가 된다.
  - **상세는 A안(`?kind=holding|watch`)**: 같은 종목을 보유·관심에 동시에 담을 수 있어 `/stocks/{code}` 하나로는 어느 쪽 상세인지 정해지지 않는다. kind 없거나 그쪽 목록에 없으면 **보유 → 관심 순 폴백**, 둘 다 없으면 `/stocks` redirect. 보유=평가금액(수량 반영) 2년 추이, 관심=등록일 이후 기준가 대비 추이로 **차트 의미가 섞이지 않는다**(B안=한 페이지에 둘 다 표시는 차트 기준을 새로 정해야 해 배제).
  - **잔고 탭은 통째 복사**: 요약 4지표·연초 이후 추이·일별 기록·종목 추가 폼·보유종목 카드 목록 전부. **보유종목 탭과 보유 목록이 두 탭에 중복 표시되는 것은 의도한 대로**(사용자 확정).
  - **보유 등록 동선은 잔고 탭 하나**: 보유종목 탭의 `+ 보유종목 추가` 폼 제거 → `addHoldingAction`의 `from=watchlist` 불리언 복귀 로직도 폐기하고, 관심종목 쪽과 같은 `mode` 화이트리스트(`holdings|watchlist|balance`) 방식으로 통일.
  - **탭 순서**: `모두 / 보유종목 / 관심종목 / 잔고`.
- **구현**:
  - `app/watchlist/` → `app/stocks/`로 이동(git mv, 히스토리 보존) 후 `page.tsx`에 4번째 탭 `balance` 추가 — 잔고 탭은 표·시세를 읽지 않고 `<HoldingsOverview>`만 렌더(활성 탭 것만 로드하는 기존 관례 유지). 각주(footer)도 탭별로 갈린다.
  - `components/holdings/HoldingsOverview.tsx`(+`.module.css`) 신설 — 구 `app/holdings/page.tsx` 본문을 옮긴 async 서버 컴포넌트(`email`만 받아 Redis 3종을 스스로 읽고 평가 실패는 내부 배너로 격리). 복붙 대신 컴포넌트로 뽑아 이중 유지보수를 피한다.
  - `app/stocks/[symbolCode]/page.tsx` — 구 보유·관심 상세 2개를 `?kind` 분기 한 파일로 병합. 양쪽에 다 있는 종목이면 헤더 아래에 **반대쪽 상세 전환 줄** 표시. 보유 편집 링크는 `?kind=holding&edit=1`. CSS는 두 모듈을 합치고 요약 그리드만 `.summary`(보유 2열)/`.summaryTriple`(관심 3열) 변형으로 분리.
  - `app/stocks/actions.ts` — 보유·관심 Server Action 6종 병합(`requireEmail`/`fail`/경로 조립 1벌). `stocksPath()` 화이트리스트에 `balance` 합류, 보유 삭제 후 복귀는 `?mode=balance`, `revalidatePath`는 `/stocks`(+상세).
  - 홈 보유종목 카드 삭제 — `IndexDashboard`(카드 블록·`holdingsSummary` prop·`DashboardStaleness.holdings`), `app/page.tsx`(요약 호출·staleness), `app/loading.tsx`(스켈레톤 8→7), `lib/holdings/summary.ts`·`types/holdings.HoldingsCardSummary` 삭제.
  - 링크 갱신 — `WatchlistCard`(`/stocks`), `dividends/page.tsx` 빈 상태(`/stocks?mode=balance`), **푸시 알림 딥링크** `alerts/evaluate.ts`(`?mode=balance`·`?mode=watchlist`)·`alerts/feedAlerts.ts`(`/stocks/{code}?kind=…`), `rows.ts`의 `detailHref`.
  - `loading.tsx`는 holdings·watchlist 2개 → `app/stocks/loading.tsx` 1개(새 최상위 섹션이라 없으면 prefetch에서 빠진다, §40).
  - **부수 수정**: 잔고 탭 보유 카드의 「평가손익」 방향 색이 `.holdingStat dd`(0,1,1) > `.rise`(0,1,0) 특정도에 눌려 죽어 있던 것을 §57과 같은 스코프 선택자로 살렸다.
- **아키텍처 준수**: 라우트·링크 문자열 이동이 전부다 — **Redis 키·Server Action 시그니처·잡 6종·KIS 호출 경로는 전부 불변**. 잔고 탭 데이터도 Redis 읽기만(§2 대원칙).
- **상태**: **구현 완료(2026-07-24)**. build·lint·tsc 통과.

---

### Phase 59 — 배당률 순위 「사업연도 귀속」 계산 전환 (12개월 롤링 이중계상 수정) (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 확인 — 배당률 순위 목록의 배당률이 "작년 말 배당률과 올해 초 배당률의 합산"으로 보이며, 배당률은 당해(사업연도)만 합산해야 하는 것 아니냐는 지적. Redis 저장 스냅샷(`market:dividendRanking`, 2026-07-23)을 직접 대조해 확인.
- **원인**: `buildEntry`가 배당률 분자를 **오늘 기준 최근 365일 롤링(TTM)** 으로 합산(`recordDate > oneYearAgo && recordDate <= today`). 사업연도 귀속을 무시하므로,
  - **① 같은 성격 중간배당 이중계상** — 중간배당 기준일이 해마다 며칠씩 당겨지면(예 8/1→7/15) 12개월 창에 중간배당이 **2번** 들어감. 폭배(`SURGE_RATIO=3`)에도 안 걸려 상위 노출. 실측: 조선내화(8위) 1,000원→1,800원으로 **13.08%**(실제 7.27%), CR홀딩스(7위) 410원→610원 **13.15%**(실제 8.84%).
  - **② 서로 다른 사업연도 혼합** — 배당절차 개선(선배당후기준일)으로 결산배당 기준일이 이듬해 2~4월로 이동한 종목이 많아 "기준일 연도≠귀속 사업연도". 실측: 유아이엘(12위) FY2025 결산 + FY2026 분기가 섞여 **12.26%**(FY2025 기준 10.9%), 현대엘리베이터(4위) FY2025 3회+FY2026 1회 21.32%.
  - 반면 1위 이지홀딩스(30.79%)·2위 노바텍(25.75%)은 결산 1회만 계상된 진짜 증배로 `폭배` 표기가 정상 — 계산 자체는 옳음.
- **정책(사용자 확정)**:
  - **사업연도 귀속 기준** — 결산(`divi_kind==="결산"`) 회차를 각 사업연도의 종점으로 보고, **(직전 결산, 이 결산] 창**의 회차(중간·분기 포함)를 합산해 그 사업연도 배당으로 삼는다. 배당률 분자 = **가장 최근 완결 사업연도** 합.
  - **결산 기준일 → 귀속 사업연도**: 기준일 월이 1~6월이면 `연도-1`(선배당후기준일로 이듬해 상반기로 옮겨간 12월 결산 법인 다수), 7~12월이면 `연도`. 3·6월 결산 등 **비12월 법인은 소수**라 오귀속 가능성을 감수(조사에서 결산 기준일 월 분포 12월 370·03월 54·02월 12·04월 7·07월 3 확인 — 상반기는 대부분 12월 결산의 이동분).
  - **폴백(TTM 유지)**: ⓐ 결산 회차가 없는 종목(중간·분기 배당만 — 예 예림당) ⓑ 최신 결산이 오늘로부터 400일 초과(최근 배당 끊김) ⓒ **배당상품(ETF·리츠·인프라펀드)** — 월·분기 분배금이라 사업연도 개념이 약해 12개월 롤링이 맞다. 폴백은 사업연도 라벨 없이 "최근 1년"으로 표기.
- **구현**:
  - `lib/jobs/refreshDividendRanking.ts` `buildEntry` 재구성 — 루프는 확정 회차(`confirmedRounds`, `face`·`stkRate` 추가)·`paidYears`·`recentCycleDates`만 모으고, TTM 누산(annual/roundsPerYear/face/stkRate) 제거. 이후 결산 기준일 목록(`settlementYmds`)으로 사업연도 창을 계산해 `basisRounds`·`priorFyTotals`를 산출. `annualDividendPerShare`·`roundsPerYear`·`dividendFaceValue`·`stockDividendRate`는 모두 `basisRounds` 기준. `surgeCandidate`는 TTM 대 직전 연도가 아니라 **basis 대 직전 사업연도 총액(`priorFyTotals`)** 으로 판정. 헬퍼 `ymdDaysBefore`·`fiscalYearLabel`, 상수 `FISCAL_YEAR_RECENCY_DAYS`·`FISCAL_YEAR_WINDOW_DAYS`(각 400) 추가. `dpsByYear` 제거.
  - `lib/dividends/ranking/store.ts` — `DividendRoundRecord.inBasis?`(basis 산입 회차 표식)·`DividendRankingEntry.dividendBasisYear?`(귀속 사업연도 "YYYY", 폴백이면 null) 2필드 추가. `annualDividendPerShare`·`dividendYield` 주석을 사업연도 기준으로 갱신.
  - `app/dividends/DividendRankRow.tsx` — 펼침 표에서 `round.inBasis` 행 강조(`.basisRow`), 캡션에 귀속 사업연도 주석. 헤더 배당률 `title`에 basis 연도 노출.
  - `app/dividends/page.module.css` — `.basisRow` 강조(좌측 강조선+옅은 배경).
  - `app/dividends/page.tsx` — 각주를 "직전 사업연도 확정 배당 합 ÷ 산출 시점 현재가"로 갱신하고 결산 기준 합산·폴백을 한 줄로 설명.
- **범위 밖**: 홈 보유·내 종목의 per-종목 배당 블록(`lib/holdings/stockInfo.ts`)도 TTM으로 배당률을 계산하나, 이번 지적은 **순위 목록** 대상이라 그대로 둔다(필요 시 후속 Phase).
- **아키텍처 준수**: 잡 6종·KIS 호출 경로·Redis 키·Server Action 시그니처 전부 불변. 스냅샷 스키마는 선택 필드 2개 추가(구 엔트리는 `?? undefined`로 안전). 실데이터 정정은 다음 `refresh-dividend-ranking`(또는 `?force=true`) 회차부터.
- **상태**: **구현 완료(2026-07-24)**. build·lint·tsc 통과.

---

### Phase 60 — per-종목 배당 블록도 사업연도 귀속으로 전환 (`stockInfo.ts` TTM 잔존분) (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 확인 — Phase 59에서 **순위 목록**만 사업연도 귀속으로 고쳤는데, 내 종목/관심 상세의 **per-종목 배당 블록**(`StockInfoBlocks` 주당배당금·시가배당률)은 여전히 TTM(최근 12개월 롤링)이라 같은 혼합·이중계상 버그가 남아 있었다. TTM = "작년 말 결산배당 + 올해 초·중 분기·중간배당"을 사업연도 구분 없이 합산하는 방식임을 재확인.
- **현행(버그) 경로**(전):
  - `constants.ts` `DIVIDEND_LOOKBACK_DAYS = 365` → `stockInfo.ts` `fetchKisDividends(code, kstYyyyMmDd(365), kstYyyyMmDd(0))`(오늘~365일 전)
  - `buildDividendBlock`이 창 안 확정 회차를 **전부 합산**해 `annualDividendPerShare` → `yieldRate = annualDividendPerShare / currentPrice × 100`
  - 표시: `components/stocks/StockInfoBlocks.tsx`(주당배당금·시가배당률). Phase 59 순위와 동일한 근본 원인·미수정 잔존분.
- **정책(사용자 확정 — 권장안=공용 모듈 추출)**:
  - **Phase 59 `computeDividendBasis`를 공용 모듈 `lib/dividends/basis.ts`로 추출**해 순위 잡(`refreshDividendRanking.ts`)과 `stockInfo.ts`가 **같은 사업연도 귀속 로직을 공유** — 규칙 분기 방지. 순위 잡은 10년치를 이미 받으므로 그대로 재사용, `stockInfo`만 창을 넓힌다.
  - **lookback 확장**: per-종목 배당 조회를 `DIVIDEND_BASIS_LOOKBACK_DAYS = 800`(신설)로 조회(2사업연도 결산 + 선배당후기준일 이동 버퍼). 배당 조회는 종목당 1콜이라 **날짜 범위만 넓히면 콜 수 불변**.
  - **폴백 동일**: 결산 회차 없음·최신 결산 400일 초과·배당상품은 최근 1년 롤링(Phase 59와 같은 규칙). ~~리츠·ETF는 결산 회차가 없어 자연히 폴백.~~ **[Phase 61 정정]** 실측 결과 **월배당 ETF만** 결산 회차가 없어(divi_kind=null) 자연 폴백이고, **리츠는 회차가 전부 `divi_kind="결산"`**(반기마다 결산)이라 폴백이 안 걸린다 — `buildDividendBlock`이 `fund=false`로 넘기므로 리츠를 per-종목에 담으면 결산-종점 로직이 **반기 1회만** 잡아 과소계상된다(현재 담긴 종목에 리츠 없어 영향 없음, Phase 61 §조사 참조).
- **구현**:
  - `lib/dividends/basis.ts` 신설 — `computeDividendBasis`(제네릭 `<T extends BasisRound>`로 순위의 `ConfirmedRound`·stockInfo의 회차 둘 다 수용)·`dayDiff`·`ymdDaysBefore`·`fiscalYearLabel`·상수 2종을 Phase 59의 `refreshDividendRanking.ts`에서 이관. Redis·KIS 의존 없는 순수 모듈.
  - `refreshDividendRanking.ts` — 위 함수·헬퍼·상수의 로컬 정의 삭제하고 basis 모듈 import(동작 불변). `dayDiff`는 `derivePayoutCycle`이 계속 쓰므로 import 유지.
  - `constants.ts` — `DIVIDEND_BASIS_LOOKBACK_DAYS = 800` 신설. `DIVIDEND_LOOKBACK_DAYS = 365`는 이제 **회차 표시(rounds) 창**으로 역할 명시.
  - `stockInfo.ts` `buildDividendBlock(rows, today, oneYearAgo)` — 확정 회차를 `{ymd,perShare,kind}`로 매핑해 `computeDividendBasis(…, fund=false, oneYearAgo, today)`로 basis 합 산출(전: 창 안 전량 합산). **`rounds`는 최근 1년(`ymd ≥ oneYearAgo`)으로 다시 잘라** "내 배당" 표시 범위·지급일 알림을 Phase 60 이전과 동일하게 유지. `basisYear`를 블록에 저장.
  - 타입 — `store.ts` 저장 블록·`stockInfo.ts` `StockDividendInfo`에 `basisYear?` 추가(구 스냅샷 폴백), 주석 갱신. 읽기 경로는 `{...blocks.dividend}` 스프레드라 자동 전달.
  - `StockInfoBlocks.tsx` — "최근 1년 주당배당금" 라벨을 `basisYear`가 있으면 "N 사업연도 주당배당금"으로, 시가배당률에 basis 근거 `title` 추가.
- **회귀 점검(확인 완료)**: `getDividendSchedule`(내 배당 탭)은 저장된 `rounds`를 그대로 나열 → rounds를 최근 1년으로 잘라 표시 범위 불변. `dividendAlerts`는 `payDate===today`만 필터 → 무관. `annualDividendPerShare` 합산 소비자는 상세 블록 1곳뿐. 순위 잡은 로직 이관만이라 산출 불변.
- **아키텍처 준수**: 잡 6종·KIS 호출 경로·Redis 키·Server Action 시그니처 불변. 스냅샷(`market:stockInfo:{code}`) 스키마는 선택 필드 `basisYear?` 1개 추가. **KIS 콜 수 불변**(날짜 범위만 확장). 실데이터 정정은 다음 `refresh-market-data` 회차부터.
- **상태**: **구현 완료(2026-07-24)**. build·lint·tsc 통과.

---

### Phase 61 — 배당상품 순위 배당률 검토: 사업연도 귀속 전환 불가, 현행 TTM 유지 (2026-07-24, 코드 변경 없음)

- **요청 근거**: 사용자 지적 — 배당률 순위 **배당상품 탭 1위 NH프라임리츠(338100) 38.12%**가 Phase 59/60의 새 계산법(사업연도 귀속)에 안 맞아 보인다. 배당상품은 `fund=true`라 `computeDividendBasis`가 무조건 TTM(최근 12개월 롤링) 폴백하도록 돼 있어, Phase 59가 일반종목에서 고친 이중계상이 배당상품엔 남았는지 확인 요청.
- **조사(실데이터 시뮬레이션, 2026-07-24 스냅샷 `market:dividendRanking` `productEntries` 기반)**:
  - 초기 진단(내 오진)은 "NH 38.12% = 2025 하반기(625) + 2026 상반기(837)의 **사업연도 혼합 이중계상**"이었으나, **정정**: 이 리츠는 **5월 결산**이라 (중간 2025-11-30 625 + 결산 2026-05-31 837) = **2026 사업연도 1년치(1462원)로 정상 합산**이다. `fiscalYearLabel`(12월 결산 가정, 1~6월→전년 귀속)로만 봐서 혼합으로 오판했던 것. 38%가 높아 보인 진짜 원인은 **2026-05-31 결산이 예년(126·140·131원) 대비 6.6배 급증한 837원**(실제 배당 증가/특별배당 반영)이지 계산 오류가 아니다. 연배당 추이 246→540→644→**1462**(급증).
  - **월배당 커버드콜 ETF**: 회차 `divi_kind`가 전부 **null**(예탁원 결산 태깅 없음) → `computeDividendBasis`가 결산 회차 없음으로 판정 → **이미 자동 TTM 폴백**. `fund` 플래그 없어도 안전, 12개월 합=연배당으로 정확.
  - **리츠**: 회차가 전부 `divi_kind="결산"`(반기마다 결산). 사업연도 귀속(결산-종점 `(직전 결산, 이 결산]`)을 적용하면 **반기 1회차만** 잡혀 **반토막 과소계상**: NH프라임리츠 38.1%→21.8%, 신한글로벌액티브리츠 25.8%→13.0%, KB스타리츠 22.8%→11.4%. (반기결산 리츠는 결산이 반기마다라 사업연도 종점을 결산으로 못 잡는다.)
- **결정(사용자 확정 2026-07-24 — 현행 유지)**: **배당상품 사업연도 귀속 전환 안 함.** 근거 — ① 월배당 ETF는 이미 TTM 폴백으로 정확 ② 리츠는 반기 2회=12개월=TTM이 오히려 연배당에 부합하고, 결산-종점 로직은 반토막 과소계상을 유발 ③ NH 38.12%는 실제 배당 급증 반영이지 버그 아님. **코드 변경 없음**, `fund=true` TTM 폴백 유지.
- **부수 정정**: Phase 60 계획서의 "리츠·ETF는 결산 회차가 없어 자연히 폴백"은 부정확 → **월배당 ETF만** 결산 회차 없음, **리츠는 결산 회차 있음**(위 §폴백 항목에 정정 반영). per-종목 배당 블록(`buildDividendBlock`, `fund=false`)은 향후 **리츠를 보유·관심에 담으면 반기 과소계상 위험** — 현재 담긴 종목엔 리츠 없어 무영향이나, 리츠 per-종목 노출 시 지급주기 기반 처리 검토 필요(향후 백로그).
- **상태**: **완료(2026-07-24)** — 문서 기록만, 코드 변경 없음.

---

### Phase 62 — 배당상품 배당률 하이브리드(리츠·인프라=직전 캘린더 연도, ETF=TTM) (2026-07-24, 구현 완료)

- **요청 근거**: 사용자 제안 — 배당상품 순위의 NH프라임리츠 배당률이 TTM이라 "올해 초(2026-05-31 결산) + 작년 말(2025-11-30 중간)"을 합산해 시점이 헷갈린다. "작년 한 해"만 합산해 표기하면 명확할 것. Phase 61 검토를 이어 방식 선택.
- **검토(실데이터 시뮬레이션, 2026-07-24 스냅샷)**:
  - **리츠**(회차 전부 `divi_kind="결산"`, 반기): 직전 캘린더 연도(2025년) 합이 반기 2회를 온전히 담아 명확·안정 — NH프라임리츠 38.1%→**19.6%**(2026 급증분 837원 제외), 신한글로벌액티브리츠 25.8%→25.5%·KB스타리츠 22.8%→23.4%(안정 배당이라 거의 불변, 부작용 없이 명확성만 획득).
  - **월배당 ETF**(회차 `divi_kind=null`): 순위 상위 다수가 연속 배당 2~3년차(상장 1~2년) **신규 상품** — 직전 캘린더 연도 방식이면 그해 배당이 부분(6~8회)이라 **과소계상→순위 왜곡**. TTM은 최근 12개월 완전분이라 신규도 정확. → ETF는 TTM 유지가 맞다.
  - 트레이드오프 = **명확성(캘린더 연도) vs 신규 상품 완전성(TTM)**. 상품 특성이 갈려 단일 규칙이 부적합.
- **정책(사용자 확정 2026-07-24 — 하이브리드)**:
  - 일반종목(ST) = 사업연도 귀속(기존 Phase 59) · 리츠·인프라펀드(RT·IF) = **직전 완결 캘린더 연도 배당 합** · 월배당 ETF(EF) = TTM. 유니버스 `group`으로 판정.
- **구현**:
  - `basis.ts` — `computeDividendBasis`의 `fund: boolean` 인자를 **`mode: DividendBasisMode`(`"fiscal"|"calendar"|"ttm"`)**로 전환(신규 export 타입). `calendar` 모드 신설 — 직전 완결 캘린더 연도(`today.year-1`) `[0101, 1231]` 기준일 회차 합, 그해 배당 없으면 TTM 폴백. `fiscal`은 기존 로직(폴백 공용 헬퍼 `ttmFallback`로 정리). docstring·폴백 설명 갱신.
  - `refreshDividendRanking.ts` `buildEntry` — `basisMode = group==="ST"?"fiscal":group==="EF"?"ttm":"calendar"`로 결정해 전달. `fund`(우선주·폭배·분할 스킵)는 그대로. `DividendBasisMode` import.
  - `stockInfo.ts` `buildDividendBlock` — 두 번째 인자 `false`→`"fiscal"`(동작 불변, per-종목은 그룹 정보 없음). 리츠 per-종목 처리는 백로그 유지.
  - `DividendRankRow.tsx` — basis 라벨을 `instrumentType==="fund"`면 `"{basisYear}년 배당"`, 아니면 `"{basisYear} 사업연도"`, 폴백이면 `"최근 1년"`으로 분기(헤더 툴팁·펼침 캡션 공용 `basisLabel`로 통일).
- **회귀 점검**: 일반종목·월배당 ETF 산출 불변(모드 이름만 바뀜, 동작 동일). 리츠·인프라만 캘린더 연도로 변경. `store.ts` 스키마 불변(`dividendBasisYear?` 재사용 — 캘린더면 "YYYY" 저장). per-종목(`stockInfo`)·폭배(`priorFyTotals`) 무영향. build·lint·tsc 통과.
- **아키텍처 준수**: 잡 6종·KIS 호출 경로·Redis 키·스냅샷 스키마 불변, KIS 콜 수 불변. **실데이터 정정은 다음 `refresh-dividend-ranking` 회차(또는 `?force=true`)부터**.
- **상태**: **구현 완료(2026-07-24)**. build·lint·tsc 통과.

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

## 8. `research.legacy.md` 의사결정 대조표 (구세대 — 이력 보존)

> ⚠️ **구세대 표시** — 아래 대조표는 구세대 원본 [`research.legacy.md`](./research.legacy.md) 기준이며, 결정 대부분이 Phase 5(KIS 이관)·Phase 11(QStash 재설계)로 대체됨. 현행 근거 문서는 새 `research.md`(코드 구조 사전 조사).

| research.legacy.md 결정 | plan.md 반영 위치 |
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

> ⚠️ **구세대 설계 (Phase 5 이전)** — 이 섹션은 공공데이터포털 시절 설계이며 현재 코드와 다름(`src/lib/api/data-go-kr`은 Phase 5에서 제거됨). 현행 기준은 Phase 9 이후 절 및 `research.md`(코드 구조 사전 조사) 참고. 내용은 이력 보존용으로 수정하지 않음.

```bash
# Phase 1 시작 시 (승인 후에만 실행)
touch .env.local   # 키 직접 입력
mkdir -p src/lib/api/data-go-kr src/lib/indices src/types src/styles
```

---

**(이력)** ~~본 `plan.md`를 최종 승인한 뒤에만 Phase 1 파일 생성을 시작한다.~~ — 최초 승인 절차 문구로, Phase 1~15 구현 완료에 따라 효력 종료(과거 이력으로만 보존).

---

*문서 버전: 2.4 (2026-07-10: ① Phase 12 "보유종목 데이터 암호화 저장" 신설 — `holdings:{email}`+`history`(totalValue 포함) 둘 다 `node:crypto` AES-256-GCM으로 저장 전 암호화(`enc:v1:{iv}:{authTag}:{ciphertext}` 버전 프리픽스 포맷, IV 12바이트 매회 생성), 키는 `HOLDINGS_ENCRYPTION_KEY`(32바이트, 서버 전용, .env.local+Vercel+별도 백업), 적용 지점은 `store.ts` 4개 함수 경계로 한정(호출부 무변경 — Phase 11 파이프라인에 투명), 마이그레이션은 읽기 하위호환(배열=평문/`enc:v1:`=복호화)+쓰기 상시 암호화로 자연 전환 후 선택적 일회성 재저장, 복호화 실패는 throw로 표면화. **진행 순서 확정: Phase 12 완료 후 Phase 11 착수.** ② Phase 11 배지 정책 2차 개정(대안 A+심각도 구분) — 배지 판정을 장중(KST 평일 09:00~18:20, 정규+재시도 창)으로 한정하고 장외·주말은 미표시(최초안의 "밤마다 상시 배지" 부작용 제거), 장중 판정을 경고(20분~1시간, 노랑·작은 느낌표)/심각(1시간+, 빨강·강조 느낌표) 2단계로 구분(`tokens.css` 색상 매핑, 필요 시 시맨틱 토큰 추가), 상세 페이지 「마지막 갱신」은 배지와 별개로 상시 표시 유지. 이전 2.3: Phase 11 **최종 확정** — `phase9.request.md` 확정 지시문 반영. 재시도·실패 정책 6건 확정: ① 정정 회차 18:15(18:10 정정치 포함 조회, 5분 여유) ② 15:40 실패 시 재시도 없이 포기(18:15가 커버) ③ 18:15 실패 시 18:20에 전체 1회 재실행 후 실패하면 다음 영업일 09:00 대기(부분 재시도 없음) ④ 보유종목 등록 시 KIS 실존 검증 제거(형식 검증만) ⑤ 공휴일은 KIS `basDt` ≠ KST 오늘로 판단해 알림 판정 skip ⑥ 데이터 갱신 실패 500/알림 발송만 실패 로그+200. 갱신 상태 UI 3건 확정: 홈 카드 6개 아이콘 우측 상단 「!」 배지(`fetchedAt` 20분 경과 시), 상세 페이지 「마지막 갱신: YYYY-MM-DD HH:mm」 표기, `tokens.css` 토큰으로 다크/라이트 대응. KST 가드 envelope 09:00~18:40로 조정(창 밖 재시도 쟁점 소멸). 구현 미착수 — 착수 지시 대기. 이전 2.2: Phase 11 "데이터 갱신 구조 전면 재설계" 설계 추가 — `phase9.request.md` 반영. `unstable_cache` 기반 접속 시 갱신(pull)을 폐기하고 QStash 스케줄 4개(`CRON_TZ=Asia/Seoul`, 장중 10분×2 분할 표현식 + 15:40 + 18:1x)가 KIS를 호출해 Redis(`market:detail:*`/`market:stock:*`)에 저장하는 push 구조로 전환, 화면은 Redis만 읽음. 요청서 cron 표현식(`*/10 9-15`)의 15:40/15:50 초과 문제를 표현식 분할로 수정. Phase 8(캐시+revalidateTag cron 전면 대체, 8-6 폐기), Phase 9(18:15 단일 cron 번복, 사용자별 종목 조회→전체 union 1회 조회, 저장 시 KIS 실존 검증 충돌), Phase 10(맥미니 crontab·check-alerts 폐기, 판정을 갱신 잡에 통합)과의 충돌 지점 및 장애 시나리오 10종(회차 실패·재시도 경합·연속 실패 시 staleness 표시·Redis 단일 의존·공휴일 알림·빈 Redis 등) 문서화. QStash 공식 문서 확인(CRON_TZ 지원·지수 백오프 재시도·DLQ·서명 검증·Free 1,000msg/일). 결정 필요 5건(18:10 vs 18:15, 창 밖 재시도 유예, 실존 검증 제거, 공휴일 skip, 부분 실패 응답 정책) 명시. 구현 미착수·승인 대기. 이전 2.1: Phase 10 "보유종목 알림 기능" 조사·설계 추가 — 신고가 추적(단일 값+그 시점 코스피/코스닥), 알림 조건 3종 OR, 맥미니 crontab 10분 주기 `/api/cron/check-alerts` 호출, 1회 발송+2시간 쿨다운, Web Push(VAPID)+`src/app/manifest.ts`+`public/sw.js` 신규 필요(현재 저장소에 PWA 자산 없음 확인). 구현 미착수·승인 대기. 이전 2.0: Phase 9 그룹 1~7 구현·로컬 검증 완료. cron을 15:40/18:15 두 개에서 평일 18:15 KST 단일로 통합(사용자 결정) — 기존 `/api/cron/revalidate-indices` 확장으로 캐시 재검증+변동성/보유종목 히스토리 upsert 일원화, `vercel.json` cron 1개. 이전 1.9: Phase 9 최종 통합 확정 — 이전의 모든 개정판(1.6 최초안: 지수(연초=100) 채택안 / 1.7: 지수 항목 제외·`prevValue` 단일 값 단순화안 / 1.8: 지수 재도입 없이 `history` 시계열+추이 차트·단위 토글)을 전부 대체하는 최종 버전. 홈 화면을 "KOSPI/KOSDAQ 카드+차트 직결" 구조에서 **요약 카드 6개 그리드(코스피·코스닥·원달러 환율·미국 10년물 금리·보유종목 수익률·코스피 변동성 지수) + 지표별 상세 페이지**(`/indices/kospi`, `/indices/kosdaq`, `/indices/usdkrw`, `/indices/us10y`, `/holdings`, `/indices/kospi-volatility`) 구조로 재구성. 홈에는 차트를 두지 않고 전부 상세 페이지로 이전. 보유종목은 `holdings:{email}`(현재 보유)·`holdings:{email}:history`(일별 `{date, totalCost, totalValue}` 시계열)로 유지하되 CRUD·차트(수익률/원 단위 토글)·일별 리스트를 `/holdings` 상세 페이지 하나로 통합. 신규 "코스피 변동성 지수"(일일 (고가-저가)/저가×100)를 `kospiVolatility:history`에 시계열 저장, 홈에는 당월 평균·전월 대비 증감만, 상세 페이지에는 최근 6개월 월별 평균 차트 하나만(토글·목록 없음) 표시. 작업 목록을 홈 리팩토링→코스피/코스닥 상세→환율/금리→보유종목→변동성 지수→cron 통합→검증의 7개 그룹으로 재편. 구현은 승인 대기)·공공 API 국내 지수 대시보드 최종 구현 계획*
