# jusik 코드 구조 사전 조사 (research.md)

> **문서 목적** — 장기 개발 중에도 AI·개발자가 매번 코드 구조와 기존 로직을 정확히
> 파악하고, 중복 구현·구조 무시를 막기 위한 사전 조사 문서다.
> plan.md에 새 작업을 추가·갱신할 때는 이 문서를 근거 자료로 참조하고, 계획이
> 실제 코드 구조와 어긋나지 않는지 여기 기록된 기존 로직·제약사항과 대조한다.
> 요청이 기존 설계 의도와 맞지 않으면 plan.md 작성 전에 먼저 사용자에게 확인받는다.
>
> 조사 기준: 2026-07-12, `src/` 전체 파일 직접 열람. 이전 문서는 `research.legacy.md`로 보존.
>
> **갱신 규칙**: 앞으로 모든 새 코드 리서치는 `research.legacy.md`(수정 금지)가 아니라
> 이 문서의 해당 절(§1~10)에 통합한다 — 새 번호 섹션을 추가하지 않는다.
>
> **문서 조직 원리** — 이 문서는 Phase 순서가 아니라 프로젝트 구조 기준 §1~10으로
> 조직된다. 시간 순서와 무관하게 항상 '현재 코드 기준 최신 상태'만 담는다.
> 새 조사 내용은 새 번호 섹션을 추가하지 않고 해당하는 기존 §1~10 절에 통합한다.
>
> **plan.md와의 역할 차이** — plan.md는 Phase 단위 작업 이력(시간순, 의사결정 기록)이고,
> research.md는 현재 코드 구조 스냅샷(시간 무관, 항상 최신 유지)이다 —
> 두 문서는 조직 원리가 다르므로 혼동하지 말 것.

---

## 1. 프로젝트 개요

- **앱**: KOSPI/KOSDAQ 개인 지수 대시보드. 홈 카드 7종(코스피·코스닥·시장·보유종목·
  코스피 변동성·핫종목·관심종목) + 각 상세 페이지.
- **스택**: Next.js 16.2.6 (App Router, `src/app`) · React 19.2.4 · TypeScript Strict ·
  Recharts 3 (차트, 유일한 Client 라이브러리) · Upstash Redis (REST) · Upstash QStash
  (스케줄러) · Auth.js(next-auth v5 beta) Google OAuth · fflate (종목 마스터 zip 해제) ·
  lucide-react (아이콘). **Tailwind 금지 — 순수 CSS + CSS Modules만** (AGENTS.md 헌법).
- **배포**: Vercel (jusik-app.vercel.app). 잡 라우트는 `maxDuration = 300`.
- **데이터 원천**: 한국투자증권(KIS) OpenAPI 단일화. ~~공공데이터포털~~은 Phase 5에서
  마이그레이션 완료되어 **코드에 더 이상 존재하지 않는다** (§9.1 특이사항 참고).

### 1.1 환경 변수 (전부 서버 전용 — `NEXT_PUBLIC_` 없음)

| 변수 | 용도 | 참조 위치 |
|---|---|---|
| `KIS_APP_KEY` / `KIS_APP_SECRET` | KIS 인증 | `lib/api/kis/auth.ts`, `client.ts` |
| `KIS_BASE_URL` | KIS 베이스 URL (기본값 내장, 선택) | `lib/api/kis/constants.ts` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Redis REST | `lib/redis/client.ts` |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | QStash 서명 검증 | `lib/jobs/verifyJobRequest.ts` |
| `CRON_SECRET` | 잡 수동 트리거 Bearer 폴백 | `lib/jobs/verifyJobRequest.ts` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth | `src/auth.ts` |
| `ALLOWED_EMAILS` | 접근 허용 이메일 CSV 화이트리스트 | `lib/auth/allowedEmails.ts` |
| `HOLDINGS_ENCRYPTION_KEY` | 개인 데이터 AES-256-GCM 키 (base64 32바이트) | `lib/crypto/secureJson.ts` |
| `DART_API_KEY` | DART OpenAPI 인증키 (공시, Phase 17-1) | `lib/api/dart/client.ts` |

---

## 2. 디렉토리 구조와 파일별 역할

### 2.1 `src/app` — 라우트 (전부 Server Component)

| 경로 | 역할 |
|---|---|
| `layout.tsx` | 루트 레이아웃. Geist 폰트, `tokens.css`+`globals.css` import, 테마 FOUC 방지 인라인 스크립트(`data-theme` 선결정) |
| `page.tsx` | 홈 대시보드. 세션 검사 → 허용 외 이메일이면 access-denied 화면 → 카드 7종 데이터 병렬 조회(`Promise.all`) → `IndexDashboard` 렌더. staleness 배지 판정도 여기서 수행 |
| `login/page.tsx` | Google 로그인 버튼 (Server Action으로 `signIn("google")`). 세션 있으면 `/` redirect, 인라인 `GoogleIcon` SVG 로컬 정의 |
| `indices/kospi` `kosdaq` `usdkrw` `us10y` `oil/page.tsx` | 지표 상세 5종 — 전부 `ensureAllowedSession()` 후 `<IndexDetailScreen market=…>` 한 줄 위임 |
| `indices/market/page.tsx` | 시장 요약(환율·금리·유가 미니 카드 3종). `getMarketDetails` MGET 1회 |
| `indices/kospi-volatility/page.tsx` | 변동성 상세 — 월별 평균 막대 차트 |
| `holdings/page.tsx` | 보유종목 목록·요약·연초 이후 추이·종목 추가 폼(`<details>` 토글) |
| `holdings/[symbolCode]/page.tsx` | 보유종목 상세 — 평가 요약·수정/삭제(`?edit=1`)·2년 추이·정보 블록 4종 |
| `holdings/actions.ts` | Server Actions: add/update/delete. **형식 검증만** 하고 KIS 호출 없음 (§6.4) |
| `watchlist/page.tsx` | 관심종목 목록 — 등록 기준일 종가 대비 수익률, 기준일 변경/삭제 |
| `watchlist/[symbolCode]/page.tsx` | 관심종목 상세 — 등록일 이후 추이·정보 블록 (보유종목 상세와 구조 동일) |
| `watchlist/actions.ts` | Server Actions: add/update(기준일 변경 시 기준가 null 리셋)/delete |
| `hot-stocks/page.tsx` | 핫종목 TOP 100 테이블 — `?period=1m|3m|6m|12m` 탭, 시장 위첨자(ᴷ/ᴰ) 표기(`MARKET_SUP` 로컬 상수) |
| `feeds/page.tsx` | 새 소식 상세 (Phase 17-2b) — `ensureAllowedSession` + `getDisclosureBoard` + `FeedTabsClient`(뉴스/공시/수출입 탭+게시판+아코디언). 홈 "새 소식" 요약 카드에서 이동 |
| `api/auth/[...nextauth]/route.ts` | Auth.js 핸들러 re-export (3줄) |
| `api/jobs/refresh-market-data/route.ts` | 시세 갱신 잡 엔드포인트 (POST, §4.1) |
| `api/jobs/refresh-hot-stocks/route.ts` | 핫종목 갱신 잡 엔드포인트 (POST, §4.2) |
| `api/jobs/refresh-feeds/route.ts` | 피드(공시) 갱신 잡 엔드포인트 (POST, §4.5) — KIS가 아니라 **시간창 가드 없음** |

