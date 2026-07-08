# KIS 지수 API 장 마감 후 갱신 여부 조사 (완료)

## 목적

`fetchKisIndexDaily`(KOSPI/KOSDAQ)가 15:30(KRX 마감) 이후에도 값이 갱신되는지,
아니면 그 이후엔 동일 값만 반복하는지 확인. 넥스트레이드(NXT)가 20:00까지
운영되는데 이 시간대에 지수 자체가 갱신되는지가 핵심 질문.
이 결과를 바탕으로 plan.md에 "시간대별 캐시 최적화" Phase를 설계할 예정.

## 방법

- `src/lib/api/kis/client.ts`(`fetchKisIndexDaily`)와 `auth.ts`(토큰 캐시)의
  실제 로직을 그대로 재현한 독립 스크립트를 작성해 Next.js 캐시 레이어를
  거치지 않고 KIS API를 직접 호출
  - 스크립트: `scratchpad/kis-poll.mjs` (KOSPI/KOSDAQ의 `output1` 스냅샷 —
    현재가, 시가/고가/저가, 전일대비, 누적거래량을 KST 타임스탬프와 함께 기록)
  - 토큰은 실제 앱과 동일한 Upstash Redis 캐시(`kis:access_token`)를 REST API로
    직접 읽고 락 로직까지 재현해 공유
- 백그라운드 루프(`scratchpad/run-poll-loop.sh`)를 실행해 **2026-07-07 13:59부터
  20:35까지 5분 간격**으로 폴링, `scratchpad/kis-poll.log`에 JSON Lines로 누적 기록
  (총 80개 샘플, 15:30/20:00 전후 구간 모두 포함)

## 결론

- **15:30(KRX 정규장 마감) 이후 지수는 사실상 완전히 고정되며, NXT 마감 시각인
  20:00 전후로는 어떠한 갱신도 관찰되지 않았다.**
- 13:59~15:25: 장중이라 `prpr`(현재가)/`vrss`(전일대비)/`acml_vol`(누적거래량)
  모두 5분마다 정상적으로 변동.
- 15:35:00: 마감 후 마지막 변경 발생 (KOSPI 7612.78→7656.31, KOSDAQ
  830.56→831.23) — 마감 직후 최종 체결가가 반영된 것으로 추정.
- 15:40~18:05 (약 2.5시간): `prpr`/`vrss`/`acml_vol` 전부 15:35 값과 100% 동일,
  완전 동결.
- 18:10:27: `acml_vol`(누적거래량)만 소폭 갱신 (KOSPI 512294→516366, KOSDAQ
  536243→543545). 가격(`prpr`)과 전일대비(`vrss`)는 변동 없음 — 뒤늦게 반영된
  거래량 정정치로 추정.
- 18:10~20:30 (약 2시간 20분, 폴링 종료 시점까지): 다시 완전 동결. NXT 마감
  시각(20:00) 전후로도 변화 전혀 없음.
- 즉, KIS 지수 API는 NXT 시간대(15:30~20:00) 거래를 지수 값에 전혀 반영하지
  않는다.

## 캐시 정책 시사점

- 15:30 마감 직후 즉시 무기한 캐시하기보다, 마감 후 소폭 정정이 있었던
  15:35 / 18:10 구간을 고려해:
  - **15:30~18:30**: 짧은 TTL(5~10분 수준) 유지 — 마감 직후 및 뒤늦은 거래량
    정정 반영 대비
  - **18:30~다음 개장 전(09:00)**: 긴 캐시(수 시간~다음날 개장까지)로 전환
    가능 — 이 구간 이후로는 실제 값 변화가 전혀 없었음
- 다음 단계: 위 내용을 바탕으로 plan.md에 "시간대별 캐시 최적화" Phase를
  설계.

## plan.md Phase 8 확정 (2026-07-08)

시간대별 동적 TTL 초안은 폐기하고, 아래 방식으로 최종 확정해 `plan.md`에
반영함:

