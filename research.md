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

- **앱**: KOSPI/KOSDAQ 개인 지수 대시보드. 홈 카드 7종(코스피·코스닥·글로벌 지표·보유종목·
  코스피 변동성·핫종목·관심종목) + 각 상세 페이지.
- **스택**: Next.js 16.2.6 (App Router, `src/app`) · React 19.2.4 · TypeScript Strict ·
  Recharts 3 (차트, 유일한 Client 라이브러리) · Upstash Redis (REST) · Upstash QStash
  (스케줄러) · Auth.js(next-auth v5 beta) Google OAuth · fflate (종목 마스터 zip 해제) ·
  lucide-react (아이콘). **Tailwind 금지 — 순수 CSS + CSS Modules만** (AGENTS.md 헌법).
- **배포**: Vercel (jusik-app.vercel.app). 잡 라우트는 `maxDuration = 300`.
  함수 리전은 `vercel.json`의 `regions`로 **서울(`icn1`)** 고정 — 원천(KIS·DART·관세청·
  네이버)이 전부 한국이고 Upstash Redis도 도쿄(ap-northeast-1)라, 기본값 `iad1`(버지니아)
  이면 모든 호출이 태평양을 왕복한다. Hobby 플랜은 단일 리전만 허용하므로 배열 원소는 1개를
  유지해야 한다(초과 시 빌드 전 배포 실패). 이 `vercel.json`은 **리전 전용** — Phase 11에서
  없앤 `crons`를 되살린 것이 아니다.
- **데이터 원천**: 한국투자증권(KIS) OpenAPI 단일화. ~~공공데이터포털~~은 Phase 5에서
  마이그레이션 완료되어 **코드에 더 이상 존재하지 않는다** (§9.1 특이사항 참고).

### 1.1 환경 변수 (전부 서버 전용 — `NEXT_PUBLIC_` 없음)

| 변수 | 용도 | 참조 위치 |
|---|---|---|
| `KIS_APP_KEY` / `KIS_APP_SECRET` | KIS 인증 | `lib/api/kis/auth.ts`, `client.ts` |
| `KIS_BASE_URL` | KIS 베이스 URL (기본값 내장, 선택) | `lib/api/kis/constants.ts` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Redis REST | `lib/redis/client.ts` |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | QStash 서명 검증 | `lib/jobs/verifyJobRequest.ts` |
| `QSTASH_TOKEN` | QStash DLQ 읽기 전용 조회 (Phase 18) | `lib/qstash/dlq.ts` |
| `CRON_SECRET` | 잡 수동 트리거 Bearer 폴백 | `lib/jobs/verifyJobRequest.ts` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth | `src/auth.ts` |
| `ALLOWED_EMAILS` | 접근 허용 이메일 CSV 화이트리스트 | `lib/auth/allowedEmails.ts` |
| `HOLDINGS_ENCRYPTION_KEY` | 개인 데이터 AES-256-GCM 키 (base64 32바이트) | `lib/crypto/secureJson.ts` |
| `DART_API_KEY` | DART OpenAPI 인증키 (공시, Phase 17-1) | `lib/api/dart/client.ts` |
| `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` | 네이버 검색 API 인증키 (뉴스, Phase 17-3) | `lib/api/naver/client.ts` |
| `DATA_GO_KR_SERVICE_KEY` | 관세청 수출입총괄(GW) API 인증키 (수출입, Phase 17-4) | `lib/api/customs/client.ts` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹 푸시 VAPID 키 (Phase 10) — 공개키도 서버 env로 두고 Server Component가 prop으로 전달 | `lib/push/send.ts`, `app/alerts/page.tsx` |

---

## 2. 디렉토리 구조와 파일별 역할

### 2.1 `src/app` — 라우트 (전부 Server Component)

| 경로 | 역할 |
|---|---|
| `layout.tsx` | 루트 레이아웃. Geist 폰트, `tokens.css`+`globals.css` import, 테마 FOUC 방지 인라인 스크립트(`data-theme` 선결정) |
| `page.tsx` | 홈 대시보드. 세션 검사 → 허용 외 이메일이면 access-denied 화면 → 카드 8종 데이터 병렬 조회(`Promise.all`) → `IndexDashboard` 렌더. staleness 배지 판정도 여기서 수행 |
| `login/page.tsx` | Google 로그인 버튼 (Server Action으로 `signIn("google")`). 세션 있으면 `/` redirect, 인라인 `GoogleIcon` SVG 로컬 정의 |
| `indices/kospi` `kosdaq` `usdkrw/page.tsx` | 지표 상세 3종 — 전부 `ensureAllowedSession()` 후 `<IndexDetailScreen market=…>` 한 줄 위임(제목 `<h1>`도 §36에서 공용 컴포넌트에 들어가 3화면 동시 적용). usdkrw만 children으로 `<DollarIndexSection>`(달러 인덱스, §28) 추가. us10y·oil·gold·btc 개별 상세는 §31에서 제거(시장 카드 접힘 목록으로 대체) |
| `indices/market/page.tsx` | 글로벌 지표 요약(§37에서 표시명 `시장`→`글로벌 지표` — 라우트·컴포넌트명·Redis 키는 `market` 유지). 금리·유가·금 미니 카드 3종 + 비트코인 커스텀 카드 — 원/달러는 §28에서 홈 카드로 분리, 수출입 카드는 §30에서 제거). `getMarketDetails` MGET 1회(5키). 카드마다 "일별 기록" `<details>` 접힘 목록(§31 — KIS 3종은 `IndexDailyList` 재사용, 비트코인은 원화 목록 인라인)·개별 상세 링크 없음. 비트코인 카드는 원화 대표값+달러 병기 |
| `indices/trade/[yyyymm]/page.tsx` | 수출입 상세(Phase 17-5) — 월 합계 3지표 + 품목별(국가 무관, HS 4단위 상위 15+기타) + 국가별(상위 8+기타, 클릭 시 품목 팝업). `getTradeDetailView` 1회. `/feeds` 수출입 탭의 월 링크로 진입 |
| `indices/kospi-volatility/page.tsx` | 변동성 상세 — 월별 평균 막대 차트 + 당월 일별 기록 목록 |
| `holdings/page.tsx` | 보유종목 목록·요약·연초 이후 추이·일별 기록(`DailyHistoryList` 접힘 목록, §29)·종목 추가 폼(`<details>` 토글, 종목명 검색 `<StockSearchInput>`) |
| `holdings/[symbolCode]/page.tsx` | 보유종목 상세 — 평가 요약·수정/삭제(`?edit=1`)·2년 추이·일별 기록(`DailyHistoryList` 접힘 목록+종가 열, §29)·정보 블록 4종 + 인라인 알림 토글(`AlertToggleButton`) |
| `holdings/actions.ts` | Server Actions: add/update/delete. **형식 검증만** 하고 KIS 호출 없음 (§6.4) |
| `watchlist/page.tsx` | 관심종목 목록 — 등록 기준일 종가 대비 수익률, 기준일 변경/삭제(`?edit=1` 토글 — 보유종목 상세 패턴, 평상시 숨김·섹션 제목 옆 "수정"/"취소" `editToggle` 링크, §23). 추가 폼은 종목명 검색 `<StockSearchInput>` |
| `watchlist/[symbolCode]/page.tsx` | 관심종목 상세 — 등록일 이후 추이·정보 블록 + 인라인 알림 토글 (보유종목 상세와 구조 동일) |
| `watchlist/actions.ts` | Server Actions: add/update(기준일 변경 시 기준가 null 리셋)/delete. update/delete 오류 redirect는 `/watchlist?edit=1`로 편집 모드 유지(`fail()`이 `?`/`&` 분기 결합) |
| `hot-stocks/page.tsx` | 핫종목 — 서버 모드 탭 `[당일 등락률(기본) \| 주간 등락률 \| 월간 핫종목]`(`?mode=weekly\|monthly`). 당일/주간: `market:dailyFluctuation`/`market:weeklyFluctuation` 상위 30을 월간과 동일한 6열 폼(순위/종목명+ᴷ·ᴰ 위첨자/종목코드 열/등락률/기준 종가/현재가, §20)으로 표시+`resolveStaleness` 배지 — 공용 `FluctuationView`(variant별 데이터 소스·문구만 교체). 위첨자는 `market:stockMaster`를 읽어 코드→시장 매핑(`loadMarketByCode`, 실패·미등재 시 생략), 기준 종가 없는 구 스냅샷은 "—". 기준 문구는 전 탭 월간 형식: "… 상위 30종목 · 기준: {전일\|5거래일 전} 종가 · 대상 전체시장 · 갱신: …". 월간: 구간 수익률 TOP 100(`?period=1m\|3m\|6m\|12m`, 구간 링크는 `?mode=monthly&period=…` — mode 유지, §20 회귀 수정). 뷰는 async 서버 서브컴포넌트(`FluctuationView`/`MonthlyView`) |
| `feeds/page.tsx` | 뉴스·공시 상세 (Phase 17-2b) — `ensureAllowedSession` + `getDisclosureBoard`·`getNewsBoard`·`getTradeStatsView`(17-4) + `FeedTabsClient`(뉴스/공시/수출입 탭+게시판+아코디언). 홈 "뉴스·공시" 요약 카드에서 이동 |
| `dividends/page.tsx` | 배당 상세 (Phase 25·43·44·45·47) — **3탭 단일 구조**(Phase 47, `?mode=stock\|product\|schedule` 서버 탭 `DIVIDEND_TABS`, 기본 stock). 헤더 아래 탭 바 하나로 통합 — 활성 탭에 필요한 데이터만 로드하고 각주도 탭별로 갈린다. ① **일반종목**·② **배당상품** = **배당률 순위** 표(Phase 43·46, `getDividendRankingView(category)`·순위 메타 `RANK_META`): 시가배당률 TOP 100, 8열(순위·종목명·현재가·배당률·주당배당금·지급주기·연속배당·비고) 공용. 배당상품(ETF·리츠·인프라펀드) 탭은 우선주·폭배·주식배당·액면분할 보정이 없어 비고 항상 "—". 순위·종목명 2열 sticky 가로 스크롤. 비고 = 우/현+주N%/폭배(DART 딥링크)·배당률 `*`=액면분할 보정(Phase 44). **폼은 핫종목 표 스타일과 통일**(Phase 45): 헤더 가운데·micro 톤, 값 숫자 열 우측(`.numCell`)·종목명 좌측, 종목명 뒤 ᴷ/ᴰ 시장 위첨자(`entry.market` 직접 사용)·링크 없음. ③ **내 배당** = **보유종목 확정 배당** 목록(`getDividendSchedule`, **보유종목만**) 한 줄씩(종목명(**링크 없음**, Phase 47 오터치 방지)·배당종류·기준일·지급일(미정 표기)·주당배당금×보유수량·예상 지급액). 각주: 순위 탭 2건(시가배당률 정의·`+` 연수, 비고 우·현+주·폭배·`*` 분할 보정), 내 배당 탭 1건(예상액=현재 보유수량/세전 15.4%). 홈 "배당" 카드에서 이동 |
| `dlq/page.tsx` | QStash DLQ 읽기 전용 목록 (Phase 18) — `ensureAllowedSession` + `listDlqMessages(cursor)` 직접 호출(Redis 아닌 QStash API — §4.3 예외), `?cursor=` 페이지네이션. 햄버거 사이드바 "DLQ 확인"에서 진입, 재발송·삭제 없음 |
| `alerts/page.tsx` | 알림 설정 (Phase 10) — `ensureAllowedSession` + `VAPID_PUBLIC_KEY`를 `PushSubscriptionManager`에 prop 전달 + 보유·관심종목별 알림 on/off(`StockAlertToggles`, 3단계에서 관심종목까지 확장) + 등록 기기 수 표시. 햄버거 사이드바 "알림 설정"에서 진입 |
| `alerts/actions.ts` | Server Actions: 푸시 구독 등록/해지(입력 형식 검증 — endpoint https·keys 필수)·테스트 발송·종목별 알림 on/off(`setStockAlertEnabledAction` — 보유·관심종목만 허용, `alerts:{email}:muted` 갱신) |
| `manifest.ts` | PWA 매니페스트(`/manifest.webmanifest`, Phase 10) — standalone·아이콘 192/512 + maskable 전용 `icon-512-maskable.png`(중앙 안전영역 여백). iOS 푸시의 전제 조건 |
| `apple-icon.png` | iOS 홈 화면 아이콘 180×180 (파일 컨벤션 — link 태그 자동 생성). iOS는 투명 미지원이라 흰 배경 플랫·여백 없이 꽉 채움 |
| `favicon.ico` | 브라우저 탭 아이콘 — 16·32·48 멀티사이즈 |
| `api/auth/[...nextauth]/route.ts` | Auth.js 핸들러 re-export (3줄) |
| `api/jobs/refresh-market-data/route.ts` | 시세 갱신 잡 엔드포인트 (POST, §4.1) |
| `api/jobs/refresh-hot-stocks/route.ts` | 핫종목 갱신 잡 엔드포인트 (POST, §4.2) |
| `api/jobs/refresh-dividend-ranking/route.ts` | 배당률 순위 갱신 잡 엔드포인트 (POST, §4.3, Phase 43) |
| `api/jobs/refresh-feeds/route.ts` | 피드(공시) 갱신 잡 엔드포인트 (POST, §4.5) — KIS가 아니라 **시간창 가드 없음** |
| `api/jobs/refresh-trade-detail/route.ts` | 수출입 상세 갱신 잡 엔드포인트 (POST, §4.6, Phase 17-5) — 월 1회·시간창 가드 없음 |