라우트별 `page.module.css` 동반. 오류 UI는 별도 error.tsx 없이 각 page의 try/catch 인라인 처리.

### 2.2 `src/lib` — 도메인 로직

| 파일 | 역할 |
|---|---|
| `api/kis/constants.ts` | KIS 베이스 URL·엔드포인트·TR_ID·조회 코드·상수 전부. 지표 코드 변경 시 이 파일만 수정 |
| `api/kis/auth.ts` | KIS 토큰 발급·캐싱 — Redis 공유 캐시 + `SET NX PX` 분산 락 + 인스턴스 내 in-flight 합류 (§7.4) |
| `api/kis/client.ts` | `fetchKisJson` 공통 래퍼(헤더·rt_cd 검증·15초 타임아웃) + 조회 함수 9종 (지수·해외·현재가·랭킹·배당·손익·재무비율·종목명·기간별시세 일/월) |
| `api/kis/types.ts` | KIS 원본 응답 타입 (필드 전부 optional string, `[key: string]: unknown` 허용) |
| `api/dart/client.ts` | DART OpenAPI 클라이언트 — `corpCode.xml` zip 파싱(fflate, 상장사만 매핑)·공시검색 `list.json`(status 013=빈 결과 정상 처리) |
| `feeds/store.ts` | 피드 store — `market:disclosures:{code}`(공시 스냅샷) 라이터·`disclosuresKey` export·`dart:corpCodeMap`(종목코드→고유번호) 리더·라이터. (단일 종목 리더 `getDisclosures`는 Phase 17-2에서 제거 — 화면은 `homeFeed`의 MGET로 통합) |
| `feeds/homeFeed.ts` | 홈 피드 리더 (Phase 17-2/17-2b) — ① `getDisclosureBoard`(`/feeds`용): 보유+관심 `{code→name}` → `market:disclosures:{code}` MGET 병합·접수번호 내림차순·상위 40건 컷. ② `getTodayFeedCounts`(홈 요약 카드용): 같은 MGET으로 `rceptDt===KST 오늘`만 카운트(뉴스·수출입은 null=준비 중). `collectOwnedStocks` 공유. 읽기 전용(누적 없음 — 종목별 원본이 SET 덮어쓰기라 컷·카운트는 조회 시점 계산만) |
| `auth/allowedEmails.ts` | `ALLOWED_EMAILS` 파싱(모듈 로드 시 1회) — `isEmailAllowed` / `getAllowedEmails`(잡용 전체 목록) |
| `auth/ensureAllowedSession.ts` | 상세 페이지 공용 가드 — 미로그인→`/login`, 허용 외→`/`(access-denied) |
| `crypto/secureJson.ts` | AES-256-GCM `enc:v1:iv:tag:ct` 포맷 — `encryptJson`/`decryptJson`(실패 시 throw)/`isEncrypted` |
| `redis/client.ts` | Upstash Redis 싱글턴 `getRedis()` |
| `date/kst.ts` | `todayKstDate()` — KST "YYYY-MM-DD" (유일한 공용 KST 날짜 헬퍼) |
| `format/*` | 표시 포맷 모음 (§6.2 카탈로그) |
| `indices/kisMapper.ts` | 국내지수 응답→도메인 매핑 + **공용 유틸 `parseNum`/`applyKisSign`/`resolveDirection`/`formatBasDtLabel`** |
| `indices/kisOverseasMapper.ts` | 해외(환율·금리·유가) 응답→도메인 매핑. 행별 전일 대비가 없어 인접 종가 차분으로 계산 |
| `indices/getDashboard.ts` | 홈 데이터 리더 — `market:detail:*` 5종 MGET. 필수 4종 없으면 throw(`MARKET_DATA_EMPTY_MESSAGE`), oil은 null 허용 |
| `indices/getIndexDetail.ts` / `getOverseasDetail.ts` | 상세 리더 — `market:detail:{key}` 1건. **두 파일 내용이 사실상 동일** (§8) |
| `indices/volatility.ts` | 변동성 기록 store+계산+카드 요약 (한 파일에 쓰기·읽기 혼재) |
| `indices/dates.ts` | `getLast7BusinessDates` — **현재 미사용 (레거시)** (§9.2) |
| `market/store.ts` | 공용 시세 Redis 스토어 — `market:detail:*`, `market:stock:*`, `market:stockInfo:*`, `market:lastRefreshAt` (§5) |
| `market/staleness.ts` | KST 시간창 가드(`isWithinKisCallWindow` 09:00~18:40) + **스케줄 인지형 배지 판정** `resolveStaleness` — 시세 잡 스케줄 상수(`SCHEDULE_MINUTES`: 09:00~15:30 10분 + 15:40 + 18:15)로 "이미 완료됐어야 할 최근 슬롯(`lastDueRefreshMs`, 유예 20분)"을 구해, fetchedAt이 그보다 오래됐을 때만 배지(정상 휴지 구간엔 안 뜸). 지연 경과로 warn/critical. `SCHEDULE_MINUTES`는 외부 QStash 등록과 동기화 필수 |
| `holdings/store.ts` | 보유종목·포트폴리오 히스토리 store — 암호화, 레거시 평문/`avgPrice` 읽기 하위호환 |
| `holdings/valuation.ts` | 포트폴리오 평가(스냅샷 MGET) — 시세 없는 종목 null 격리·합계 제외, `latestRecordBefore`/`computeDailyChangeRate` |
| `holdings/summary.ts` | 홈 보유종목 카드 요약 (실패 시 null) |
| `holdings/stockHistory.ts` | 종목별 2년 종가 히스토리 `stock:{code}:history` — 백필(최대 8콜 페이징)/일별 갱신/upsert |
| `holdings/stockInfo.ts` | 정보 블록 4종 — 쓰기(잡 전용 `fetchStockInfoBlocks`: 배당·손익·재무비율 병렬)와 읽기(`getStockInfo`: Redis 조합만) 경로가 한 파일에 명시 구분 |
| `hotstocks/store.ts` | 핫종목 store — `market:hotStocks` + `:progress` 커서, 구간 4종 정의·라벨 |
| `hotstocks/months.ts` | 월 문자열("YYYY-MM") 계산 — `baseMonthKst`(전월)/`addMonths`/월초·월말/표시 포맷 |
| `hotstocks/universe.ts` | KIS 종목 마스터 zip 다운로드·EUC-KR 고정폭 파싱 — ST(주권)만, 스팩 제외, 코드 오름차순 |
| `hotstocks/summary.ts` | 홈 핫종목 카드 요약 + 갱신 지연 판정 `isHotStocksStale` |
| `jobs/refreshMarketData.ts` | **시세 갱신 잡 파이프라인 본체** (§4.1) |
| `jobs/refreshHotStocks.ts` | **핫종목 갱신 잡 파이프라인 본체** (§4.2) |
| `jobs/refreshFeeds.ts` | **피드(공시) 갱신 잡 파이프라인 본체** (§4.5) |
| `jobs/collectTargets.ts` | 잡 공용 수집 대상 조회 — `collectHoldings`/`collectWatchlists`/`unionSymbolCodes`/`errorMessage` (시세·피드 잡 공유, Phase 17-1에서 refreshMarketData 로컬 함수를 추출) |
| `jobs/verifyJobRequest.ts` | 잡 공용 인증 — QStash 서명 → CRON_SECRET Bearer 폴백(timingSafeEqual) |
| `watchlist/store.ts` | 관심종목 store — 암호화 (신규 키라 평문 하위호환 없음) |
| `watchlist/summary.ts` | `computeWatchReturnRate`(순수 함수) + 홈 카드 요약 |
| `theme.ts` | `THEME_STORAGE_KEY`·`Theme` 타입만 |