- **기본 캐시는 변경하지 않는다.** `unstable_cache`/fetch 레벨 모두 기존
  `KIS_CACHE_REVALIDATE_SECONDS = 600`(10분)을 09:00~다음 개장 전까지
  시간대 구분 없이 그대로 유지한다. (`unstable_cache`가 정의 시점에
  revalidate를 고정하는 한계 때문에 시간대별 동적 TTL 방식은 채택하지 않음.)
- 대신 **정확한 확정 시각에 강제 무효화하는 cron 2개**를 신설해 "10분 자동
  재검증 + 확정 시각 강제 갱신"을 병행한다:
  - **15:40 KST (평일 월~금)** — 15:35 마감 후 최종 체결가 확정 반영
  - **18:15 KST (평일 월~금)** — 18:10 누적거래량 정정치 확정 반영
- 두 cron 모두 Phase 4.7에서 제거했던 `api/cron/revalidate-indices/route.ts`
  구조(커밋 `0bcfdd7`의 부모 커밋 버전)를 그대로 재사용하되, 삭제된 legacy
  `CACHE_TAGS`(`lib/api/data-go-kr/constants`, Phase 5에서 제거됨) import만
  현재의 `KIS_CACHE_TAGS`(`lib/api/kis/constants`)로 교체.
- `CRON_SECRET` 인증 방식도 예전과 동일하게 유지.
- `vercel.json`을 새로 만들어 crons 배열에 2개 스케줄 등록:
  - `40 6 * * 1-5` (UTC) = 15:40 KST
  - `15 9 * * 1-5` (UTC) = 18:15 KST
- 공휴일 판단 로직은 넣지 않음 (평일이면 공휴일이어도 그냥 실행, 실질적
  비용 미미하므로).

## Phase 8 구현 완료 (2026-07-08)

승인 받아 8-1~8-5를 구현·로컬 검증까지 완료함 (8-6 프로덕션 배포 후 확인만
남음). `plan.md`도 완료 상태로 갱신(문서 버전 1.4).

**구현 파일:**
- `.env.local` — `CRON_SECRET` 신규 발급해 추가 (기존에 값 없었음)
- `src/app/api/cron/revalidate-indices/route.ts` (신규) — Phase 4.7에서 제거된
  버전(`0bcfdd7^`)을 복원, legacy `CACHE_TAGS` import만 `KIS_CACHE_TAGS`
  (`@/lib/api/kis/constants`)로 교체
- `vercel.json` (신규) — crons 2개(`40 6 * * 1-5` = 15:40 KST, `15 9 * * 1-5`
  = 18:15 KST) 등록
- `src/proxy.ts` — matcher 수정 (아래 발견 2)

**구현 중 발견 1 — `revalidateTag(tag, "max")`는 즉시 만료가 아니다:**

계획 초안 스니펫은 공식 예제를 따라 `"max"` 프로파일을 사용했는데, 로컬
검증(8-5) 중 크론 호출 직후 첫 요청이 여전히 이전 `asOf`를 반환하는 것을
발견함. `node_modules/next/dist/docs`의 `revalidateTag.md` 확인 결과,
`profile="max"`는 **stale-while-revalidate** 방식 — 태그를 stale로만 표시하고,
실제 재요청은 "그 태그를 쓰는 페이지가 다음에 방문될 때"에야 백그라운드로
트리거되며 그 방문 자체는 여전히 예전 값을 반환한다(한 번 더 방문해야 새
값). 문서가 정확히 "외부 시스템/webhook이 즉시 만료를 원하는 경우"를 위해
`revalidateTag(tag, { expire: 0 })`를 명시적으로 권장하고 있어 이걸로 교체.
로컬 재검증 결과 크론 호출 직후 첫 요청부터 바로 새 `asOf`가 반영됨을 확인함.

**구현 중 발견 2 — `proxy.ts` 인증 matcher가 `/api/cron`을 빠뜨림:**