라우트별 `page.module.css` 동반. 오류 UI는 별도 error.tsx 없이 각 page의 try/catch 인라인 처리.

**`loading.tsx` 9개 (§40)** — 라우트가 전부 동적(`auth()`가 쿠키 접근)이라 `loading.tsx`가
없으면 Next가 동적 라우트를 **prefetch 대상에서 제외**한다. 이를 되살리려고 전 화면에 배치하되,
중첩 상속을 이용해 파일 수를 줄였다. 전부 `components/ui/PageSkeleton`에 위임하는 한 줄짜리다.

| 파일 | 커버 범위 | 변형 |
|---|---|---|
| `app/loading.tsx` | 홈 + 자기 `loading.tsx` 없는 하위 라우트 폴백 | dashboard, 카드 8 |
| `app/login/loading.tsx` | 로그인 (홈 그리드 상속 차단용) | detail, 1 |
| `app/indices/loading.tsx` | kospi·kosdaq·usdkrw·market·kospi-volatility·trade/[yyyymm] **6종** | detail+chart, 6 |
| `app/holdings/loading.tsx` | 목록 + `[symbolCode]` 상세 | detail+chart, 5 |
| `app/watchlist/loading.tsx` | 목록 + `[symbolCode]` 상세 | detail+chart, 5 |
| `app/hot-stocks` · `feeds` · `dividends` · `alerts` · `dlq` `/loading.tsx` | 각 1화면 | detail, 5~10 |

새 라우트를 추가할 때 위 디렉터리 아래면 `loading.tsx`가 자동 상속되고, 새 최상위 섹션이면
직접 추가해야 prefetch가 동작한다.

### 2.2 `src/lib` — 도메인 로직