### 2.3 `src/components`

| 컴포넌트 | 종류 | 역할 |
|---|---|---|
| `indices/IndexDashboard` | Server | 홈 카드 7종 조립 + 헤더(테마 토글·로그아웃) |
| `indices/SummaryCard` | Server | **홈 요약 카드 공용 프리미티브** — value/change/footnote/placeholder/staleness 배지. 카드 전체가 Link |
| `indices/HotStocksCard` | Server | 핫종목 전용 카드 (TOP 3 리스트라 SummaryCard 미사용) |
| `indices/IndexDetailScreen` | Server(async) | **지표 상세 5종 공용 화면** — `getIndexDetail`/`getOverseasDetail` 분기, 카드+차트+일별 리스트+푸터 |
| `indices/IndexCard` / `IndexDailyList` / `DataAsOfFooter` | Server | 상세 스냅샷 카드 / 일별 시세 리스트 / 홈 푸터 |
| `indices/IndexChartClient` → `IndexLineChart` | Client | Recharts 래핑 패턴: Client 셸이 `dynamic(…, { ssr: false })` + 스켈레톤 → 실제 차트 |
| `indices/VolatilityChartClient` → `VolatilityChart` | Client | 동일 패턴, BarChart |
| `holdings/HoldingsChartClient` → `HoldingsChart` | Client | 동일 패턴, LineChart + 수익률%↔원단위 토글. **보유종목 홈/상세·관심종목 상세 3곳 공용** (관심종목에선 totalValue 자리에 종가를 넣어 재활용) |
| `stocks/StockInfoBlocks` | Server | 정보 블록 4종(시총·배당·실적·투자지표) — 보유·관심 상세 공용, `formatRatio` export |
| `feeds/FeedTabsClient` | **Client** | 뉴스/공시/수출입 3탭 + 게시판 + 아코디언 (Phase 17-2). 데이터는 Server가 props로 주입, Client는 탭 선택·아코디언 open/close만. 공시 탭만 실동작(제출인·접수일 메타+DART 원문 새 탭), 뉴스·수출입은 자리표시자. **17-2b에서 홈 전체폭→`/feeds/page.tsx`로 렌더 위치만 이동**(컴포넌트 무변경). ~~`stocks/StockDisclosures`~~는 A안 철회로 **삭제** |
| `indices/FeedSummaryCard` | Server | 홈 "새 소식" 그리드 요약 카드 (Phase 17-2b) — 핫종목형 3줄(공시/뉴스/수출입 당일 건수, 뉴스·수출입은 "준비 중"). 골격은 SummaryCard `composes`, 카드 전체가 `/feeds` 링크. `getTodayFeedCounts` 결과를 prop으로 받음 |
| `nav/NavIconLink` | Server | 헤더 이동 아이콘 버튼(home/back) — 36px 아이콘 버튼 통일 규격 |
| `theme/ThemeToggle` | Client | `useSyncExternalStore`로 `data-theme` 구독·토글 |
| `auth/SignOutButton` | Server | Server Action `signOut` 폼 |

### 2.4 기타

- `src/types/indices.ts` `holdings.ts` `watchlist.ts` — 도메인 타입 (§6.3).
- `src/proxy.ts` — **미들웨어에 해당** (Next 16에서 파일명 proxy). 세션 쿠키만 낙관적
  검사, 허용 이메일 판정은 page 레벨. matcher가 `api/auth`·잡 라우트 3종·정적 자산 제외.
  → **잡 라우트는 미들웨어 미보호이며 `verifyJobRequest`가 유일한 인증** — 새 잡 라우트를
  신설하면 이 matcher 제외 등록이 세트로 필요하다 (§8.13).
- `src/styles/tokens.css` — 디자인 토큰(색·타이포·간격·radius). `html[data-theme="dark"]`
  오버라이드. 등락색: rise `#f04452` / fall `#3182f6` (한국식 빨강=상승).
- `src/app/globals.css` — `.numeric` (`tabular-nums`) 등 전역. 숫자 UI는 항상 `.numeric` 병기.
- `next.config.ts` — `staticPageGenerationTimeout: 300`만.

---

## 3. 아키텍처 대원칙 (모든 계획이 지켜야 함)

1. **외부 API 호출은 잡 경유만 한다.** KIS는 시세·핫종목 잡 2종, DART는 피드 잡이
   유일한 호출 경로다. 화면(Server Component)·Server Action은 외부 API를 절대
   직접 호출하지 않고 Redis 스냅샷만 읽는다 (plan.md §11.6). 사용자 액션은 임의 시각에
   발생해 KIS 허용 시간 규칙과 충돌하므로, 등록 폼은 형식 검증만 하고 종목명·시세·
   기준가는 다음 갱신 회차에 잡이 채운다 (§11.10-A4, §15.4).
