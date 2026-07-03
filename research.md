# jusik 기술 리서치 — 국내 지수 대시보드 (공공 API + Recharts)

> **작성일:** 2026-05-22  
> **앱 스펙:** KOSPI / KOSDAQ 지수 표시 · 최근 추이 라인 차트(Recharts) · 장 마감 후 일 1회 갱신 · CSS Modules  
> **프로젝트:** Next.js 16.2.6 · React 19.2.4 · App Router (`src/app/`)  
> **문서 목적:** 구현 전 기술 의사결정 기록 (소스 코드 작성 없음)

---

## 1. 요약 및 핵심 권고

| 주제 | 권고 |
|------|------|
| **대상 API** | 공공데이터포털 [금융위원회_지수시세정보](https://www.data.go.kr/data/15094807/openapi.do) — 주가지수 시세 오퍼레이션 (`getStockMarketIndex` 등, 활용 가이드로 최종 URL 확인) |
| **인증키** | `DATA_GO_KR_SERVICE_KEY` 환경변수, **서버 전용**. 클라이언트·`NEXT_PUBLIC_*` 금지 |
| **페칭 위치** | **1차: Server Component + `src/lib/` 데이터 레이어** (직접 `fetch`). BFF Route Handler는 선택(클라이언트 갱신·웹훅 시) |
| **캐싱** | `fetch(..., { next: { revalidate: N, tags: ['indices'] } })` + **평일 14:00 KST 전후 `revalidateTag` 크론**(권장) |
| **15:30 갱신 기대** | ⚠️ 공공 API는 **당일 15:30 직후가 아니라 T+1 영업일 13:00 이후** 반영 — UI 문구·캐시 스케줄을 API 실제 반영 시각에 맞출 것 |
| **Recharts** | 서버에서 fetch → **직렬화 가능한 props**로 **Client 전용 차트 컴포넌트**에 전달 (`'use client'`) |
| **스타일** | Tailwind 없음 · `tokens.css` + CSS Modules (기존 보일러플레이트와 동일 방향) |

---

## 2. 현재 프로젝트 베이스라인

### 2.1 구조

```
src/app/
├── layout.tsx      # Geist 폰트, globals.css
├── globals.css
├── page.tsx        # create-next-app 템플릿 (교체 예정)
└── page.module.css
```

- **의존성:** `next`, `react`, `react-dom`만 존재. **Recharts·axios 미설치**.
- **path alias:** `@/*` → `./src/*` (`tsconfig.json`).
- **라우트:** `/` 단일 정적 페이지 (빌드 시 Static prerender).

### 2.2 Next.js 16 유의사항 (`AGENTS.md`)

- 공식 가이드: `node_modules/next/dist/docs/` — v15/v16과 캐싱·`params` Promise 등 **breaking change** 존재.
- 본 프로젝트는 **`cacheComponents` 플래그 미사용** → **기존 `fetch` + `revalidate` 모델** 기준으로 분석 (Cache Components는 Phase 3+ 검토).

---

## 3. 공공 API 개요 (금융위원회 지수시세정보)

### 3.1 서비스 특성

| 항목 | 내용 |
|------|------|
| 제공 기관 | 금융위원회 (한국거래소 데이터 연계) |
| API 유형 | REST, JSON/XML |
| 갱신 주기 | **일 1회** (실시간 아님) |
| 데이터 반영 시각 | 기준일 **영업일 기준 하루 뒤 오후 1시(13:00) 이후** 업데이트 (금요일 → 다음 월요일 등) |
| 트래픽 | 개발계정 기본 10,000회/일 (운영 시 활용사례 등록으로 증설 가능) |
| 참고 문서 | `오픈API 활용자가이드_금융위원회_지수시세정보.docx` (포털에서 다운로드) |

> **스펙과의 정합성:** 요구사항 「매일 장 마감(15:30) 이후 갱신」은 **거래소 장 운영 시간** 기준이고, 공공 API는 **익영업일 13시 이후**에 전일 종가 데이터가 올라온다. 대시보드에 「최종 반영: YYYY-MM-DD (공공데이터 기준)」 표기를 권장한다.

### 3.2 엔드포인트 (확인 필요)

포털·커뮤니티 구현 사례 기준 **주가지수 시세** 호출 형태는 아래와 유사하다. **활용 신청 후 Swagger/가이드에서 최종 Base URL·오퍼레이션명을 반드시 재확인**한다.

| 항목 | 값 (참고) |
|------|-----------|
| Base (사례 1) | `https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService` |
| Operation (사례) | `/getStockMarketIndex` |
| Base (사례 2, 명칭 상이) | `GetIndexPriceInfoService` — 포털 개정 시 서비스명 변경 가능 |

**요청 파라미터 (주가지수 시세, 일반적 패턴):**

| 파라미터 | 설명 | KOSPI/KOSDAQ 예 |
|----------|------|-----------------|
| `serviceKey` | 일반 인증키 | env에서 주입 |
| `resultType` | `json` | json |
| `pageNo` | 페이지 | 1 |
| `numOfRows` | 행 수 | 추이 N일이면 N 이상 |
| `idxNm` | 지수명 | `코스피`, `코스닥` (가이드·2024.12 지수명 변경 주의) |
| `basDt` | 기준일자 `YYYYMMDD` | 미지정 시 최신, 과거 조회 시 지정 |

### 3.3 응답 구조 (JSON, 전형적 패턴)

공공데이터포털 금융 API는 대부분 아래 envelope를 따른다.

```json
{
  "response": {
    "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE." },
    "body": {
      "numOfRows": 10,
      "pageNo": 1,
      "totalCount": 100,
      "items": {
        "item": [ /* 또는 단일 객체 */ ]
      }
    }
  }
}
```

**주가지수 `item` 필드 예시 (가이드·사례 기준, 필드명은 가이드로 검증):**

| 필드 | 의미 | 대시보드 매핑 |
|------|------|----------------|
| `basDt` | 기준일자 | 차트 X축 `date` |
| `idxNm` | 지수명 | KOSPI/KOSDAQ 라벨 |
| `clpr` | 종가(현재 지수) | `close`, 카드 현재값 |
| `vs` | 전일 대비 | `changeAmount` |
| `fltRt` | 등락률(%) | `changeRate` |
| `mkp` / `hipr` / `lopr` | 시가/고가/저가 | (선택) 상세 패널 |

**`item` 단일 vs 배열:** `items.item`이 객체 1개인 경우가 많아 파서에서 **정규화 필수** (§6).

### 3.4 최근 7일 추이 데이터 확보 전략

단일 호출이 **하루·한 지수**만 줄 가능성이 높다. 추이 7일은 다음 중 선택:

| 방식 | 설명 | 트래픽 |
|------|------|--------|
| **A. `basDt` 7회 병렬 fetch** | 영업일 7개 날짜 계산 후 `Promise.all` | 지수 2개 × 7 = 14 req/갱신 |
| **B. `numOfRows` 확대 + 정렬** | API가 기간 목록 반환 시 1 req/지수 | 가이드 확인 후 우선 |
| **C. 서버 캐시 누적** | 매일 1회 fetch 후 DB/파일 누적 | 장기 운영용 |

**Phase 1 구현 권장:** A + `unstable_cache` / `fetch` revalidate로 **같은 갱신 주기에 묶기**.

---

## 4. 공공 API 보안 및 페칭 전략

### 4.1 일반인증키 (Encoding / Decoding)

| 키 종류 | 특징 | 사용 시점 |
|---------|------|-----------|
| **Encoding** | URL에 이미 `%2F` 등 인코딩된 문자열 | 쿼리스트링에 **수동 concat** 할 때 |
| **Decoding** | 원본 키 | **`URLSearchParams` 사용 시** (params가 재인코딩하므로 디코딩 키 사용) |

**권장 서버 패턴 (예시):**

```ts
// src/lib/api/data-go-kr/client.ts (구현 예정)
const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY is not set");

const params = new URLSearchParams({
  serviceKey: key, // Decoding 키 권장
  resultType: "json",
  pageNo: "1",
  numOfRows: "7",
  idxNm: "코스피",
});
const url = `https://apis.data.go.kr/.../getStockMarketIndex?${params}`;
```

- 포털 **미리보기**에서 Encoding/Decoding 각각 시험 → 동작하는 키를 env에 저장.
- **401 / SERVICE_KEY_IS_NOT_REGISTERED** → 키 종류 오류·활용 미승인·만료(2년) 점검.

### 4.2 환경변수 규칙

| 변수 | 노출 | 비고 |
|------|------|------|
| `DATA_GO_KR_SERVICE_KEY` | 서버 only | `.env.local`, Vercel Encrypted Env |
| `NEXT_PUBLIC_*` | 브라우저 | **인증키에 사용 금지** |

`.gitignore`에 `.env*` 포함됨 — 커밋 금지.

### 4.3 Server Component 직접 fetch vs Route Handler (BFF)

| 기준 | Server Component + `lib` | Route Handler (`/api/indices`) |
|------|---------------------------|--------------------------------|
| **인증키 보호** | ✅ 서버에서만 실행 | ✅ |
| **구현 복잡도** | 낮음 | 중간 (라우트·에러 JSON 추가) |
| **RSC 호환** | ✅ 네이티브 | 페이지가 내부 `fetch(origin/api)` 필요 |
| **클라이언트 재요청** | props만으로는 불가 | ✅ `fetch('/api/indices')` 가능 |
| **집계 API** | 페이지/loader에서 병렬 | 한 엔드포인트로 KOSPI+KOSDAQ+7일 묶기 용이 |
| **캐싱** | `fetch` revalidate / `unstable_cache` | Route `revalidate` + 동일 옵션 |
| **테스트** | lib 단위 테스트 | HTTP 통합 테스트 |

#### 추천 아키텍처 (하이브리드)

```
┌─────────────────────────────────────────────────────────────┐
│  app/page.tsx (Server Component)                            │
│    └─ getDashboardData()  ← src/lib/indices/getDashboard.ts │
│         ├─ fetchIndexSnapshot('코스피')                      │
│         ├─ fetchIndexSnapshot('코스닥')                      │
│         └─ fetchIndexHistory('코스피'|'코스닥', 7일)         │
└───────────────────────────┬─────────────────────────────────┘
                            │ serializable props
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  IndexDashboard (Server) — 레이아웃·카드·숫자 (CSS Modules)   │
│    └─ IndexLineChart (Client, Recharts)                      │
└─────────────────────────────────────────────────────────────┘

(선택) app/api/indices/route.ts
  → 크론 revalidateTag, 모바일 클라이언트 갱신, 외부 연동 시만 추가
```

**결론**

1. **기본 경로:** 데이터 페칭·매핑·캐시는 **`src/lib/api/` + Server Component**에 둔다.  
2. **BFF는 선택:** Vercel Cron이 `GET /api/indices`를 호출해 `revalidateTag('indices')` 하거나, 추후 클라이언트 주도 새로고침이 필요할 때 추가한다.  
3. **절대 금지:** 브라우저에서 `apis.data.go.kr` 직접 호출.

### 4.4 에러·안정성

| 상황 | 처리 |
|------|------|
| `resultCode !== '00'` | 사용자 메시지 + 서버 로그 (`resultMsg`) |
| `item` 없음 | empty state |
| 타임아웃 | `fetch` + `AbortSignal`, fallback UI |
| 개발 HMR 캐시 | `serverComponentsHmrCache`로 dev에서 stale 가능 → hard refresh로 검증 |

---

## 5. 데이터 캐싱 및 자동 갱신

### 5.1 Next.js 16 fetch 캐싱 (현재 프로젝트 적용 모델)

`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md` 기준:

```ts
// 예시 — 지수 API 호출
await fetch(url, {
  next: {
    revalidate: 86_400, // 초 단위
    tags: ["indices"],
  },
});
```

| `revalidate` | 의미 |
|--------------|------|
| `false` | 무기한 캐시 (Infinity) |
| `0` | 캐시 안 함 (매 요청 fetch) |
| `number` | 최대 N초 후 stale → 백그라운드 revalidate |

**개발 모드:** 페이지는 기본 **요청마다 렌더** — revalidate 동작은 **production build**에서 검증.

**Route segment:**

```ts
// app/page.tsx — 예시
export const revalidate = 86_400; // 레이아웃·페이지 기본 TTL(초), 정적 분석 가능한 리터럴만
```

개별 `fetch`의 `revalidate`가 더 짧으면 **라우트 전체 주기가 낮아짐**.

### 5.2 「15:30 이후 갱신」 vs 공공 API 실제 반영 시각

| 시각 | 의미 |
|------|------|
| **15:30 KST** | 당일 현물시장 정규장 마감 (UI·비즈니스 기대) |
| **T+1 13:00+ KST** | 공공 API에 **해당 영업일 종가**가 반영되는 시점 (공식 안내) |

따라서 **15:30에 revalidate를 맞춰도 API 응답은 전일과 동일할 수 있다.**  
앱의 「자동 갱신」은 다음 두 축으로 설계한다.

1. **사용자 기대(장 마감):** UI에 「공공데이터는 익영업일 오후 1시 이후 갱신」 안내.  
2. **기술적 갱신(신선 데이터):** **평일 14:00 KST 이후** 첫 revalidate + ISR.

### 5.3 권장 갱신 전략 (복합)

#### 전략 1 — Time-based Revalidate (기본, 필수)

```ts
// 24시간 — 구현 단순, 대부분의 요청은 캐시 적중
next: { revalidate: 86_400, tags: ["indices"] }
```

- 주말·공휴일에도 revalidate는 돌지만 **API 데이터는 변하지 않음** → 트래픽 낭비 최소화하려면 전략 2 병행.

#### 전략 2 — Cron + `revalidateTag` (권장, 운영)

| 항목 | 값 |
|------|-----|
| 스케줄 | `0 5 * * 1-5` (UTC) ≈ **평일 14:00 KST** (서머타임 시 cron 조정) |
| 동작 | `GET /api/cron/revalidate-indices` (Route Handler) → `revalidateTag('indices')` |
| 보안 | `CRON_SECRET` 헤더 검증 (Vercel Cron) |

```ts
// route.ts 예시 스케치
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  revalidateTag("indices");
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
```

#### 전략 3 — `unstable_cache` (비-fetch 로직)

날짜 계산·7일 병렬 호출·매핑 결과를 한 함수로 묶을 때:

```ts
import { unstable_cache } from "next/cache";

export const getDashboardData = unstable_cache(
  async () => { /* fetch + map */ },
  ["dashboard-indices"],
  { revalidate: 86_400, tags: ["indices"] }
);
```

#### 전략 4 — Cache Components (Next 16, 미래)

`cacheComponents: true` + `'use cache'` + `cacheLife()` 프로필 — **현재 프로젝트 미적용**. 마이그레이션은 API 연동 안정 후 검토.

### 5.4 갱신 전략 비교표

| 전략 | 장점 | 단점 | 채택 |
|------|------|------|------|
| `revalidate: 86400` | 단순 | API 반영 전에도 revalidate 가능 | ✅ 기본 |
| 15:30 KST cron | 비즈니스 직관 | **데이터는 아직 안 바뀜** | ❌ 단독 사용 비권장 |
| 14:00 KST 평일 cron + tag | API 반영 시각과 정합 | Cron 호스팅 필요 | ✅ 권장 |
| `revalidate: 0` | 항상 최신 시도 | 트래픽·속도 불리 | ❌ |
| 클라이언트 polling | — | 키 노출·비용 | ❌ |

### 5.5 영업일 계산

공휴일 API 없이 Phase 1에서는 **주말 제외 + 수동 공휴일 배열(선택)** 또는 **API `basDt` 역순 탐색**으로 7거래일 확보. 정확도 요구 시 한국거래소 휴장일 테이블·공휴일 API 추가.

---

## 6. 데이터 포맷 정제 (Data Mapper 설계)

### 6.1 레이어 구조

```
apis.data.go.kr (raw JSON)
        ↓
src/lib/api/data-go-kr/
  ├── client.ts          # URL, serviceKey, fetch + cache options
  ├── types.ts           # RawResponse, RawIndexItem (API 그대로)
  └── normalize.ts       # ensureArray(item)
        ↓
src/lib/indices/mapper.ts
  ├── toIndexSnapshot(raw)
  ├── toChartSeries(raw[])
  └── toDashboardDTO(kospi, kosdaq)
        ↓
src/types/indices.ts     # 앱 도메인 타입 (UI·Recharts)
```

### 6.2 도메인 타입 (앱 내부, Recharts 친화)

```ts
// src/types/indices.ts — 설계 예시

export type MarketIndex = "KOSPI" | "KOSDAQ";

export interface IndexSnapshot {
  market: MarketIndex;
  name: string;           // "코스피"
  basDt: string;          // "20260522" → 표시 시 포맷
  close: number;
  changeAmount: number;
  changeRate: number;
  direction: "rise" | "fall" | "flat";
}

/** Recharts LineChart dataKey 호환 */
export interface IndexChartPoint {
  date: string;           // "05/19" 또는 ISO — 표시용
  basDt: string;          // 원본 YYYYMMDD
  close: number;
}

export interface IndexSeries {
  market: MarketIndex;
  points: IndexChartPoint[];
}

export interface IndexDashboardData {
  asOf: string;           // ISO — 캐시 생성 시각
  kospi: IndexSnapshot;
  kosdaq: IndexSnapshot;
  kospiHistory: IndexSeries;
  kosdaqHistory: IndexSeries;
}
```

### 6.3 Raw → Domain 매핑 규칙

| 단계 | 함수 (예시) | 책임 |
|------|-------------|------|
| Normalize | `ensureItemsArray(body)` | `item` 단일 객체 → `[item]` |
| Parse number | `parseNum(s: string \| number)` | `clpr`, `fltRt` 문자열 대응 |
| Snapshot | `mapToSnapshot(item, market)` | `direction` = sign(`fltRt`) |
| History | `mapToChartPoints(items[])` | `basDt` 오름차순 정렬, `date` 라벨 |
| Validate | `assertChartLength(points, 7)` | 개발 시 경고 |

```ts
// mapper 예시 스니펫
function ensureItemsArray<T>(items: { item?: T | T[] }): T[] {
  const raw = items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function mapToChartPoints(items: RawIndexItem[]): IndexChartPoint[] {
  return ensureItemsArray({ item: items })
    .sort((a, b) => a.basDt.localeCompare(b.basDt))
    .map((row) => ({
      basDt: row.basDt,
      date: formatBasDtLabel(row.basDt), // "05/22"
      close: parseNum(row.clpr),
    }));
}
```

### 6.4 Recharts 데이터 형태

Recharts `LineChart`는 **객체 배열 + `dataKey`** 패턴.

```tsx
// Client 컴포넌트에서 사용할 props 예시 (구현 스케치)
<LineChart data={series.points}>
  <XAxis dataKey="date" />
  <YAxis domain={["auto", "auto"]} />
  <Line type="monotone" dataKey="close" dot={false} />
</LineChart>
```

- KOSPI/KOSDAQ **차트 2개** 또는 **탭 전환 1개** — UI 결정은 plan 단계에서 확정.
- Y축: 지수별 스케일 분리(차트 2개) 권장 — 스케일 혼합 시 왜곡.

### 6.5 DTO 조립 (대시보드 1회 로드)

```ts
// getDashboardData() 반환 예시
async function getDashboardData(): Promise<IndexDashboardData> {
  const [kospiRaw, kosdaqRaw, kospiHist, kosdaqHist] = await Promise.all([
    fetchIndex("코스피", { rows: 1 }),
    fetchIndex("코스닥", { rows: 1 }),
    fetchIndexHistory("코스피", 7),
    fetchIndexHistory("코스닥", 7),
  ]);
  return {
    asOf: new Date().toISOString(),
    kospi: mapToSnapshot(kospiRaw, "KOSPI"),
    kosdaq: mapToSnapshot(kosdaqRaw, "KOSDAQ"),
    kospiHistory: { market: "KOSPI", points: mapToChartPoints(kospiHist) },
    kosdaqHistory: { market: "KOSDAQ", points: mapToChartPoints(kosdaqHist) },
  };
}
```

---

## 7. 클라이언트 컴포넌트 분리 (Recharts + RSC)

### 7.1 제약

| 제약 | 설명 |
|------|------|
| Recharts | DOM/SVG 의존 → **Client Component 필수** |
| RSC | `fetch`·`process.env` 서버 전용 |
| React 19 | `recharts` 2.13+ 및 `react-is` 버전 정합 (peer) |

### 7.2 권장 컴포넌트 트리

```
app/page.tsx                          [Server]
└── IndexDashboard                    [Server]
    ├── AppHeader / IndexSummaryCards [Server] — CSS Modules
    │     ├── IndexCard (KOSPI)       [Server] — 숫자 .numeric
    │     └── IndexCard (KOSDAQ)      [Server]
    ├── IndexChartsSection            [Server] — 섹션 레이아웃만
    │     ├── IndexLineChart          [Client] ← Recharts
    │     └── IndexLineChart          [Client]
    └── DataAsOfFooter                [Server] — asOf, API 지연 안내
```

**데이터 전달 규칙**

- Server → Client: **plain object/array만** (JSON serializable).
- Client에서 **재-fetch 금지**(Phase 1) — 키·캐시 정책 단순화.
- 차트 interactivity(툴팁)만 클라이언트.

### 7.3 Client 차트 컴포넌트 패턴

**패턴 A — `'use client'` + 직접 import (권장, 단순)**

```tsx
// IndexLineChart.tsx — 스케치
"use client";

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { IndexSeries } from "@/types/indices";

export function IndexLineChart({ series }: { series: IndexSeries }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={series.points}>{/* ... */}</LineChart>
    </ResponsiveContainer>
  );
}
```

**패턴 B — `next/dynamic` + `ssr: false`**

- Recharts 전체를 dynamic 로드해 **hydration mismatch** 방지.
- React 19 + Next 16에서 이슈 시 B 적용.

```tsx
// IndexChartsSection.tsx (Server) — 스케치
import dynamic from "next/dynamic";

const IndexLineChart = dynamic(
  () => import("./IndexLineChart").then((m) => m.IndexLineChart),
  { ssr: false, loading: () => <p>차트 로딩 중…</p> }
);
```

**권장:** 먼저 **패턴 A** 시도 → 빌드/하이드레이션 오류 시 **B**로 전환.

### 7.4 Server / Client 경계 체크리스트

| 컴포넌트 | 유형 | 이유 |
|----------|------|------|
| `app/page.tsx` | Server | `getDashboardData()` |
| `IndexDashboard` | Server | 조립·SEO |
| `IndexCard` | Server | 정적 숫자·CSS Modules |
| `IndexLineChart` | **Client** | Recharts |
| `IndexChartsSection` | Server (A) 또는 Client wrapper (B) | dynamic 사용 시 |
| API lib / mapper | Server only | env·fetch |

### 7.5 Recharts 설치 시 (구현 단계 참고)

```bash
npm install recharts
```

- `react-is`가 React 19와 맞는지 `npm ls react-is` 확인.
- 문제 시 `package.json` `overrides`로 `react-is` 버전 정렬 (Recharts 이슈 #5146 참고).

---

## 8. 스타일링 (CSS Modules) — 대시보드 적용

Tailwind 없이 진행. `research.md`(이전 jusik 계획)와 동일하게:

| 계층 | 파일 | 용도 |
|------|------|------|
| 토큰 | `src/styles/tokens.css` | `--color-rise` `#f04452`, `--color-fall` `#3182f6`, 배경 `#f2f4f6` |
| 전역 | `globals.css` | `.numeric { font-variant-numeric: tabular-nums; }` |
| 카드 | `IndexCard.module.css` | surface, radius 16px |
| 차트 | `IndexLineChart.module.css` | 높이, 패딩 (Recharts wrapper) |

지수 색: **상승 빨강 / 하락 파랑** — 한국 주식 UI 관례. Recharts `<Line stroke={...} />`에 CSS 변수 연동은 Client에서 `getComputedStyle` 또는 토큰 hex를 props로 전달.

---

## 9. 제안 디렉터리 구조 (구현 시)

```
src/
├── app/
│   ├── page.tsx
│   ├── page.module.css
│   ├── layout.tsx
│   └── api/
│       └── cron/revalidate-indices/route.ts   # (선택)
├── components/
│   └── indices/
│       ├── IndexDashboard.tsx
│       ├── IndexCard.tsx
│       ├── IndexCard.module.css
│       ├── IndexChartsSection.tsx
│       ├── IndexLineChart.tsx                 # 'use client'
│       └── IndexLineChart.module.css
├── lib/
│   ├── api/data-go-kr/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   └── normalize.ts
│   └── indices/
│       ├── mapper.ts
│       ├── getDashboard.ts
│       └── dates.ts                           # 영업일 7개 계산
├── types/
│   └── indices.ts
└── styles/
    └── tokens.css
```

---

## 10. 리스크 및 오픈 이슈

| ID | 이슈 | 완화 |
|----|------|------|
| R1 | API URL/필드명 가이드와 불일치 | 활용 가이드 PDF 기준 단일 소스 |
| R2 | 15:30 vs T+1 13:00 기대치 gap | UI 문구 + 14:00 cron |
| R3 | `item` 단일/배열 | `ensureItemsArray` |
| R4 | Recharts × React 19 | 버전·dynamic ssr:false |
| R5 | 7일 × 2지수 트래픽 | 캐시·병렬 1일 1회 갱신 |
| R6 | 지수명 변경(2024.12) | `idxNm` 가이드 확인 |
| R7 | 개발 모드 캐시 착시 | production build로 revalidate 검증 |

---

## 11. 구현 순서 제안 (승인 후)

1. env + `lib/api/data-go-kr/client` + raw fetch 검증 (콘솔/일시 route)  
2. `types` + `mapper` + `getDashboardData` + revalidate/tag  
3. Server UI (카드, footer) + tokens/CSS Modules  
4. `recharts` + `IndexLineChart` (Client)  
5. (선택) Cron `revalidateTag`  
6. production에서 갱신 시각·캐시 hit QA  

---

## 12. 참고 링크

| 자료 | URL |
|------|-----|
| 금융위원회 지수시세정보 | https://www.data.go.kr/data/15094807/openapi.do |
| Next.js fetch / revalidate | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md` |
| Caching (Previous Model) | `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` |
| Recharts + Next 이슈 | https://github.com/recharts/recharts/issues/5146 |

---

## 13. 결론

- **보안:** 공공 API 키는 **서버 데이터 레이어**에만 두고, **Server Component에서 직접 fetch**하는 구조를 1차로 채택한다. BFF Route Handler는 크론·클라이언트 갱신이 필요해질 때 추가한다.  
- **갱신:** `revalidate: 86400` + **`indices` 태그** + **평일 14:00 KST cron `revalidateTag`** 조합이 공공 API 실제 반영 주기와 가장 잘 맞는다. 15:30만으로는 **데이터가 아직 갱신되지 않을 수 있음**을 명시한다.  
- **매퍼:** `items.item` 정규화 → `IndexSnapshot` / `IndexChartPoint[]` → Recharts `data` 배열.  
- **UI:** fetch·매핑은 Server, **Recharts만 Client**로 분리하고 직렬화된 props를 넘긴다.

본 문서는 `plan.md` 작성 및 구현 승인 전 **기술 의사결정의 기준 문서**로 사용한다.

---

## 14. KIS API 마이그레이션 리서치 (추가, 2026-07-03)

> §14는 실제 구현이 코드베이스에 선반영된 뒤 사후 문서화한 내용이다. §1~13(공공데이터포털 기반 원안)은 초기 리서치 기록으로 유지하고, 데이터 소스는 이후 한국투자증권(KIS) Open API로 전환되었다.

### 14.1 전환 배경

- 원안(§3)의 금융위원회 지수시세정보 API 대비, KIS Open API는 준실시간(약 10분 간격) 시세를 제공해 「15:30 이후 갱신」 기대치 격차(R2, §5.2, §10)를 줄일 수 있다.
- 코드베이스에 `src/lib/api/kis/`(`auth.ts`, `client.ts`, `constants.ts`, `types.ts`), `src/lib/indices/kisMapper.ts`가 이미 구현되어 있고, `getDashboard.ts`가 KIS 경로로 완전히 전환되어 있다.
- `src/lib/api/data-go-kr/`, `src/lib/indices/mapper.ts`(data-go-kr 전용 함수)는 레거시로 남아 있으며 사용 여부·정리 방향은 미확정 → `plan.md` Phase 5로 등록.

### 14.2 KIS Open API 개요

| 항목 | 내용 |
|------|------|
| Base URL | `https://openapi.koreainvestment.com:9443` (`KIS_BASE_URL` env로 override 가능) |
| 인증 | OAuth2 client_credentials, `POST /oauth2/tokenP` |
| 시세 조회 | `GET /uapi/domestic-stock/v1/quotations/inquire-index-daily-price` (TR_ID `FHPUP02120000`) |
| 지수 코드 | KOSPI `0001`, KOSDAQ `1001` (업종 시장분류 코드 `U`) |
| 응답 구조 | `output1`(당일 요약 스냅샷) + `output2`(일자별 배열, 최신순) |
| 캐시 정책 | fetch 레벨 `revalidate: 600s` + `unstable_cache` 이중 캐시 (§5.3 전략 1+3과 동일 패턴) |

### 14.3 토큰 발급 제약 (실측, 2026-07-03)

- 토큰 발급 엔드포인트는 **1분당 1회** 제한이며, 초과 시 `error_code: EGW00133`("접근토큰 발급 잠시 후 다시 시도하세요")로 거부된다. 로컬 검증 중 연속 스크립트 실행으로 실제 재현됨.
- 현재 구현(`src/lib/api/kis/auth.ts`)은 **모듈 메모리**에 토큰을 캐시(`cachedToken` + `inflight` 프로미스로 동시 요청 합류)한다. 단일 프로세스 내에서는 안전하지만, **서버리스 다중 인스턴스 환경(Vercel)에서는 인스턴스마다 캐시가 별도로 초기화**되어 트래픽 증가 시 인스턴스 수만큼 토큰 발급이 분산 발생 → 1분당 1회 제한에 걸릴 위험이 커진다.
- `auth.ts` 코드 내 기존 NOTE 주석에 "Vercel KV / Upstash Redis 등 외부 저장소 캐시로 교체 검토"가 이미 언급되어 있었으나 계획 문서에는 미반영 상태였다 → `plan.md` Phase 6으로 정식 등록.

### 14.4 외부 저장소 캐시 옵션 비교

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Vercel KV**(Upstash 기반 Redis) | Vercel 프로젝트에 통합, 대시보드에서 즉시 프로비저닝 | Vercel 플랫폼 종속 |
| **Upstash Redis**(직접 연동) | REST API로 Edge/서버리스 모두 호환, 배포처 종속 없음 | 별도 계정·키 관리 필요 |
| 유지(모듈 메모리) | 변경 없음 | 인스턴스별 분산 발급 지속, 스케일 시 rate limit 리스크 |

**권고:** Upstash Redis(REST API 방식)를 우선 검토한다 — 현재 Vercel 배포와 호환되면서도 특정 플랫폼에 종속되지 않는다. 상세 구현 순서는 `plan.md` Phase 6 참고.

---

*문서 버전: 2.0 · 국내 지수 대시보드 / 공공 API 연동 리서치*
