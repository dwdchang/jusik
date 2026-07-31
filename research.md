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
- **스택**: Next.js 16.2.12 (App Router, `src/app`) · React 19.2.4 · TypeScript Strict ·
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
| `DATA_GO_KR_SERVICE_KEY` | 관세청 수출입총괄(GW, Phase 17-4) + **금융위 주식시세정보(Phase 63)** 공유 인증키 | `lib/api/customs/client.ts`·`lib/api/fsc/stockPrice.ts` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹 푸시 VAPID 키 (Phase 10) — 공개키도 서버 env로 두고 Server Component가 prop으로 전달 | `lib/push/send.ts`, `app/alerts/page.tsx` |

---

## 2. 디렉토리 구조와 파일별 역할

### 2.1 `src/app` — 라우트 (전부 Server Component)

| 경로 | 역할 |
|---|---|
| `layout.tsx` | 루트 레이아웃. Geist 폰트, `tokens.css`+`globals.css` import, 테마 FOUC 방지 인라인 스크립트(`data-theme` 선결정) |
| `page.tsx` | 홈 대시보드. 세션 검사 → 허용 외 이메일이면 access-denied 화면 → 카드 7종 데이터 병렬 조회(§58에서 보유종목 카드 삭제)(`Promise.all`) → `IndexDashboard` 렌더. staleness 배지 판정도 여기서 수행. **갱신 지연 인시던트**(`resolveRefreshIncident`, §52)가 있으면 per-card 배지를 전부 억제하고 헤더 상태 표시로 통합(`incident` prop 전달) |
| `login/page.tsx` | Google 로그인 버튼 (Server Action으로 `signIn("google")`). 세션 있으면 `/` redirect, 인라인 `GoogleIcon` SVG 로컬 정의 |
| `indices/kospi` `kosdaq` `usdkrw/page.tsx` | 지표 상세 3종 — 전부 `ensureAllowedSession()` 후 `<IndexDetailScreen market=…>` 한 줄 위임(제목 `<h1>`도 §36에서 공용 컴포넌트에 들어가 3화면 동시 적용). usdkrw만 children으로 `<DollarIndexSection>`(달러 인덱스, §28) 추가. us10y·oil·gold·btc 개별 상세는 §31에서 제거(시장 카드 접힘 목록으로 대체) |
| `indices/market/page.tsx` | 글로벌 지표(§37에서 표시명 `시장`→`글로벌 지표` — 라우트·컴포넌트명·Redis 키는 `market` 유지). **§88 전면 개편**(차트 전면 제거 — `BtcChartClient`·`BtcLineChart`는 파일까지 삭제, `IndexChartClient`는 지수 상세·DXY가 계속 써서 남김) **→ §89 타일 재개편**: 맨 위 「주요 지표」 카드에 **3열 2행 `GlobalTileGrid`**(미국 10년물·비트코인(USD) + `highlights` 구획의 반도체·두바이유·브렌트유·WTI) — **출처가 둘**이라 구획 컴포넌트로 못 그린다(앞 2개는 10분 주기 `market:detail`, 뒤 4개는 하루 3회차 `market:globalTable`). 그 아래 **`GlobalTileSection` 4개**(세계 증시 **4열**(§90)·환율 **4열**·귀금속·비철금속 3열·농산물 3열, **전부 펼침**). 열 수는 화면이 구획 id로 정한다(`FOUR_COLUMN_SECTIONS`) — 스냅샷에 표현 정보를 넣지 않았다. **세계 증시 첫 타일 코스피는 구획 밖에서 온다**(§90) — `market:detail:kospi`(10분)를 표 스냅샷 행 모양으로 만들어 `rows` 앞에 끼우므로 구획 컴포넌트는 그대로 쓴다. **기준일·일별 기록·`btcKrw` 제거**(§89). 읽기는 `getMarketDetails` MGET 1회(3키: us10y·btcUsd·kospi) + `getGlobalTable` 1회 **병렬**. 헤더 「마지막 갱신」은 detail 3종 기준이고 **지표는 자기 갱신 시각을 따로 적는다** — 하루 3회차라 같이 묶으면 10분마다 도는 값까지 낡아 보인다(§85 dxy와 같은 이유). **§91에서 각주 6지점(주요 지표·구획 4개·갱신 주기 푸터)이 `NoteDisclosure` 접힘 토글로** — 값을 크게 보려고 만든 타일 아래에 4~5줄 회색 문단이 붙어 §89·§90의 정보 밀도가 되돌아간 것을 되돌린다 |
| `indices/actions.ts` | 지수 상세 Server Action 1종 (Phase 93) — `fetchIntradayFlowSlots(market, tradingDate)`: 일별 수급 표에서 펼친 하루의 장중 시각 슬롯을 `:archive:{날짜}` GET 1회로 돌려준다. **Redis 스냅샷만 읽고 KIS 호출 없음**(§2). UI를 거치지 않고도 POST되는 엔드포인트라 페이지 게이트와 별개로 `auth`+허용 이메일을 다시 검사하고, `market` 화이트리스트·거래일 `YYYY-MM-DD` 패턴·축적 시작일 이후인지까지 확인한 뒤에야 키를 조립한다. 수동 트리거 슬롯(`:manual:`)은 읽지 않는다. 없는 날은 빈 배열(화면 "기록 없음"), Redis 실패는 예외로 올려 화면이 재시도를 안내 |
| `indices/trade/[yyyymm]/page.tsx` | 수출입 상세(Phase 17-5) — 월 합계 3지표 + 품목별(국가 무관, HS 4단위 상위 15+기타) + 국가별(상위 8+기타, 클릭 시 품목 팝업). `getTradeDetailView` 1회. `/feeds` 수출입 탭의 월 링크로 진입. 맨 아래 출처·오차 각주는 §91에서 `NoteDisclosure` 접힘(표 위 `cardNote` 2개는 집계 기준·조작 안내라 그대로 펼침) |
| `indices/kospi-volatility/page.tsx` | 변동성 상세 — 월별 평균 막대 차트 + 당월 일별 기록 목록. 푸터 계산식 안내는 §91에서 `NoteDisclosure` 접힘 |
| `stocks/page.tsx` | **내 종목 목록**(Phase 56, Phase 58에서 `/watchlist`→`/stocks`로 개명·통합 — 제목 `내 종목`, 홈 "내 종목" 카드에서 진입) — **4탭 단일 구조**(`?mode=all\|holdings\|watchlist\|balance` 서버 탭 `TABS`, 기본 `all`, 핫종목·배당과 동형). 표 폼은 배당률 순위 표 관례(`.tableScroll`+`.stockTable`, **종목명 열 sticky** 가로 스크롤, 값 숫자 열 우측 `.numCell`). **모두·보유종목 탭 = 종목명+6열**(현재가·등락률(전일 대비)·수익률·수익금·평균단가·총 매입금액), **관심종목 탭 = 종목명+4열**(현재가·등락률·수익률·기준일), **잔고 탭 = 표가 아니라 `<HoldingsOverview>`**(구 `/holdings` 화면 본문 통째, §58). 모두 탭의 관심종목 행은 보유 전용 3열이 `-`. **전 탭 수익률 내림차순**(`sortRowsByReturnRate`, 수익률 null은 맨 뒤·그들끼리 종목명순). 보유·관심에 같은 종목이 있으면 **2행으로 따로** 표시(합치지 않음 — 사용자 확정). 모두 탭에서만 보유종목 **종목명 글자색** 강조(`--color-holding-name`, 라이트/다크 2벌). 데이터는 활성 탭 것만 로드(`getHoldings`+`getPortfolioValuation` / `getWatchlist`, **잔고 탭은 목록·시세를 읽지 않고 `HoldingsOverview`가 직접 읽는다**)하고 시세는 두 목록 합집합 `getStockSnapshots` 1회(+평가 내부 MGET 1회) — KIS 직접 호출 없음. 추가 폼은 **관심종목 탭(기준일 → `addWatchItemAction`)과 잔고 탭(수량·총 매입금액 → `addHoldingAction`)에만**(§58에서 보유종목 탭 추가 폼 제거 — 보유 등록 동선은 잔고 탭 하나), 모두·보유 탭엔 없음. 종목명 클릭 시 펼침(`StockRowItem`, 아래) |
| `stocks/[symbolCode]/page.tsx` | **종목 상세 통합 라우트**(Phase 58 — 구 `holdings/[symbolCode]`+`watchlist/[symbolCode]`). 같은 종목이 보유·관심에 동시에 있을 수 있어 **`?kind=holding\|watch`로 어느 쪽 상세인지 가른다**(A안). kind가 없거나 그쪽 목록에 없으면 **보유 → 관심 순 폴백**, 둘 다 없으면 `/stocks` redirect. 보유=평가 요약 6지표·보유 내역 수정/삭제(`?kind=holding&edit=1`)·2년 평가금액 추이·일별 기록(`DailyHistoryList`+종가 열, §29) / 관심=현재가·기준일·기준가·등록 기준 수익률 3지표·등록일 이후 기준가 대비 추이(현재가·등락률·수익률은 스냅샷이 없으면 목록과 같은 종가 폴백을 흐린 값으로 표시하고, 보유 계산 `currentValue`·`profit`에는 쓰지 않는다 — Phase 65. 「저장된 시세 없음」 배너도 관심은 폴백마저 없을 때만). 공통=정보 블록 4종 + 인라인 알림 토글(`AlertToggleButton`) + 양쪽에 다 있을 때만 뜨는 반대쪽 상세 전환 줄 |
| `stocks/rows.ts` | 표 행 모델 `StockRow`(kind=holding\|watch, 보유 전용·관심 전용 필드는 반대쪽에서 null) + `buildHoldingRows`/`buildWatchRows`/`sortRowsByReturnRate` (Phase 56). `detailHref`는 §58에서 `/stocks/{code}?kind=…`. 펼침 지표(52주 최고·최저+현재가 대비 괴리율·PER/PBR·시가총액)는 스냅샷 `raw`에서 여기서만 뽑아 행에 실어, 클라이언트가 KIS 원본 타입을 몰라도 되게 한다(`buildStockIndicators` 재사용 + `parseNum`). 오늘 손익은 평가금액을 전일 대비 등락률로 역산해 계산. **관심 행은 스냅샷이 없으면 등록 시 종가로 폴백**(`snapshot?.price ?? item.priceAtRegistration`, 등락률은 `changeRateAtRegistration`) — `provisionalPrice`·`priceBasisDate`를 행에 실어 화면이 흐리게 표시한다(Phase 65). 보유는 `provisionalPrice: false` 고정(평가금액 계산 오염 방지). 정렬은 불변(폴백 수익률 0%가 그대로 참여) |
| `stocks/StockRowItem.tsx` | Client — 표 1행 + 펼침 상세 행(`colSpan`, 배당률 순위 `DividendRankRow`와 같은 패턴, 클릭 시 추가 조회 0). 공통=52주 최고/최저·PER/PBR·시가총액, 보유=수량·평가금액·오늘 손익, 관심=기준가(직전 거래일 잠정 표기)·등록 기준일·등록 후 경과일 + **수정·삭제**(Phase 23의 `?edit=1` 편집 모드를 대체) + 상세 보기 링크. 기준일 편집은 **2단계**(Phase 57 A안) — 평상시 `수정`/`삭제` 버튼만, `수정`을 눌러야 기준일 입력+`저장`/`취소`가 열리고 행을 접으면 편집 상태 초기화. 폴백값(현재가·등락률·수익률)은 `--opacity-provisional`로 흐리고 툴팁 `{기준일} 종가 · 실시간 갱신 전`, 툴팁이 안 뜨는 터치 기기용으로 펼침에 「현재가 기준」 한 줄(Phase 65) |
| `stocks/actions.ts` | Server Actions 6종(Phase 58에서 구 `holdings/actions.ts`+`watchlist/actions.ts` 병합) — 보유 add/update/delete + 관심 add/update/delete. **형식 검증만** 하고 KIS 호출 없음 (§6.4). 폼의 `mode` 히든값을 화이트리스트(`holdings\|watchlist\|balance`)로 검사해 **경로를 서버가 조립**(`stocksPath()`)한 뒤 그 탭으로 성공·실패 redirect — 입력값을 경로에 넣지 않아 오픈 리다이렉트 없음. 보유 상세 경로는 `/stocks/{code}?kind=holding`, 보유 삭제 후에는 `?mode=balance`로 복귀. `revalidatePath`는 `/stocks`(+상세). **등록 시 종목명·기준가 즉시 채움(Phase 63)**: `resolveStockName`(=`market:stockMaster` Redis 리더, 외부호출 0)으로 add 시 종목명을 바로 채우고(보유·관심 공통, 비갱신 시간대에도 코드 대신 이름 표기), **관심 add는 추가로 `fetchStockCloseAsOf`(금융위 시세)로 `priceAtRegistration`/`priceBasisDate` 확정** — 보유는 가격 슬롯이 없어(스냅샷 경유) 종가는 잡 백필. 둘 다 실패는 격리(이름 ""·기준가 null → 다음 회차 잡이 재확정). ⚠️ 관심 add의 금융위 호출은 §3 「잡 경유」 예외(시간창 없는 EOD, 등록 시점 기준가 확정용) |
| `hot-stocks/page.tsx` | 핫종목 — 서버 모드 탭 `[당일 등락률(기본) \| 주간 등락률 \| 월간 핫종목]`(`?mode=weekly\|monthly`). 당일/주간: `market:dailyFluctuation`/`market:weeklyFluctuation` 상위 30을 월간과 동일한 6열 폼(순위/종목명+ᴷ·ᴰ 위첨자/종목코드 열/등락률/기준 종가/현재가, §20)으로 표시+`resolveStaleness` 배지 — 공용 `FluctuationView`(variant별 데이터 소스·문구만 교체). 위첨자는 `market:stockMaster`를 읽어 코드→시장 매핑(`loadMarketByCode`, 실패·미등재 시 생략), 기준 종가 없는 구 스냅샷은 "—". 기준 문구는 전 탭 월간 형식: "… 상위 30종목 · 기준: {전일\|5거래일 전} 종가 · 대상 전체시장 · 갱신: …". 월간: 구간 수익률 TOP 100(`?period=1m\|3m\|6m\|12m`, 구간 링크는 `?mode=monthly&period=…` — mode 유지, §20 회귀 수정). 뷰는 async 서버 서브컴포넌트(`FluctuationView`/`MonthlyView`) |
| `feeds/page.tsx` | 뉴스·공시 상세 (Phase 17-2b) — `ensureAllowedSession` + `getDisclosureBoard`·`getNewsBoard`·`getEarningsBoard`(§81)·`getTradeStatsView`(17-4) + `FeedTabsClient`(뉴스/공시/실적/수출입 탭+게시판+아코디언). 홈 "뉴스·공시" 요약 카드에서 이동. **`?tab=`이 현재 탭이다**(Phase 81 신설 → **Phase 82에서 탭 상태 자체가 URL로 승격** — 클라이언트 `useState` 폐기, 화이트리스트 밖 값은 기본 탭 `news`로 폴백). **Phase 82: `?code=`로 실적 탭 종목 선택** — 외부 입력이라 `getEarningsStockOptions` 결과 중 `supported`인 코드만 통과시키고 미지정이면 첫 종목 기본 선택, `EarningsFocusPanel` 조립은 **`?tab=earnings`일 때만**(다른 탭에서 DART를 부르지 않게). **Phase 83: 선택지·선택코드를 `FeedTabsClient`에도 넘긴다**(선택 줄과 실적 목록 필터가 클라이언트로 내려갔다) |
| `dividends/page.tsx` | 배당 상세 (Phase 25·43·44·45·47) — **3탭 단일 구조**(Phase 47, `?mode=stock\|product\|schedule` 서버 탭 `DIVIDEND_TABS`, 기본 stock). 헤더 아래 탭 바 하나로 통합 — 활성 탭에 필요한 데이터만 로드하고 각주도 탭별로 갈린다. ① **일반종목**·② **배당상품** = **배당률 순위** 표(Phase 43·46, `getDividendRankingView(category)`·순위 메타 `RANK_META`): 시가배당률 TOP 100, 8열(순위·종목명·현재가·배당률·주당배당금·지급주기·연속배당·비고) 공용. 배당상품(ETF·리츠·인프라펀드) 탭은 우선주·폭배·주식배당·액면분할 보정이 없어 비고 항상 "—". 순위·종목명 2열 sticky 가로 스크롤. **종목명 클릭 시 지난 배당 기록 펼침**(Phase 51, `DividendRankRow` 클라이언트 — 데이터 행 + colSpan 상세 행으로 `entry.history`를 회차 표(기준일·주당배당금·**실배당률**·지급일·**지급 주기**)로 렌더, 추가 조회 0·구 스키마는 "기록 준비 중" 폴백). **회차 실배당률**(Phase 55, `formatRoundYield`)은 그 회차 주당배당금을 **현재가(`entry.price`)로 나눈 실측값**(연 환산 없음) — **basis 산입 회차(`round.inBasis`, `.basisRow` 강조·좌측 강조선) 합이 헤더 시가배당률과 일치**(Phase 59, 캡션에 귀속 사업연도 표기·헤더 배당률 `title`에도 basis 근거), Phase 53 연 환산은 반기 종목 두 회차를 실제의 2배로 오해시켜 폐기. **"지급 주기" 열**(Phase 55)은 예탁원 `divi_kind`(결산/중간, 주기 아님) 대신 메인 표와 같은 `entry.payoutCycle`(간격 중앙값 판정, `formatPayoutCycle`)을 표시 — 종목 단위 단일값이라 회차마다 같은 값 반복(`round.kind`는 스냅샷엔 남되 화면 미사용). **배당률 옆 괄호**(Phase 54·55 B안, `roundYearOrdinals(history, payoutCycle)`): `recordDate` 연도별로 묶어 관측 배당을 기준일 오름차순으로 세어 `순번/그해개수`(1/2·2/2), 그해 1회뿐이면 폐기(중간 회차 누락 시 분모 과소 가능은 사용자 판단·확정). 단 **`payoutCycle==="연"`이면 회차마다 "(연)"** 표기(그해 관측 회차 수가 아닌 간격 중앙값 기준이라, 데이터 누락으로 1회만 잡힌 분기·반기가 "(연)"으로 오표기되지 않음). 상세 행은 **빈 순위 셀(`.stickyRank`) 1 + colSpan(COLUMN_COUNT-1)**로 순위 열을 비운 채 열 그리드를 유지하고 종목명 열부터 시작(Phase 54, `.detailCell` 좌측 패딩=종목명 패딩만). 표시 포매터는 `ranking/format.ts`(클라이언트 안전, `summary.ts`에서 분리)에서 서버·클라이언트 공용. 비고 = 우/현+주N%/폭배(DART 딥링크)·배당률 `*`=액면분할 보정(Phase 44). **폼은 핫종목 표 스타일과 통일**(Phase 45): 헤더 가운데·micro 톤, 값 숫자 열 우측(`.numCell`)·종목명 좌측, 종목명 뒤 ᴷ/ᴰ 시장 위첨자(`entry.market` 직접 사용)·링크 없음. ③ **내 배당** = **보유종목 확정 배당** 목록(`getDividendSchedule`, **보유종목만**) 한 줄씩(종목명(**링크 없음**, Phase 47 오터치 방지)·배당종류·기준일·지급일(미정 표기)·주당배당금×보유수량·예상 지급액). **내 배당 탭에는 목록 아래 「배당 알림」 카드**(Phase 73) — `CategoryAlertToggles`에 `dividend` 한 항목만 넘긴 재사용, `/alerts`의 「알림 종류」 배당과 **같은 키**라 어느 쪽에서 바꿔도 같이 반영된다. `getAlertPrefs` 실패는 격리(토글만 숨기고 목록은 그대로). **Phase 83: 예탁원이 아직 반영하지 않아 DART 배당결정 공시로 메운 회차는 「공시」 배지**(`row.source==="dart"`, `title`로 사유). 각주: 순위 탭 2건(시가배당률=**직전 사업연도 확정 배당 합**÷현재가·결산배당 기준일로 사업연도 구분·중간분기 합산·폴백 최근 1년 Phase 59, `+` 연수, 비고 우·현+주·폭배·`*` 분할 보정), 내 배당 탭 2건(예상액=현재 보유수량/세전 15.4% + 회차 출처·우선주 미적용 안내 Phase 83). 홈 "배당" 카드에서 이동 |
| `analysis/page.tsx` | 종목분석 랜딩 (Phase 64) — `ensureAllowedSession` + `AnalysisSearch`(클라이언트, `StockSearchInput` 재사용→선택 후 `/analysis/{code}` 이동). 홈 「종목분석」카드에서 진입. 검색은 stockMaster 리더라 외부호출 0 |
| `analysis/[symbolCode]/page.tsx` | 종목분석 상세 — **통합지표** (Phase 72로 재작성) — **사용자 열람 시에만 조회**(`getAnalysisOverview`+`getAnalysisQuote` 병렬 read-through). 순서 고정: 투자지표(15칸) → 주가 변동률 → 차트 4종 → 주요 재무지표 표 → 「재무제표 상세보기」 링크. 시계열 조립은 `view.ts` 순수 함수 3종에 위임하고 페이지는 렌더만. 상태 4종별 안내 문구, 헤더 종목명=stockMaster 리더 폴백(코드, **Phase 78에서 `cache()` — `generateMetadata`와 본문이 161KB 키를 두 번 읽었다**). **세션 가드 뒤 `/^\d{6}$/` 미통과 시 `/analysis` redirect**(Phase 76 — `quote`는 corpCode 게이트를 안 지나 임의 코드로도 금융위를 부른다). **Phase 78부터 둘을 함께 기다리지 않는다** — DART 1초 대 금융위 5~15초라 시세 의존 블록(투자지표·주가 변동률·배당금&시가배당률·재무지표 표)만 `<Suspense>` 3개로 감싸고 `quotePromise`를 `await` 없이 넘긴다(호출 1회·reject 없음). 재무 차트 3종은 먼저 나가고, 빈자리는 `QuotePendingBlocks`가 지킨다. **화면 순서는 불변**이라 경계가 3개로 갈렸다 |
| `analysis/[symbolCode]/statements/page.tsx` | 종목분석 — 재무제표 전문 (Phase 64 화면을 Phase 72에서 이설) — `getFinancialAnalysis` read-through(6개년). 재무제표(재무상태표·손익·현금흐름 등)+재무지표 표(`FinancialSection` 공용). 계정이 회사당 수백 행이라 통합지표에서 분리, 뒤로가기는 `/analysis/{code}`. 재무지표는 DART가 2023년부터만 제공해 그 이전 연도는 빈다(화면 각주로 고지). 통합지표와 같은 `/^\d{6}$/` 게이트(Phase 76) |
| `analysis/AnalysisSearch.tsx` | Client — 종목분석 검색 폼. `StockSearchInput`(hidden `symbolCode`) + 「분석」 버튼, submit 시 `router.push(/analysis/{code})` |
| `dlq/page.tsx` | QStash DLQ 읽기 전용 목록 (Phase 18) — `ensureAllowedSession` + `listDlqMessages(cursor)` 직접 호출(Redis 아닌 QStash API — §4.3 예외), `?cursor=` 페이지네이션. 햄버거 사이드바 "DLQ 확인"에서 진입, 재발송·삭제 없음 |
| `alerts/page.tsx` | 알림 설정 (Phase 10·73) — `ensureAllowedSession` + `VAPID_PUBLIC_KEY`를 `PushSubscriptionManager`에 prop 전달 + **알림 종류별 on/off**(`CategoryAlertToggles`, Phase 73 — `ALERT_CATEGORY_META` 4종을 `getAlertPrefs` 값과 합쳐 내려줌) + 보유·관심종목별 알림 on/off(`StockAlertToggles`, 3단계에서 관심종목까지 확장) + 등록 기기 수 표시. 종목별 토글 아래에 **종목을 끄면 그 종목의 4종이 모두 멈춘다**는 안내 한 줄(`.cardNote`, Phase 79). 세 블록은 각각 try/catch로 격리돼 하나가 실패해도 나머지는 뜬다. 햄버거 사이드바 "알림 설정"에서 진입 |
| `alerts/actions.ts` | Server Actions: 푸시 구독 등록/해지(입력 형식 검증 — endpoint https·keys 필수)·테스트 발송·종목별 알림 on/off(`setStockAlertEnabledAction` — 보유·관심종목만 허용, `alerts:{email}:muted` 갱신)·**알림 종류별 on/off**(`setAlertCategoryEnabledAction`, Phase 73 — `isAlertCategory` 화이트리스트 검증 후 `alerts:{email}:prefs` 갱신, `revalidatePath`는 `/alerts`+`/dividends` 둘 다 — 같은 키를 배당 페이지 토글과 공유) |
| `manifest.ts` | PWA 매니페스트(`/manifest.webmanifest`, Phase 10) — standalone·아이콘 192/512 + maskable 전용 `icon-512-maskable.png`(중앙 안전영역 여백). iOS 푸시의 전제 조건 |
| `apple-icon.png` | iOS 홈 화면 아이콘 180×180 (파일 컨벤션 — link 태그 자동 생성). iOS는 투명 미지원이라 흰 배경 플랫·여백 없이 꽉 채움 |
| `favicon.ico` | 브라우저 탭 아이콘 — 16·32·48 멀티사이즈 |
| `api/auth/[...nextauth]/route.ts` | Auth.js 핸들러 re-export (3줄) |
| `api/jobs/refresh-market-data/route.ts` | 시세 갱신 잡 엔드포인트 (POST, §4.1) |
| `api/jobs/refresh-hot-stocks/route.ts` | 핫종목 갱신 잡 엔드포인트 (POST, §4.2) |
| `api/jobs/refresh-dividend-ranking/route.ts` | 배당률 순위 갱신 잡 엔드포인트 (POST, §4.3, Phase 43) |
| `api/jobs/refresh-feeds/route.ts` | 피드(공시) 갱신 잡 엔드포인트 (POST, §4.5) — KIS가 아니라 **시간창 가드 없음** |
| `api/jobs/refresh-trade-detail/route.ts` | 수출입 상세 갱신 잡 엔드포인트 (POST, §4.6, Phase 17-5) — 월 1회·시간창 가드 없음 |
| `api/jobs/cleanup-orphan-stocks/route.ts` | 고아 종목 키 정리 잡 엔드포인트 (POST, §4.7, Phase 49) — 매일 03:00 KST·KIS 미호출·시간창 가드 없음 |
| `api/market/last-refresh/route.ts` | 마지막 갱신 시각 조회 (GET, Phase 77) — `ui/AutoRefresh` 전용. `market:lastRefreshAt`의 성공 시각 하나만 반환(**Redis GET 1회·KIS 호출 0**). 잡 라우트와 달리 **세션 인증**(호출 주체가 브라우저) — proxy matcher에 더해 라우트에서도 `isEmailAllowed` 확인(이중 방어). `Cache-Control: no-store` 필수 — 캐시되면 갱신 감지 자체가 무의미해진다 |
| `actions.ts` | 루트 Server Action (Phase 77) — `invalidateMarketRouterCache()`: `revalidatePath("/", "layout")`로 **클라이언트 라우터 캐시 전량 무효화**. `router.refresh()`만으로는 현재 라우트만 지워, 갱신 직후 다른 화면으로 이동하면 `staleTimes`(600초) 안의 묵은 세그먼트가 그대로 보인다. 화면이 전부 동적 렌더라 무효화할 서버 캐시는 없고 노리는 효과는 클라이언트 캐시 하나뿐 |