2. **쓰기/읽기 주체 분리** — Redis 공용 시세 키의 쓰기는 잡만, 읽기는 화면만.
   개인 데이터(holdings/watchlist)만 Server Action이 쓴다.
3. **모든 저장은 멱등** — SET 덮어쓰기·날짜 upsert. 잡 재시도·중복 실행에 안전.
4. **실패 격리** — 지표별/종목별/이메일별로 try-catch 격리, 카드 요약은 실패 시 null
   반환(홈 전체를 막지 않음), 부분 실패는 리포트에 기록.
5. **KST 시간창 이중 방어 (KIS 한정)** — QStash 스케줄 자체 + 라우트의
   `isWithinKisCallWindow` 가드(평일 09:00~18:40 밖이면 no-op 200). 우회는
   `?force=true` + CRON_SECRET 수동 트리거 한정. **피드 잡(DART)은 시간창 제약이
   없어 이 가드를 적용하지 않는다** (plan.md §17.2).

---

## 4. 데이터 흐름

### 4.1 시세 갱신 잡 (핵심 파이프라인)

```
QStash 스케줄 4개 (평일 09:00~15:30 10분 간격 / 15:40 / 18:15 KST)
  → POST /api/jobs/refresh-market-data
      ① verifyJobRequest: QStash 서명 → CRON_SECRET Bearer 폴백 (실패 401)
      ② isWithinKisCallWindow 가드 (밖이면 no-op 200; manual+?force=true만 우회)
  → refreshMarketData(trigger)  [lib/jobs/refreshMarketData.ts]
      1. refreshIndices: KIS 5종 병렬(allSettled) → market:detail:{kospi|kosdaq|usdkrw|us10y|oil}
         (snapshot + history 7일 + dailyRows, 매퍼: kisMapper / kisOverseasMapper)
      2. KOSPI 원본 응답 재사용 → computeVolatilityRecords → kospiVolatility:history upsert
      3. 전체 허용 이메일의 holdings + watchlist 조회 → 종목코드 union·중복 제거
      4. refreshStocks: 종목별 순차(유량 제한) —
         현재가 스냅샷 → market:stock:{code}
         + 확정 회차(KST 15:35 이후: 15:40·18:15)면 종가 히스토리 갱신·정보 블록 갱신
         + 신규 종목이면 즉시 2년 백필 / 정보 블록 최초 생성
         (시총 랭킹은 회차당 1회 지연 조회)
      5. fillMissingNames: 종목명 빈 항목 → fetchKisStockName → holdings/watchlist 저장
      6. fillRegistrationPrices: 관심종목 기준가 확정 — KIS 호출 없이
         stock:{code}:history에서 registeredAt 이하 마지막 종가. 잠정(직전 거래일)
         확정은 이후 회차에 당일 종가로 승격 재확인. 멱등
      7. refreshPortfolios: 이메일별 평가 → holdings:{email}:history 오늘 upsert
         (스냅샷 하나라도 없으면 과소 집계 방지 위해 그 사용자 skip)
      8. tradingDay 판정(KOSPI basDt == KST 오늘) → 알림 훅 evaluateAlertsHook
         (Phase 10 예정, 현재 no-op. 휴장일 skip, 실패해도 200)
      9. 전부 성공 시 market:lastRefreshAt 기록
  → 응답: report (데이터 갱신 실패 시 500 → QStash 재시도)
```

### 4.2 핫종목 갱신 잡

```
QStash 스케줄 (매월 1~7일 10:35 KST) → POST /api/jobs/refresh-hot-stocks
  (인증·시간창 가드 동일)
  → refreshHotStocks(trigger)  [lib/jobs/refreshHotStocks.ts]
      완료 가드: market:hotStocks.computedFor == 기준월(전월)이면 no-op
      → fetchHotStockUniverse: 마스터 zip 2종 다운로드·파싱 (~2,650종목, 코드 오름차순)
      → market:hotStocks:progress 있으면 커서 이어받기 (같은 기준월만 유효)
      → 종목별: 월봉 1콜(M-13월초~M월말) → 구간 4종(1m/3m/6m/12m) 수익률 후보 제출
         (온라인 선택으로 구간별 상위 100만 유지, 초당 15콜 스로틀, 1회 재시도,
          연속 10실패 시 progress 저장 후 중단·500)
      → 시간 예산 250초 소진 시 progress 저장 후 종료 (다음 날 스케줄이 이어받음)
      → 완주 시 market:hotStocks 저장 + progress 삭제
```

### 4.5 피드(공시) 갱신 잡 — Phase 17-1

```
QStash 스케줄 (매일 08~22시 정시 KST, CRON_TZ=Asia/Seoul 0 8-22 * * *)
  → POST /api/jobs/refresh-feeds
      verifyJobRequest만 — isWithinKisCallWindow 가드 없음 (KIS 아님, 공시는 장외·주말에도 발생)
  → refreshFeeds(trigger)  [lib/jobs/refreshFeeds.ts]
      1. collectHoldings + collectWatchlists (collectTargets.ts 공용) → 종목코드 union
      2. ensureCorpCodeMap: dart:corpCodeMap 30일 주기 갱신
         (+매핑에 없는 신규 종목 발견 시 1일 1회 보정 갱신 — 미매핑 코드가 매 회차
          zip을 받지 않게 제한). corpCode.xml zip → 상장사(6자리 종목코드)만 매핑
      3. 종목별 순차(150ms 간격): DART list.json 최근 90일 최대 10건
         → market:disclosures:{code} SET 덮어쓰기 (종목별 실패 격리)
  → 응답: report (실패 시 500 → QStash 재시도, 멱등)
```

- 17-2(뉴스, 네이버 검색 API)·17-3(정부자료, 관세청 API)은 이 파이프라인에 소스별로
  증분 추가 예정 (plan.md §17.6).

### 4.3 화면 읽기 경로 (전부 Redis만)

페이지가 부르는 내부 REST API는 없다 — Route Handler는 auth·잡 2종뿐이고, 모든
페이지는 Server Component에서 lib 함수를 직접 호출한다.

- **홈** `app/page.tsx`: `getDashboardData`(detail 5종 MGET) + 카드 요약 4종 +
  `getLastRefreshRecord` 병렬 → staleness 배지 판정 → `IndexDashboard`.