| 파일 | 역할 |
|---|---|
| `api/kis/constants.ts` | KIS 베이스 URL·엔드포인트·TR_ID·조회 코드·상수 전부. 지표 코드 변경 시 이 파일만 수정 |
| `api/kis/auth.ts` | KIS 토큰 발급·캐싱 — Redis 공유 캐시 + `SET NX PX` 분산 락 + 인스턴스 내 in-flight 합류 (§7.4) |
| `api/kis/client.ts` | `fetchKisJson` 공통 래퍼(헤더·rt_cd 검증·15초 타임아웃) + 조회 함수 11종 (지수·해외·환율 통화쌍(`fetchKisFxPairDaily`, §28)·현재가·시총랭킹·등락률랭킹·배당·손익·재무비율·종목명·기간별시세 일/월) |
| `api/kis/types.ts` | KIS 원본 응답 타입 (필드 전부 optional string, `[key: string]: unknown` 허용) |
| `api/upbit/client.ts` | 업비트 공개 시세 API 클라이언트 (§30) — `fetchUpbitTicker`/`fetchUpbitDayCandles` + `UPBIT_BTC_MARKETS`(KRW-BTC·USDT-BTC). 인증·키 불필요, 15초 타임아웃. 호출 주체는 시세 갱신 잡뿐 |
| `api/dart/client.ts` | DART OpenAPI 클라이언트 — `corpCode.xml` zip 파싱(fflate, 상장사만 매핑)·공시검색 `list.json`(status 013=빈 결과 정상 처리) |
| `api/naver/client.ts` | 네이버 뉴스 검색 클라이언트 (Phase 17-3) — 종목명 키워드·`sort=date`, `<b>`/엔티티 제거, **제목+요약에 종목명 포함 기사만** 필터(저관련·오탐 제거), pubDate ms 파싱. 상위 10건 |
| `api/customs/client.ts` | 관세청 수출입총괄(GW) 클라이언트 (Phase 17-4) — `getNewtradeList`(XML), `fetchTradeStats(strt,end)`. `총계`/비정형 year 제외·`year "YYYY.MM"→"YYYYMM"` 정규화·`parseNum` 경유·`resultCode≠00` throw. **조회 범위 최대 12개월(inclusive)** 제약 |
| `feeds/store.ts` | 피드 store — `market:disclosures:{code}`(공시)·`market:news:{code}`(뉴스) 스냅샷 라이터·`disclosuresKey`/`newsKey` export·`dart:corpCodeMap`(종목코드→고유번호) 리더·라이터·`market:tradeStats`(수출입, 종목 무관 단일 키) `TradeStatMonth`/`StoredTradeStats`+`getTradeStats`/`setTradeStats`(Phase 17-4). (단일 종목 리더 `getDisclosures`는 Phase 17-2에서 제거 — 화면은 `homeFeed`의 MGET로 통합) |
| `feeds/tradeStats.ts` | 수출입 뷰 빌더 (Phase 17-4) — `buildTradeStatsView`(순수: 최신 확정월 + 전년동월 `find`로 YoY %)/`getTradeStatsView`(리더, 상세 인덱스 `detailMonths` 동봉). `/indices/market` 카드·`/feeds` 탭 공용 |
| `feeds/tradeDetail.ts` | 수출입 상세 뷰 빌더 (Phase 17-5) — `buildTradeDetailView`(순수: 상위 N + "기타"=전체−Σ상위N 복원)/`getTradeDetailView(yyyymm)`(리더). `/indices/trade/[yyyymm]` 전용 |
| `jobs/refreshTradeDetail.ts` | 수출입 상세 갱신 잡 (Phase 17-5) — 97개 류 전수 조회(동시성 4, 실측 51~61초/13.5MB)를 집계해 `market:tradeDetail:{yyyymm}`(~8KB) 저장. 월 1회성 가드 |
| `feeds/homeFeed.ts` | 홈 피드 리더 (Phase 17-2/17-2b/17-3) — ① `getDisclosureBoard`/`getNewsBoard`(`/feeds`용): 보유+관심 `{code→name}` → `market:disclosures:{code}`/`market:news:{code}` MGET 병합·최신순(접수번호/pubDate)·상위 40건 컷(공통 `FeedBoardItem`). ② `getTodayFeedCounts`(홈 요약 카드용): 공시·뉴스 MGET 2회로 오늘(`rceptDt`/`pubDateKst`===KST 오늘) 건수 카운트(수출입 제외 — 월간 데이터). `collectOwnedStocks` 공유. 읽기 전용(누적 없음 — 종목별 원본이 SET 덮어쓰기라 컷·카운트는 조회 시점 계산만) |
| `auth/allowedEmails.ts` | `ALLOWED_EMAILS` 파싱(모듈 로드 시 1회) — `isEmailAllowed` / `getAllowedEmails`(잡용 전체 목록) |
| `auth/ensureAllowedSession.ts` | 상세 페이지 공용 가드 — 미로그인→`/login`, 허용 외→`/`(access-denied) |
| `crypto/secureJson.ts` | AES-256-GCM `enc:v1:iv:tag:ct` 포맷 — `encryptJson`/`decryptJson`(실패 시 throw)/`isEncrypted` |
| `redis/client.ts` | Upstash Redis 싱글턴 `getRedis()` |
| `date/kst.ts` | `todayKstDate()` — KST "YYYY-MM-DD" (유일한 공용 KST 날짜 헬퍼) · `kstYyyyMmDd(ms)`(17-3) · `currentKstMonth()`/`subtractMonths(ym,n)`(17-4, 수출입 월 판정·조회창) |
| `format/*` | 표시 포맷 모음 (§6.2 카탈로그) |
| `indices/kisMapper.ts` | 국내지수 응답→도메인 매핑 + **공용 유틸 `parseNum`/`applyKisSign`/`resolveDirection`/`formatBasDtLabel`** |
| `indices/kisOverseasMapper.ts` | 해외(환율·금리·유가·금) 응답→도메인 매핑. 행별 전일 대비가 없어 인접 종가 차분으로 계산 |
| `indices/upbitMapper.ts` | 업비트 티커·일봉→도메인 매핑 (§30) — `mapUpbitDetail`: 스냅샷(전일 종가 대비 직접 제공)+history(최근 7)+dailyRows(`prev_closing_price` 차분), `StoredMarketDetail` 동일 폼. 일봉 경계 KST 09:00 |
| `indices/dxy.ts` | 달러 인덱스 계산 (§28) — `computeDxyDetail`(순수): KIS에 DXY 종목이 없어 환율 6종(`KIS_DXY_COMPONENTS`)의 일별 종가를 ICE 공식(가중 기하평균)으로 합성. 통화쌍별 휴장일이 달라 기준일 교집합에서만 계산, `StoredMarketDetail` 동일 폼 반환 |
| `indices/getDashboard.ts` | 홈 데이터 리더 — `market:detail:*` 7종 MGET. 필수 4종 없으면 throw(`MARKET_DATA_EMPTY_MESSAGE`), oil·gold·btcUsd(§33)는 null 허용 |
| `indices/getIndexDetail.ts` / `getOverseasDetail.ts` | 상세 리더 — `market:detail:{key}` 1건. **두 파일 내용이 사실상 동일** (§8) |
| `indices/volatility.ts` | 변동성 기록 store+계산+카드 요약 (한 파일에 쓰기·읽기 혼재) |
| `indices/dates.ts` | `getLast7BusinessDates` — **현재 미사용 (레거시)** (§9.2) |
| `market/store.ts` | 공용 시세 Redis 스토어 — `market:detail:*`, `market:stock:*`, `market:stockInfo:*`(배당 회차 `rounds` 포함, §25), `market:lastRefreshAt`, `market:dailyFluctuation`, `market:weeklyFluctuation`, `market:stockMaster` (§5). `getStockInfoBlocksMap`(MGET 일괄, 없는 종목은 맵에서 제외) 제공 |
| `stocks/search.ts` | `"use server"` — `searchStocks(query)` 종목명 검색 액션. `auth`+`isEmailAllowed` 가드 후 `market:stockMaster` 부분일치 필터, 접두 우선·가나다 정렬 상위 20. 등록 폼 전용, KIS 직접 호출 없음 |
| `market/staleness.ts` | KST 시간창 가드(`isWithinKisCallWindow` 09:00~18:40) + **스케줄 인지형 배지 판정** `resolveStaleness` — 시세 잡 스케줄 상수(`SCHEDULE_MINUTES`: 09:00~15:30 10분 + 15:40 + 18:15)로 "이미 완료됐어야 할 최근 슬롯(`lastDueRefreshMs`, 유예 20분)"을 구해, fetchedAt이 그보다 오래됐을 때만 배지(정상 휴지 구간엔 안 뜸). 지연 경과로 warn/critical. `SCHEDULE_MINUTES`는 외부 QStash 등록과 동기화 필수 |
| `holdings/store.ts` | 보유종목·포트폴리오 히스토리 store — 암호화, 레거시 평문/`avgPrice` 읽기 하위호환 |
| `holdings/valuation.ts` | 포트폴리오 평가(스냅샷 MGET) — 시세 없는 종목 null 격리·합계 제외. 일일 등락률(`totalDailyChangeRate`)은 종목별 `changeRate`로 전일 평가액을 역산·가중(히스토리 불필요·항상 가용) |
| `holdings/summary.ts` | 홈 보유종목 카드 요약 (실패 시 null) |
| `holdings/stockHistory.ts` | 종목별 2년 종가 히스토리 `stock:{code}:history` — 백필(최대 8콜 페이징)/일별 갱신/upsert |
| `holdings/stockInfo.ts` | 정보 블록 4종 — 쓰기(잡 전용 `fetchStockInfoBlocks`: 배당·손익·재무비율 병렬)와 읽기(`getStockInfo`: Redis 조합만) 경로가 한 파일에 명시 구분. 배당 블록에 확정 회차별 행 `rounds`(기준일·종류·주당배당금·지급일, §25)도 저장 — 기존 요약 필드는 무변경. **날짜 파싱 `toIsoDate`는 구분자를 걷어낸 뒤 8자리 판정**(Phase 47) — 예탁원이 같은 응답에서 `record_date`="20260331"·`divi_pay_dt`="2026/05/29"로 포맷을 섞어 보내, 구 `/^\d{8}$/` 매칭은 슬래시 지급일을 전부 놓쳐 확정 지급일까지 "미정"으로 떨어뜨렸음(2026-07-20 실측·수정). `lastPayDate`도 같은 정규화로 산출 |
| `hotstocks/store.ts` | 핫종목 store — `market:hotStocks` + `:progress` 커서, 구간 4종 정의·라벨 |
| `hotstocks/months.ts` | 월 문자열("YYYY-MM") 계산 — `baseMonthKst`(전월)/`addMonths`/월초·월말/표시 포맷 |
| `hotstocks/universe.ts` | KIS 종목 마스터 zip 다운로드·EUC-KR 고정폭 파싱 — 스팩 제외·코드 오름차순. 내부 `fetchUniverse(groups)`(그룹 파라미터화)를 공개 2종이 감싼다: **`fetchHotStockUniverse`(ST-only, 불변)** — 핫종목 잡 + 종목명 검색(`market:stockMaster`) 공용이라 ST 필터를 바꾸면 두 곳이 오염됨 · **`fetchDividendRankingUniverse`(ST+EF+RT+IF, Phase 46)** — 배당률 순위 잡 전용, 한 번의 다운로드로 일반종목+배당상품을 함께 받아 레코드 `group`으로 분류. `UniverseStock.group`(`ST/EF/RT/IF`)·`DIVIDEND_PRODUCT_GROUPS`(EF/RT/IF) 노출. ETN(`EN`)은 채무증권이라 제외(2026-07-20 실측: 롯데리츠=`RT`, 맥쿼리인프라=`IF`, ACE 리츠부동산인프라액티브(0153P0)=`EF`) |
| `hotstocks/summary.ts` | 월간 랭킹 갱신 지연 판정 `isHotStocksStale` (핫종목 페이지 월간 뷰용) |
| `hotstocks/dailyCard.ts` | 홈 핫종목 카드 요약 `getDailyHotCardSummary` — `market:dailyFluctuation` 당일 등락률 상위 4 (§33에서 4행 통일) |
| `jobs/refreshMarketData.ts` | **시세 갱신 잡 파이프라인 본체** (§4.1) — 지수·종목·포트폴리오 갱신에 더해 달러 인덱스(`refreshDxy`, 환율 6종 순차 조회→계산, §28)·비트코인(`refreshBtc`, 업비트 2마켓 순차, §30)·당일·주간 등락률 상위 30(`refreshDailyFluctuation`/`refreshWeeklyFluctuation`, 회차당 각 1콜)·종목 마스터(`refreshStockMaster`, 1일 1회) 저장. 다섯 다 부수·실패 격리 |
| `jobs/refreshHotStocks.ts` | **핫종목 갱신 잡 파이프라인 본체** (§4.2) |
| `jobs/refreshFeeds.ts` | **피드(공시·뉴스·수출입) 갱신 잡 파이프라인 본체** (§4.5) — corpCode 매핑→종목별 공시(DART)+뉴스(네이버, 종목명 키워드) 조회·저장. 소스·종목별 실패 격리. + `refreshTradeStats`(17-4) — 종목 무관 월 1회성(스냅샷 최신월<직전 완결월일 때만), 12개월 한도 때문에 2회 호출(최근 12개월+전년동월)→13개월 연속 저장. 잡 `ok` 게이팅 제외(다음 회차 가드가 재시도). 알림 훅 2종: `evaluateFeedAlerts`(공시·시장경보) + `evaluateDividendAlerts`(배당 지급일 당일, §25) |
| `jobs/collectTargets.ts` | 잡 공용 수집 대상 조회 — `collectHoldings`/`collectWatchlists`/`unionSymbolCodes`/`errorMessage` (시세·피드 잡 공유, Phase 17-1에서 refreshMarketData 로컬 함수를 추출) |
| `jobs/verifyJobRequest.ts` | 잡 공용 인증 — QStash 서명 → CRON_SECRET Bearer 폴백(timingSafeEqual) |
| `qstash/dlq.ts` | QStash DLQ 읽기 전용 조회(Phase 18) — `QSTASH_TOKEN`(서버 전용)으로 `Client.dlq.listMessages` 호출, 화면용 뷰 모델(`DlqMessageView`) 매핑. `/dlq` 페이지 전용 |
| `alerts/store.ts` | 알림 store (Phase 10 2·3단계, §25) — 개인: `alerts:{email}:peaks`(신고가, 암호화)·`:muted`(음소거 종목, 암호화)·`:cooldown:{code}`(EX 7200 평문). 전역(공개 데이터 파생, 평문): `alerts:disclosure:last:{code}`(마지막 통지 접수번호)·`alerts:marketwarn:last:{code}`(시장경보 상태 6필드)·`alerts:dividend:sent:{code}:{payDate}`(배당 지급일 알림 발송 마커, EX 2일) |
| `alerts/evaluate.ts` | 시세 알림 판정·발송 (Phase 10 2단계, 관심종목 확장) — `evaluatePriceAlerts`: 보유+관심종목 union(`collectAlertTargets` — 종목 단위 dedupe, 보유 우선·같은 종목 보유 내역 합산) 대상으로 지수 MGET→조건 3종(기준가 −10%(보유=매입가/관심=등록가, 미확정 skip)/신고가 −10%/지수 −2%+종목 −12%) OR 판정→발송·쿨다운. 순수 판정부 `evaluateTarget`·시장 매핑 `marketIndexOf` 분리 |
| `alerts/feedAlerts.ts` | 공시·시장경보 알림 판정·발송 (Phase 10 3단계) — `evaluateFeedAlerts`(feeds 잡 훅 전용): 공시 8유형 키워드 분류기 `matchDisclosureCategories`(회사채는 "파생결합" 제외)·경보 상태 추출 `extractMarketWarnState`·diff `diffMarketWarnStates` 분리. 커서·상태는 발송 결과와 무관하게 전진(중복 방지 우선), 쿨다운 없음 |
| `alerts/dividendAlerts.ts` | 배당 지급일 당일 알림 (§25) — `evaluateDividendAlerts`(feeds 잡 훅 전용): 보유종목 union(**관심종목 제외**)의 `rounds`에서 지급일=KST 오늘·주당배당금>0 회차 추출(같은 날 여러 회차는 합산) → 종목×지급일 전역 마커로 중복 차단(발송 전 기록 — 중복 방지 우선) → 보유 사용자에게만 발송(음소거 공유·이메일 단위 실패 격리). KIS 추가 호출 0 |
| `dividends/summary.ts` | 배당 일정 리더 (§25) — **보유종목만**(`getHoldings` 기반, 관심종목 제외) `getStockInfoBlocksMap`으로 `rounds` 병합. `getDividendSchedule`(상세 목록 — 예상 지급액=주당배당금×보유수량 읽기 시 계산, 지급일 미정 먼저→미래→과거 내림차순)·`getDividendCardSummary`(홈 카드 — 지급일 ≥ KST 오늘 오름차순 상위 4, 실패 시 null) |
| `push/store.ts` | 웹 푸시 구독 store (Phase 10) — `push:subs:{email}` `secureJson` 암호화(endpoint가 곧 발송 권한), endpoint 기준 dedup 등록/해지/`prunePushSubscriptions`(발송 경로 전용) |
| `push/send.ts` | 웹 푸시 발송 공용 유틸 (Phase 10) — `sendPushToEmail(email, payload)`: VAPID env 검증, 구독별 실패 격리, 410/404 자동 정리. 페이로드 계약 `{title, body, url?, tag?}`는 `public/sw.js`와 동기화 필수. 잡 훅(2·3단계)·테스트 발송 액션 공유 |
| `watchlist/store.ts` | 관심종목 store — 암호화 (신규 키라 평문 하위호환 없음) |
| `watchlist/summary.ts` | `computeWatchReturnRate`(순수 함수) + 홈 카드 요약 `getWatchlistCardSummary` — 수익률 상위 4종목 개별 목록(`top4`: 등록 기준일 대비 수익률 + 전일 등락률, §24·§33) |
| `theme.ts` | `THEME_STORAGE_KEY`·`Theme` 타입만 |