라우트별 `page.module.css` 동반. 오류 UI는 별도 error.tsx 없이 각 page의 try/catch 인라인 처리.

**`loading.tsx` 9개 (§40)** — 라우트가 전부 동적(`auth()`가 쿠키 접근)이라 `loading.tsx`가
없으면 Next가 동적 라우트를 **prefetch 대상에서 제외**한다. 이를 되살리려고 전 화면에 배치하되,
중첩 상속을 이용해 파일 수를 줄였다. 전부 `components/ui/PageSkeleton`에 위임하는 한 줄짜리다.

| 파일 | 커버 범위 | 변형 |
|---|---|---|
| `app/loading.tsx` | 홈 + 자기 `loading.tsx` 없는 하위 라우트 폴백 | dashboard, 카드 7 |
| `app/login/loading.tsx` | 로그인 (홈 그리드 상속 차단용) | detail, 1 |
| `app/indices/loading.tsx` | kospi·kosdaq·usdkrw·market·kospi-volatility·trade/[yyyymm] **6종** | detail+chart, 6 |
| `app/stocks/loading.tsx` | 내 종목 목록(4탭) + `[symbolCode]` 상세 | detail+chart, 5 |
| `app/analysis/loading.tsx` | 랜딩(검색) + `[symbolCode]` 통합지표 + `[symbolCode]/statements` **3종** | detail, 6 |
| `app/hot-stocks` · `feeds` · `dividends` · `alerts` · `dlq` `/loading.tsx` | 각 1화면 | detail, 5~10 |

새 라우트를 추가할 때 위 디렉터리 아래면 `loading.tsx`가 자동 상속되고, 새 최상위 섹션이면
직접 추가해야 prefetch가 동작한다.

### 2.2 `src/lib` — 도메인 로직