- **지표 상세**: `IndexDetailScreen` → `getIndexDetail`/`getOverseasDetail` → detail 1건.
- **보유종목**: `getHoldings`(복호화) → `getPortfolioValuation`(`market:stock:*` MGET) +
  `getPortfolioHistory`. 상세는 + `getStockInfo`(스냅샷+정보 블록 조합) + `getStockHistory`.
- **관심종목**: `getWatchlist` + `getStockSnapshots` + `computeWatchReturnRate`.
  상세는 보유종목 상세와 동일 구성에 기준가 대비 차트.
- **홈 "새 소식" 카드**: `getTodayFeedCounts(email)`(feeds/homeFeed) — 오늘 공시 건수만
  집계 → `FeedSummaryCard`. 홈 `Promise.all`에 `.catch(() => 기본 0/null)` 격리로 합류.
- **새 소식 상세(`/feeds`)**: `getDisclosureBoard(email)` — `market:disclosures:{code}`
  MGET 병합·상위 40건 → `FeedTabsClient`. (Phase 17-2에서 A안 철회 — 보유·관심 상세
  페이지는 더 이상 공시를 읽지 않는다. 17-2b에서 게시판을 홈 전체폭→`/feeds`로 이동.)
- **핫종목**: `getHotStocks` 통짜 1건 → `?period` 탭으로 구간 선택 (검증: 알 수 없는 값→1m).
- **변동성**: `getVolatilityHistory` → `aggregateMonthlyAverages`(최근 6개월).

### 4.4 사용자 쓰기 경로 (Server Actions)

- `holdings/actions.ts`·`watchlist/actions.ts`: `requireEmail`(세션+허용 검사, 실패
  redirect `/login`) → 형식 검증(실패 시 `?error=코드` redirect, page의 ERROR_MESSAGES
  맵이 표시) → store 저장(암호화) → `revalidatePath` → redirect.
- 검증 규칙: 종목코드 `^\d{6}$` · 수량 양의 정수 · 총 매입금액 > 0 · 관심종목 기준일은
  오늘 이하 & 최근 2년(`STOCK_HISTORY_WINDOW_DAYS`) 이내(히스토리 범위 밖은 기준가
  확정 불가라 등록 차단) · 동일 종목 중복 등록 차단.
- 관심종목 기준일 변경 시 `priceAtRegistration`/`priceBasisDate`를 null로 리셋 →
  다음 회차에 잡이 재확정.

---

## 5. Redis 키 맵

| 키 | 값 | 암호화 | 쓰기 주체 | 읽기 주체 |
|---|---|---|---|---|
| `market:detail:{kospi\|kosdaq\|usdkrw\|us10y\|oil}` | `StoredMarketDetail` (snapshot+history+dailyRows+fetchedAt) | ✕ | 시세 잡 | 홈·지표 상세·시장 |
| `market:stock:{code}` | `StoredStockSnapshot` (price·changeRate·marketName·raw 전체·fetchedAt) | ✕ | 시세 잡 | 평가·관심종목·상세 |
| `market:stockInfo:{code}` | `StoredStockInfoBlocks` (순위·배당·실적) | ✕ | 시세 잡(확정 회차/신규) | `getStockInfo` |
| `market:lastRefreshAt` | `LastRefreshRecord` (at·trigger·ok) | ✕ | 시세 잡(전부 성공 시) | 홈 배지·각 페이지 「마지막 갱신」 |
| `stock:{code}:history` | `StockDailyPrice[]` 2년 (날짜 오름차순) | ✕ | 시세 잡(백필/확정 갱신) | 상세 차트·기준가 확정 |
| `kospiVolatility:history` | `KospiVolatilityRecord[]` | ✕ | 시세 잡 | 변동성 카드·상세 |
| `market:hotStocks` | `StoredHotStocks` (구간 4종 TOP 100) | ✕ | 핫종목 잡 | 핫종목 카드·페이지 |
| `market:hotStocks:progress` | `HotStocksProgress` (커서) | ✕ | 핫종목 잡 (완료 시 삭제) | 핫종목 잡 |
| `holdings:{email}` | `Holding[]` | **○** | Server Action + 잡(종목명 채움) | 보유종목 화면·잡 |
| `holdings:{email}:history` | `PortfolioDailyRecord[]` | **○** | 시세 잡 | 보유종목 화면 |
| `watchlist:{email}` | `WatchItem[]` | **○** | Server Action + 잡(종목명·기준가) | 관심종목 화면·잡 |
| `kis:access_token` (+`:lock`) | 토큰 캐시 (TTL=만료 시각) | ✕ | KIS auth | KIS auth |
| `market:disclosures:{code}` | `StoredDisclosures` (최근 90일 공시 최대 10건+fetchedAt) | ✕ | 피드 잡 | 홈 통합 피드(`homeFeed` MGET) |
| `dart:corpCodeMap` | `StoredCorpCodeMap` (종목코드→DART 고유번호, 30일 주기) | ✕ | 피드 잡 | 피드 잡 |

- 이메일 키는 항상 `normalizeEmail`(trim+lowercase) 후 사용.
- 공용 시세는 비암호화(사용자 무관 공개 데이터), 개인 데이터 3키만 `enc:v1:` 암호화.
- `holdings:{email}`은 레거시 평문 배열·`avgPrice` 모델 읽기 하위호환이 있고, 다음
  저장 시 자연 마이그레이션된다. watchlist는 신규 키라 하위호환 없음.

---

## 6. 재사용 가능한 기존 자산 카탈로그

새 기능 구현 전 반드시 여기서 먼저 찾는다. 같은 성격의 코드를 새로 만들면 안 된다.

### 6.1 데이터·계산 유틸

- `parseNum` (kisMapper) — KIS 문자열 숫자→number(비정상 0). *주의: `stockInfo.ts`의
  `toNumber`는 비정상 시 null 반환으로 의미가 다름 — 0이 유효값인 문맥에선 toNumber 계열.*
- `applyKisSign` — KIS 부호 코드(1~5)→부호 있는 숫자. 전일 대비 다룰 때 필수.
- `resolveDirection` — 등락값→`rise|fall|flat` (CSS 클래스명과 1:1).
- `todayKstDate` (date/kst) — KST 오늘 "YYYY-MM-DD".
- `ensureAllowedSession` — 페이지 접근 가드. `requireEmail` 패턴 — 액션 가드.
- `encryptJson`/`decryptJson`/`isEncrypted` — 개인 데이터 저장 시 필수.
- `getStockSnapshots`/`getMarketDetails` — MGET 일괄 조회 (개별 GET 반복 금지).
- `computeWatchReturnRate`, `computeDailyChangeRate`, `latestRecordBefore`,
  `getPortfolioValuation` — 수익률·평가 계산은 이들 재사용.