### 2.3 `src/components`

| 컴포넌트 | 종류 | 역할 |
|---|---|---|
| `indices/IndexDashboard` | Server | 홈 카드 9종 조립(§28에서 원/달러 카드 분리 신설, 글로벌 지표 카드는 §33에서 `MarketCard` 리스트형으로 교체) + 헤더(좌 `NavIconLink` 홈 아이콘 + `<h1>Dashboard</h1>` + 우 햄버거 `HeaderMenu` — Phase 26에서 제거했던 제목을 §36에서 영어 제목으로 복원, 설명 문구는 그대로 없음) |
| `indices/SummaryCard` | Server | **홈 요약 카드 공용 프리미티브** — value/change/placeholder/staleness 배지(§35에서 `footnote` prop 폐지 — 홈 각주 전면 제거). 카드 전체가 Link |
| `indices/MarketCard` | Server | 「글로벌 지표」 전용 카드 (§33, 제목은 §37에서 `시장`→`글로벌 지표`) — 금리·유가·금·비트코인(USD) 4행 동등 목록, 행마다 지표명·값·등락률. 지표명은 §34에서 축약(`美 금리`·`WTI`·`GOLD`·`BTC`) — 4행 모두 값 열은 숫자만(전부 USD 기준이라 §37에서 BTC의 `($)`도 제거, 통화 안내는 상세 화면 각주에만). 각주는 §35에서 제거, 등락률만 `--text-caption-sm`(12px)로 1pt 축소. §30 추가 지표는 null이면 행 생략. 골격·배지는 SummaryCard composes, 리스트 폼은 WatchlistCard와 동일 관례, 카드 전체 `/indices/market` 링크 |
| `indices/HotStocksCard` | Server | 핫종목 전용 카드 — 당일 등락률 TOP 4 리스트 (§33에서 4행 통일, SummaryCard 미사용) |
| `indices/WatchlistCard` | Server | 관심종목 전용 카드 (§24) — 수익률 상위 4종목 리스트(§33), 행마다 등록 기준일 대비 수익률 + 전일 등락률(§35에서 괄호 제거 — `.daily` 11px로 구분). 골격·staleness 배지는 SummaryCard composes(`STALENESS_LABELS` export 재사용), 리스트 폼은 HotStocksCard와 동일 |
| `indices/DividendCard` | Server | 배당 일정 전용 카드 (§25) — 다가오는 지급일 상위 4행(§33, 종목명·지급일 MM/DD·주당배당금), **보유종목 기준**. 골격·배지·리스트 폼은 WatchlistCard와 동일 관례, 카드 전체 `/dividends` 링크 |
| `indices/IndexDetailScreen` | Server(async) | **지표 상세 3종(코스피·코스닥·원달러) 공용 화면** — `getIndexDetail`/`getOverseasDetail` 분기, 헤더(홈 아이콘 + 지표명 `<h1>`(§36) + 마지막 갱신)+카드+차트+일별 리스트+푸터. `children` 슬롯(일별 시세와 푸터 사이 — usdkrw의 달러 인덱스 섹션용, §28) |
| `indices/DollarIndexSection` | Server(async) | 원/달러 상세 하단 달러 인덱스 섹션 (§28) — `getOverseasDetail("DXY")` → IndexCard+차트+근사치 각주. 첫 갱신 전엔 준비 중 문구 |
| `indices/IndexCard` / `IndexDailyList` / `DataAsOfFooter` | Server | 상세 스냅샷 카드 / 일별 시세 리스트 / 홈 푸터 |
| `indices/IndexChartClient` → `IndexLineChart` | Client | Recharts 래핑 패턴: Client 셸이 `dynamic(…, { ssr: false })` + 스켈레톤 → 실제 차트 |
| `indices/BtcChartClient` → `BtcLineChart` | Client | 동일 패턴, 비트코인 전용 (§30) — `currency` prop으로 축·툴팁 포맷 분기(원화 M/B 축약, 달러 소수 2자리). 호출부는 시장 카드뿐(비트코인 개별 상세·`BtcDetailSection`은 §31에서 제거) |
| `indices/VolatilityChartClient` → `VolatilityChart` | Client | 동일 패턴, BarChart |
| `holdings/HoldingsChartClient` → `HoldingsChart` | Client | 동일 패턴, LineChart + 수익률%↔원단위 토글. **보유종목 홈/상세·관심종목 상세 3곳 공용** (관심종목에선 totalValue 자리에 종가를 넣어 재활용) |
| `holdings/DailyHistoryList` | Client | 일별 기록 목록 (§29) — 접힘 기본 `<details>`(네이티브, JS 무관) + 월 단위 페이지네이션(`useState` 월 인덱스, 기록 있는 달만 이전/다음, 양 끝 disabled). 서버가 히스토리 전체를 props로 주입. 보유종목 홈/상세 2곳 공용 — 상세만 `close` 종가 열 추가. rise/fall 판정은 로컬 사본(`resolveDirection`을 클라이언트 번들에 안 넣기 위함) |
| `stocks/StockInfoBlocks` | Server | 정보 블록 4종(시총·배당·실적·투자지표) — 보유·관심 상세 공용, `formatRatio` export |
| `stocks/StockSearchInput` | Client | 등록 폼 종목명 검색 입력 — 디바운스 250ms→`searchStocks` 액션, 결과 드롭다운(키보드 ↑↓/Enter/Esc), 선택 시 hidden `symbolCode` 채우고 배지 표시. 보유·관심 추가 폼 공용 |
| `feeds/FeedTabsClient` | **Client** | 뉴스/공시/수출입 3탭 + 게시판 + 아코디언 (Phase 17-2/17-3/17-4). 데이터는 Server가 props로 주입, Client는 탭 선택·아코디언 open/close만. 3탭 모두 실동작(공시=제출인·접수일+DART 원문, 뉴스=출처·발행일+원문 새 탭 / 기본 선택 뉴스, 수출입=`TradeBoard` 최신월 3지표+YoY 요약 + 최근 13개월 표, 아코디언 없음). **17-2b에서 홈 전체폭→`/feeds/page.tsx`로 렌더 위치만 이동**. ~~`stocks/StockDisclosures`~~는 A안 철회로 **삭제** |
| `indices/FeedSummaryCard` | Server | 홈 "뉴스·공시" 그리드 요약 카드 (Phase 17-2b/17-3) — 공시·뉴스 당일 건수 2줄(수출입은 월간 데이터라 제외). 골격은 SummaryCard `composes`, 카드 전체가 `/feeds` 링크. `getTodayFeedCounts` 결과를 prop으로 받음 |
| `nav/NavIconLink` | Server | 헤더 이동 아이콘 버튼(home/back) — 36px 아이콘 버튼 통일 규격 |
| `nav/HeaderMenu` | Server | 햄버거 메뉴 조립 전용(Phase 18) — `MenuSidebar`에 `ThemeToggle`·`SignOutButton`을 슬롯으로 주입 (서버 액션 폼은 Client 안에서 정의 불가) |
| `nav/MenuSidebar` | Client | 햄버거 버튼 + 우측 슬라이드 사이드바(Phase 18) — 열림 상태·오버레이·ESC 닫기, 화면 모드(위)/알림 설정(Phase 10)·DLQ 확인 링크(중간)/로그아웃(아래) |
| `alerts/PushSubscriptionManager` | Client | 이 기기의 푸시 구독 on/off + 테스트 발송 (Phase 10) — 지원 감지(iOS 미설치 시 홈 화면 추가 안내), `sw.js` 등록→`pushManager.subscribe`→Server Action 저장. VAPID 공개키는 prop으로 수신 |
| `alerts/StockAlertToggles` | Client | 보유·관심종목별 알림 on/off (Phase 10 2·3단계) — 서버가 내려준 목록·초기 상태를 로컬 상태로 토글, `setStockAlertEnabledAction` 저장. 끄면 시세·공시·시장경보 알림 모두 음소거 |
| `alerts/AlertToggleButton` | Client | 종목 상세 화면 인라인 알림 토글 — 단일 종목 on/off, `setStockAlertEnabledAction` 재사용. 보유·관심종목 상세의 "종목 정보" 섹션 헤더에 배치(기존 /alerts 링크 대체) |
| `theme/ThemeToggle` | Client | `useSyncExternalStore`로 `data-theme` 구독·토글 (Phase 18부터 사이드바 안에 배치) |
| `auth/SignOutButton` | Server | Server Action `signOut` 폼 — Phase 18에서 아이콘+텍스트 행 스타일(사이드바 하단용) |