Phase 7에서 설정한 matcher(`/((?!api/auth|_next/static|_next/image|favicon.ico).*)`)가
`/api/auth`만 예외 처리하고 있어서, 신설한 `/api/cron/revalidate-indices`도
인증 미들웨어에 걸려 세션 없는 요청(Vercel Cron 포함 모든 외부 호출)이 매번
`/login`으로 307 리다이렉트되고 라우트 핸들러(및 `CRON_SECRET` 검사)에
전혀 도달하지 못하는 문제를 발견함. 이대로면 프로덕션에서 cron이 실제로는
전혀 동작하지 않았을 것. `matcher`에 `api/cron`을 추가해 수정.

**로컬 검증 (build+start, `npm run build && npm run start`):**
- 무인증 호출 → `401 {"ok":false,"error":"Unauthorized"}`
- 오답 시크릿 → `401`
- 정답 `CRON_SECRET` → `200 {"ok":true,"revalidatedAt":...,"tags":["indices"],...}`
- `asOf` 갱신 확인용으로 임시 디버그 라우트(`/api/cron/debug-asof`, 실제
  `getDashboardData()`를 호출해 `asOf`만 반환)를 추가해 전후 비교 후 삭제:
  크론 호출 전 `asOf`가 고정 캐시값 → 크론 호출(`revalidatedAt: 05:34:54.097`)
  직후 첫 요청부터 새 `asOf`(`05:34:54.591`) 반영 확인
- `npx tsc --noEmit`, `npm run lint`, `npm run build` 모두 통과

**남은 작업:** 8-6 — Vercel 배포 시 `CRON_SECRET` env 등록, 15:40/18:15 KST
실제 cron 실행 로그와 `asOf` 갱신 여부 확인.

## Phase 8 보안 검토 (2026-07-08)

Phase 8 신규/변경 파일(`route.ts`, `proxy.ts`, `vercel.json`, `.env.local`)
중심으로 보안 검토 수행. 심각한 문제는 없음, 개선 권고 1건.

**1. 인증 없이 접근 가능한 엔드포인트:**
- `/api/cron/revalidate-indices` — 세션 프록시(`proxy.ts`)에서는 제외돼
  있지만, 라우트 자체에서 `CRON_SECRET`을 `timingSafeEqual`로 검증하므로
  실질적으로는 보호됨. 다만 **`proxy.ts`의 matcher가 `api/cron` 경로 전체를
  제외**하고 있어서(특정 라우트만이 아니라), 앞으로 `/api/cron/` 아래에
  자체 인증 로직 없는 라우트를 추가하면 그대로 공개될 위험이 있음.
  **낮음~중간 심각도** — 지금 당장 문제는 아니지만 matcher를
  `api/cron/revalidate-indices`처럼 구체적으로 좁히는 걸 권장.
- `/api/auth/[...nextauth]` — Auth.js 표준 OAuth 라우트, 공개 필요(정상).

**2. 외부 입력 검증:**
- cron 라우트는 `Authorization` 헤더만 읽고 길이 비교 후
  `timingSafeEqual`로 비교 — 쿼리 파라미터·바디 등 추가 입력 없음. 문제
  없음.
- 시크릿 없음/헤더 없음/길이 불일치 시 상수 시간 비교를 건너뛰므로 이론상
  아주 미세한 타이밍 사이드채널(토큰 길이 유추)이 있지만, 32바이트 랜덤
  시크릿에 실질적 위협은 아님 (예전 Phase 4 코드와 동일 패턴).

**3. 위험한 렌더링 패턴:**
- `dangerouslySetInnerHTML`은 `layout.tsx`의 테마 초기화 스크립트 1곳뿐이며,
  사용자 입력이 전혀 섞이지 않는 고정 문자열 — 문제 없음.

**4. 기타:**
- `CRON_SECRET`은 `.env.local`에만 있고 `.gitignore`로 제외됨 확인 — git에
  커밋 안 됨.
- `npm audit`: high/critical 없음 (moderate 3건, low 1건 —
  `@babel/core`/`js-yaml`/`postcss`·`next` 관련, 기존 의존성이라 이번
  변경과 무관).

**결론:** 심각한 문제 없음. 유일한 개선 권고는 `proxy.ts`의 `api/cron`
matcher를 `api/cron/revalidate-indices`로 좁히는 것(방어 심층화 차원) —
아직 적용 여부는 사용자 확인 대기 중.