- `addMonths`/`baseMonthKst`/`monthStartYyyyMmDd`/`monthEndYyyyMmDd` (hotstocks/months) —
  월 단위 계산 공용.
- `resolveStaleness`(스케줄 인지형 배지)/`isWithinKisCallWindow` (market/staleness).
- `verifyJobRequest` — 새 잡 라우트를 만들면 반드시 이걸로 인증 (신설 시 3곳 동기화 — §8.13).
- `collectHoldings`/`collectWatchlists`/`unionSymbolCodes` (jobs/collectTargets) —
  잡의 수집 대상(허용 이메일 전체 보유+관심종목) 조회는 이들 재사용.
- `getDisclosureBoard` (feeds/homeFeed) — 사용자 보유+관심 공시를 MGET 병합·상위 40건
  컷(`/feeds` 게시판용). `getTodayFeedCounts` — 같은 MGET으로 당일 건수만 세는 홈 카드용.
  종목별 원본 리더가 필요하면 이들을 확장(`disclosuresKey` export 재사용).
- `getLastRefreshRecord().catch(() => null)` — 「마지막 갱신」 표기는 이 실패 격리
  패턴으로 통일 (여러 페이지에서 반복되는 관례).

### 6.2 표시 포맷 (`lib/format/*`)

- `formatIndex` — 지수 소수 2자리. `formatKrw` — "12,345원". `formatAvgPrice` —
  총액÷수량 버림 2자리. `formatEokwon` — 억원→"356조 6,867억원". `formatKrwAbbrev` —
  차트 y축 M/B. `formatChangeAmount`/`formatChangeRate`/`formatChange`/
  `formatPercentPoint` — 등락 표기(+부호). `formatKstDateTime` — 「마지막 갱신」 표기.
  `formatBasDtDisplay`(2026.06.01) / `formatBasDtLabel`(06/01, kisMapper에 위치).
  `formatRatio`(StockInfoBlocks에서 export) — PER/PBR 등.
  `formatMonthDisplay`/`formatMonthRangeDisplay` (hotstocks/months).

### 6.3 타입

- `types/indices.ts` — `IndicatorId`(=`MarketIndex`|`OverseasIndicator`),
  `IndexSnapshot`/`IndexSeries`/`IndexDailyRow`/`IndexDetailData`/`IndexDashboardData`,
  `PriceDirection`, 변동성 3종, `KIS_DATA_NOTICE`, `INDICATOR_NAMES`.
- `types/holdings.ts` — `Holding`(totalCost 모델), `PortfolioDailyRecord`,
  `HoldingValuation`/`PortfolioValuation`, `HoldingsCardSummary`.
- `types/watchlist.ts` — `WatchItem` (priceAtRegistration/priceBasisDate 잠정·확정 모델).
- store별 Stored* 타입은 각 store 파일에서 export (market/store, hotstocks/store).

### 6.4 UI 패턴

- **Recharts는 3단 래핑 고정**: Server page → `*ChartClient`(`'use client'` +
  `dynamic(ssr:false)` + 스켈레톤) → 실제 차트 컴포넌트. 새 차트도 이 패턴.
- 차트 색·축은 CSS 변수(`var(--chart-stroke-kospi)` 등) 사용 — 하드코딩 금지.
- 홈 카드는 `SummaryCard` 프리미티브 재사용 (특수 레이아웃만 HotStocksCard처럼 별도).
- 페이지 헤더 규격: `NavIconLink`(home/back) + `h1.title` + `span.lastRefresh`.
- 숫자는 `.numeric` 클래스, 등락 색은 `styles[resolveDirection(x)]` — 새 화면의 CSS
  Module에도 `.rise/.fall/.flat` 클래스가 있어야 한다.
- **신규 단일 지표 상세 화면은 `IndexDetailScreen`(market 프로프) 패턴 재사용이 1순위.**
- 폼 오류는 `?error=코드` redirect + page의 `ERROR_MESSAGES` 맵 + `role="alert"` 배너.
- 접기 폼은 `<details open={오류 시}>` 패턴 (holdings·watchlist 추가 폼).
- 페이지 골격 CSS 클래스명 관례: `page > container > header/section/footer` +
  `sectionTitle`·`emptyNotice`·`notice` (페이지마다 `page.module.css` 1:1).

---

## 7. 인증·보안 구조

### 7.1 사용자 인증 (Auth.js + 화이트리스트 2단)

- `src/auth.ts`: Google Provider만, `trustHost: true`. **로그인 자체는 모든 Google
  계정 허용** — 접근 가부는 page 레벨에서 판단 (access-denied 화면을 보여주기 위한
  의도된 설계).
- `src/proxy.ts`(미들웨어): 세션 쿠키 존재만 낙관적 검사, 없으면 `/login` redirect.
  matcher가 `api/auth`, 잡 라우트 2종, 정적 자산을 제외.
- page 레벨: 홈은 직접 검사(허용 외→access-denied 화면 렌더), 나머지 페이지는
  `ensureAllowedSession()`(허용 외→`/` redirect). Server Action은 `requireEmail`.

### 7.2 잡 엔드포인트 인증 (`verifyJobRequest`)

- ① QStash `Upstash-Signature` JWT 검증 (Receiver, 서명·본문 해시·만료만 — URL claim은
  프록시 편차로 검증 제외) → ② 실패 시 `CRON_SECRET` Bearer 폴백(`timingSafeEqual`
  타이밍 공격 방지). 반환값 `"qstash" | "manual" | null`이 trigger 문자열이자 force
  권한 판단 기준(`manual`만 `?force=true` 허용).

### 7.3 개인 데이터 암호화 (`secureJson`)

- AES-256-GCM, `enc:v1:{iv}:{tag}:{ct}` base64. IV 매회 랜덤 12바이트. 복호화 실패는
  **throw** (조용한 빈 값 반환 금지 — plan.md §12.3). 버전 프리픽스로 키 로테이션(v2) 대비.

### 7.4 KIS 토큰 발급·캐싱 (`api/kis/auth.ts`) — 3중 동시성 제어

1. Redis 캐시 (`kis:access_token`, TTL=만료 시각, 만료 60초 전 갱신) — 다중 인스턴스 공유.
2. 같은 인스턴스 동시 요청은 `inflight` 프로미스 합류.
3. 인스턴스 간 동시 발급은 `SET NX PX 10s` 분산 락 — 락 미점유 시 250ms×20회 폴링으로
   피어가 써준 토큰 대기. KIS 토큰 발급은 1초 1건 제한이라 이 구조가 필수.