### 2.4 기타

- `src/types/indices.ts` `holdings.ts` `watchlist.ts` — 도메인 타입 (§6.3).
- `src/proxy.ts` — **미들웨어에 해당** (Next 16에서 파일명 proxy). 세션 쿠키만 낙관적
  검사, 허용 이메일 판정은 page 레벨. matcher가 `api/auth`·`api/jobs/` 접두사·정적 자산·
  PWA 자산(`sw.js`·`manifest.webmanifest`·`icons/`·`apple-icon.png`, Phase 10) 제외.
  → **잡 라우트는 미들웨어 미보호이며 `verifyJobRequest`가 유일한 인증** — 새 잡 라우트를
  신설하면 이 matcher 제외 등록이 세트로 필요하다 (§8.13).
- `public/sw.js` — 서비스 워커 (Phase 10) — push·notificationclick 리스너만(오프라인
  캐싱 없음). 페이로드 계약은 `lib/push/send.ts`와 동기화 필수. `next.config.ts` 헤더로
  `Cache-Control: no-cache` (수정이 기기에 즉시 전파되도록).
- `src/styles/tokens.css` — 디자인 토큰(색·타이포·간격·radius). `html[data-theme="dark"]`
  오버라이드. 등락색: rise `#f04452` / fall `#3182f6` (한국식 빨강=상승).
  타이포 계단: `--text-price` 28 / `--text-title` 22 /
  `--text-page-title` 20(§36 페이지 h1 전용) / `--text-caption` 13 /
  `--text-caption-sm` 12(§35 보조 수치용) / `--text-micro` 11px.
  굵기: `--weight-regular` 400(§36 페이지 h1) / medium 500 / semibold 600 / bold 700.
  페이지 제목은 전 화면 공통으로 `<h1 className={styles.title}>` +
  `--text-page-title`·`--weight-regular` (§36 — 각 `page.module.css`에 같은
  `.title` 블록이 복붙되어 있으니 제목 스타일 변경 시 14곳을 함께 고친다).
  카드 도형(surface+border+radius) 내부 여백은 **`--card-padding`(=`--space-12`)
  단일 토큰** — §39에서 홈·상세 39곳에 복붙돼 있던 `--space-16`을 한 칸 줄이며
  토큰으로 통합했다(카드 여백 재조정은 `tokens.css` 한 줄만 고치면 된다).
  카드 간 gap은 `--space-8`(§35). 단 **컨테이너 패딩은 §38에서 `--space-16`으로
  환원**(§35의 `--space-12`를 되돌림) — 홈 `.dashboard`와 상세 화면 13종의
  `.container`가 `padding: --space-16`·헤더 `margin-bottom: --space-16`으로
  동일해야 좌우 정렬선·제목 높이가 화면 간에 어긋나지 않는다.
- `src/app/globals.css` — `.numeric` (`tabular-nums`) 등 전역. 숫자 UI는 항상 `.numeric` 병기.
- `next.config.ts` — `staticPageGenerationTimeout: 300` + `/sw.js` no-cache 헤더(Phase 10).

---

## 3. 아키텍처 대원칙 (모든 계획이 지켜야 함)

1. **외부 API 호출은 잡 경유만 한다.** KIS는 시세·핫종목 잡 2종, DART는 피드 잡,
   업비트(비트코인, §30)는 시세 잡이 유일한 호출 경로다. 화면(Server Component)·Server Action은 외부 API를 절대
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
      1. refreshIndices: KIS 6종 병렬(allSettled) → market:detail:{kospi|kosdaq|usdkrw|us10y|oil|gold}
         (snapshot + history 7일 + dailyRows, 매퍼: kisMapper / kisOverseasMapper. gold=N/GOLDLNPM, §30)
      1a. refreshDxy: 환율 통화쌍 6콜 순차(FX@EUR·JPY·GBP·CAD·SEK·CHF) → computeDxyDetail
           (ICE 공식 근사, 기준일 교집합) → market:detail:dxy — 파생 부수 지표, 잡 ok 게이팅 제외 (§28)
      1a'. refreshBtc: 업비트 2마켓 순차(KRW-BTC·USDT-BTC, 티커+일봉 각 1콜) → mapUpbitDetail
           → market:detail:{btcKrw|btcUsd} — 외부 부수 지표, 잡 ok 게이팅 제외 (§30)
      1b. refreshDailyFluctuation: 등락률 순위(FHPST01700000) 1콜 → market:dailyFluctuation
           (basePrice=전일 종가: 현재가−prdy_vrss 부호 적용, §20)
      1b'. refreshWeeklyFluctuation: 동일 API fid_input_cnt_1="5" 1콜 →
           market:weeklyFluctuation (5거래일 전 종가 대비, dsgt_date_clpr_vrss_prpr_rate,
           basePrice=등락률 역산 — 1원 단위 오차 가능, §20)
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
         → evaluatePriceAlerts(lib/alerts/evaluate.ts): 보유+관심종목 union
         대상 조건 3종 판정→신고가 갱신→음소거·쿨다운 체크→발송→쿨다운 SET
         (휴장일 skip, 실패해도 200)
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

### 4.3 배당률 순위 갱신 잡 — Phase 43·44