| 파일 | 역할 |
|---|---|
| `api/kis/constants.ts` | KIS 베이스 URL·엔드포인트·TR_ID·조회 코드·상수 전부. 지표 코드 변경 시 이 파일만 수정 |
| `api/kis/auth.ts` | KIS 토큰 발급·캐싱 — Redis 공유 캐시 + `SET NX PX` 분산 락 + 인스턴스 내 in-flight 합류 (§7.4) |
| `api/kis/client.ts` | `fetchKisJson` 공통 래퍼(헤더·rt_cd 검증·15초 타임아웃) + 조회 함수 11종 (지수·해외·환율 통화쌍(`fetchKisFxPairDaily`, §28)·현재가·시총랭킹(`fetchKisMarketCapRanking(market?)` — 시장 인자 없으면 전체시장, 1콜 상위 30이 상한이고 **연속조회 없음**, §68)·등락률랭킹·배당·손익·재무비율·종목명·기간별시세 일/월) |
| `api/kis/types.ts` | KIS 원본 응답 타입 (필드 전부 optional string, `[key: string]: unknown` 허용) |
| `api/upbit/client.ts` | 업비트 공개 시세 API 클라이언트 (§30) — `fetchUpbitTicker`/`fetchUpbitDayCandles` + `UPBIT_BTC_MARKETS`(KRW-BTC·USDT-BTC). 인증·키 불필요, 15초 타임아웃. 호출 주체는 시세 갱신 잡뿐 |
| `api/dart/client.ts` | DART OpenAPI 클라이언트 — `corpCode.xml` zip 파싱(fflate, 상장사만 매핑)·공시검색 `list.json`(status 013=빈 결과 정상 처리, **`pblntfTy`로 공시유형 한정 가능** — `DART_PBLNTF_EXCHANGE`="I"/`DART_PBLNTF_PERIODIC`="A", Phase 81)·`fetchDartDocumentText`(원문 zip→평문)·**`isDividendDecisionReport`/`parseDartDividendDetail`/`fetchDartDividendDetail`/`fetchDartDividendDecision`**(현금ㆍ현물배당결정 → 배당구분·주당배당금(보통주)·시가배당률·기준일·**지급예정일**; 배당구분·지급예정일과 접수번호 지정 조회는 Phase 83. ⚠️ **시가배당률 정규식은 `시가배당[율률]`** — Phase 44의 `시가배당율?`은 실서식 「시가배당**률**(%)」과 어긋나 2026-07-15~30 표본 **8/8 실패**했고 주당배당금·기준일만 정상이라 폭배 툴팁의 공식 시가배당률이 조용히 비어 있었다)·**`parseDartEarningsDetail`/`fetchDartEarningsDetail`**(잠정실적 원문 → 매출액·영업이익·당기순이익 × **7칸 전부**: 당기/전기/전기대비/전기전환/전년동기/전년동기대비/전환 + 단위·대상기간 — Phase 81, **전기 3칸은 Phase 82**)·**`parseDartIrDetail`/`fetchDartIrDetail`**(IR 개최 공시 원문 → 일시·장소·개최목적·개최방법·설명회내용·자료 게재일시·IR 웹페이지, Phase 82 — 완전 정형이라 라벨 사이를 그대로 집는다, 실측 48/48; 일시조차 못 잡으면 `null`로 제목·링크만 남긴다) |
| `api/dart/finance.ts` | DART 재무 클라이언트 (Phase 64 · **Phase 72 확장**, 종목분석) — `fetchDartFinancialStatements`(fnlttSinglAcntAll, CFS/OFS, **`reprtCode` 인자로 연간·분기 겸용**)·`fetchDartFinancialIndices`(fnlttSinglIndx)·**`fetchDartDividendMatters`**(alotMatter, 한 콜에 3개년)·**`fetchDartStockTotalQty`**(stockTotqySttus, 발행주식총수·자기주식). status 013=빈 배열, 인증키 공유. **화면(read-through)이 직접 호출**(§3 예외). ⚠️ **제공 시작 연도가 API마다 다름** — 재무제표 2015~, 재무지표·배당 중 `fnlttSinglIndx`만 2023~ (2026-07-28 실측) |
| `api/fsc/stockPrice.ts` | 금융위원회 주식시세정보(data.go.kr 15094808) 클라이언트 (Phase 63) — `fetchStockCloseAsOf(code, "YYYYMMDD")`→기준일 이하 최신 확정 종가. KRX EOD·**시간창 없음**(영업일+1 확정), `likeSrtnCd`+12일 창, 실패·미상장 null. 반환에 `changeRate`(응답 `fltRt`, 빈 문자열은 0% 오인 방지로 제외) 포함 — 관심종목 등락률 폴백용(Phase 65). 호출 주체=관심종목 등록 액션(§3 예외). 인증키 관세청과 공유. **Phase 72**: 봉투 검증 공통부 `fetchFscItems` 추출 + **`fetchStockDailySeries`**(기간 일별 시세, 오름차순, `hipr`/`lopr`/`lstgStCnt`/`mrktTotAmt` 포함, 1콜에 1년치 262행 실측) 추가 — 종목분석 시세 파생용. ⚠️ **제공 범위 2020~**(2019년 이전 0건)·**무수정주가**(구간 내 액면분할 시 불연속) |
| `api/naver/client.ts` | 네이버 뉴스 검색 클라이언트 (Phase 17-3) — 종목명 키워드·`sort=date`, `<b>`/엔티티 제거, **제목+요약에 종목명 포함 기사만** 필터(저관련·오탐 제거), pubDate ms 파싱. 상위 10건. **Phase 84에서 `summary`(발췌)를 함께 반환하고 `sort`·`match` 옵션이 붙었다** — 실적 보도는 검색어(`"종목명" "영업이익"`)와 필터 키워드(종목명)가 달라 `match`로 분리했고, 발표 직후엔 `date`가 시황·정치 기사로 채워져 `sim`을 쓴다. 뉴스 탭 저장분은 무변경(요약을 굳히지 않는다) |
| `api/customs/client.ts` | 관세청 수출입총괄(GW) 클라이언트 (Phase 17-4) — `getNewtradeList`(XML), `fetchTradeStats(strt,end)`. `총계`/비정형 year 제외·`year "YYYY.MM"→"YYYYMM"` 정규화·`parseNum` 경유·`resultCode≠00` throw. **조회 범위 최대 12개월(inclusive)** 제약 |
| `analysis/overview.ts` | 종목분석 **통합지표** read-through 리더 (Phase 72) — `getAnalysisOverview(code)`: Redis `analysis:overview:v2:{corpCode}` 히트 반환→미스 시 연간 6개년(CFS+OFS)·분기(`buildQuarterJobs`)·배당(alotMatter)·주식총수 조회(동시성 5, ≈43콜)→**연간/분기/연환산(TTM) 세 벌 시계열**로 환산해 **TTL 30일** 저장. 규칙 3가지: ① 재무제표별 금액 기준이 달라(**손익=3개월+누적 / 현금흐름=누적만 / BS=기말**) **전부 누적으로 모은 뒤 인접 분기 차분** ② 계정은 **표준 코드 → 계정명 → 예비 코드** 순으로 찾되 `sj_div`로 범위 제한 ③ **분기 연도 후보는 연간과 따로 만든다**(§80) — 사업보고서는 이듬해 제출이라 연간의 최신은 `올해-1`이지만 분기보고서는 당해 연도에 나오므로, `buildQuarterJobs`가 **확정 3년 × 4분기 + 진행 연도 중 제출기한(1Q 5/15·반기 8/14·3Q 11/14)이 지난 분기**를 붙인다(연간 배열을 재사용하다 2026Q1이 통째로 빠졌던 회귀). 진행 연도는 주식총수가 비어 와 **직전 사업연도 말 주식수로 폴백**(확정 연도는 폴백 없음). ROE 분모=**기말** 지배주주 자본(국내 증권사 표기와 일치, 실측 확인) |
| `analysis/quote.ts` | 종목분석 **시세 파생** read-through 리더 (Phase 72) — `getAnalysisQuote(code)`: 금융위 일별 시세로 52주 최고·최저(장중가), 변동률 4종(1M·3M·1Y·올해), **연말·분기말 종가**(PER·PBR·연환산 시가배당률 분자) 산출 → `analysis:quote:v1:{code}` **TTL 6시간**(재무와 갱신 주기가 달라 키 분리). 이미 받아둔 시계열로 해결되는 기간말은 재조회 안 함. KIS를 안 쓰는 이유=`market:stock:*`는 보유·관심 종목만 존재(임의 종목엔 스냅샷 없음). **Phase 78 — 캐시 2층**: 확정 기간말 종가를 `analysis:closes:v1:{code}`(TTL 1년)로 분리해 6시간마다 2020년치까지 다시 받던 것을 없앴다(실측 12.6초/14콜 → 285ms/0콜). 무수정주가라 값이 불변이지만 **`CLOSE_SETTLE_DAYS`=7일 지난 기간말만** 저장한다(금융위 확정이 영업일+1 13시라 갓 지난 기간말은 직전 거래일 종가가 잡힌다). 동시성도 `DART_CONCURRENCY`(5) 공유를 끊고 **`QUOTE_CONCURRENCY`=20** — 금융위는 콜당 130ms/5.2초로 갈리는 편차형이라(순차에서도 발생=스로틀 아님) 5로 나누면 3라운드가 각자 최악 콜에 묶인다 |
| `analysis/view.ts` | 종목분석 화면 조립 순수 함수 (Phase 72) — 재무+시세 결합. `withAnnualValuation`(연말 종가로 PER·PBR) / `withTtmValuation`(**각 분기말 종가** — 현재가를 과거 지점에 쓰면 시가배당률이 왜곡됨) / `withQuarterValuation`(**배수 미산출** — 분기 EPS는 3개월치라 4배 부풀려 읽힘) + 투자지표 15칸 `buildInvestmentIndicators`(52주·자사주·PER/PBR·배당 3종·5년 성장률·시총 등) |
| `analysis/financials.ts` | 종목분석 재무제표 전문 read-through 리더 (Phase 64, **Phase 72에서 6개년·키 v2**) — `getFinancialAnalysis(code)`: corpCode 매핑(`getCorpCodeMap`)→Redis `analysis:financials:v2:{corpCode}` 히트 반환→미스 시 최근 6개년 DART 조회(연결 우선·`fnlttSinglAcntAll` 연도별 당기금액을 계정×연도 행렬 병합·재무지표 연도×4분류 병합, 동시성 5)→**TTL 30일** 저장. 상태 4종(`ok/not_listed/no_data/error`). ⚠️ §3 예외 2건: DART 직접 호출 + Redis 쓰기(`analysis:*` 별도 네임스페이스=시세 키 무충돌). 평소 호출·갱신 잡 0 |
| `feeds/earnings.ts` | **실적 공시 분류기** (Phase 81) — `matchEarningsCategories`(보고서명 → 6유형 `잠정실적`·`실적전망`·`실적예고`·`실적변동`·`IR`·`정기보고서`, 정기보고서는 "기타시장안내" 제외)·`hasEarningsFigures`(원문 수치 파싱 대상=잠정실적만)·**`isAlertableEarnings`(푸시 대상=`잠정실적`·`정기보고서`·`실적변동` 3종, Phase 81-1)**·**`hasIrSchedule`/`needsEarningsDocument`(원문(zip)을 받을 유형=잠정실적+IR)·`EARNINGS_PARSER_VERSION`(원문 파서 버전 — 올리면 저장분이 다음 회차부터 재파싱된다, **현재 3**, Phase 84)**·**`isEarningsNewsTarget`(실적 보도를 모을 유형 — 알림 3종과 같은 기준이되 축이 달라 함수를 나눴다)·`isBlankDartCell`/`formatBriefingWhen`(Phase 84 — DART 서식은 빈 칸을 `-`로 채워 보내므로 문자열 존재만으로 값 유무를 판단할 수 없다. 화면·리더가 공유)**. 키워드는 2026-05 거래소공시 전수 2,488건 실스캔 확정. **분류(화면)와 알림 범위는 분리돼 있다** — 탭은 6유형 전부 보여주고 알림만 좁힌다(실측: IR이 전체 41%인데 수치표 0건 = 수치 없는 일정 안내). Redis·web-push 무의존 순수 모듈이라 갱신 잡·알림·화면이 공유 |
| `feeds/store.ts` | 피드 store — `market:disclosures:{code}`(공시)·`market:news:{code}`(뉴스)·**`market:earnings:{code}`(실적, Phase 81 — `EarningsItem`/`EarningsFigure`/`getEarningsSnapshots`(MGET, 잡의 파싱 결과 재사용용)/`setEarnings`/`earningsKey`; **Phase 82에서 `EarningsFigure`에 전기 3칸(옵셔널 — v1 저장분엔 없다)·`EarningsIr`·`EarningsItem.ir` 추가, `parsed: boolean` → `parsedV: number` / Phase 84에서 `EarningsBriefing`·`EarningsItem.briefing`·`.correctionReason`·`.irUrl`**)**·**`market:earningsNews:{code}`(실적 보도, Phase 84 — `EarningsNewsItem`/`StoredEarningsNews`/`earningsNewsKey`/`getEarningsNews`(단건 GET — 실적 탭은 한 번에 한 종목만 본다)/`setEarningsNews`)** 스냅샷 라이터·`disclosuresKey`/`newsKey` export·`dart:corpCodeMap`(종목코드→고유번호) 리더·라이터·`market:tradeStats`(수출입, 종목 무관 단일 키) `TradeStatMonth`/`StoredTradeStats`+`getTradeStats`/`setTradeStats`(Phase 17-4). (단일 종목 리더 `getDisclosures`는 Phase 17-2에서 제거 — 화면은 `homeFeed`의 MGET로 통합) |
| `feeds/tradeStats.ts` | 수출입 뷰 빌더 (Phase 17-4) — `buildTradeStatsView`(순수: 최신 확정월 + 전년동월 `find`로 YoY %)/`getTradeStatsView`(리더, 상세 인덱스 `detailMonths` 동봉). `/indices/market` 카드·`/feeds` 탭 공용 |
| `feeds/tradeDetail.ts` | 수출입 상세 뷰 빌더 (Phase 17-5) — `buildTradeDetailView`(순수: 상위 N + "기타"=전체−Σ상위N 복원)/`getTradeDetailView(yyyymm)`(리더). `/indices/trade/[yyyymm]` 전용 |
| `jobs/refreshTradeDetail.ts` | 수출입 상세 갱신 잡 (Phase 17-5) — 97개 류 전수 조회(동시성 4, 실측 51~61초/13.5MB)를 집계해 `market:tradeDetail:{yyyymm}`(~8KB) 저장. 월 1회성 가드 |
| `feeds/homeFeed.ts` | 홈 피드 리더 (Phase 17-2/17-2b/17-3/81) — ① `getDisclosureBoard`/`getNewsBoard`/**`getEarningsBoard`**(`/feeds`용): 보유+관심 `{code→name}` → `market:disclosures:{code}`/`market:news:{code}`/`market:earnings:{code}` MGET 병합·최신순(접수번호/pubDate)·상위 40건 컷(공통 `FeedBoardItem`, 실적은 유형·수치·대상기간·단위**+IR 일정**(§82)**+발표 안내·정정사유**(§84)를 얹은 `EarningsBoardItem`). ② `getTodayFeedCounts`(홈 요약 카드용): 공시·뉴스 MGET 2회로 오늘(`rceptDt`/`pubDateKst`===KST 오늘) 건수 카운트(수출입 제외 — 월간 데이터). `collectOwnedStocks` 공유. 읽기 전용(누적 없음 — 종목별 원본이 SET 덮어쓰기라 컷·카운트는 조회 시점 계산만) |
| `feeds/earningsFocus.ts` | **실적 탭 종목별 블록** (Phase 82) — ① `getEarningsStockOptions`(보유→관심 순 칩 목록, **우선주는 DART 고유번호가 없어 `supported:false`**) ② `getEarningsFocus`: **확정(`analysis/overview.ts` 분기 시계열, TTL 30일 read-through 재사용) + 잠정(`market:earnings:{code}` 스냅샷)을 한 시계열로 결합**. 잠정은 원문 단위 라벨(원~조원)로 **억원 정규화**하고 **달력 분기 3개월인 건만** 분기 포인트로 받는다(누계를 분기값으로 오인하면 시계열이 뻥튀기된다). **확정에 이미 있는 분기는 확정 우선**, 같은 분기 잠정이 여럿이면 접수번호가 큰 정정본 채택. 최근 9분기 컷 + 최신 분기 요약 3칸(전분기·전년동기 대비 — **결합 시계열에서 직접 계산**, 짝이 없으면 잠정 원문 증감 칸으로 폴백) + IR 일정. 확정을 못 구해도 IR 일정은 살려서 반환. **Phase 84에서 `briefings`(잠정실적 「2. 정보제공내역」 → 실적발표 안내, **행사명이 채워진 건만** — 서식은 24/24 파싱되지만 값이 있는 건 5/24라 전부 렌더하면 빈 줄만 늘어난다)·`news`(`market:earningsNews` 읽기, 기준 공시가 45일보다 오래되면 빈 배열)가 붙었고 확정 실패 경로에도 함께 싣는다** |
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
| `indices/getDashboard.ts` | 홈 데이터 리더 — `market:detail:*` 8종 MGET. 필수 4종 없으면 throw(`MARKET_DATA_EMPTY_MESSAGE`), oil·gold·btcUsd(§33)·dxy(§85 원/달러 카드 보조줄)는 null 허용. **dxy는 `asOf` 후보에서 제외** — 잡 ok 게이팅 밖 파생 지표라 계산이 계속 실패하면 낡은 `fetchedAt`이 화면 「마지막 갱신」을 끌어내린다. §86에서 **수급 4키**(`market:investor:*` 2 + `market:investorIntraday:*:baseline` 2)를 MGET과 **병렬**로 읽어 `kospiFlow`·`kosdaqFlow`(`buildHomeIndexFlow`) 조립 — 각 지수의 **자기 `fetchedAt`**을 기준으로 삼는다(화면 전체 asOf를 쓰면 다른 지표 지연 시 엉뚱한 슬롯과 비교) |
| `indices/getIndexDetail.ts` / `getOverseasDetail.ts` | 상세 리더 — `market:detail:{key}` 1건. **두 파일 내용이 사실상 동일** (§8) |
| `indices/globalTable.ts` | 글로벌 지표 조립 (§88 · §89에서 6섹션 32종 → 5구획 27종 · §90에서 다우존스 복귀로 **28종**, 구획 id `oil`·`preciousMetals`·`baseMetals` → `highlights`·`metals`로 변경 — 이어받기가 `id + label` 기준이라 재편 후 첫 회차에는 이어받을 값이 없다) — `isGlobalTableRound`(하루 3회차 게이트: `GLOBAL_TABLE_ROUND_MINUTES` 09:00·15:40·18:15 + 9분 창. 세 값은 `market/staleness.ts`의 `SCHEDULE_MINUTES`에 실제로 있는 슬롯이어야 한다)·`buildGlobalTableSections`(카탈로그 `KIS_GLOBAL_TABLE_SECTIONS` 순서대로 순차 조회 — 출처 4종 `overseas`/`dxyPair`(재사용)/`detail`(재사용)/`domestic`. **항목 단위 실패 격리** 후 직전 스냅샷 행을 이어받고 `staleAt` 표시, 이어받을 값도 없으면 그 행만 빠진다. `rt_cd=0`인데 종가가 0인 계열은 실패로 다뤄 "0.00"이 표에 남지 않게 한다) |
| `indices/marketFlow.ts` | 거래대금·수급 계산 (§86, 순수 함수) — `pickBaselineSlot`(§70에서 이동, 현재 시각 이하 마지막 슬롯. **상세·홈이 같은 기준을 쓰게 공용화**)·`computeFlowStreak`(같은 부호 연속 거래일. 당일 행부터 세므로 **장중엔 확정값 아님**, 20거래일 창 소진 시 `capped`, 당일 0이면 null)·`buildHomeIndexFlow`(홈 카드용 요약 조립 — 거래대금·3열 각각 전일 슬롯 우선·전일 종일 폴백, 둘 다 없으면 null) |
| `indices/volatility.ts` | 변동성 기록 store+계산+카드 요약 (한 파일에 쓰기·읽기 혼재). 카드 요약은 최신 2개 기록의 전일 대비 + 월 집계 2종, 당일 진행분 판정(KST 15:30)까지 (§71) |
| `indices/dates.ts` | `getLast7BusinessDates` — **현재 미사용 (레거시)** (§9.2) |
| `market/store.ts` | 공용 시세 Redis 스토어 — `market:detail:*`, `market:stock:*`, `market:stockInfo:*`(배당 회차 `rounds` 포함, §25), `market:lastRefreshAt`(`LastRefreshRecord`: `at`=마지막 성공·`attemptedAt`=마지막 실행 시작(§52)·`trigger`·`ok`), `market:dailyFluctuation`, `market:weeklyFluctuation`, `market:stockMaster`, `market:investor:*`(§42), `market:investorIntraday:*`(+`:baseline` §70, +`:archive:{날짜}`·`:manual:{날짜}` §92 — 후자 2종은 **TTL 없는 영구 축적**이며 미러 스크립트가 `INTRADAY_ARCHIVE_SCAN_MATCH`로 훑는다), `market:fiRanking:*`(§50), `market:marketCapRanking:*`(+`:baseline`, §68), `market:globalTable`(§88·§89·§90 — 구획 5×28종의 값·등락률·기준일만, 항목별 detail 키를 만들지 않아 화면이 GET 1회로 완결) (§5). `getStockInfoBlocksMap`(MGET 일괄, 없는 종목은 맵에서 제외) 제공 |
| `stocks/search.ts` | `"use server"` — `searchStocks(query)` 종목명 검색 액션. `auth`+`isEmailAllowed` 가드 후 `market:stockMaster` 부분일치 필터, 접두 우선·가나다 정렬 상위 20. 등록 폼 전용, KIS 직접 호출 없음 |
| `stocks/myStocksCard.ts` | 홈 「내 종목」 카드 요약 `getMyStocksCardSummary` (Phase 67) — 보유·관심을 한 카드에 담는다. `getHoldings`+`getWatchlist` 병렬 → **합집합 `getStockSnapshots` MGET 1회** → 그 맵을 `getPortfolioValuation`에 주입(재조회 없음). 양쪽 다 수익률 내림차순 상위 4개(`sortRowsByReturnRate`와 같은 규칙), 보유 전체 수익률·전일 대비 동봉. 관심 행은 Phase 65 종가 폴백 규칙 적용. 실패 시 null |
| `market/staleness.ts` | KST 시간창 가드(`isWithinKisCallWindow` 09:00~18:40) + **스케줄 인지형 배지 판정** `resolveStaleness` — 시세 잡 스케줄 상수(`SCHEDULE_MINUTES`: 09:00~15:30 10분 + 15:40 + 18:15)로 "이미 완료됐어야 할 최근 슬롯(`lastDueRefreshMs`, 유예 20분)"을 구해, fetchedAt이 그보다 오래됐을 때만 배지(정상 휴지 구간엔 안 뜸). 지연 경과로 warn/critical. `SCHEDULE_MINUTES`는 외부 QStash 등록과 동기화 필수. **`resolveRefreshIncident`**(§52) — `market:lastRefreshAt` 레코드(`at`=마지막 성공, `attemptedAt`=마지막 실행 시작)로 홈 전반 갱신 지연 인시던트 판정: 예정 슬롯을 놓쳤고 `attemptedAt`도 그 이전이면 `stalled`(잡 미실행=QStash 미발화 추정), `attemptedAt`은 그 이후면 `failing`(실행됐으나 실패). `since`(멈춘 시각)·`missedSlots`(`countMissedSlots`)·`nextSlotMs`(`nextScheduledRefreshMs`) 동반 |
| `holdings/store.ts` | 보유종목·포트폴리오 히스토리 store — 암호화, 레거시 평문/`avgPrice` 읽기 하위호환 |
| `holdings/valuation.ts` | 포트폴리오 평가(스냅샷 MGET) — 시세 없는 종목 null 격리·합계 제외. 일일 등락률(`totalDailyChangeRate`)은 종목별 `changeRate`로 전일 평가액을 역산·가중(히스토리 불필요·항상 가용) |
| `holdings/stockHistory.ts` | 종목별 2년 종가 히스토리 `stock:{code}:history` — 백필(최대 8콜 페이징)/일별 갱신/upsert |
| `holdings/stockInfo.ts` | 정보 블록 4종 — 쓰기(잡 전용 `fetchStockInfoBlocks`: 배당·손익·재무비율 병렬)와 읽기(`getStockInfo`: Redis 조합만) 경로가 한 파일에 명시 구분. **배당 블록 시가배당률 분자는 직전 사업연도 확정 배당 합**(Phase 60, `buildDividendBlock`→공용 `dividends/basis.ts` `computeDividendBasis`, 순위 잡과 동일 로직) — 12개월 롤링(TTM)이 작년 말 결산+올해 초 분기를 섞거나 이동한 중간배당을 이중계상하던 문제 해소. per-종목 배당 조회를 `DIVIDEND_BASIS_LOOKBACK_DAYS(800)`로 넓혀 결산 2회를 확보(콜 수 불변·날짜만 확장), 폴백(결산 없음·오래됨·리츠/ETF)은 최근 1년. 표시 회차 `rounds`는 `DIVIDEND_LOOKBACK_DAYS(365)`로 다시 잘라 "내 배당" 일정·지급일 알림 범위 불변. `basisYear?`(귀속 사업연도)를 블록에 저장(구 스냅샷 폴백). 배당 블록에 확정 회차별 행 `rounds`(기준일·종류·주당배당금·지급일, §25)도 저장. **날짜 파싱 `toIsoDate`는 구분자를 걷어낸 뒤 8자리 판정**(Phase 47) — 예탁원이 같은 응답에서 `record_date`="20260331"·`divi_pay_dt`="2026/05/29"로 포맷을 섞어 보내, 구 `/^\d{8}$/` 매칭은 슬래시 지급일을 전부 놓쳐 확정 지급일까지 "미정"으로 떨어뜨렸음(2026-07-20 실측·수정). `lastPayDate`도 같은 정규화로 산출. 투자지표 파서 `buildStockIndicators`(PER/PBR/EPS/BPS·52주)는 종목 목록 펼침(`stocks/rows.ts`)과 공용이라 export (Phase 56) |
| `hotstocks/store.ts` | 핫종목 store — `market:hotStocks` + `:progress` 커서, 구간 4종 정의·라벨 |
| `hotstocks/months.ts` | 월 문자열("YYYY-MM") 계산 — `baseMonthKst`(전월)/`addMonths`/월초·월말/표시 포맷 |
| `hotstocks/universe.ts` | KIS 종목 마스터 zip 다운로드·EUC-KR 고정폭 파싱 — 스팩 제외·코드 오름차순. 내부 `fetchUniverse(groups)`(그룹 파라미터화)를 공개 2종이 감싼다: **`fetchHotStockUniverse`(ST-only, 불변)** — 핫종목 잡 + 종목명 검색(`market:stockMaster`) 공용이라 ST 필터를 바꾸면 두 곳이 오염됨 · **`fetchDividendRankingUniverse`(ST+EF+RT+IF, Phase 46)** — 배당률 순위 잡 전용, 한 번의 다운로드로 일반종목+배당상품을 함께 받아 레코드 `group`으로 분류. `UniverseStock.group`(`ST/EF/RT/IF`)·`DIVIDEND_PRODUCT_GROUPS`(EF/RT/IF) 노출. ETN(`EN`)은 채무증권이라 제외(2026-07-20 실측: 롯데리츠=`RT`, 맥쿼리인프라=`IF`, ACE 리츠부동산인프라액티브(0153P0)=`EF`) |
| `hotstocks/summary.ts` | 월간 랭킹 갱신 지연 판정 `isHotStocksStale` (핫종목 페이지 월간 뷰용) |
| `hotstocks/dailyCard.ts` | 홈 핫종목 카드 요약 `getDailyHotCardSummary` — `market:dailyFluctuation` 당일 등락률 상위 4 (§33에서 4행 통일) |
| `jobs/refreshMarketData.ts` | **시세 갱신 잡 파이프라인 본체** (§4.1) — 지수·종목·포트폴리오 갱신에 더해 달러 인덱스(`refreshDxy`, 환율 6종 순차 조회→계산, §28)·비트코인(`refreshBtc`, 업비트 2마켓 순차, §30)·당일·주간 등락률 상위 30(`refreshDailyFluctuation`/`refreshWeeklyFluctuation`, 회차당 각 1콜)·시장 전체 일별 수급(`refreshInvestorFlows`, 시장별 1콜, §42)·장중 시각 슬롯(`refreshIntradayFlowSlots`, **KIS 콜 0** — 같은 회차 수급·지수 응답 재사용, 거래일이 바뀐 첫 회차에 직전 슬롯 묶음을 `:baseline`으로 승격, 당일 행이 없는 회차는 skip, §70. **§92에서 `trigger`를 받아** 정규(QStash)는 당일 키+`:archive:{날짜}`에 쓰고 수동은 `:manual:{날짜}`로 격리 — 리포트의 `intradayFlows.manual`이 그 표시. **§93에서 슬롯에 기관 세부 7종을 함께 담는다** — 같은 `row`에서 복사할 뿐이라 콜 수는 그대로 0)·종목별 수급 순위(`refreshFiRanking`, 시장당 4콜=외국인·기관×순매수·순매도, §50)·시총 순위(`refreshMarketCapRanking`, 시장당 1콜, 거래일이 바뀐 첫 회차에 직전 스냅샷을 `:baseline`으로 승격, §68)·종목 마스터(`refreshStockMaster`, 1일 1회) 저장. 전부 부수·실패 격리 |
| `jobs/refreshHotStocks.ts` | **핫종목 갱신 잡 파이프라인 본체** (§4.2) |
| `jobs/refreshFeeds.ts` | **피드(공시·뉴스·수출입) 갱신 잡 파이프라인 본체** (§4.5) — corpCode 매핑→종목별 공시(DART)+뉴스(네이버, 종목명 키워드) 조회·저장. 소스·종목별 실패 격리. + `refreshTradeStats`(17-4) — 종목 무관 월 1회성(스냅샷 최신월<직전 완결월일 때만), 12개월 한도 때문에 2회 호출(최근 12개월+전년동월)→13개월 연속 저장. 잡 `ok` 게이팅 제외(다음 회차 가드가 재시도). + `refreshEarnings`(Phase 81) — 종목별 **유형 한정 DART 조회 2회**(`pblntf_ty=I` 거래소공시 + `A` 정기공시)로 실적 공시만 모아 `market:earnings:{code}` 저장하고, 잠정실적은 원문(zip) 파싱까지. **직전 스냅샷에서 접수번호가 같고 `parsed`인 건은 결과를 물려받아** 원문을 다시 받지 않으며, 회차당 신규 원문 파싱은 20건 상한. + **`refreshEarningsNews`(Phase 84)** — 방금 모은 실적 공시 중 **최근 7일 안에 접수된 수치 공시**(잠정실적·정기보고서·실적변동)가 있는 종목만 네이버를 1콜 부른다. **발표가 없으면 콜 0**이고, 같은 공시로 이미 모은 스냅샷이면(`basisRceptNo` 대조) 건너뛰어 발표 종목당 **분기 1콜**이 된다. `ok` 게이팅 제외. 알림 훅 2종: `evaluateFeedAlerts`(공시·시장경보·**실적**) + `evaluateDividendAlerts`(배당 지급일 당일, §25) |
| `jobs/collectTargets.ts` | 잡 공용 수집 대상 조회 — `collectHoldings`/`collectWatchlists`/`unionSymbolCodes`/`errorMessage` (시세·피드 잡 공유, Phase 17-1에서 refreshMarketData 로컬 함수를 추출) |
| `jobs/cleanupOrphanStocks.ts` | **고아 종목 키 정리 잡 본체** (§4.7, Phase 49) — `collectTargets`로 살아있는 집합 계산 → 대량 삭제 방어 가드(읽기 실패·허용 이메일 0이면 skip) → `market:stock:*` SCAN → 고아 종목의 per-종목 키 **11종**(Phase 81에서 `market:earnings:{code}`·`alerts:earnings:last:{code}`, Phase 83에서 `market:dividendDecision:{code}`, Phase 84에서 `market:earningsNews:{code}` 추가) 일괄 `del`. 각 키 빌더는 소유 store에서 export해 재사용 |
| `jobs/verifyJobRequest.ts` | 잡 공용 인증 — QStash 서명 → CRON_SECRET Bearer 폴백(timingSafeEqual) |
| `qstash/dlq.ts` | QStash DLQ 읽기 전용 조회(Phase 18) — `QSTASH_TOKEN`(서버 전용)으로 `Client.dlq.listMessages` 호출, 화면용 뷰 모델(`DlqMessageView`) 매핑. `/dlq` 페이지 전용 |
| `alerts/categories.ts` | **알림 종류 정의** (Phase 73, **Phase 81에서 5종**) — `AlertCategory` 5종(`price`·`disclosure`·`marketWarn`·`dividend`·`earnings`)·`AlertCategoryPrefs`·기본값(전부 켬)·화면 메타 `ALERT_CATEGORY_META`(배열 순서=화면 순서)·`isAlertCategory` 화이트리스트. Redis·web-push를 물지 않는 순수 모듈이라 서버 컴포넌트·액션·클라이언트 토글이 함께 import한다 |
| `alerts/store.ts` | 알림 store (Phase 10 2·3단계, §25, Phase 73) — 개인: `alerts:{email}:peaks`(신고가, 암호화)·`:muted`(음소거 종목, 암호화)·`:prefs`(알림 종류 on/off, **평문** — 보유종목을 드러내지 않는 취향 값이라 쿨다운 키와 같은 기준)·`:cooldown:{code}`(EX 7200 평문). `getAlertPrefs`는 **기본값 위에 저장값을 덮어** 반환하므로 카테고리가 늘어도 기존 사용자가 새 알림을 놓치지 않고, `saveAlertPrefs`는 전부 켬이면 키를 지운다(muted 관례). 전역(공개 데이터 파생, 평문): `alerts:disclosure:last:{code}`(마지막 통지 접수번호)·**`alerts:earnings:last:{code}`(실적 공시 커서, Phase 81 — 유형을 좁힌 별도 조회라 접수번호 흐름이 달라 공시 커서와 공유하면 서로를 삼킨다)**·`alerts:marketwarn:last:{code}`(시장경보 상태 6필드)·`alerts:dividend:sent:{code}:{payDate}`(배당 지급일 알림 발송 마커, EX 2일) |
| `alerts/evaluate.ts` | 시세 알림 판정·발송 (Phase 10 2단계, 관심종목 확장) — `evaluatePriceAlerts`: 보유+관심종목 union(`collectAlertTargets` — 종목 단위 dedupe, 보유 우선·같은 종목 보유 내역 합산) 대상으로 지수 MGET→조건 3종(기준가 −10%(보유=매입가/관심=등록가, 미확정 skip)/신고가 −10%/**종목 등락률 − 소속 지수 등락률 ≤ −10%p**) OR 판정→발송·쿨다운. **조건 3은 Phase 73에서 "지수 −2% AND 종목 −12%"(AND 2임계)에서 두 값의 차이 1임계로 교체** — 구 규칙은 지수가 −1.9%면 종목이 −20%여도 안 울리는 사각지대가 있었고, 구 임계쌍의 간격이 정확히 10%p라 기존 발동 지점은 그대로 포함된다. 종류 게이팅(`prefs.price`)은 **발송에만** 걸고 신고가 갱신·저장은 계속한다(다시 켰을 때 낡은 기준으로 오탐 방지). 순수 판정부 `evaluateTarget`·시장 매핑 `marketIndexOf` 분리 |
| `alerts/feedAlerts.ts` | 공시·시장경보·**실적** 알림 판정·발송 (Phase 10 3단계, Phase 73, **실적은 Phase 81**) — `evaluateFeedAlerts`(feeds 잡 훅 전용): 공시 8유형 키워드 분류기 `matchDisclosureCategories`(회사채는 "파생결합" 제외)·경보 상태 추출 `extractMarketWarnState`·diff `diffMarketWarnStates` 분리. **매칭 라벨에 「배당」이 있으면 공시가 아니라 배당 이벤트로 분류**(Phase 73 — 같은 공시가 두 번 가지 않게 배타 분기)해 제목 `배당 공시 — {종목}`으로 발송(링크는 공시 원문이 있는 `/feeds` 유지). **음소거는 3종 모두에 적용**된다(Phase 79 — Phase 73의 배당 예외 폐기, 리포트 `dividendDisclosures.mutedSkipped` 신설). 각 종류 스위치(`prefs.disclosure`/`prefs.dividend`/`prefs.marketWarn`/`prefs.earnings`)도 함께 확인. **실적은 잡이 넘긴 `earningsBySymbol`을 `alerts:earnings:last:{code}` 커서와 대조해 새 건만 발송**(제목 `실적 공시 — {종목}`, 링크 `/feeds?tab=earnings`) — 실적 6유형은 기존 공시 8유형과 키워드가 하나도 겹치지 않아 배당 같은 배타 분기가 필요 없다. **단 발송은 `isAlertableEarnings` 3종만**(Phase 81-1 — IR·실적예고는 수치 없는 일정 안내라 화면에만 남긴다). **커서는 유형과 무관하게 전진**시켜 제외 유형을 매 회차 재평가하지 않으며, 몇 건이 유형으로 빠졌는지는 리포트 `earnings.typeSkipped`로 드러난다. 커서·상태는 발송 결과와 무관하게 전진(중복 방지 우선), 쿨다운 없음 |
| `alerts/dividendAlerts.ts` | 배당 지급일 당일 알림 (§25, Phase 73) — `evaluateDividendAlerts`(feeds 잡 훅 전용): 보유종목 union(**관심종목 제외**)의 `rounds`에서 지급일=KST 오늘·주당배당금>0 회차 추출(같은 날 여러 회차는 합산) → 종목×지급일 전역 마커로 중복 차단(발송 전 기록 — 중복 방지 우선) → 보유 사용자에게만 발송(이메일 단위 실패 격리). 「배당」 종류(`prefs.dividend`)와 **종목별 음소거를 둘 다 확인**한다(Phase 79 — Phase 73의 예외 폐기). 전역 마커는 회차 단위라 음소거와 무관하게 먼저 기록된다. KIS 추가 호출 0 |
| `dividends/summary.ts` | 배당 일정 리더 (§25) — **보유종목만**(`getHoldings` 기반, 관심종목 제외) `getDividendRoundsMap`(Phase 83)으로 회차 확보. `getDividendSchedule`(상세 목록 — 예상 지급액=주당배당금×보유수량 읽기 시 계산, 지급일 미정 먼저→미래→과거 내림차순, 행마다 `source`)·`getDividendCardSummary`(홈 카드 — 지급일 ≥ KST 오늘 오름차순 상위 4, 실패 시 null) |
| `dividends/rounds.ts` | **배당 회차 병합** (Phase 83) — 예탁원(KIS `market:stockInfo`의 `rounds`)을 본 소스로 두고 **예탁원에 아직 없는 기준일만** 배당결정 공시(`market:dividendDecision`)로 메운다. 예탁원이 이사회 결의를 며칠 늦게 반영해 확정 배당이 화면에서 통째로 빠지던 문제를 푼다(실측 2026-07-30 삼성전자 26.2Q: DART 374원 vs 예탁원 `per_sto_divi_amt=0`). 같은 기준일이면 **예탁원 우선**(정정도 그쪽이 반영), 공시끼리 겹치면 접수번호가 큰 정정본. 주당배당금·기준일이 없는 건(현물배당만·파싱 실패)은 버린다. 순수 함수 `mergeDividendRounds` + 리더 `getDividendRoundsMap`(두 MGET 병렬, 공시 읽기 실패는 격리). **한계**: 배당결정 공시는 보통주 법인 명의라 우선주(DART 고유번호 없음)엔 이 보완이 안 걸린다 |
| `dividends/basis.ts` | 시가배당률 분자(사업연도 귀속) 공용 순수 로직 (Phase 60, Redis·KIS 무의존) — `computeDividendBasis<T extends BasisRound>(rounds, fund, oneYearAgo, today)`: 결산(kind=="결산") 회차를 사업연도 종점으로 보고 (직전 결산, 이 결산] 창 합=basis, `basisYear`(귀속 연도)·`priorFyTotals`(폭배 대조) 반환. 폴백(결산 없음·최신 결산 400일 초과·fund)은 [oneYearAgo, today] TTM. 헬퍼 `dayDiff`·`ymdDaysBefore`·`fiscalYearLabel`·상수 2종(FISCAL_YEAR_RECENCY/WINDOW_DAYS) 함께 export. `refreshDividendRanking`(순위)·`holdings/stockInfo`(per-종목) 공용 — 규칙 분기 방지 |
| `push/store.ts` | 웹 푸시 구독 store (Phase 10) — `push:subs:{email}` `secureJson` 암호화(endpoint가 곧 발송 권한), endpoint 기준 dedup 등록/해지/`prunePushSubscriptions`(발송 경로 전용) |
| `push/send.ts` | 웹 푸시 발송 공용 유틸 (Phase 10) — `sendPushToEmail(email, payload)`: VAPID env 검증, 구독별 실패 격리, 410/404 자동 정리. 페이로드 계약 `{title, body, url?, tag?}`는 `public/sw.js`와 동기화 필수. 잡 훅(2·3단계)·테스트 발송 액션 공유 |
| `watchlist/store.ts` | 관심종목 store — 암호화 (신규 키라 평문 하위호환 없음) |
| `watchlist/summary.ts` | `computeWatchReturnRate`(순수 함수)만 남는다 — 목록(`stocks/rows.ts`)·종목 상세가 쓴다. 홈 카드 요약 `getWatchlistCardSummary`는 Phase 67에서 `stocks/myStocksCard.ts`로 대체·삭제 |
| `theme.ts` | `THEME_STORAGE_KEY`·`Theme` 타입만 |

### 2.3 `src/components`

| 컴포넌트 | 종류 | 역할 |
|---|---|---|
| `indices/IndexDashboard` | Server | 홈 카드 조립(§28 원/달러 분리 + §85 그 카드에 달러 인덱스 보조줄 `dollarIndexNote`(`DXY 101.45 (+0.02%)` — §85.1에서 한글 표기·기준일 병기 제거), §33 글로벌 지표 `MarketCard`, **Phase 64에서 「종목분석」 진입 `SummaryCard`(`/analysis`, placeholder형) 추가**) + 헤더(좌 `NavIconLink` 홈 아이콘 + `<h1>Dashboard</h1>` + 우 햄버거 `HeaderMenu` — Phase 26에서 제거했던 제목을 §36에서 영어 제목으로 복원, 설명 문구는 그대로 없음) |
| `indices/SummaryCard` | Server | **홈 요약 카드 공용 프리미티브** — value/change/**note**/**flow**/placeholder/staleness 배지(§35에서 `footnote` prop 폐지 — 홈 각주 전면 제거. §71의 `note`는 각주가 아니라 **기준이 다른 부가 지표 한 줄**로, 색상 없이 tertiary 대비 — 변동성 카드와 원/달러 카드(§85 DXY)가 사용. **`flow`는 §86에서 추가한 `ReactNode` 슬롯** — 문자열 한 줄인 `note`로 담을 수 없는 여러 줄·그리드용이고 코스피·코스닥 카드가 `IndexFlowNote`를 넘긴다. 위 여백은 앞 요소(`.change`)가 갖는다). 카드 전체가 Link |
| `indices/MarketCard` | Server | 「글로벌 지표」 전용 카드 (§33, 제목은 §37에서 `시장`→`글로벌 지표`) — 금리·유가·금·비트코인(USD) 4행 동등 목록, 행마다 지표명·값·등락률. 지표명은 §34에서 축약(`美 금리`·`WTI`·`GOLD`·`BTC`) — 4행 모두 값 열은 숫자만(전부 USD 기준이라 §37에서 BTC의 `($)`도 제거, 통화 안내는 상세 화면 각주에만). 각주는 §35에서 제거, 등락률만 `--text-caption-sm`(12px)로 1pt 축소. §30 추가 지표는 null이면 행 생략. 골격·배지는 SummaryCard composes, 리스트 폼은 MyStocksCard(구 WatchlistCard)와 동일 관례, 카드 전체 `/indices/market` 링크 |
| `indices/HotStocksCard` | Server | 핫종목 전용 카드 — 당일 등락률 TOP 4 리스트 (§33에서 4행 통일, SummaryCard 미사용) |
| `indices/MyStocksCard` | Server | 홈 **「내 종목」** 카드 (§24→§57 개명→**§67에서 보유+관심 통합**, 구 `WatchlistCard`를 대체) — **왼쪽 보유 4·오른쪽 관심 4** 2열, 제목 우측에 **보유 전체 수익률·전일 대비**. **라벨 텍스트(「보유」·「관심」·이름표) 없음**(사용자 확정) — 좌/우 위치와 글자 크기(수익률 `--text-caption` · 전일 대비 `--text-micro`)로만 구분하고, **열 구분선도 없다**(§57에서 표 세로선을 뺀 것과 같은 방향). 시각 라벨이 없는 대신 `<ol aria-label>`·`.srOnly`로 스크린리더 텍스트는 유지. 2열이 들어가려면 폭이 필요해 카드 자신이 `grid-column: 1 / -1`(전폭)을 갖는다 — 반폭이면 열당 94px로 종목명이 잘린다(§67 계산). 한쪽만 비면 그 열에 `종목을 등록해보세요`, 양쪽 다 비면 카드 전체 placeholder. 골격·staleness 배지는 SummaryCard composes, 행 폼은 구 WatchlistCard 승계 |
| `indices/DividendCard` | Server | 배당 일정 전용 카드 (§25) — 다가오는 지급일 상위 4행(§33, 종목명·지급일 MM/DD·주당배당금), **보유종목 기준**. 골격·배지·리스트 폼은 MyStocksCard(구 WatchlistCard)와 동일 관례, 카드 전체 `/dividends` 링크 |
| `indices/IndexDetailScreen` | Server(async) | **지표 상세 3종(코스피·코스닥·원달러) 공용 화면** — `getIndexDetail`/`getOverseasDetail` 분기, 헤더(홈 아이콘 + 지표명 `<h1>`(§36) + 마지막 갱신)+카드+**차트**+**거래대금·수급 요약(국내만, §69 — §87에서 차트 아래로 내려가고 접힘 기본)**+일별 리스트+푸터. `children` 슬롯(일별 시세와 푸터 사이 — usdkrw의 달러 인덱스 섹션용, §28). **푸터 `dataNotice`는 §91에서 `NoteDisclosure` 접힘 토글**(그 아래 「마지막 갱신」·「기준일」은 그대로 — 데이터의 나이라 접지 않는다) |
| `indices/GlobalTile` | Server | 글로벌 지표 타일 하나 (§89) — 라벨(+국기·단위) / **값 큼직** / 전일 대비율 작게, 세로 4줄 왼쪽 정렬. 값 글자 크기는 **`--tile-value-size` 상속**으로 받는다(CSS Modules는 파일마다 해시가 달라 부모가 자식 클래스를 못 고르지만 CSS 변수는 상속된다). 값은 **포맷된 문자열**로 받는다(소수 0·2·4자리 + 상단은 `formatIndex`도 씀). 이어받은 항목은 **값 뒤** `*`(기준일 열이 없어져 옮긴 자리). **국기는 `public/flags/{code}.svg`**(§90 — `flag-icons` MIT 4x3 SVG 8종을 복사, 패키지 의존성 아님) — `<img width=16 height=12 alt="">`에 `no-img-element` 국소 해제(SVG는 `next/image` 최적화 대상이 아니다), 코드가 경로에 들어가므로 `/^[a-z]{2}$/`로 한 번 더 막는다(스냅샷 경유), 흰 바탕 국기(일본)가 묻히지 않게 `--color-border` 0.5px 한 겹 |
| `indices/GlobalTileGrid` | Server | 타일 그리드 (§89) — 3열/4열 두 가지, 열 수에 맞는 `--tile-value-size`를 자식에 내려보낸다. **폭 실측**: 내부 폭은 3열 `v/3 − 34.67`·4열 `v/4 − 28`(@360px 88.0/62.0px), 값 폰트 상한은 3열 `v/14.634 − 7.108`(9자)·4열 `v/17.344 − 6.456`(8자) → @360px **17.5/14.3px**. 채택 `clamp(15px, 4.8vw, 24px)` / `clamp(12px, 3.85vw, 20px)` — 기울기는 가장 빠듯한 360px 기준, 최대값은 **컨테이너가 480px에서 멈춘 뒤에도 vw가 계속 커지는 것**을 막는 캡 |
| `indices/GlobalTileSection` | Server | 글로벌 지표 구획 (§88의 `GlobalTableSection` 4열 표를 §89에서 대체·삭제) — `<details open>`/`<summary>` 네이티브라 JS 0·서버 컴포넌트. **기본 펼침이지만 접기는 남겼다**(요청은 "펼친 상태"였지 "접기 제거"가 아니고 비용이 0). 값 자리 수는 행의 `decimals`(`formatFixed`). **기준일 열 제거** — 기준일이 알려주던 것(미국·유럽은 항상 전일 종가)과 단위 축약으로 잘라낸 거래소·기준 설명은 전부 **구획 각주**로 옮겼다 — 그 각주는 §91에서 `NoteDisclosure` 접힘 토글이 되어 `<details>`가 중첩된다(부모 `<summary>` 바깥이라 클릭 영역은 안 겹친다) |
| `indices/MarketFlowSummary` | Server | 국내 지수 상세 **차트 아래** 「거래대금 · 수급」 요약 (§69, §70, 배치·접힘은 §87 — `<details>`/`<summary>` 네이티브라 JS 0·서버 컴포넌트 유지, 접힌 채로도 거래대금 금액은 `summary`에 보인다) — 시장 전체 거래대금 1줄 + 개인·외국인·기관계 3열(값·증감). **KIS 추가 콜 0**(저장된 스냅샷만). 값이 "그 시각까지의 누적"이라 **전일 같은 시각 슬롯**(`intradayBaseline`, §70)과 비교하고 — `pickBaselineSlot`=현재 시각 이하의 마지막 슬롯, 없으면 가장 이른 슬롯 — 슬롯이 없는 첫 거래일만 전일 종일 대비로 폴백(라벨로 구분). 거래대금과 3열은 각각 기준을 정한다. 3열은 **순매수 금액**이며 투자자별 *거래대금*은 KIS 미제공(§69 실측) — 화면 주석으로 명시. 셀 폭 때문에 3열만 억원 반올림 표기(`formatEokwon`). 데이터가 둘 다 없으면 `null` 반환(자체 margin 보유). `pickBaselineSlot`은 §86에서 `lib/indices/marketFlow.ts`로 이동해 홈 카드와 공용 |
| `indices/IndexFlowNote` | Server | 홈 **코스피·코스닥 카드**의 거래대금·수급 보조 블록 (§86, 배치는 §86.2) — 투자자 3주체를 **행**으로 둔 **테두리 없는 4열 표**(주체 / 순매수 금액 / 전일 같은 시각 대비 증감 / 연속 거래일 `2D`·`20D+`) + 그 아래 거래대금 1줄. 상세 `MarketFlowSummary`와 **같은 스냅샷·같은 기준**(`buildHomeIndexFlow`)이며 **KIS 추가 콜 0**. 폭 병목은 **뷰포트 400~402px**(2열 전환 바로 위 — 카드 내부 332→155px. 아이폰 17이 정확히 402px)이고 390px 이하는 1열이라 넉넉하다. 주체를 **열**로 두던 §86·§86.1 배치는 이 폭에 3열을 억지로 끼우는 일이었다(라벨을 값과 같은 줄에 두면 상단 행만 160px > 154px). 주체를 행으로 돌리면 표가 열 폭을 내용에 맞춰 배분해(그리드 `1fr` 균등 분할과 달리 짧은 열이 남긴 폭을 긴 열이 쓴다) 최악 케이스에도 10px이 남고, 그래서 §86의 1자 축약을 **풀네임(개인·외국인·기관계)으로 되돌렸다**. 표를 쓰는 이유는 이 자동 배분과 정렬이며 데이터 표라 시맨틱도 맞다(`<th scope="row">`). 라벨·값 모두 `--text-micro`(11px, §86.1의 10.5px 축약은 §86.3에서 되돌림) — 라벨은 색(tertiary)으로만 구분. 연속은 「2일」·「20일+」이며 **「거래일」 풀표기는 안 들어간다**(연속 열이 16→35px, 실데이터에서도 3.7px 부족 — §86.3 실측). 셀 간격은 `padding-left: 3px`(첫 열 0), 빈 값은 `—`. 최악 케이스 여유 3.2px이라 표기를 더 늘리려면 배치를 바꿔야 한다. 색상은 순매수 금액에만 — 거래대금·증감·연속은 무채색(§85 관례) |
| `indices/DollarIndexSection` | Server(async) | 원/달러 상세 하단 달러 인덱스 섹션 (§28) — `getOverseasDetail("DXY")` → IndexCard+차트+근사치 각주(§91에서 `NoteDisclosure` 접힘). 첫 갱신 전엔 준비 중 문구 |
| `indices/IndexCard` / `IndexDailyList` / `DataAsOfFooter` | Server | 상세 스냅샷 카드 / 일별 시세 리스트(해외 지표) / 홈 푸터 |
| `indices/IndexDailyTable` | Server | 국내 지수 상세 "일별 시세" 탭 — 거래량·거래대금 열(§50). 억/만원·만주/억주 표기 |
| `indices/InvestorFlowTable` | Client | 국내 지수 상세 "일별 수급" 탭 — 투자자별 순매수 금액(§42). **§93에서 날짜 행 펼침이 붙으며 Client로 전환**(`FiRankingTable`과 같은 이유): 아카이브 축적 시작일(`INTRADAY_ARCHIVE_SINCE`) 이후 날짜 행만 펼침 버튼이 되고, 누르면 `fetchIntradayFlowSlots` Server Action이 그 날짜의 `:archive:{날짜}` 1건만 가져온다(받아둔 날짜는 재요청 없음, 여러 날짜 동시 펼침 가능). 펼친 표는 시각+주체(있으면 10종·없으면 3종)+거래대금이고 셀마다 **누적(위)·직전 회차 대비 증분(아래)** 두 줄 — 색은 누적에만. 시각 열은 상위 표 날짜 열처럼 sticky |
| `indices/DetailTabs` / `FiRankingTable` | Client | 상세 탭 래퍼(서버 컴포넌트를 panel로 전달, §50) / 종목별 수급 순위(외국인·기관·순매수·순매도 토글, §50) |
| `indices/MarketCapRankingTable` | Server | 국내 지수 상세 "시총 순위" 탭 (§68) — 실시간 시총 상위 30, 7열(순위·종목명·현재가·등락률·시가총액·전일 대비 시총 증감·순위 변동). 순위·종목명 sticky 가로 스크롤, 토글이 없어 서버 컴포넌트. 전일 30위권 밖 진입은 `NEW`, 기준 스냅샷 없는 첫 거래일은 "—" |
| `indices/IndexChartClient` → `IndexLineChart` | Client | Recharts 래핑 패턴: Client 셸이 `dynamic(…, { ssr: false })` + 스켈레톤 → 실제 차트. 국내 지수는 `ComposedChart`로 지수 선 + 거래량/거래대금 막대 토글(§50) |
| `indices/BtcChartClient` → `BtcLineChart` | Client | 동일 패턴, 비트코인 전용 (§30) — `currency` prop으로 축·툴팁 포맷 분기(원화 M/B 축약, 달러 소수 2자리). 호출부는 시장 카드뿐(비트코인 개별 상세·`BtcDetailSection`은 §31에서 제거) |
| `indices/VolatilityChartClient` → `VolatilityChart` | Client | 동일 패턴, BarChart |
| `holdings/HoldingsChartClient` → `HoldingsChart` | Client | 동일 패턴, LineChart + 수익률%↔원단위 토글. **잔고 탭·종목 상세(보유/관심) 공용** (관심종목에선 totalValue 자리에 종가를 넣어 재활용) |
| `holdings/DailyHistoryList` | Client | 일별 기록 목록 (§29) — 접힘 기본 `<details>`(네이티브, JS 무관) + 월 단위 페이지네이션(`useState` 월 인덱스, 기록 있는 달만 이전/다음, 양 끝 disabled). 서버가 히스토리 전체를 props로 주입. 잔고 탭·종목 상세(보유) 2곳 공용 — 상세만 `close` 종가 열 추가. rise/fall 판정은 로컬 사본(`resolveDirection`을 클라이언트 번들에 안 넣기 위함) |
| `holdings/HoldingsOverview` | Server | **잔고 탭 본문**(Phase 58) — 구 `/holdings` 목록 화면의 본문(요약 4지표·연초 이후 추이 차트·일별 기록·종목 추가 폼·보유종목 카드 목록)을 그대로 옮긴 async 서버 컴포넌트. `email`만 받아 `getHoldings`+`getPortfolioHistory`+`getPortfolioValuation`을 스스로 읽고(전부 Redis), 평가 실패는 내부 배너로 격리한다. 화면 껍데기(page·container·header·footer)는 품는 쪽(`app/stocks/page.tsx`)이 담당 |
| `stocks/StockInfoBlocks` | Server | 정보 블록 4종(시총·배당·실적·투자지표) — 보유·관심 상세 공용, `formatRatio` export |
| `stocks/StockSearchInput` | Client | 등록 폼 종목명 검색 입력 — 디바운스 250ms→`searchStocks` 액션, 결과 드롭다운(키보드 ↑↓/Enter/Esc), 선택 시 hidden `symbolCode` 채우고 배지 표시. 보유·관심 추가 폼 공용 |
| `feeds/FeedTabsClient` | **Client** | 뉴스/공시/**실적**/수출입 4탭 + 게시판 + 아코디언 (Phase 17-2/17-3/17-4/**81**). 데이터는 Server가 props로 주입, Client는 탭 선택·아코디언 open/close만. 4탭 모두 실동작(공시=제출인·접수일+DART 원문, 뉴스=출처·발행일+원문 새 탭 / 기본 선택 뉴스, **실적=(Phase 82) 서버 슬롯 `earningsFocus` + `EarningsBoard` 유형 배지+제목, 아코디언에 종목·유형·대상기간·제출인·접수일 + 잠정실적 수치 표(매출액/영업이익/당기순이익 × 당기·**전분기·전분기대비**·전년동기·전년동기대비 — 6열이라 `overflow-x` 래퍼, 전기 칸이 없는 v1 저장분은 4열로 축소 렌더; 흑자·적자 전환은 증감 칸에 라벨로 상승/하락색) + **IR 항목의 개최일시·방법·목적·IR 자료 링크** + **실적발표 행사명·일시·정정사유**(Phase 84 — 행사명이 `-`면 줄을 만들지 않는다))**, 수출입=`TradeBoard` 최신월 3지표+YoY 요약 + 최근 13개월 표, 아코디언 없음). **탭 전환은 `?tab=` 링크다**(Phase 81에서 진입 탭만 주입 → **Phase 82에서 `useState` 폐기**: 실적 상단 블록이 서버 전용(DART+`<Suspense>`)이라 탭이 클라이언트 상태면 뉴스만 보는 방문에도 미리 렌더해야 했다. Client에 남은 상태는 아코디언 `openId`뿐). **Phase 83에서 선택 종목 상태(`pickedCode`)가 하나 더 붙었다** — `?code=`가 정본이되(뒤로가기 시 렌더 중 상태 조정으로 URL을 따른다) 드롭다운을 바꾸면 **아래 실적 목록은 즉시** 걸리고 `router.push`로 상단 서버 블록만 갱신된다. 실적 목록 필터가 서버가 아닌 여기 있는 이유가 그것(사용자 확정 B안). **17-2b에서 홈 전체폭→`/feeds/page.tsx`로 렌더 위치만 이동**. ~~`stocks/StockDisclosures`~~는 A안 철회로 **삭제** |
| `feeds/EarningsFocusPanel` | Server | **실적 탭 상단 블록** (Phase 82) — 최신 분기 요약 3칸(매출액·영업이익·순이익 × 전분기·전년동기 대비) + 차트 + 최근 9분기 표 + IR 일정 카드 + **「실적 발표 안내」·「실적 관련 보도」**(Phase 84 — 보도는 제목(원문 링크)+발췌 4줄 클램프+발행일, **본문은 담지 않고 출처 각주를 단다**). 확정 재무 첫 조회가 느려 **본문만 `<Suspense key={code}>`** (Phase 78 패턴) — 선택 줄과 아래 게시판은 기다리지 않는다. **Phase 83에서 종목 선택 칩이 여기서 빠져 `EarningsStockPicker`로 갔다** (props도 `options` → `hasOptions` 축소) |
| `feeds/EarningsStockPicker` | **Client** | **실적 탭 종목 선택 줄** (Phase 83) — 보유·관심 세그먼트 2개 + 오른쪽 드롭다운, **한 줄**. Phase 82가 라디오를 물린 근거("세로로 늘어놓으면 선택 영역이 목록보다 길어진다")는 드롭다운엔 해당하지 않아(접혀 있다) 오히려 원래 요구에 더 맞는다. **그룹은 별도 상태가 아니다** — 선택 종목이 속한 쪽이 곧 활성 세그먼트라 URL과 어긋날 여지가 없고, 세그먼트를 누르면 그 그룹의 첫 종목으로 옮겨 간다. 접근성은 칩과 같은 `role="radiogroup"`/`role="radio"`, 우선주는 `<option disabled>`+"(자료 없음)" |
| `feeds/EarningsFocusChart` (+`Client`) | Client | 분기 실적 차트 (Phase 82) — 매출액·영업이익 막대 + 영업이익률 선(우측 축) `ComposedChart`. **잠정 분기는 `<Cell fillOpacity>`로 흐리게** (색을 바꾸면 범례가 늘어난다). 기간 탭 없음 — 이 화면의 존재 이유가 "최신 분기를 5주 먼저 본다"라 분기만 그린다. `Client` 래퍼가 `dynamic`+`ssr:false`(§4 관례) — 실적 탭을 안 열면 recharts 청크가 아예 안 내려간다 |
| `indices/FeedSummaryCard` | Server | 홈 "뉴스·공시" 그리드 요약 카드 (Phase 17-2b/17-3) — 공시·뉴스 당일 건수 2줄(수출입은 월간 데이터라 제외). 골격은 SummaryCard `composes`, 카드 전체가 `/feeds` 링크. `getTodayFeedCounts` 결과를 prop으로 받음 |
| `analysis/FinancialSection` | Server | 종목분석 재무 표 한 절 (Phase 64) — 계정명 sticky + 연도 열 가로 스크롤 표. 재무제표·재무지표 공용, 값 포맷(`format`) 주입(금액=조/억/원 축약, 지표=소수 2자리). `rows` 비면 렌더 안 함. **Phase 72부터 `/statements` 전용** |
| `analysis/InvestmentIndicators` | Server | 투자지표 카드 (Phase 72) — 3열 그리드 15칸(라벨·큰 숫자·기준 각주). 값은 `view.ts`가 문자열로 포맷해 넘겨 컴포넌트는 렌더만. 시세 기준일을 머리에 표기 |
| `analysis/AnalysisCharts` (+`Client`) | Client | 종목분석 차트 묶음 (Phase 72) — 주가 변동률 막대(상승 빨강/하락 파랑) + 지표 차트 4종(실적·배당금&시가배당률·현금흐름표·주당현금흐름 — 뒤 둘은 **꺾은선**). **차트마다 연환산/연간/분기 탭을 독립 보유**, 비율 계열은 우측 축 `ComposedChart`. `Client` 래퍼가 `dynamic`+`ssr:false`(§4 관례). **Phase 78에서 export가 둘로 갈림** — `AnalysisFinancialCharts`(실적·현금흐름표·주당현금흐름, 전 탭이 DART만) / `AnalysisQuoteCharts`(주가 변동률·배당금&시가배당률 — **연환산 탭의 시가배당률이 종가 의존**). 같은 모듈이라 recharts 청크는 하나 |
| `analysis/QuotePendingBlocks` · `QuoteElapsed` | Server · Client | 시세 대기 자리표시자 (Phase 78) — 시세 의존 3블록의 `<Suspense>` fallback. 실제 블록과 같은 치수(투자지표 15칸·차트 2장·표 6행), `PageSkeleton`과 같은 shimmer·`prefers-reduced-motion` 대응. `QuoteElapsed`만 클라이언트로 **실제 경과 초**를 표시(3초 전 숨김, 8초 초과 시 안내 문구 추가, 숫자는 `aria-hidden`). **진행률(%)은 쓰지 않는다** — 서버 렌더 중 진행을 클라이언트로 흘릴 표준 경로가 없어 예측값이 되는데 편차가 3배라 100%에 닿고도 안 끝난다 |
| `analysis/KeyMetricsTable` | Client | 주요 재무지표 표 (Phase 72) — 11행(매출·영업이익·ROE·배당 3종·EPS 2종·PER·BPS·PBR) × 기간 열. 지표명 sticky + 가로 스크롤이되 **최신이 왼쪽**(차트와 반대 방향 — 최근 실적을 먼저 읽는 쪽이 자연스러움). 행마다 단위가 달라 포맷을 행 정의에 둠 |
| `nav/NavIconLink` | Server | 헤더 이동 아이콘 버튼(home/back) — 36px 아이콘 버튼 통일 규격 |
| `nav/HeaderMenu` | Server | 햄버거 메뉴 조립 전용(Phase 18) — `MenuSidebar`에 `ThemeToggle`·`SignOutButton`을 슬롯으로 주입 (서버 액션 폼은 Client 안에서 정의 불가) |
| `nav/MenuSidebar` | Client | 햄버거 버튼 + 우측 슬라이드 사이드바(Phase 18) — 열림 상태·오버레이·ESC 닫기, 화면 모드(위)/알림 설정(Phase 10)·DLQ 확인 링크(중간)/로그아웃(아래) |
| `ui/ToggleSwitch` | Client | **알림 on/off 스위치 공용 컴포넌트** (Phase 74) — `checked`·`onToggle`·`label`·`disabled`. 아래 알림 토글 4종이 전부 이것을 쓴다. 트랙 안에 켬/끔 **문구를 넣지 않고** 색(`--color-primary`/`--color-switch-off`)과 손잡이 위치로만 상태를 표시하며, 접근성은 `role="switch"`+`aria-checked`(토글 버튼용 `aria-pressed` 아님). §8.15 참고 |
| `ui/NoteDisclosure` | Server | **각주 「설명」 접힘 토글 공용 컴포넌트** (Phase 91) — `label`(기본 "설명")·`className`·`children`. 네이티브 `<details>`라 클라이언트 번들 0(§87·§89 관례)이고 키보드·스크린리더는 브라우저가 준다. 지표 상세 화면의 **설명형 각주 10지점**이 전부 이것을 쓴다(글로벌 지표 주요 지표·구획 4개·갱신 주기 푸터 / 지수 상세 3종 공용 푸터 / 달러 인덱스 / 코스피 변동성 / 수출입 상세). 폰트·색·펼침 회전은 컴포넌트가 쥐고 **여백만 `className`으로 받는다**(카드 안 각주와 푸터 첫 줄의 간격이 달라서). `GlobalTileSection`처럼 이미 `<details open>`인 카드 안에 중첩되지만 부모 `<summary>` 바깥이라 클릭 영역이 겹치지 않는다. §6.4 참고 |
| `ui/AutoRefresh` | Client | **갱신 회차 반영 시 자동 새로고침** (Phase 77) — 루트 `layout.tsx`에 배치(전 화면 커버), 렌더 출력 없음. 마운트 시 기준값 확보 → 예정 회차(`nextScheduledRefreshMs` 재사용)까지는 **서버를 부르지 않음** → 회차가 지나면 30초 간격으로 `/api/market/last-refresh` 확인 → `at`이 달라지면 `invalidateMarketRouterCache()` + `router.refresh()` → 5분 안에 안 바뀌면 그 회차 포기. **예정 시각만 보고 곧바로 새로고침하지 않는 이유**는 잡 실행·Redis 반영 편차(§9.4의 20분 유예와 같은 사정). **경로는 의존성이 아니라 ref로 읽는다** — 화면을 옮길 때마다 타이머를 다시 걸면 회차 대기 상태가 초기화돼 그 회차를 통째로 놓친다. 백그라운드 탭은 확인을 건너뛰고 `visibilitychange` 복귀 시 한 번 더 확인, `/login` 제외 |
| `alerts/PushSubscriptionManager` | Client | 이 기기의 푸시 구독 on/off + 테스트 발송 (Phase 10) — 지원 감지(iOS 미설치 시 홈 화면 추가 안내), `sw.js` 등록→`pushManager.subscribe`→Server Action 저장. VAPID 공개키는 prop으로 수신. 스위치는 **낙관적으로 움직이지 않는다**(권한 허용·구독 등록이 끝난 뒤에만 켜짐 — 거부되면 꺼진 채 남고 사유는 메시지 줄) |
| `alerts/StockAlertToggles` | Client | 보유·관심종목별 알림 on/off (Phase 10 2·3단계) — 서버가 내려준 목록·초기 상태를 로컬 상태로 토글, `setStockAlertEnabledAction` 저장. 끄면 그 종목의 시세·공시·시장경보·**배당** 알림이 모두 음소거된다(Phase 79 — Phase 73의 배당 예외 폐기) |
| `alerts/CategoryAlertToggles` | Client | 알림 종류별 on/off (Phase 73) — `CategoryAlertItem[]`(key·label·description·enabled)을 받아 토글, `setAlertCategoryEnabledAction` 저장. `/alerts`는 **5종**(Phase 81에서 「실적」 추가) 전부, 배당 페이지 「내 배당」 탭은 `dividend` 1종만 넘겨 **같은 컴포넌트·같은 키를 재사용**한다 |
| `alerts/AlertToggleButton` | Client | 종목 상세 화면 인라인 알림 토글 — 단일 종목 on/off, `setStockAlertEnabledAction` 재사용. 보유·관심종목 상세의 "종목 정보" 섹션 헤더에 배치(기존 /alerts 링크 대체). 스위치엔 문구가 없으므로 앞에 「알림」 라벨을 붙인다(Phase 74) |
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
- `scripts/` — **앱 바깥 운영 스크립트**(Next 빌드 미포함, Phase 92 신설).
  `mirror-intraday-flows.mjs` = 장중 수급 슬롯 아카이브(`:archive:*`·`:manual:*`)를
  맥미니 SQLite로 복제 — SCAN+MGET → `node:sqlite`(**의존성 0**), PK
  `(market, trading_date, hhmm, source)`로 멱등, 기본은 미보유 날짜+최근 3일만.
  **Redis가 원천이고 여기는 복제본**이라 며칠 안 돌아도 유실 없음(그래서 삭제·롤오버 없음).
  읽기 전용 토큰(`UPSTASH_REDIS_REST_READONLY_TOKEN`) 우선. SCAN 패턴은 `market/store.ts`의
  `INTRADAY_ARCHIVE_SCAN_MATCH`와 **하드코딩으로 짝**이라 키 형태 변경 시 함께 고친다.
  §93에서 기관 세부 7컬럼이 늘었고, Phase 92에 만들어진 DB는 실행 때마다
  `PRAGMA table_info` → 빠진 컬럼만 `ALTER TABLE ADD COLUMN`으로 따라잡는다(수동 조치 불필요).
  `com.jusik.mirror-intraday.plist`(launchd 샘플, 매일 19:00) · `README.md`(설치·스키마·
  분석 시 주의 — `source='qstash'` 필터, 비정각 hhmm 버킷 귀속, `0900` 슬롯은 항상 0).
- `src/app/globals.css` — `.numeric` (`tabular-nums`) 등 전역. 숫자 UI는 항상 `.numeric` 병기.
- `next.config.ts` — `staticPageGenerationTimeout: 300` + `/sw.js` no-cache 헤더(Phase 10)
  + `experimental.staleTimes.dynamic: 600`(Phase 77 — 갱신 간격과 동일. Phase 48의 30초는
  갱신 주기의 1/20만 덮어 캐시 이득 대부분을 버렸다. **"다음 갱신까지 남은 시간만큼"은 표현 불가** —
  `staleTimes`는 빌드타임 고정값이고 시각별로 계산해 넣을 훅이 없다. 그 의도는
  `ui/AutoRefresh`가 능동 무효화로 대신한다). `static`은 기본값(5분) 유지.

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
      ② isWithinKisCallWindow 가드 (밖이면 no-op 200; manual+?force=true만 우회 —
         이 force는 아래 1a''의 하루 3회차 게이트도 함께 우회한다(최초 시딩용, §88).
         QStash 경로는 스케줄이 곧 시간 규칙이라 force를 무시)
  → refreshMarketData(trigger)  [lib/jobs/refreshMarketData.ts]
      1. refreshIndices: KIS 6종 병렬(allSettled) → market:detail:{kospi|kosdaq|usdkrw|us10y|oil|gold}
         (snapshot + history 7일 + dailyRows, 매퍼: kisMapper / kisOverseasMapper. gold=N/GOLDLNPM, §30)
      1a. refreshDxy: 환율 통화쌍 6콜 순차(FX@EUR·JPY·GBP·CAD·SEK·CHF) → computeDxyDetail
           (ICE 공식 근사, 기준일 교집합) → market:detail:dxy — 파생 부수 지표, 잡 ok 게이팅 제외 (§28)
      1a'. refreshBtc: 업비트 2마켓 순차(KRW-BTC·USDT-BTC, 티커+일봉 각 1콜) → mapUpbitDetail
           → market:detail:{btcKrw|btcUsd} — 외부 부수 지표, 잡 ok 게이팅 제외 (§30)
      1a''. refreshGlobalTable: **하루 3회차만**(isGlobalTableRound — 09:00·15:40·18:15 시작
           9분 창) 카탈로그 5구획 28종 순차 조회 → market:globalTable (§88·§89·§90).
           신규 22콜 = 해외 기간별시세 21 + 국내 현재가 1(국내 금 J/M04020000).
           유로·일본·영국은 1a의 통화쌍 응답 재사용, WTI·국제 금은 market:detail:{oil|gold}
           재사용이라 0콜. 국내 금 기준일은 같은 회차 KOSPI basDt(현재가 응답에 영업일 없음).
           항목 단위 실패 격리 — 실패 항목은 직전 스냅샷 행을 이어받고 staleAt 표시(3회차뿐이라
           행이 사라지면 반나절 빈다). 부수 데이터, 잡 ok 게이팅 제외
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
         대상 조건 3종 판정→신고가 갱신→종류(prefs.price)·음소거·쿨다운 체크
         →발송→쿨다운 SET (휴장일 skip, 실패해도 200). 종류를 꺼 둬도
         신고가 갱신·저장은 그대로 수행한다(Phase 73)
      0. (시작 시) market:lastRefreshAt.attemptedAt 기록 — 성공·실패 무관하게
         "잡이 실제로 돌았는지" 남김(§52 방법2, at·ok는 보존/false)
      9. 전부 성공 시 market:lastRefreshAt 갱신(at=완료 시각·attemptedAt·ok=true)
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
      → 종목별 buildEntry: 예탁원 배당일정 1콜(최근 10년) → **직전 사업연도 확정 배당 합**
         (Phase 59·60, 공용 `dividends/basis.ts` computeDividendBasis)으로 시가배당률. 결산(divi_kind=="결산") 기준일을
         사업연도 종점으로 보고 (직전 결산, 이 결산] 창의 중간·분기 배당을 합산 —
         12개월 롤링이 기준일 미세 이동으로 같은 중간배당을 이중계상하거나 서로 다른
         사업연도를 섞던 문제 해소(조선내화·CR홀딩스 실측). 폴백(basisYear=null)=최근 1년
         롤링: 결산 없음·최신 결산 400일 초과·배당상품. 결산 기준일 월 1~6월은 전년도로
         귀속(선배당후기준일, fiscalYearLabel). 폭배는 basis 대 직전 사업연도 총액들(priorFyTotals).
         + 연속 배당 연수 + 지급 주기(기준일 평균 간격 → 월/분기/반기/연)
         + 우선주(stk_kind=="우선") + 주식배당률(stk_divi_rate, basis 회차 기준)
         + 배당당시 액면가(face_val, basis 회차) + 지난 배당 기록(history, Phase 51: 확정 회차를
         지급 주기별 창 연 6년·반기 4년·분기 2년·월 12개월(판정불가는 연)으로 잘라 최신순,
         basis 산입 회차는 inBasis=true 표식 Phase 59) 산출. 배당상품은 우선주·주식배당·폭배를
         강제 비활성. instrumentType(stock/fund)에 따라 일반/배당상품 버퍼(각 상위 500)에
         온라인 선택
      → 시간 예산 250초 소진 시 progress 저장 후 종료
      → 완주 시 finalizeEntries를 두 버퍼에 각각(isFund 플래그): 일반종목은
         ① 배당률>12% 이상치만 현재 액면가(CTPF1002R papr) 조회 → 배당당시÷현재
         액면가 비율로 주당배당금 환산(액면분할/병합 보정, Phase 53: history 회차
         perShare도 같은 비율로 보정해 펼침 표 회차 배당률이 헤더와 기준 일치) →
         ② 재정렬·TOP 100 절단 →
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
      5. 종목별 순차 실적 공시 refreshEarnings — Phase 81:
         DART list.json을 유형 한정으로 2회(pblntf_ty=I 거래소공시 → A 정기공시,
         각 150ms 간격) 조회해 실적 6유형(feeds/earnings.ts)만 남기고 접수번호
         중복 제거 → 최신순 10건 → market:earnings:{code} SET 덮어쓰기.
         **유형을 좁히는 게 핵심** — 무필터 조회는 대형주가 90일 800건대라
         (삼성전자 818건 실측) 상위 10건 컷에서 실적이 한 건도 안 남는다.
         같은 조건에 pblntf_ty=I를 걸면 15건으로 줄어 1페이지에 다 들어온다.
         원문(document.xml, zip)을 받는 유형은 **잠정실적(수치 표 7칸 전부)과
         IR(개최 일정)** 2종이며(needsEarningsDocument, IR은 Phase 82), 직전
         스냅샷에 같은 접수번호가 **같은 파서 버전(parsedV)** 으로 있으면 결과를
         물려받아 원문을 다시 받지 않는다(회차당 신규 파싱 30건 상한).
         **파서 버전을 올리면 저장분이 알아서 몇 회차에 걸쳐 재파싱된다** —
         Phase 82의 전기 3칸·IR 일정이 이 경로로 소급 반영됐다. 종목별 실패 격리
      5-1. 배당결정 공시 collectDividendDecisions — Phase 83:
         **5단계가 이미 받아 둔 거래소공시 rows를 재사용**한다(목록 조회 추가 0건).
         「현금ㆍ현물배당결정」(자회사 건 제외)만 추려 최신순 6건 → 원문에서
         배당구분·주당배당금(보통주)·기준일·지급예정일 파싱 →
         market:dividendDecision:{code} SET 덮어쓰기. 원문 예산은 실적과 분리한
         회차당 8건(DIVIDEND_DOC_BUDGET) — 실적 시즌에 예산을 다 쓰면 배당이
         계속 밀리기 때문. 파서 버전(parsedV)으로 재파싱하는 방식은 실적과 동일.
         이 단계 실패는 잡 ok를 게이팅하지 않는다(예탁원 회차를 보완하는 부가 소스)
      5-2. 실적 보도 refreshEarningsNews — Phase 84:
         5단계 결과에서 **최근 7일 안에 접수된 수치 공시**(잠정실적·정기보고서·
         실적변동 = isEarningsNewsTarget)가 있는 종목만 네이버를 1콜 부른다
         (`"종목명" "영업이익"`·sort=sim) → 점수 필터(제목 종목명 +2 · 제목 실적어
         +1 · 요약만이면 최소점) → 상위 5건 market:earningsNews:{code} SET.
         **발표가 없는 회차엔 콜 0**이고, 같은 공시로 이미 모은 스냅샷이면
         (basisRceptNo 대조) 건너뛰므로 발표 종목당 실제 콜은 **분기 1회**다.
         sort=sim인 이유는 발표 직후 date 정렬이 시황·정치 기사로 채워지기 때문
         (실측 비교: 종목명 단독 date 7/20 vs `"종목명" "영업이익"` sim 15/15).
         저작권상 **네이버 발췌와 원문 링크까지만** 저장하고 본문은 담지 않는다.
         이 단계 실패도 잡 ok를 게이팅하지 않는다(실적 수치는 이미 5단계에 있다)
      6. 알림 훅 evaluateFeedAlerts(lib/alerts/feedAlerts.ts) — Phase 10 3단계:
         ① 공시: 방금 받아온 공시(메모리 전달)를 종목별 전역 커서
            alerts:disclosure:last:{code}(마지막 통지 접수번호)와 비교 →
            새 공시만 8유형 키워드 분류 → 매칭분 발송. 첫 회차는 기준점만 저장.
            매칭 라벨에 「배당」이 있으면 배당 이벤트로 갈라(Phase 73) 제목
            "배당 공시"로 발송한다(같은 공시 중복 발송 없음). 음소거는 다른
            유형과 똑같이 적용(Phase 79 — Phase 73의 배당 예외 폐기)
         ② 실적(Phase 81): 5단계에서 받아온 실적 공시를 별도 커서
            alerts:earnings:last:{code}와 비교 → 새 건 중 **알림 대상 3종
            (잠정실적·정기보고서·실적변동, Phase 81-1)**만 "실적 공시" 제목으로
            발송(링크 /feeds?tab=earnings&code={종목코드} — 실적 탭이 한 종목만
            보여주므로 code를 지정해야 알림이 가리킨 공시가 보인다, Phase 83).
            IR·실적예고는 수치 없는 일정 안내라
            화면 탭에만 남기고 푸시는 안 보낸다(실측 58건 중 27건이 여기 해당).
            커서는 유형과 무관하게 전진 — 제외 유형을 매 회차 재평가하지 않는다.
            첫 회차는 기준점만 저장. 실적 6유형은 공시 8유형과 키워드가
            겹치지 않아 배타 분기가 없다
         ③ 시장경보: market:stock:{code} 스냅샷 raw의 경보 필드 6종을
            alerts:marketwarn:last:{code}와 비교(KIS 추가 호출 없음) →
            변화(지정·해제)만 발송. 첫 회차는 기준점만 저장
         발송 대상 = 각 사용자 보유+관심종목, 종류 스위치(alerts:{email}:prefs)와
         음소거(alerts:{email}:muted)를 4종 모두 통과해야 발송(Phase 79·81),
         이메일 단위 실패 격리. 훅 실패는 로그만 — 잡 ok 게이팅 안 함
      7. 알림 훅 evaluateDividendAlerts(lib/alerts/dividendAlerts.ts) — Phase 25:
         보유종목 union(관심종목 제외)의 **병합 회차**(getDividendRoundsMap =
         market:stockInfo:{code} rounds + market:dividendDecision:{code} 보완,
         Phase 83)에서 지급일=KST 오늘·주당배당금>0 회차 추출(KIS 추가 호출 없음, 같은 날
         여러 회차는 합산) → alerts:dividend:sent:{code}:{payDate} 마커(EX 2일)로
         중복 차단 — 발송 전에 기록(중복 방지 우선, 사용자와 무관한 회차 단위라
         음소거와 별개) → 보유 사용자에게만 발송(prefs.dividend + 종목별
         음소거 둘 다 확인 — Phase 79, 이메일 단위 실패 격리).
         훅 실패는 로그만 — ok 게이팅 안 함
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

### 4.7 고아 종목 키 정리 잡 — Phase 49

```
QStash 스케줄 (매일 03:00 KST — CRON_TZ=Asia/Seoul 0 3 * * *) → POST /api/jobs/cleanup-orphan-stocks
    verifyJobRequest만 — 시간창 가드 없음 (KIS 미호출, Redis만 읽고 지움)
  → cleanupOrphanStocks(trigger)  [lib/jobs/cleanupOrphanStocks.ts]
      1. 살아있는 집합 = unionSymbolCodes(collectHoldings, collectWatchlists)
      2. 대량 삭제 방어: 허용 이메일 0 / watchlist results.ok=false 있음 /
         holdings 읽힌 수≠허용 수 → 이번 회차 삭제 skip (ok:true, skipped)
      3. market:stock:* SCAN (cursor, match, count=500) → 존재 종목코드 수집 (중복 제거)
      4. 고아 = 존재 − 살아있는 집합
      5. 고아 종목마다 per-종목 키 10종 del(...): market:stock·market:stockInfo·
         stock:{code}:history·market:disclosures·market:news·market:earnings·
         market:dividendDecision(Phase 83)·alerts:disclosure:last·
         alerts:earnings:last·alerts:marketwarn:last
  → 응답: report(live/scanned/orphan/deletedKeys) — 실패 시 500 → QStash 재시도(멱등)
```

- **고아 판정 근거**: per-종목 키는 전부 "전 사용자 보유+관심 합집합"으로만 생성된다
  (refreshMarketData/refreshFeeds). 어떤 사용자도 안 갖는 종목은 갱신 잡이 다시 쓰지
  않아 고아로 남는다. 소비처(보유·관심·피드 알림 warnCodes)도 전부 같은 합집합.
- **제외 키**: `alerts:dividend:sent:{code}:{payDate}`는 payDate 복합 키 + 자체 TTL(2일)로
  자동 정리되므로 대상 아님. `market:stock:*` MATCH는 `market:stockInfo:*`와 겹치지 않는다.
- **경합**: 정리 직후 재추가되면 다음 거래일 시세 잡이 스냅샷 복구(그 사이 "데이터 없음").
- **운영**: QStash 스케줄 등록은 사용자 수작업(다른 잡과 동일). 미등록이면 잡은 안 돈다.

### 4.3 화면 읽기 경로 (전부 Redis만)

페이지가 부르는 내부 REST API는 없다 — Route Handler는 auth·잡 2종뿐이고, 모든
페이지는 Server Component에서 lib 함수를 직접 호출한다.

- **홈** `app/page.tsx`: `getDashboardData`(detail 8종 MGET — §85에서 dxy 합류) + 카드 요약 4종(변동성·
  핫종목·**내 종목**·배당 — §58에서 보유종목 카드·요약 삭제, §67에서 내 종목 카드가 보유+관심 통합)
  + `getLastRefreshRecord` 병렬 → staleness 배지 판정 → `IndexDashboard`.
  내 종목 요약(`getMyStocksCardSummary`)은 `holdings:{email}`·`watchlist:{email}` 2키 +
  두 목록 합집합 스냅샷 MGET 1회로 끝난다(평가 계산에 스냅샷 맵을 주입해 재조회 없음).
- **지표 상세**: `IndexDetailScreen` → `getIndexDetail`/`getOverseasDetail` → detail 1건.
  usdkrw는 children `DollarIndexSection`이 `market:detail:dxy` 1건 추가 조회 (§28).
  글로벌 지표(`/indices/market`, §88·§89·§90)는 detail 3키(us10y·btcUsd·kospi) MGET 1회 +
  `market:globalTable` 1회를 병렬로 읽는다 — 28종은 항목별 키 없이 이 스냅샷 하나로 끝나고,
  §89에서 일별 기록을 없애 `dailyRows`는 이 화면에서 더 읽지 않는다(저장은 유지).
- **잔고 탭(`/stocks?mode=balance`, §58)**: `HoldingsOverview`가 `getHoldings`(복호화) →
  `getPortfolioValuation`(`market:stock:*` MGET) + `getPortfolioHistory`. 일별 기록
  목록(`DailyHistoryList`)은 이 `getPortfolioHistory` 결과를 그대로 재사용 — 추가 페치 없음 (§29).
- **내 종목 목록(`/stocks`)**: 활성 탭에 따라 `getWatchlist` / `getHoldings`+
  `getPortfolioValuation`을 읽고(잔고 탭은 둘 다 읽지 않는다 — 위 항목), 시세는 두 목록
  합집합 `getStockSnapshots` 1회로 받아 `buildWatchRows`(`computeWatchReturnRate`)·
  `buildHoldingRows`로 행을 만든 뒤 수익률 내림차순 정렬 (Phase 56).
- **종목 상세(`/stocks/[symbolCode]`, §58)**: `getHoldings`+`getWatchlist`로 `?kind` 해석 →
  `getStockInfo`(스냅샷+정보 블록 조합) + `getStockHistory` + `getMutedSymbols`.
  보유는 수량 반영 평가금액 추이·일별 기록, 관심은 기준가 대비 추이.
- **홈 "뉴스·공시" 카드**: `getTodayFeedCounts(email)`(feeds/homeFeed) — 오늘 공시·뉴스 건수
  집계 → `FeedSummaryCard`. 홈 `Promise.all`에 `.catch(() => 기본 0)` 격리로 합류.
- **배당 일정(`/dividends`, §25)**: `getDividendSchedule(email)` — `getHoldings`(보유종목만) →
  `getDividendRoundsMap`(**`market:stockInfo` + `market:dividendDecision` 두 MGET 병렬 →
  `mergeDividendRounds`**, Phase 83) → 예상 지급액(주당배당금×보유수량) 계산.
  홈 카드는 `getDividendCardSummary`(지급일 ≥ 오늘 상위 4, 실패 시 null 격리).
- **뉴스·공시 상세(`/feeds`)**: `getDisclosureBoard`·`getNewsBoard`·`getEarningsBoard(email)` —
  `market:disclosures:{code}`·`market:news:{code}`·`market:earnings:{code}` MGET 병합·상위 40건
  → `FeedTabsClient`. 현재 탭은 `?tab=`(Phase 81 → 82에서 탭 상태 자체가 URL). **실적 탭이면
  추가로 `getEarningsStockOptions`+`getEarningsFocus(?code=)`**(Phase 82) — 이 경로만 화면에서
  DART를 직접 부른다(`analysis/overview.ts` 재사용, §3 아키텍처 예외를 종목분석과 공유).
  Phase 83에서 실적 공시 목록이 **선택 종목 것만** 보이게 됐는데, 거르는 곳은 서버가
  아니라 `FeedTabsClient`다 — 서버는 전 종목치를 그대로 넘기고 클라이언트가 필터한다
  (종목을 바꿀 때 목록이 서버 왕복을 기다리지 않게 하려는 것, 사용자 확정 B안).
  (Phase 17-2에서 A안 철회 — 보유·관심 상세 페이지는 더 이상 공시를 읽지 않는다.
  17-2b에서 게시판을 홈 전체폭→`/feeds`로 이동.)
- **핫종목**: `?mode` 서버 분기 — 월간은 `getHotStocks` 통짜 1건→`?period` 탭(링크에 `mode=monthly` 유지), 당일/주간은 `getDailyFluctuation`/`getWeeklyFluctuation` 1건(상위 30)+`getStockMaster`(위첨자 매핑)+`resolveStaleness`. (검증: 알 수 없는 mode→daily, period→1m).
- **변동성**: `getVolatilityHistory` → `aggregateMonthlyAverages`(최근 6개월) + 당월 필터
  일별 기록 목록(내림차순 — 페치 1회 재사용, Phase 27).
  홈 카드(`getVolatilityCardSummary`)는 같은 history 1건에서 **최신 2개 기록으로 전일 대비**,
  월 집계로 당월 평균·전월 대비를 함께 만든다(§71 — 기록이 1건이라도 있으면 카드 표시,
  당월/전월분이 없으면 해당 값만 null).
- **예외 — DLQ(`/dlq`, Phase 18)**: 유일하게 Redis가 아닌 외부 API(QStash)를 Server
  Component에서 직접 읽는다(`listDlqMessages`, `QSTASH_TOKEN` 서버 전용). 운영 확인용
  읽기 전용 화면이라 스냅샷 캐시 없음. KIS 금지 원칙(§3)과는 무관(QStash는 KIS 아님).

### 4.4 사용자 쓰기 경로 (Server Actions)

- `stocks/actions.ts`(§58에서 보유·관심 액션 6종 병합): `requireEmail`(세션+허용 검사, 실패
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
| `market:detail:{kospi\|kosdaq\|usdkrw\|us10y\|oil\|gold\|dxy\|btcKrw\|btcUsd}` | `StoredMarketDetail` (snapshot+history+dailyRows+fetchedAt). dxy는 환율 6종 합성 파생 지표(§28), gold는 KIS N/GOLDLNPM, btcKrw·btcUsd는 업비트 외부 지표(§30) | ✕ | 시세 잡 | 홈(dxy는 §85에서 원/달러 카드 보조줄)·지표 상세·시장 |
| `market:stock:{code}` | `StoredStockSnapshot` (price·changeRate·marketName·raw 전체·fetchedAt) | ✕ | 시세 잡 | 평가·관심종목·상세 |
| `market:stockInfo:{code}` | `StoredStockInfoBlocks` (순위·배당·실적 + 배당 확정 회차 `rounds` — optional, 구 스냅샷 호환, §25; 배당 `annualDividendPerShare`=직전 사업연도 합·`basisYear?` Phase 60) | ✕ | 시세 잡(확정 회차/신규) | `getStockInfo`·배당 일정 리더·배당 알림 훅 |
| `market:globalTable` | `StoredGlobalTable` (구획 5개 × 행: label·unit·**flag?**(§90에서 이모지 → `public/flags/{code}.svg`의 소문자 2자 코드)·decimals·close·changeRate·direction·basDt(+`staleAt?`) + fetchedAt) — 차트·일별 없음. basDt는 화면에서 뺐지만(§89) 이어받기 판정에 남는다 (§88·§89·§90) | ✕ | 시세 잡(하루 3회차) | 글로벌 지표 화면 |
| `market:lastRefreshAt` | `LastRefreshRecord` (at·trigger·ok) | ✕ | 시세 잡(전부 성공 시) | 홈 배지·각 페이지 「마지막 갱신」 |
| `stock:{code}:history` | `StockDailyPrice[]` 2년 (날짜 오름차순) | ✕ | 시세 잡(백필/확정 갱신) | 상세 차트·기준가 확정 |
| `kospiVolatility:history` | `KospiVolatilityRecord[]` | ✕ | 시세 잡 | 변동성 카드·상세 |
| `market:hotStocks` | `StoredHotStocks` (구간 4종 TOP 100) | ✕ | 핫종목 잡 | 핫종목 페이지 월간 뷰 |
| `market:hotStocks:progress` | `HotStocksProgress` (커서) | ✕ | 핫종목 잡 (완료 시 삭제) | 핫종목 잡 |
| `market:dailyFluctuation` | `StoredDailyFluctuation` (당일 등락률 상위 30+basePrice(전일 종가, §20)+fetchedAt) | ✕ | 시세 잡 | 핫종목 페이지(기본 탭)·홈 핫종목 카드 |
| `market:weeklyFluctuation` | `StoredWeeklyFluctuation` (주간=5거래일 전 대비 등락률 상위 30+basePrice(역산, §20)+fetchedAt) | ✕ | 시세 잡 | 핫종목 페이지 주간 탭 |
| `market:stockMaster` | `StoredStockMaster` (코드↔종목명 ~2,650+fetchedAt) | ✕ | 시세 잡 (1일 1회) | 종목명 검색 `searchStocks` |
| `market:investor:{kospi\|kosdaq}` | `StoredInvestorFlows` (시장 전체 투자자 순매수 금액 최근 20거래일, 백만원, §42) | ✕ | 시세 잡 | 지수 상세 "일별 수급" 탭 · 상단 요약 · **홈 코스피/코스닥 카드**(§86 3열·연속 거래일) |
| `market:investorIntraday:{kospi\|kosdaq}` | `StoredIntradayFlows` (당일 시각 슬롯 누적 — `tradingDate`+`slots[{hhmm, 개인·외국인·기관계 순매수, 거래대금}]`, 백만원, §70). 잡이 회차마다 upsert하며 **KIS 추가 호출 없음**(같은 회차 응답 재사용). **§92부터 정규(QStash) 회차만** 이 키를 건드린다 | ✕ | 시세 잡 | (다음 거래일 baseline 승격용) |
| `market:investorIntraday:{kospi\|kosdaq}:baseline` | 직전 거래일 슬롯 묶음 (§70) — 「거래대금 · 수급」 요약의 **전일 같은 시각 대비** 기준. 거래일이 바뀐 첫 회차에 위 키를 승격 | ✕ | 시세 잡 | 지수 상세 상단 요약 · **홈 코스피/코스닥 카드**(§86) |
| `market:investorIntraday:{kospi\|kosdaq}:archive:{YYYY-MM-DD}` | 위 당일 키와 **같은 값을 날짜별로 영구 보존**(§92, TTL 없음) — 시간대별 분포를 확률로 다루려면 표본이 필요한데 당일 키는 매일 덮어써지고 **KIS는 과거 거래일의 시간대별 수급을 안 준다**(§70 실측 — 지나간 날은 복구 불가). 회차마다 당일 키와 함께 SET(마지막 회차 1회 복사는 그 회차가 실패한 날이 통째로 빈다). **§93에서 슬롯이 3주체 → 10주체로**(기관 세부 7종 옵셔널 추가, KIS 콜은 그대로 0) — 슬롯 103B→약 250B, 연 2.1MB→약 5MB(한도 64MB). **2026-07-31분은 확장 전이라 영구히 3주체**다 | ✕ | 시세 잡 | 맥미니 미러(`scripts/mirror-intraday-flows.mjs`) · 일별 수급 표 날짜 펼침(`indices/actions.ts`, §93) · (후속: 분위수 계산) |
| `market:investorIntraday:{kospi\|kosdaq}:manual:{YYYY-MM-DD}` | **수동 트리거**(`?force=true` 등)가 만든 슬롯 (§92) — 정규 회차 사이 비정형 시각이라 섞이면 시간대별 분포가 오염된다. 버리지 않고 격리만 하며(사용자 확정) 날짜가 키에 있어 그 자체로 아카이브. 판별은 **`trigger`(인증 방식)** 기준 — hhmm으로 가르면 정각에 떨어진 수동 호출을 놓치고(정규 슬롯을 덮어씀) 지연된 정규 회차를 오분류한다 | ✕ | 시세 잡 | 맥미니 미러(`source='manual'`, 분석에서 제외) |
| `market:fiRanking:{kospi\|kosdaq}` | `StoredFiRanking` (외국인·기관 × 순매수·순매도 각 상위 30, 수량=주·금액=백만원, §50) | ✕ | 시세 잡 | 지수 상세 "종목별 순위" 탭 |
| `market:marketCapRanking:{kospi\|kosdaq}` | `StoredMarketCapRanking` (실시간 시총 상위 30 + `tradingDate`·`baseDate`, 시총 단위 억원, §68) | ✕ | 시세 잡 | 지수 상세 "시총 순위" 탭 |
| `market:marketCapRanking:{kospi\|kosdaq}:baseline` | `MarketCapBaseline` (직전 거래일 마지막 회차=18:15 확정의 종목코드→`{rank, capEok}`, §68) | ✕ | 시세 잡 | 위 탭의 전일 대비 순위·시총 증감 기준 |
| `market:dividendRanking` | `StoredDividendRanking` — 일반종목 `entries`/`universeCount` + 배당상품 `productEntries?`/`productUniverseCount?`(Phase 46, 구 스키마 폴백) 시가배당률 각 TOP 100+fetchedAt. 배당률 분자 `annualDividendPerShare`=직전 사업연도 확정 배당 합(Phase 59, 폴백 시 최근 1년), 귀속 사업연도는 `dividendBasisYear?`("YYYY"·폴백 null). 각 엔트리에 지난 배당 기록 `history?`(Phase 51, 회차별 기준일·주당배당금·지급일·종류, 주기별 창으로 절단, basis 산입 회차는 `inBasis?` Phase 59) | ✕ | 배당률 순위 잡 | 배당 페이지 순위 섹션(일반종목/배당상품 2탭) |
| `market:dividendRanking:progress` | `DividendRankingProgress` (커서+일반/배당상품 두 버퍼+가격 스냅샷) | ✕ | 배당률 순위 잡 (완료 시 삭제) | 배당률 순위 잡 |
| `analysis:financials:v2:{corpCode}` | `FinancialAnalysis` (6개년 재무제표 계정×연도 + 재무지표 4분류, Phase 64·**키 v2는 Phase 72**) | ✕ | **화면**(read-through, §3 예외) | 종목분석 `/statements` |
| `analysis:overview:v2:{corpCode}` | `AnalysisOverview` (연간 6개년·분기 12~15·연환산 시계열 + 자사주 비중, TTL 30일, §72) — **v2는 §80**(분기 시계열에 진행 연도가 붙어 모양이 바뀌었다. TTL 30일이라 프리픽스를 올리지 않으면 한 달간 옛 시계열이 나간다. v1 키는 TTL로 자연 소멸) | ✕ | **화면**(read-through, §3 예외) | 종목분석 통합지표 |
| `analysis:quote:v1:{code}` | `AnalysisQuote` (52주 최고·최저·변동률 4종·연말/분기말 종가, **TTL 6시간** — 재무와 갱신 주기가 달라 분리, §72) | ✕ | **화면**(read-through, §3 예외) | 종목분석 통합지표 |
| `analysis:closes:v1:{code}` | `Record<기간키, 종가>` (`{"2023Q2": 71500, ...}`, **TTL 1년**, §78) — 확정 기간말 종가. 무수정주가라 불변이지만 **7일 지난 기간말만** 넣는다(금융위 확정이 영업일+1 13시). TTL은 값의 수명이 아니라 안 보는 종목의 키를 걷어내는 장치 | ✕ | **화면**(read-through, §3 예외) | 종목분석 통합지표 |
| `holdings:{email}` | `Holding[]` | **○** | Server Action + 잡(종목명 채움) | 보유종목 화면·잡 |
| `holdings:{email}:history` | `PortfolioDailyRecord[]` | **○** | 시세 잡 | 보유종목 화면 |
| `watchlist:{email}` | `WatchItem[]` | **○** | Server Action + 잡(종목명·기준가) | 관심종목 화면·잡 |
| `kis:access_token` (+`:lock`) | 토큰 캐시 (TTL=만료 시각) | ✕ | KIS auth | KIS auth |
| `market:disclosures:{code}` | `StoredDisclosures` (최근 90일 공시 최대 10건+fetchedAt) | ✕ | 피드 잡 | 홈 통합 피드(`homeFeed` MGET) |
| `market:news:{code}` | `StoredNews` (최신 뉴스 최대 10건+fetchedAt) | ✕ | 피드 잡 | 홈 통합 피드(`homeFeed` MGET) |
| `market:earnings:{code}` | `StoredEarnings` (실적 공시 최대 10건+유형·잠정실적 파싱 수치·**IR 일정**·`parsedV`+fetchedAt, Phase 81/**82**) | ✕ | 피드 잡 | `/feeds` 실적 탭(`homeFeed` MGET · `earningsFocus`) · 피드 잡(직전 파싱 결과 재사용) |
| `market:earningsNews:{code}` | `StoredEarningsNews` (실적 발표 직후 보도 최대 5건 — 제목·링크·**네이버 발췌**·발행일 + 수집 계기 공시 `basisRceptNo`/`basisRceptDt`, Phase 84). 발표 때만 갱신되므로 기준 공시 접수일을 함께 굳혀 화면이 45일 지난 스냅샷을 숨긴다 | ✕ | 피드 잡(발표 후 7일 창의 종목만) | `/feeds` 실적 탭(`earningsFocus` 단건 GET) |
| `market:dividendDecision:{code}` | `StoredDividendDecisions` (「현금ㆍ현물배당결정」 공시 최대 6건 — 배당구분·주당배당금·기준일·지급예정일·`parsedV`+fetchedAt, **Phase 83**). 예탁원(KIS)이 이사회 결의를 며칠 늦게 반영해 `market:stockInfo`의 `rounds`에서 빠지는 최신 회차를 메운다 | ✕ | 피드 잡(실적과 같은 거래소공시 목록 재사용) | 배당 일정 리더·배당 알림 훅(`dividends/rounds.ts` 병합) · 피드 잡(직전 파싱 결과 재사용) |
| `dart:corpCodeMap` | `StoredCorpCodeMap` (종목코드→DART 고유번호, 30일 주기) | ✕ | 피드 잡 | 피드 잡 |
| `push:subs:{email}` | `StoredPushSubscription[]` (기기별 구독, Phase 10) | **○** | 구독 Server Action + 발송 경로(410/404 prune) | `/alerts` 화면·발송 유틸 |
| `alerts:{email}:peaks` | `StockPeakMap` (종목별 신고가+갱신 시점 지수) | **○** | 시세 잡(알림 훅 — 보유+관심종목만 유지) | 알림 훅 |
| `alerts:{email}:muted` | `string[]` (알림 끈 종목코드) | **○** | `/alerts` 종목별 토글 Server Action | 알림 훅·`/alerts` 화면 |
| `alerts:{email}:prefs` | `AlertCategoryPrefs` (알림 종류 4종 on/off, Phase 73 — 전부 켬이면 키 삭제) | ✕ | `/alerts`·배당 「내 배당」 탭 종류 토글 Server Action | 알림 훅 3종·`/alerts`·`/dividends` 화면 |
| `alerts:{email}:cooldown:{code}` | 발송 시각 ISO (EX 7200 — 2시간 재알림 금지) | ✕ | 시세 알림 훅 | 시세 알림 훅 |
| `alerts:disclosure:last:{code}` | 마지막 통지 접수번호 (종목별 전역 커서, Phase 10 3단계) | ✕ | 피드 알림 훅 | 피드 알림 훅 |
| `alerts:earnings:last:{code}` | 마지막 통지 **실적** 접수번호 (종목별 전역 커서, Phase 81 — 공시 커서와 분리) | ✕ | 피드 알림 훅 | 피드 알림 훅 |
| `alerts:marketwarn:last:{code}` | `MarketWarnState` (시장경보 상태 6필드, 종목별 전역) | ✕ | 피드 알림 훅 | 피드 알림 훅 |
| `alerts:dividend:sent:{code}:{payDate}` | 발송 시각 ISO (EX 2일 — 배당 지급일 알림 중복 방지 마커, 종목×지급일 전역, §25) | ✕ | 배당 알림 훅 | 배당 알림 훅 |

- 이메일 키는 항상 `normalizeEmail`(trim+lowercase) 후 사용.
- 공용 시세는 비암호화(사용자 무관 공개 데이터), 개인 데이터 6키(holdings·history·watchlist·push:subs·alerts peaks·muted)만 `enc:v1:` 암호화 — 쿨다운 키와 알림 종류 `prefs`는 평문(TTL 기반이거나, 보유종목을 드러내지 않는 취향 값).
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
  `getPortfolioValuation` — 수익률·평가 계산은 이들 재사용. `getPortfolioValuation`은
  두 번째 인자로 **이미 읽어 둔 스냅샷 맵을 주입**할 수 있다(§67 — 보유 외 종목이 섞여
  있어도 무관, MGET 중복 제거용).
- `addMonths`/`baseMonthKst`/`monthStartYyyyMmDd`/`monthEndYyyyMmDd` (hotstocks/months) —
  월 단위 계산 공용.
- `resolveStaleness`(스케줄 인지형 배지)/`isWithinKisCallWindow` (market/staleness).
- `verifyJobRequest` — 새 잡 라우트를 만들면 반드시 이걸로 인증 (신설 시 3곳 동기화 — §8.13).
- `collectHoldings`/`collectWatchlists`/`unionSymbolCodes` (jobs/collectTargets) —
  잡의 수집 대상(허용 이메일 전체 보유+관심종목) 조회는 이들 재사용.
- `getDisclosureBoard`/`getEarningsBoard` (feeds/homeFeed) — 사용자 보유+관심 공시·실적을
  MGET 병합·상위 40건 컷(`/feeds` 게시판용). `getTodayFeedCounts` — 같은 MGET으로 당일
  건수만 세는 홈 카드용(실적은 아직 이 카드에 없다 — 분기 집중형이라 "오늘 N건" 모델과
  안 맞음). 종목별 원본 리더가 필요하면 이들을 확장(`disclosuresKey`·`earningsKey` export 재사용).
- `getLastRefreshRecord().catch(() => null)` — 「마지막 갱신」 표기는 이 실패 격리
  패턴으로 통일 (여러 페이지에서 반복되는 관례).

### 6.2 표시 포맷 (`lib/format/*`)

- `formatIndex` — 지수 소수 2자리. `formatKrw` — "12,345원". `formatAvgPrice` —
  총액÷수량 버림 2자리. `formatEokwon` — 억원→"356조 6,867억원". `formatKrwAbbrev` —
  차트 y축 M/B. `formatFlowCompact`(§86) — 백만원→최상위 단위 1개·**쉼표 없음**
  ("29.7조"/"-382억"), 1조 미만은 억원 정수(코스닥 수급이 "0.0조"로 뭉개지는 것 방지),
  억 반올림이 1조 경계를 넘으면 조로 승격. 홈 카드 3열 폭(430px에서 53.7px) 전용이라
  `formatEokAxis`(차트 축, 억에도 소수·부호 옵션 없음)와 구분된다.
  `formatChangeAmount`/`formatChangeRate`/`formatChange`/
  `formatPercentPoint` — 등락 표기(+부호). `formatKstDateTime` — 「마지막 갱신」 표기.
  `formatBasDtDisplay`(2026.06.01) / `formatBasDtLabel`(06/01, kisMapper에 위치).
  `formatRatio`(StockInfoBlocks에서 export) — PER/PBR 등.
  `formatMonthDisplay`/`formatMonthRangeDisplay` (hotstocks/months).
  `format/trade.ts`(17-4) — `formatUsdEok`/`formatUsdEokSigned`("607.5억 달러", 1억 달러=1e8 USD)·`formatYyyymm`(2026.06)·`formatYoy`(전년동월비 %, null→"—").
  `format/btc.ts`(§30) — `formatBtcValue`(통화별: 원화 정수 "…원", 달러 소수 2자리)·`BtcCurrency` 타입 — 서버·클라이언트 공용. `formatBtcChange`는 §89에서 삭제(유일한 사용처였던 글로벌 지표 카드가 타일로 바뀌며 공용 `formatChangeRate`를 쓴다).

### 6.3 타입

- `types/indices.ts` — `IndicatorId`(=`MarketIndex`|`OverseasIndicator`(GOLD 포함 4종)|`"DXY"`|`"BTCKRW"`|`"BTCUSD"` —
  DXY는 환율 6종 합성 파생 지표(§28), BTC 2종은 업비트 외부 지표(§30)),
  `IndexSnapshot`/`IndexSeries`/`IndexDailyRow`/`IndexDetailData`/`IndexDashboardData`
  (§86에서 `kospiFlow`·`kosdaqFlow` 추가), `HomeIndexFlow`/`HomeIndexFlowInvestor`(§86 홈 카드
  거래대금·수급 보조 블록 — 금액은 전부 백만원 원값, 표기는 화면에서),
  `PriceDirection`, 변동성 3종(`VolatilityCardSummary`는 §71에서 일 지표 4·월 지표 2로 확장),
  `KIS_DATA_NOTICE`, `INDICATOR_NAMES`.
- `types/holdings.ts` — `Holding`(totalCost 모델), `PortfolioDailyRecord`,
  `HoldingValuation`/`PortfolioValuation`. (`HoldingsCardSummary`는 §58 홈 보유종목 카드 삭제와 함께 제거)
- `types/watchlist.ts` — `WatchItem` (priceAtRegistration/priceBasisDate 잠정·확정 모델 + `changeRateAtRegistration?` 등락률 폴백값, Phase 65 — optional이라 구 레코드 호환).
- store별 Stored* 타입은 각 store 파일에서 export (market/store, hotstocks/store).

### 6.4 UI 패턴

- **Recharts는 3단 래핑 고정**: Server page → `*ChartClient`(`'use client'` +
  `dynamic(ssr:false)` + 스켈레톤) → 실제 차트 컴포넌트. 새 차트도 이 패턴.
- 차트 색·축은 CSS 변수(`var(--chart-stroke-kospi)` 등) 사용 — 하드코딩 금지.
- 홈 카드는 `SummaryCard` 프리미티브 재사용 (특수 레이아웃만 HotStocksCard처럼 별도).
- 페이지 헤더 규격: `NavIconLink`(home/back) + `h1.title` + `span.lastRefresh`.
- 숫자는 `.numeric` 클래스, 등락 색은 `styles[resolveDirection(x)]` — 새 화면의 CSS
  Module에도 `.rise/.fall/.flat` 클래스가 있어야 한다.
  **표 안에서는 반드시 스코프해야 색이 먹는다** — `.table td`/`.stockTable td`처럼
  요소를 낀 규칙(0,1,1)이 단독 `.rise`(0,1,0)를 이겨 색이 기본 글자색으로 덮인다
  (Phase 56에서 실제로 수익률·수익금 색이 죽었고 Phase 57에서 `.stockTable .rise`
  형태로 수정). 배당률 순위 `.rankTable .rankYield`도 같은 이유로 스코프돼 있다.
- **신규 단일 지표 상세 화면은 `IndexDetailScreen`(market 프로프) 패턴 재사용이 1순위.**
- 폼 오류는 `?error=코드` redirect + page의 `ERROR_MESSAGES` 맵 + `role="alert"` 배너.
- 접기 폼은 `<details open={오류 시}>` 패턴 (holdings·watchlist 추가 폼).
- **설명형 각주는 `ui/NoteDisclosure` 하나로** (Phase 91) — "왜/어디서/무슨 기준"을 적는
  카드·푸터 각주는 접힘 토글로 두고, **표 값을 읽는 데 필요한 범례는 펼친 채 남긴다**
  (`MarketFlowSummary`의 부호 범례, `MarketCapRankingTable`의 기준 한 줄, 지수 상세
  일별 수급 탭 `sectionNote`, 수출입 상세 `cardNote` 2개 — 접으면 값을 오독한다).
  푸터의 「마지막 갱신」·「기준일」도 접지 않는다(각주가 아니라 데이터의 나이 표시라,
  숨기면 staleness를 감추는 셈).
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
  **읽기 전용 Action도 자체 검사한다** — `lib/stocks/search.ts`(종목 검색)와
  `indices/actions.ts`(장중 슬롯, §93)는 `auth()`+`isEmailAllowed`를 각자 확인한 뒤
  빈 결과를 돌려준다. 렌더 시점의 페이지 게이트는 보안 경계가 아니다(Action은 UI를
  거치지 않고도 POST된다).

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
- **동적 라우트 파라미터는 세션 가드 직후 형식 검증 후 redirect**가 관례 — `/stocks/[symbolCode]`·`/analysis/[symbolCode]`(+`/statements`)는 `/^\d{6}$/`, `/indices/trade/[yyyymm]`는 `isValidYyyymm`. 새 동적 라우트를 만들면 같은 게이트를 넣는다(Phase 76에서 분석 라우트 2개 누락분 보강).
- 외부 링크는 저장 단계에서 스킴 검증 — 네이버 뉴스는 `toSafeHttpUrl`로 http(s)만 통과, DART 링크는 고정 https 프리픽스 + `rceptNo` 조립.
- **의존성 권고 판정 시 주의**: `npm audit` 요약의 패키지 범위는 **자체 권고 + 번들 의존성 권고의 합집합**이라 패치된 버전도 취약해 보인다. 반드시 `npm audit --json`의 `vulnerabilities.<pkg>.via[]` 개별 범위·`fixAvailable`로 판단한다(Phase 76에서 이 오독 때문에 next 권고 9건이 2주간 방치됐다). 현재 `next` 항목이 계속 뜨는 것은 번들 `postcss@8.4.31`·`sharp@0.34.5` 때문이며 **next 자체 권고는 0건**이다.

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
   `stocks/actions.addDaysIsoDate`(ISO). 같은 목적, 포맷만 다름.
5. **전월 계산 2벌** — `volatility.previousMonth`는 `hotstocks/months.addMonths(m, -1)`과
   동일 기능. `stockInfo.previousQuarterYymm`도 유사 계열(분기 단위).
6. **수익률 계산식 `(현재-기준)/기준*100` 인라인 반복** — `valuation.ts`(정본),
   `HoldingsOverview`의 일별 리스트·chartPoints, 종목 상세의 보유·관심 chartPoints,
   `computeWatchReturnRate`. 산식 정책이 바뀌면 전부 손봐야 한다.
7. ~~**Server Action 보일러플레이트 중복**~~ — §58에서 `stocks/actions.ts` 한 파일로
   합치며 `requireEmail`/`fail`/경로 조립이 1벌로 정리됐다. ERROR_MESSAGES 맵은 여전히
   목록 page와 상세 page에 부분 중복.
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
    `fillRegistrationPrices`(needsFill), `stocks/rows.ts`(buildWatchRows),
    종목 상세 page(관심 분기). Phase 65의 **종가 폴백 판정(스냅샷 부재 시
    `priceAtRegistration` 사용)도 3곳** — `stocks/rows.ts`(buildWatchRows),
    종목 상세 page(watchPrice), `stocks/myStocksCard.ts`(홈 카드, §67 이전엔
    `watchlist/summary.ts`). 폴백 규칙을
    바꾸면 세 곳이 어긋나지 않게 함께 고쳐야 한다.
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
    returnRate }` 변환이 `HoldingsOverview`와 종목 상세의 보유·관심 분기에서 거의 동일하게
    반복 — 새 차트 화면 추가 시 4번째 사본이 생기기 쉽다 (§8.6 수익률 산식 반복과 같은 지점).
15. **on/off 표시는 `ui/ToggleSwitch` 하나로** (Phase 74) — 알림 토글 4종이 각자 버튼을
    갖고 있던 시절, `PushSubscriptionManager`만 **동작형** 라벨(켜져 있을 때 「알림 끄기」)을
    쓰고 나머지 3종은 **상태형** 라벨(켜져 있을 때 「알림 켬」)을 써서 같은 화면에서 같은
    "켜짐"이 정반대 문구·정반대 색으로 보였다(사용자가 실제로 헷갈려 신고). 지금은 넷 다
    스위치를 쓰므로 **새 on/off UI를 만들 때 자체 버튼을 만들지 말 것** — 문구로 상태를
    표현하는 순간 이 혼동이 되살아난다. 스위치 트랙에 켬/끔 텍스트를 넣는 것도 같은 이유로
    금지(「지금 상태」인지 「누르면 될 상태」인지 다시 모호해진다).
16. **분기 실적 차트가 2곳** (Phase 82) — `analysis/AnalysisCharts`의 「실적」 차트(연환산/
    연간/분기 탭, **확정만**)와 `feeds/EarningsFocusChart`(분기 전용, **확정+잠정 결합**).
    합치지 않은 이유는 데이터가 다르기 때문이다 — 실적 탭은 확정에 아직 없는 최신 분기를
    잠정으로 이어 붙이는 게 존재 이유고, 종목분석은 감사 완료 수치만 보여야 한다.
    **매출액·영업이익 색과 억원 축약(1조 이상 "조" 롤업)은 두 파일에 같은 값으로 중복**되니
    디자인을 바꾸면 함께 고친다. 확정 데이터 자체는 `analysis/overview.ts` 캐시를 공유해
    중복 조회는 없다.

17. **DART 서식은 "파싱 성공"과 "값 있음"이 다르다** (Phase 84) — 서식이 빈 칸을 `-`로
    채워 보내므로 정규식이 매치됐다고 값이 들어온 게 아니다. 실적발표 안내(「2. 정보제공내역」)는
    표본 24건에서 **서식 24/24 파싱 · 값이 실제로 있는 건 5건**이었다(중소형주는 "-"나
    "공정공시 후 수시제공"). 그래서 판정을 `feeds/earnings.ts`의 `isBlankDartCell`
    하나로 모아 **리더(`earningsFocus`)와 화면(`FeedTabsClient`)이 같은 기준**을 쓴다 —
    한쪽만 빠뜨리면 그 화면에만 빈 줄이 줄줄이 생긴다. 같은 이유로 **날짜를 정규화하지
    않는다**: `2026년 7월 30일(목)`·`2026-07-30`·`공정공시 후 수시제공`이 한 칸에 섞여 와
    파싱해 재조립하려 들면 값을 망가뜨린다.

18. **뉴스는 소비처마다 수집 규칙이 다르다** (Phase 84) — `market:news:{code}`(뉴스 탭)와
    `market:earningsNews:{code}`(실적 탭)는 **같은 네이버 API를 쓰지만 쿼리·정렬·필터·
    보관 필드가 전부 다르다**(종목명/`"종목명" "영업이익"`, date/sim, 매 회차/발표 후 7일,
    제목만/요약 포함). 한쪽 규칙을 다른 쪽에 적용하면 조용히 나빠진다 — 실적 탭에 date를
    쓰면 발표 당일 시황 기사가 앞을 채우고, 뉴스 탭에 요약을 저장하면 값만 커진다.
    ⚠️ **네이버는 쿼리에 종목명이 있어도 다른 종목 기사를 준다**(실측: `현대차 2분기 실적`에
    LG엔솔 3건). `earningsNews.ts`의 점수제가 이걸 뒤로 미는 장치이며, 제목 매칭을
    **필수로 걸지 않은 건** "삼전 2분기 영업익"·"하이닉스 2분기 영업이익" 같은 축약형
    제목이 흔해서다. 대신 3점(제목에 종목명+실적어) 기사가 부족한 종목에서는 2점 기사가
    자리를 채우므로 실적 기사가 아닌 건이 섞일 수 있다(실측 현대차 5건 중 2건).

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
- **`S`(금선물) 카테고리는 죽은 피드다** (§88 실측 2026-07-30) — output2가 비는 데서
  그치지 않고 **값 자체가 2023년에 정지**했다(S/M0401 WTI 105.24가 2026-07-11 실측과
  동일 · S/M0101 금 1,928.60 vs 정상 N/NYGOLD 4,097.00). 마스터의 `E`접두 32종
  (백금·팔라듐·납·니켈·주석·설탕·대두·소맥…)이 **이 카테고리에만** 있어 우회가 없고,
  같은 코드를 `N`에 넣으면 `rt_cd=0`이면서 값이 `0.00`으로 온다. **다시 시도하지 말 것.**
- **해외선물 시세는 거래소별 신청 계좌가 아니면 막힌다** (§88) — NYMEX `EGW00551`·
  CBOT `EGW00552`. ICE만 열려 있으나 `output1`의 **전일 정산가 한 값**뿐이고 분봉
  (`output2`)은 파라미터 6조합 모두 빈 응답이라 등락률을 자체 계산해야 한다(+월물 롤오버).
- **환율 마스터의 ISO 코드가 뒤바뀐 쌍이 있다** (§88) — `FX@INR`이 인도네시아
  루피아(18,054) · `FX@IDR`이 인도 루피(95.49). 한글명은 값과 맞고 알파벳만 반대다.
  상식대로 `IDR`을 쓰면 인도 값이 들어온다.
- **국내 금 현물은 국내주식 현재가 API로 온다** (§88) — `J/M04020000`("금 99.99_1kg",
  원/g. 미니금은 `M04020100`). 접두 `M`이 없는 `04020000`은 값이 0이고, 이 응답에는
  영업일 필드가 없어 기준일은 같은 회차 KOSPI `basDt`를 쓴다.
- KIS 문자열 숫자·부호 코드는 반드시 `parseNum`+`applyKisSign` 경유.

### 9.4 시간·스케줄 규칙

- KIS 호출 허용 창: **KST 평일 09:00~18:40** (`isWithinKisCallWindow`). 확정 회차 판정은
  **KST 15:35 이후** (`isConfirmedRound`).
- **배지 판정(2026-07-13 개정)**: 고정 시간창(구 `isWithinBadgeWindow` ~18:20)·"N분 경과"
  방식을 폐기하고, 시세 잡 스케줄(09:00~15:30 10분 + 15:40 + 18:15)을 코드 상수화해
  "예정된 갱신이 지났는데도 누락된 경우"에만 배지를 띄운다. **정상 휴지 구간(15:40~18:15,
  장 마감 후·주말)에는 마지막 갱신이 오래돼도 배지가 뜨지 않는다.** `SCHEDULE_MINUTES`
  상수는 외부 QStash 등록과 반드시 일치시켜야 한다(스케줄 변경 시 동반 수정 — §8.13 결합점).
- **자동 새로고침도 같은 상수를 쓴다** (Phase 77) — `ui/AutoRefresh`가 `nextScheduledRefreshMs`로
  다음 예정 회차를 구해 그 전까지는 서버를 부르지 않는다. 따라서 `SCHEDULE_MINUTES`가
  실제 QStash 등록과 어긋나면 배지 오판정뿐 아니라 **자동 새로고침 시점도 함께 어긋난다**
  (결합점이 하나 늘었다). 다만 회차를 놓쳐도 다음 회차에 복구되고, 탭 복귀 시점 확인이
  별도로 걸려 있어 영구적으로 묵은 화면이 남지는 않는다.
- **회차 안에서 다시 갈라지는 갱신도 있다** (§88·§89·§90) — 글로벌 지표 28종은
  `GLOBAL_TABLE_ROUND_MINUTES`(09:00·15:40·18:15 + 9분 창, `isGlobalTableRound`)에 걸린
  회차에서만 갱신한다. 해외 지수·상품은 전일 종가가 하루 한 번 바뀔 뿐이라 42회차 전부
  갱신하면 22콜 × 42 = **+924콜/일**이 되고, 3회차로 묶으면 +66콜/일이다. 이 상수 역시
  `SCHEDULE_MINUTES`에 실재하는 슬롯이어야 한다(없는 시각을 넣으면 영구 미갱신) —
  결합점이 하나 더 늘었다. **신규 잡 라우트를 만들지 않은 이유**는 AGENTS.md §2의
  "잡 6종" 규칙을 고치지 않기 위함이다.
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
  **oil·gold·btcUsd·dxy는 null 허용** (나중에 추가된 키 — 새 지표 추가 시 같은 전략 참고).
  oil·gold·btcUsd는 §33에서 홈 글로벌 지표 카드 4행 목록으로 합류(null이면 행 생략),
  dxy는 §85에서 원/달러 카드 보조줄로 합류(null이면 줄 생략), btcKrw는 홈 미사용.
  글로벌 지표 카드 staleness 배지는 금리·유가·금 3종 기준 — btcUsd는 잡 `ok` 게이팅 밖
  외부 지표라 제외 (§30 dxy 관례). **dxy도 배지·`asOf` 판정에서 제외**(§85) — 홈에
  표시하지만 판정에는 넣지 않는 건 btcUsd와 같은 취급이다.
- **dxy의 기준일은 원/달러보다 하루 밀리는 것이 정상이다**(§85 실측 2026-07-30: usdkrw
  `20260730` vs dxy `20260729`). 통화쌍 6종의 기준일 교집합에서만 계산하는 구조라(§28)
  장중에는 당일 행이 아직 6종 모두 채워지지 않는다. **원/달러 카드 보조줄은 기준일을
  표시하지 않으므로**(§85.1 사용자 확정 — §85에서는 병기했다가 제거) 장중에 원/달러
  하락과 `DXY` 상승이 한 카드에 동시에 보일 수 있다 — 버그가 아니라 이 시차다.
- 비트코인은 24시간 거래 자산이지만 갱신은 시세 잡 시간창(평일 09:00~18:40)에만 —
  주말·야간 화면은 마지막 회차 시세(각주 안내, 사용자 확정 §30). 달러 표기는 업비트
  USDT-BTC 마켓 시세(USDT≈USD).
- 알림(Web Push)은 **Phase 10 3단계까지 전부 구현** — PWA·구독 등록·발송
  유틸(`lib/push/*`)·`/alerts` 화면(1단계) + 시세 알림 조건 3종·신고가 추적·2시간
  쿨다운(2단계, `lib/alerts/evaluate.ts`) + 공시 8유형·KRX 시장경보·**실적 6유형**(3단계,
  `lib/alerts/feedAlerts.ts` — `refreshFeeds` 훅, 종목별 전역 커서로 중복 차단,
  첫 회차는 기준점만 저장하고 발송 안 함). 시세·공시·시장경보·실적 알림 모두
  보유+관심종목 대상(시세 조건 1의 기준가만 보유=매입가/관심=등록가로 다름 —
  등록가 미확정이면 그 조건만 skip)이며 `alerts:{email}:muted` 음소거
  목록(보유·관심 토글)을 셋이 공유한다. 시장경보는 KIS 추가 호출 없이
  `market:stock:{code}` raw의 경보 필드 6종 회차 간 비교로 감지.
- **알림 on/off 축은 3개**(Phase 73): ① 기기 단위 푸시 구독(`PushSubscriptionManager` —
  해지하면 발송 주소 자체가 사라져 어떤 알림도 못 온다) ② **알림 종류**
  **5종**(`alerts:{email}:prefs` — 시세 급락·공시·시장경보·배당·**실적**, 실적은 Phase 81)
  ③ 종목 단위 음소거(`alerts:{email}:muted`). **5종 모두 ②·③을 둘 다 통과해야 발송된다**
  (Phase 79 — Phase 73의 배당 예외 폐기, 사용자 확정 번복). 두 축은 직교한다:
  ②는 **모든 종목에** 걸리는 전역 축, ③은 그 위에 종목 단위로 걸리는 AND 게이트.
  그래서 "전체 알림은 끄고 배당만 받기"는 구독을 유지한 채 종류 4개를 끄면 되고,
  "이 종목만 조용히"는 종목별 토글 하나로 그 종목의 5종이 전부 멈춘다.
  **종류를 늘려도 마이그레이션이 필요 없다** — `getAlertPrefs`가 기본값 위에 저장값을
  덮어 반환하고(부분 저장 허용), `saveAlertPrefs`는 전부 켬이면 키를 지운다.
- **배당 알림은 「배당 공시 + 지급일 당일」 한 종류로 묶여 있다**(Phase 73) — DART
  공시 8유형 중 「배당」 매칭분은 공시 알림에서 빠져나와 배당 쪽으로 가고(같은 공시가
  두 번 가지 않게 배타 분기), 지급일 알림과 같은 스위치(`prefs.dividend`)를 쓴다.
  토글은 `/alerts`의 「알림 종류」와 배당 페이지 「내 배당」 탭 두 곳에 있고 **같은 키**다.
- **배당 지급일 당일 알림(§25, `lib/alerts/dividendAlerts.ts` — `refreshFeeds` 훅)은
  예외적으로 보유종목만 대상**(관심종목 제외 — 사용자 확정).
  중복 방지는 종목×지급일 전역 마커(`alerts:dividend:sent:*`, EX 2일)로 발송 전 기록.

### 9.6 프런트 규칙

- Tailwind 금지, CSS Modules + `tokens.css` 토큰. 등락색은 rise=빨강/fall=파랑 (한국식).
- Client Component는 차트 셸 3종 + ThemeToggle + `feeds/FeedTabsClient`(Phase 17-2 —
  탭 전환·아코디언은 서버로 못 옮기는 정당한 최소 Client 예외) + `feeds/EarningsStockPicker`
  (Phase 83 — `<select onChange>`라 Client가 강제된다) + `nav/MenuSidebar`(Phase 18 —
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