### 7.5 기타

- KIS 키·Redis 토큰 등 전부 서버 전용 env. 클라이언트에서 외부 API 직접 호출 없음.
- `dangerouslySetInnerHTML`은 layout.tsx 테마 스크립트 1곳 — 정적 문자열 상수라 안전.
- 사용자 입력 렌더링은 React 기본 이스케이프에 의존 (위험 패턴 없음).

---

## 8. 화면 간 겹치는·중복된 로직 (수정 시 주의, 리팩터링 후보)

새 작업이 아래 항목을 건드리면 **모든 사본을 함께** 고치거나, 공용화를 먼저 검토한다.

1. **KST 변환 `new Date(now + 9*60*60*1000)` + getUTC\* 패턴 5곳** — `date/kst.ts`,
   `market/staleness.ts`, `hotstocks/months.ts`, `refreshMarketData.isConfirmedRound`,
   `kis/client.ts kstYyyyMmDd`. 공용 헬퍼는 `todayKstDate` 하나뿐이고 나머지는 인라인.
   *참고: `todayKstDate`는 `date/kst`가 정본이고 `holdings/store`가 re-export — import
   경로가 2개지만 실체는 동일 (실측 확인).*
2. **`kstYyyyMmDd(daysAgo)` 함수가 문자 그대로 중복** — `kis/client.ts`와
   `holdings/stockInfo.ts`에 동일 구현 2벌. `refreshFeeds.kstYyyyMmDdDaysAgo`도
   같은 목적(구현은 `todayKstDate` 기반이라 문자 중복은 아님).
3. **"YYYYMMDD"→"YYYY-MM-DD" 변환(`toIsoDate`) 3벌** — `stockInfo.ts`(형식 검사 포함),
   `volatility.ts`(검사 없음), `stockHistory.parseChartRows` 인라인.
4. **날짜 더하기 헬퍼 2벌** — `stockHistory.addDaysYyyyMmDd`(YYYYMMDD)와
   `watchlist/actions.addDaysIsoDate`(ISO). 같은 목적, 포맷만 다름.
5. **전월 계산 2벌** — `volatility.previousMonth`는 `hotstocks/months.addMonths(m, -1)`과
   동일 기능. `stockInfo.previousQuarterYymm`도 유사 계열(분기 단위).
6. **수익률 계산식 `(현재-기준)/기준*100` 인라인 반복** — `valuation.ts`(정본),
   holdings page 일별 리스트·chartPoints, holdings 상세 chartPoints, watchlist 상세
   chartPoints, `computeWatchReturnRate`. 산식 정책이 바뀌면 전부 손봐야 한다.
7. **Server Action 보일러플레이트 중복** — `requireEmail`/`fail`이 holdings·watchlist
   actions.ts에 각각 정의. ERROR_MESSAGES 맵도 page마다 부분 중복.
8. **`getIndexDetail`과 `getOverseasDetail`이 사실상 동일 코드** — 타입 시그니처만 다름.
   `INDICATOR_TO_DETAIL_KEY`가 이미 IndicatorId 전체를 커버하므로 통합 가능.
9. **`normalizeEmail` 2벌** (holdings/store, watchlist/store), **`sleep` 3벌**
   (kis/auth, refreshHotStocks, refreshFeeds). `errorMessage`는 Phase 17-1에서
   collectTargets로 공용화 — refreshMarketData·refreshFeeds가 import.
10. **「가장 오래된 fetchedAt 선택」 로직 3곳** — `getDashboard.asOf`, 홈 page의
    marketFetchedAt, market page의 oldestFetchedAt (전부 `.sort()[0]` 패턴). 또한
    staleness 판정 자체도 홈 `resolveStaleness`(장중 시간창)와 핫종목
    `isHotStocksStale`(기준월)로 이원화되어 있다.
11. **관심종목 잠정 기준가 판정식 `priceBasisDate < registeredAt` 3곳** —
    `fillRegistrationPrices`(needsFill), watchlist page, watchlist 상세 page.
12. **차트 축·그리드·툴팁 Recharts 설정** — IndexLineChart/VolatilityChart/HoldingsChart
    3곳에 유사 코드 (tick 스타일·margin 등). 디자인 변경 시 3곳 동시 수정.
13. **잡 라우트 신설 시 3곳 동기화** — 새 `/api/jobs/*`는 ① `proxy.ts` matcher 제외
    추가, ② `verifyJobRequest` 재사용(+KIS 호출 잡이면 `isWithinKisCallWindow` 가드),
    ③ QStash 스케줄 등록이 세트다. 기존 잡에 로직을 얹을 수 있으면 신설하지 않는
    편이 구조에 맞다 (refresh-feeds는 시간창 제약 차이로 신설한 예외 — plan.md §17.2).
14. **chartPoints 매핑 3벌** — `{ fullDate, date: slice(5).replace("-","/"), totalValue,
    returnRate }` 변환이 holdings 목록·상세, watchlist 상세에서 거의 동일하게 반복 —
    새 차트 화면 추가 시 4번째 사본이 생기기 쉽다 (§8.6 수익률 산식 반복과 같은 지점).

---

## 9. 특이사항·제약사항

### 9.1 문서·헌법과 코드의 불일치

- **AGENTS.md(헌법) §2가 여전히 공공데이터포털**(`DATA_GO_KR_SERVICE_KEY`,
  `ensureItemsArray`) 기준으로 쓰여 있으나, 코드는 Phase 5에서 KIS로 완전 이관되어
  **해당 키·함수·`lib/api/data-go-kr/`가 존재하지 않는다.** 취지(서버 전용 키·클라이언트
  직접 호출 금지·응답 정규화)는 KIS 코드에 동일하게 적용되어 있다. 헌법 갱신은 별도
  승인 사항.
- plan.md 전반부(§1~5)도 공공데이터포털 시절 설계라 현재 코드와 다르다. **현행 구조는
  §9(Phase 9) 이후 절이 정본**이다.
- `layout.tsx` 루트 metadata description에도 "공공데이터포털" 문구가 남아 있다
  (실측 2026-07-12). metadata를 만지는 작업에서 함께 정리 후보.

### 9.2 레거시·미사용 코드 (실측 grep 확인, 2026-07-12)

- `lib/indices/dates.ts`(`getLast7BusinessDates`) — 어디서도 import되지 않음.
- `KIS_ENDPOINTS.INDEX_PRICE` / `KIS_TR_ID.INDEX_PRICE` — 미사용 (일자별 조회로 대체).
- `KIS_MARKET_CAP_RANKING_SIZE` 상수 — 미사용 (라벨 문자열 "30위권 밖"에 하드코딩).