```
QStash 스케줄 (월 1회 권장) → POST /api/jobs/refresh-dividend-ranking
  (인증·시간창 가드는 핫종목 잡과 동일)
  → refreshDividendRanking(trigger)  [lib/jobs/refreshDividendRanking.ts]
      완료 가드: market:dividendRanking.computedFor == KST 오늘이면 no-op
         (단, ?force=true 수동 트리거는 이 가드를 우회해 키 삭제 없이 재시딩 —
          진행 중 progress는 이어받아 여러 번 호출 시 커서부터 완주, Phase 46)
      → fetchDividendRankingUniverse: 일반종목(ST)+배당상품(EF/RT/IF)을 한 번의
         마스터 다운로드로 받아 코드 오름차순 (Phase 46, KIS 호출 0건). 레코드의
         group으로 이후 두 순위로 분류 — isFundStock(EF/RT/IF)=배당상품
      → 전 종목 현재가 선확보: 멀티시세 FHKST11300006 30종목/콜
         (배당률 = 배당금 ÷ 현재가라 상위 선택 시점에 가격이 있어야 한다)
      → market:dividendRanking:progress 있으면 커서 + 두 버퍼 + 가격 스냅샷 이어받기
         (Phase 46: productEntries 없는 구 progress는 무효 → 처음부터)
      → 종목별 buildEntry: 예탁원 배당일정 1콜(최근 10년) → 최근 1년 주당배당금 합으로
         시가배당률 + 연속 배당 연수 + 지급 주기(기준일 평균 간격 → 월/분기/반기/연)
         + 우선주(stk_kind=="우선") + 주식배당률(stk_divi_rate) + 폭배 후보(전년 대비
         급증) + 배당당시 액면가(face_val) 산출. 배당상품은 우선주·주식배당·폭배를
         강제 비활성. instrumentType(stock/fund)에 따라 일반/배당상품 버퍼(각 상위 500)에
         온라인 선택
      → 시간 예산 250초 소진 시 progress 저장 후 종료
      → 완주 시 finalizeEntries를 두 버퍼에 각각(isFund 플래그): 일반종목은
         ① 배당률>12% 이상치만 현재 액면가(CTPF1002R papr) 조회 → 배당당시÷현재
         액면가 비율로 주당배당금 환산(액면분할/병합 보정) → ② 재정렬·TOP 100 절단 →
         ③ 폭배 종목만 DART 현금·현물배당결정 공시 조회(corpCodeMap 1회) → ④ 순위.
         배당상품은 ①③을 스킵하고 ②④만
      → market:dividendRanking 저장(entries+productEntries) + progress 삭제
```

**KIS `ranking/dividend-rate`(HHKDB13470100)는 미사용** — 응답 `divi_rate`가 액면가배당률이라
정렬 기준이 다르고(같은 예탁원 계열인 `ksdinfo/dividend`의 실측 주석과 동일 필드명),
`UPJONG` 필수 파라미터·30건 상한 전례로 전 종목 커버리지도 보장되지 않는다 (plan.md §43).

**Phase 44 실측 정정** — `stk_kind`는 배당 형태가 아니라 주식 종류(보통/우선). 현금/주식
병행은 `stk_divi_rate`(>0), 배당 주기는 `divi_kind`가 아니라 배당 기준일 간격으로 판정.
액면분할은 배당락 이후 발생 시 배당 이력 `face_val`엔 안 잡히고 현재가만 반영돼 시가배당률이
부풀려지므로(실측: INVENI 38.74%→7.75%, 5:1 분할) 현재 액면가와 대조해 보정. 폭배(비경상
급증)는 KIS가 특별배당을 구분 안 해(divi_kind=분기/결산/반기뿐) 감지만 하고 DART 공시로 넘김.
`finalizeEntries`의 DART 호출은 원래 KIS 담당인 이 잡에 폭배 한정으로 섞이는 유일한 예외.

### 4.5 피드(공시) 갱신 잡 — Phase 17-1

```
QStash 스케줄 (매일 08~22시 정시 KST, CRON_TZ=Asia/Seoul 0 8-22 * * *)
  → POST /api/jobs/refresh-feeds
      verifyJobRequest만 — isWithinKisCallWindow 가드 없음 (KIS 아님, 공시는 장외·주말에도 발생)
  → refreshFeeds(trigger)  [lib/jobs/refreshFeeds.ts]
      0. refreshTradeStats (종목 무관·월 1회성): 스냅샷 최신월<직전 완결월일 때만
         관세청 2회 호출(최근 12개월+전년동월) → market:tradeStats 13개월 연속 저장
         (잡 ok 게이팅 제외 — 실패 시 다음 회차 가드가 재시도)
      1. collectHoldings + collectWatchlists (collectTargets.ts 공용) → 종목코드 union
      2. ensureCorpCodeMap: dart:corpCodeMap 30일 주기 갱신
         (+매핑에 없는 신규 종목 발견 시 1일 1회 보정 갱신 — 미매핑 코드가 매 회차
          zip을 받지 않게 제한). corpCode.xml zip → 상장사(6자리 종목코드)만 매핑
      3. 종목별 순차(150ms 간격): DART list.json 최근 90일 최대 10건
         → market:disclosures:{code} SET 덮어쓰기 (종목별 실패 격리)
      4. 종목별 순차(150ms 간격): 네이버 뉴스 검색(종목명 키워드) 최신 10건
         → market:news:{code} SET 덮어쓰기 (종목별 실패 격리, 종목명 미확정은 skip)
      5. 알림 훅 evaluateFeedAlerts(lib/alerts/feedAlerts.ts) — Phase 10 3단계:
         ① 공시: 방금 받아온 공시(메모리 전달)를 종목별 전역 커서
            alerts:disclosure:last:{code}(마지막 통지 접수번호)와 비교 →
            새 공시만 8유형 키워드 분류 → 매칭분 발송. 첫 회차는 기준점만 저장
         ② 시장경보: market:stock:{code} 스냅샷 raw의 경보 필드 6종을
            alerts:marketwarn:last:{code}와 비교(KIS 추가 호출 없음) →
            변화(지정·해제)만 발송. 첫 회차는 기준점만 저장
         발송 대상 = 각 사용자 보유+관심종목, 음소거(alerts:{email}:muted) 공유,
         이메일 단위 실패 격리. 훅 실패는 로그만 — 잡 ok 게이팅 안 함
      6. 알림 훅 evaluateDividendAlerts(lib/alerts/dividendAlerts.ts) — Phase 25:
         보유종목 union(관심종목 제외)의 market:stockInfo:{code} rounds에서
         지급일=KST 오늘·주당배당금>0 회차 추출(KIS 추가 호출 없음, 같은 날
         여러 회차는 합산) → alerts:dividend:sent:{code}:{payDate} 마커(EX 2일)로
         중복 차단 — 발송 전에 기록(중복 방지 우선) → 보유 사용자에게만
         발송(음소거 공유·이메일 단위 실패 격리). 훅 실패는 로그만 — ok 게이팅 안 함
  → 응답: report (실패 시 500 → QStash 재시도, 멱등)
```

- 17-4(수출입, 관세청 API)는 이 파이프라인에 스텝 0(월 1회성)으로 증분 추가됨 (plan.md §17.14).

### 4.6 수출입 상세 갱신 잡 — Phase 17-5

```
QStash 스케줄 (월 1회, 매월 5일 03:00 KST — CRON_TZ=Asia/Seoul 0 3 5 * *) → POST /api/jobs/refresh-trade-detail
    verifyJobRequest만 — 시간창 가드 없음 (KIS 아님, 월간 확정 통계)
  → refreshTradeDetail(trigger)  [lib/jobs/refreshTradeDetail.ts]
      0. 대상 = 직전 달(현재 KST 월은 월중 집계라 미완결 — §17-4와 동일 규칙)
         market:tradeDetail:{yyyymm}이 이미 있으면 관세청 호출 없이 즉시 skip
      1. 97개 류(HS 2단위 01~97) 전수 조회, 동시성 4 (실측 51~61초·13.5MB)
         류 조회 1회가 (국가 × HS 4단위) 행렬을 통째로 준다 → 국가별 추가 호출 0
      2. 집계: 품목별 상위 15 / 국가별 상위 8(+국가별 상위 5품목) / 전체 합계
      3. market:tradeDetail:{yyyymm}(~8KB) + market:tradeDetail:months(인덱스) 저장
  → 응답: report (실패 시 500 → QStash 재시도, 멱등)
```

- **일부 류라도 실패하면 저장하지 않는다** — 빠진 류만큼 집계가 왜곡되는데, 한 번
  저장하면 0번 가드에 걸려 왜곡이 영구 고착된다. 저장을 건너뛰면 다음 회차가 전수 재조회.
- **품목명은 API 제공값**(`statKor`, hsCd별 일관성 실측 확인) — 정적 매핑 불필요.
  다만 관세청 법령 원문이라 최대 182자로 길어, 화면은 HS 부호 병기 + 2줄 말줄임 + `title`.
- **합계는 품목별 통계 자체 집계** — 수출입총괄과 0.03% 차이(202606 실측 1021.3 vs
  1021.7억). 98·99류는 빈 응답이라 더 돌아도 안 메워진다. 출처를 섞으면 "기타"가
  틀어지므로 자체 정합을 지키고 차이는 화면 각주로 밝힌다.

### 4.3 화면 읽기 경로 (전부 Redis만)

페이지가 부르는 내부 REST API는 없다 — Route Handler는 auth·잡 2종뿐이고, 모든
페이지는 Server Component에서 lib 함수를 직접 호출한다.

- **홈** `app/page.tsx`: `getDashboardData`(detail 7종 MGET) + 카드 요약 5종(보유·
  변동성·핫종목·관심종목·배당) + `getLastRefreshRecord` 병렬 → staleness 배지 판정 →
  `IndexDashboard`.
- **지표 상세**: `IndexDetailScreen` → `getIndexDetail`/`getOverseasDetail` → detail 1건.
  usdkrw는 children `DollarIndexSection`이 `market:detail:dxy` 1건 추가 조회 (§28).
  글로벌 지표(`/indices/market`)는 금리·유가·금·비트코인 2키를 합쳐 MGET 1회(5키) — 카드별
  일별 기록도 이 `dailyRows`를 그대로 접힘 목록으로 렌더(추가 페치 없음, §31).
- **보유종목**: `getHoldings`(복호화) → `getPortfolioValuation`(`market:stock:*` MGET) +
  `getPortfolioHistory`. 상세는 + `getStockInfo`(스냅샷+정보 블록 조합) + `getStockHistory`.
  일별 기록 목록(`DailyHistoryList`)은 홈=`getPortfolioHistory`·상세=`getStockHistory`
  결과를 그대로 재사용 — 추가 페치 없음 (§29).
- **관심종목**: `getWatchlist` + `getStockSnapshots` + `computeWatchReturnRate`.
  상세는 보유종목 상세와 동일 구성에 기준가 대비 차트.
- **홈 "뉴스·공시" 카드**: `getTodayFeedCounts(email)`(feeds/homeFeed) — 오늘 공시·뉴스 건수
  집계 → `FeedSummaryCard`. 홈 `Promise.all`에 `.catch(() => 기본 0)` 격리로 합류.
- **배당 일정(`/dividends`, §25)**: `getDividendSchedule(email)` — `getHoldings`(보유종목만) →
  `getStockInfoBlocksMap` MGET → `rounds` 병합·예상 지급액(주당배당금×보유수량) 계산.
  홈 카드는 `getDividendCardSummary`(지급일 ≥ 오늘 상위 4, 실패 시 null 격리).
- **뉴스·공시 상세(`/feeds`)**: `getDisclosureBoard`·`getNewsBoard(email)` — `market:disclosures:{code}`·
  `market:news:{code}` MGET 병합·상위 40건 → `FeedTabsClient`. (Phase 17-2에서 A안 철회 — 보유·관심
  상세 페이지는 더 이상 공시를 읽지 않는다. 17-2b에서 게시판을 홈 전체폭→`/feeds`로 이동.)
- **핫종목**: `?mode` 서버 분기 — 월간은 `getHotStocks` 통짜 1건→`?period` 탭(링크에 `mode=monthly` 유지), 당일/주간은 `getDailyFluctuation`/`getWeeklyFluctuation` 1건(상위 30)+`getStockMaster`(위첨자 매핑)+`resolveStaleness`. (검증: 알 수 없는 mode→daily, period→1m).
- **변동성**: `getVolatilityHistory` → `aggregateMonthlyAverages`(최근 6개월) + 당월 필터
  일별 기록 목록(내림차순 — 페치 1회 재사용, Phase 27).
- **예외 — DLQ(`/dlq`, Phase 18)**: 유일하게 Redis가 아닌 외부 API(QStash)를 Server
  Component에서 직접 읽는다(`listDlqMessages`, `QSTASH_TOKEN` 서버 전용). 운영 확인용
  읽기 전용 화면이라 스냅샷 캐시 없음. KIS 금지 원칙(§3)과는 무관(QStash는 KIS 아님).

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
| `market:detail:{kospi\|kosdaq\|usdkrw\|us10y\|oil\|gold\|dxy\|btcKrw\|btcUsd}` | `StoredMarketDetail` (snapshot+history+dailyRows+fetchedAt). dxy는 환율 6종 합성 파생 지표(§28), gold는 KIS N/GOLDLNPM, btcKrw·btcUsd는 업비트 외부 지표(§30) | ✕ | 시세 잡 | 홈·지표 상세·시장 |
| `market:stock:{code}` | `StoredStockSnapshot` (price·changeRate·marketName·raw 전체·fetchedAt) | ✕ | 시세 잡 | 평가·관심종목·상세 |
| `market:stockInfo:{code}` | `StoredStockInfoBlocks` (순위·배당·실적 + 배당 확정 회차 `rounds` — optional, 구 스냅샷 호환, §25) | ✕ | 시세 잡(확정 회차/신규) | `getStockInfo`·배당 일정 리더·배당 알림 훅 |
| `market:lastRefreshAt` | `LastRefreshRecord` (at·trigger·ok) | ✕ | 시세 잡(전부 성공 시) | 홈 배지·각 페이지 「마지막 갱신」 |
| `stock:{code}:history` | `StockDailyPrice[]` 2년 (날짜 오름차순) | ✕ | 시세 잡(백필/확정 갱신) | 상세 차트·기준가 확정 |
| `kospiVolatility:history` | `KospiVolatilityRecord[]` | ✕ | 시세 잡 | 변동성 카드·상세 |
| `market:hotStocks` | `StoredHotStocks` (구간 4종 TOP 100) | ✕ | 핫종목 잡 | 핫종목 페이지 월간 뷰 |
| `market:hotStocks:progress` | `HotStocksProgress` (커서) | ✕ | 핫종목 잡 (완료 시 삭제) | 핫종목 잡 |
| `market:dailyFluctuation` | `StoredDailyFluctuation` (당일 등락률 상위 30+basePrice(전일 종가, §20)+fetchedAt) | ✕ | 시세 잡 | 핫종목 페이지(기본 탭)·홈 핫종목 카드 |
| `market:weeklyFluctuation` | `StoredWeeklyFluctuation` (주간=5거래일 전 대비 등락률 상위 30+basePrice(역산, §20)+fetchedAt) | ✕ | 시세 잡 | 핫종목 페이지 주간 탭 |
| `market:stockMaster` | `StoredStockMaster` (코드↔종목명 ~2,650+fetchedAt) | ✕ | 시세 잡 (1일 1회) | 종목명 검색 `searchStocks` |
| `market:dividendRanking` | `StoredDividendRanking` — 일반종목 `entries`/`universeCount` + 배당상품 `productEntries?`/`productUniverseCount?`(Phase 46, 구 스키마 폴백) 시가배당률 각 TOP 100+fetchedAt | ✕ | 배당률 순위 잡 | 배당 페이지 순위 섹션(일반종목/배당상품 2탭) |
| `market:dividendRanking:progress` | `DividendRankingProgress` (커서+일반/배당상품 두 버퍼+가격 스냅샷) | ✕ | 배당률 순위 잡 (완료 시 삭제) | 배당률 순위 잡 |
| `holdings:{email}` | `Holding[]` | **○** | Server Action + 잡(종목명 채움) | 보유종목 화면·잡 |
| `holdings:{email}:history` | `PortfolioDailyRecord[]` | **○** | 시세 잡 | 보유종목 화면 |
| `watchlist:{email}` | `WatchItem[]` | **○** | Server Action + 잡(종목명·기준가) | 관심종목 화면·잡 |
| `kis:access_token` (+`:lock`) | 토큰 캐시 (TTL=만료 시각) | ✕ | KIS auth | KIS auth |
| `market:disclosures:{code}` | `StoredDisclosures` (최근 90일 공시 최대 10건+fetchedAt) | ✕ | 피드 잡 | 홈 통합 피드(`homeFeed` MGET) |
| `market:news:{code}` | `StoredNews` (최신 뉴스 최대 10건+fetchedAt) | ✕ | 피드 잡 | 홈 통합 피드(`homeFeed` MGET) |
| `dart:corpCodeMap` | `StoredCorpCodeMap` (종목코드→DART 고유번호, 30일 주기) | ✕ | 피드 잡 | 피드 잡 |
| `push:subs:{email}` | `StoredPushSubscription[]` (기기별 구독, Phase 10) | **○** | 구독 Server Action + 발송 경로(410/404 prune) | `/alerts` 화면·발송 유틸 |
| `alerts:{email}:peaks` | `StockPeakMap` (종목별 신고가+갱신 시점 지수) | **○** | 시세 잡(알림 훅 — 보유+관심종목만 유지) | 알림 훅 |
| `alerts:{email}:muted` | `string[]` (알림 끈 종목코드) | **○** | `/alerts` 종목별 토글 Server Action | 알림 훅·`/alerts` 화면 |
| `alerts:{email}:cooldown:{code}` | 발송 시각 ISO (EX 7200 — 2시간 재알림 금지) | ✕ | 시세 알림 훅 | 시세 알림 훅 |
| `alerts:disclosure:last:{code}` | 마지막 통지 접수번호 (종목별 전역 커서, Phase 10 3단계) | ✕ | 피드 알림 훅 | 피드 알림 훅 |
| `alerts:marketwarn:last:{code}` | `MarketWarnState` (시장경보 상태 6필드, 종목별 전역) | ✕ | 피드 알림 훅 | 피드 알림 훅 |
| `alerts:dividend:sent:{code}:{payDate}` | 발송 시각 ISO (EX 2일 — 배당 지급일 알림 중복 방지 마커, 종목×지급일 전역, §25) | ✕ | 배당 알림 훅 | 배당 알림 훅 |

- 이메일 키는 항상 `normalizeEmail`(trim+lowercase) 후 사용.
- 공용 시세는 비암호화(사용자 무관 공개 데이터), 개인 데이터 6키(holdings·history·watchlist·push:subs·alerts peaks·muted)만 `enc:v1:` 암호화 — 쿨다운 키는 TTL 기반 평문.
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
  `format/trade.ts`(17-4) — `formatUsdEok`/`formatUsdEokSigned`("607.5억 달러", 1억 달러=1e8 USD)·`formatYyyymm`(2026.06)·`formatYoy`(전년동월비 %, null→"—").
  `format/btc.ts`(§30) — `formatBtcValue`/`formatBtcChange`(통화별: 원화 정수 "…원", 달러 소수 2자리)·`BtcCurrency` 타입 — 서버·클라이언트 공용.

### 6.3 타입