### 9.3 KIS API 실측 기반 제약 (코드 주석에 박제된 것들)

- 현재가 응답(FHKST01010100)에 **종목명이 없다** → 종목명은 별도 CTPF1002R로 채움.
- 손익계산서 값은 **연중 누적(YTD)** → 분기 단독값은 직전 분기 차감(12월 결산 가정).
- 배당 주당배당금 0원은 **미확정 회차** → 확정분만 집계.
- 기간별시세 1회 최대 100행. 월봉은 진행 중인 달 미포함(FID_INPUT_DATE_2 월말 지정 시).
- OIL은 `N/WTIF`만 사용 — `S/M0401` 계열은 output2가 비어 응답 (사용 금지).
- 종목 마스터 파일 그룹코드 오프셋은 `tail[1:3]` — **공식 파이썬 샘플([0:2])과 1바이트
  다름** (2026-07-11 원시 바이트 실측 우선).
- 시총 랭킹은 1회 상위 30건 → 밖이면 "30위권 밖" 라벨.
- KIS 문자열 숫자·부호 코드는 반드시 `parseNum`+`applyKisSign` 경유.

### 9.4 시간·스케줄 규칙

- KIS 호출 허용 창: **KST 평일 09:00~18:40** (`isWithinKisCallWindow`). 확정 회차 판정은
  **KST 15:35 이후** (`isConfirmedRound`).
- **배지 판정(2026-07-13 개정)**: 고정 시간창(구 `isWithinBadgeWindow` ~18:20)·"N분 경과"
  방식을 폐기하고, 시세 잡 스케줄(09:00~15:30 10분 + 15:40 + 18:15)을 코드 상수화해
  "예정된 갱신이 지났는데도 누락된 경우"에만 배지를 띄운다. **정상 휴지 구간(15:40~18:15,
  장 마감 후·주말)에는 마지막 갱신이 오래돼도 배지가 뜨지 않는다.** `SCHEDULE_MINUTES`
  상수는 외부 QStash 등록과 반드시 일치시켜야 한다(스케줄 변경 시 동반 수정 — §8.13 결합점).
- 피드 잡(DART)은 시간창 제약 없음 — 스케줄은 매일 08~22시 정시
  (`CRON_TZ=Asia/Seoul 0 8-22 * * *`), 라우트에 시간창 가드도 없다.
- 공휴일은 미반영 — 휴장일 감지는 basDt ≠ KST 오늘 (tradingDay=false → 알림만 skip,
  데이터 갱신은 수행).
- 핫종목 기준월 = 실행 시점 KST의 **전월**(직전 완결 월). 구간 라벨은 "최근 …"으로 통일
  ("1분기"·"상반기" 같은 고정 명칭 금지 — 사용자 확정).
- QStash는 응답 200이어야 재시도 안 함 — 시간창 밖 skip은 200, 데이터 실패는 500(재시도
  유도), 알림 실패는 200.

### 9.5 도메인 모델 주의점

- Holding은 **totalCost 모델** — 평균 매입가는 저장하지 않고 표시 시 `formatAvgPrice`로
  계산. 레거시 avgPrice 항목은 읽기 시 역산.
- WatchItem 기준가는 **잠정→확정 2단계** — `priceBasisDate < registeredAt`이면 잠정
  (직전 거래일 종가), 이후 회차가 당일 종가 생성 여부를 재확인해 승격.
- 등록 직후 종목명은 빈 문자열 — 화면은 `name || symbolCode`로 표시.
- 상세 페이지는 종목코드 단위 — 동일 종목 중복 등록을 액션에서 차단. `[symbolCode]`
  페이지는 6자리 형식 검증 → 소유/등록 목록 필터 → 없으면 목록으로 redirect.
  **임의 종목(미보유·미등록) 상세 조회 기능은 현재 없다** — 신규 요구가 이를 필요로
  하면 plan.md 작성 전에 확인.
- 포트폴리오 히스토리 upsert는 스냅샷이 하나라도 없으면 그 사용자 전체 skip (과소 집계 방지).
- 홈 `getDashboardData`는 필수 4종(kospi·kosdaq·usdkrw·us10y) 없으면 throw, **oil만
  null 허용** (Phase 15 추가 키 — 새 지표 추가 시 같은 전략 참고).
- 알림(Web Push)은 **Phase 10 미구현** — `evaluateAlertsHook`이 연결 지점(no-op).
  `StoredStockSnapshot.changeRate`/`marketName`은 이 알림 조건용으로 미리 저장 중.

### 9.6 프런트 규칙

- Tailwind 금지, CSS Modules + `tokens.css` 토큰. 등락색은 rise=빨강/fall=파랑 (한국식).
- Client Component는 차트 셸 3종 + ThemeToggle + `feeds/FeedTabsClient`(Phase 17-2 —
  탭 전환·아코디언은 서버로 못 옮기는 정당한 최소 Client 예외) — 새 인터랙션도 최소 Client 원칙.
- 테마는 `data-theme` 속성 + localStorage(`jusik-theme`), FOUC 방지 인라인 스크립트.
- 레이아웃 max-width 480px 모바일 우선 (`--layout-max-width`).
- `params`/`searchParams`는 Promise — Next 16 규약대로 항상 `await` 후 사용. 검증 실패
  값은 redirect 또는 기본값 폴백(핫종목 `resolvePeriod` 참고).

---

## 10. plan.md 연계 방법

- plan.md의 현행 정본은 Phase 9~16 절(§9 이후). 새 Phase 계획 작성 시:
  1. 관련 파일·데이터 흐름을 본 문서 §2·§4·§5에서 확인하고 계획에 파일 경로를 명시한다.
  2. 재사용 자산(§6)에 있는 것은 "재사용"으로 명시하고 새로 만들지 않는다.
  3. §8 중복 목록에 걸리는 로직을 수정하는 계획이면 영향받는 사본 전부를 계획에 적는다.
  4. §9 제약(시간창·멱등·실패 격리·암호화·KIS 실측 제약)을 위반하는 요구면 plan.md
     작성 전에 사용자에게 확인받는다.
- 코드 구조가 바뀌는 Phase가 완료되면 이 문서의 해당 절을 같은 커밋 흐름에서 갱신한다.

---

*조사 이력: 1차 src/app 조사(구 research.legacy.md §15 — 본 문서 각 절로 이관 후 제거)
→ 현행 문서(2026-07-12, src 전체 조사)가 1차 내용을 포함·해소. 이후 모든 조사는 본
문서 해당 절에 통합한다.*