- `types/indices.ts` — `IndicatorId`(=`MarketIndex`|`OverseasIndicator`(GOLD 포함 4종)|`"DXY"`|`"BTCKRW"`|`"BTCUSD"` —
  DXY는 환율 6종 합성 파생 지표(§28), BTC 2종은 업비트 외부 지표(§30)),
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
13. **잡 라우트 신설 시 2곳 동기화** — 새 `/api/jobs/*`는 ① `verifyJobRequest`
    재사용(+KIS 호출 잡이면 `isWithinKisCallWindow` 가드), ② QStash 스케줄 등록이
    세트다. 기존 잡에 로직을 얹을 수 있으면 신설하지 않는 편이 구조에 맞다
    (refresh-feeds는 시간창 제약 차이로, refresh-trade-detail은 61초 전수 조회의
    시간 예산·실패 격리 때문에 신설한 예외 — plan.md §17.2·§17.15).
    ~~`proxy.ts` matcher 제외 추가~~는 §17.15에서 필요 없어졌다 — matcher가 잡을
    하나씩 열거하다 신설 라우트를 빠뜨려 307→/login으로 새는 사고가 실제로 나서,
    `api/jobs/` 접두사 하나로 묶었다 (잡은 전부 스스로 인증하므로 안전).
14. **chartPoints 매핑 3벌** — `{ fullDate, date: slice(5).replace("-","/"), totalValue,
    returnRate }` 변환이 holdings 목록·상세, watchlist 상세에서 거의 동일하게 반복 —
    새 차트 화면 추가 시 4번째 사본이 생기기 쉽다 (§8.6 수익률 산식 반복과 같은 지점).

---

## 9. 특이사항·제약사항

### 9.1 문서·헌법과 코드의 불일치

- **데이터 원천 전환 이력**: 프로젝트는 공공데이터포털 API로 시작했다. 도입 당시 불편이
  없으면 계속 쓰려 했으나 원하는 기능(실시간 시세·랭킹·재무 등)을 구현하기 어려워
  **Phase 5에서 KIS OpenAPI로 전환**했다. 이때 `DATA_GO_KR_SERVICE_KEY`·`ensureItemsArray`·
  `lib/api/data-go-kr/`는 코드에서 완전히 제거됐고, AGENTS.md(헌법) §2도 KIS 기준으로 갱신됐다
  (`KIS_APP_KEY`·`parseNum`/`applyKisSign` 명시). 서버 전용 키·클라이언트 직접 호출 금지·
  응답 정규화 취지는 KIS 코드에 동일하게 유지된다.
- plan.md 전반부(§1~5)는 공공데이터포털 시절 설계라 현재 코드와 다르다(이력으로 보존).
  **현행 구조는 §9(Phase 9) 이후 절이 정본**이다.

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
- GOLD는 `N/GOLDLNPM`(LBMA 런던 금 현물) — `N/XAUUSDCOMP`·`N/NYGOLD`도 정상 응답하지만
  현물 벤치마크로 GOLDLNPM 채택(2026-07-19 실측, §30). 비트코인은 KIS에 없음(마스터
  전수 + 추정 코드 4종 빈 응답 확인) → 업비트 공개 API 사용.
- 종목 마스터 파일 그룹코드 오프셋은 `tail[1:3]` — **공식 파이썬 샘플([0:2])과 1바이트
  다름** (2026-07-11 원시 바이트 실측 우선).
- 시총 랭킹은 1회 상위 30건 → 밖이면 "30위권 밖" 라벨.
- **등락률 순위(FHPST01700000)도 1회 상위 30건이 상한** — `fid_input_cnt_1`을 키워도 30건,
  `tr_cont` 연속조회는 1페이지로 리셋돼 31위 이하 조회 불가(2026-07-14 실측). 100위는
  전체 종목 스캔이라야 가능. `fid_rank_sort_cls_code` "0"=상승률순/"1"=하락률순.
- **등락률 순위의 `fid_prc_cls_code`는 비교 기준가 선택** — "0"=저가대비(당일 저가 대비
  수익률 순위, `prdy_ctrt` 정렬과 불일치), "1"=종가대비(전일 종가 대비 등락률순)
  (2026-07-17 실측). 당일 등락률 순위는 반드시 "1"을 사용하고, 갱신 잡은 방어적으로
  `changeRate` 내림차순 재정렬·재순위 후 저장한다.
- **등락률 순위의 `fid_input_cnt_1`은 비교 시점(N거래일 전) 선택** — "5"면 정확히
  5거래일 전 종가 대비 현재가 등락률순이 온다(2026-07-18 일봉 교차 검증 실측). 이때
  N일 등락률은 `prdy_ctrt`(여전히 당일 등락률)가 아니라
  **`dsgt_date_clpr_vrss_prpr_rate`**(지정일 종가 대비 현재가 비율, 부호 직접 포함 —
  `applyKisSign` 불필요, `parseNum`만)가 담고, 30행 전부 이 값 내림차순으로 정렬돼
  온다. 단 지정일 종가가 **원주가(수정주가 미반영)**라 감자·액면병합이 구간에 낀
  종목은 왜곡된 값으로 상위에 나타날 수 있다(실측: 인산가 +687.5% vs 수정주가 기준
  실제 −21.3%). KIS HTS 순위와 동일한 원천 특성이라 보정 없이 UI 각주로만 안내한다.
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
- 홈 `getDashboardData`는 필수 4종(kospi·kosdaq·usdkrw·us10y) 없으면 throw,
  **oil·gold·btcUsd는 null 허용** (나중에 추가된 키 — 새 지표 추가 시 같은 전략 참고).
  oil·gold·btcUsd는 §33에서 홈 글로벌 지표 카드 4행 목록으로 합류(null이면 행 생략),
  btcKrw·dxy는 홈 미사용. 글로벌 지표 카드 staleness 배지는 금리·유가·금 3종 기준 —
  btcUsd는 잡 `ok` 게이팅 밖 외부 지표라 제외 (§30 dxy 관례).
- 비트코인은 24시간 거래 자산이지만 갱신은 시세 잡 시간창(평일 09:00~18:40)에만 —
  주말·야간 화면은 마지막 회차 시세(각주 안내, 사용자 확정 §30). 달러 표기는 업비트
  USDT-BTC 마켓 시세(USDT≈USD).
- 알림(Web Push)은 **Phase 10 3단계까지 전부 구현** — PWA·구독 등록·발송
  유틸(`lib/push/*`)·`/alerts` 화면(1단계) + 시세 알림 조건 3종·신고가 추적·2시간
  쿨다운(2단계, `lib/alerts/evaluate.ts`) + 공시 8유형·KRX 시장경보(3단계,
  `lib/alerts/feedAlerts.ts` — `refreshFeeds` 훅, 종목별 전역 커서로 중복 차단,
  첫 회차는 기준점만 저장하고 발송 안 함). 시세·공시·시장경보 알림 모두
  보유+관심종목 대상(시세 조건 1의 기준가만 보유=매입가/관심=등록가로 다름 —
  등록가 미확정이면 그 조건만 skip)이며 `alerts:{email}:muted` 음소거
  목록(보유·관심 토글)을 셋이 공유한다. 시장경보는 KIS 추가 호출 없이
  `market:stock:{code}` raw의 경보 필드 6종 회차 간 비교로 감지.
- **배당 지급일 당일 알림(§25, `lib/alerts/dividendAlerts.ts` — `refreshFeeds` 훅)은
  예외적으로 보유종목만 대상**(관심종목 제외 — 사용자 확정). 음소거 목록은 공유,
  중복 방지는 종목×지급일 전역 마커(`alerts:dividend:sent:*`, EX 2일)로 발송 전 기록.

### 9.6 프런트 규칙

- Tailwind 금지, CSS Modules + `tokens.css` 토큰. 등락색은 rise=빨강/fall=파랑 (한국식).
- Client Component는 차트 셸 3종 + ThemeToggle + `feeds/FeedTabsClient`(Phase 17-2 —
  탭 전환·아코디언은 서버로 못 옮기는 정당한 최소 Client 예외) + `nav/MenuSidebar`(Phase 18 —
  사이드바 열림 상태만) — 새 인터랙션도 최소 Client 원칙.
- 테마는 `data-theme` 속성 + localStorage(`jusik-theme`), FOUC 방지 인라인 스크립트.
- 레이아웃 max-width 480px 모바일 우선 (`--layout-max-width`).
- **화면 전환 스켈레톤은 `components/ui/PageSkeleton` 하나로 통일** (§40). Server Component라
  클라이언트 JS가 없다 — `loading.tsx`가 곧 prefetch 경계라 여기에 `'use client'`가 들어가면
  경계 자체가 무거워지므로 유지할 것. 자리표시자 크기는 실제 화면 토큰(`--space-16` 컨테이너,
  `--card-padding` 카드)을 그대로 따라 데이터 도착 시 레이아웃이 튀지 않게 맞춰져 있다.
  shimmer는 `prefers-reduced-motion: reduce`에서 정지. 차트 내부 로딩(`*ChartClient`의
  `.chartSkeleton` "차트 로딩 중…")은 별개 계층이라 그대로 공존한다.
- `params`/`searchParams`는 Promise — Next 16 규약대로 항상 `await` 후 사용. 검증 실패
  값은 redirect 또는 기본값 폴백(핫종목 `resolvePeriod` 참고).
- 핫종목 표(`hot-stocks/page.module.css` `.table`)는 3개 탭이 같은 클래스를 공유하며
  `table-layout: fixed` + `th:nth-child` 고정 폭 6열 34/108/48/74/84/84px(합 432px ≤
  min-width 440px)로 **탭·데이터와 무관하게 열 경계 동일**(plan.md §21 — auto 시절엔
  행 내용 따라 배분돼 탭 간 미세하게 어긋났음). 종목명은 `.nameText`
  `max-width: 88px`+ellipsis, 종목코드 값은 `.table .codeCell` 10px 직접 지정(토큰
  없음), td 값은 12px 직접 지정. 갱신 시각은 3개 탭 모두 `.lastRefresh` 별도
  줄(기준 문구 `rangeInfo`와 분리, plan.md §22)로 표시.

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
