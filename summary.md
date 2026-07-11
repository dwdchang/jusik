# Phase 11 구현 완료 보고 (2026-07-11)

그룹 1~8 전부 구현 완료했습니다. KIS 호출이 **QStash 갱신 잡 단일 경로**로 이관됐고, 화면은 이제 Redis만 읽습니다. lint·tsc·build와 로컬 실측(인증·KST 가드·staleness 12케이스) 모두 통과했으며, **배포 시 사용자 작업 4가지**(아래 체크리스트)가 남았습니다.

## 그룹별 구현 내역

- **G1 QStash 셋업**: `@upstash/qstash@2.11.1` 설치. 서명 키 env·콘솔 스케줄 등록은 배포 시 작업으로 정리(체크리스트).
- **G2 스토어·파이프라인**: `lib/market/store.ts`(`market:detail:{4종}`·`market:stock:{code}`·`market:stockInfo:{code}`·`market:lastRefreshAt`), `lib/market/staleness.ts`(KST 허용 창 09:00~18:40 / 배지 창 09:00~18:20 / 경고·심각 판정), `lib/jobs/refreshMarketData.ts` — 지수 4종→변동성→보유종목 union 중복 제거→종목별 스냅샷→종목명 채움→포트폴리오 upsert→알림 빈 훅(G8), 단계별 실패 격리, `basDt` 거래일 가드(A5).
- **G3 엔드포인트**: `POST /api/jobs/refresh-market-data` — QStash 서명 검증 + `CRON_SECRET` Bearer 폴백, 가드 밖 no-op 200, 데이터 실패 시 500(A6), `maxDuration 300`.
- **G4 읽기 경로**: `getDashboard`/`getIndexDetail`/`getOverseasDetail`/`valuation`/`getStockInfo` 전부 Redis 리더로 교체. KIS client는 전 함수 `no-store`(캐시 상수 삭제), `revalidate` export 6곳 제거. **A4 적용** — 종목 추가는 형식 검증만, 종목명은 잡이 다음 회차에 채우고(그 전엔 코드 표시), 시세 없는 종목은 「시세 없음」으로 격리·합계 제외.
- **G5 레거시 제거**: 기존 cron 라우트 삭제, `vercel.json` 삭제(crons만 있었음), proxy matcher 예외를 `api/jobs/refresh-market-data`로 교체.
- **G6 갱신 상태 UI**: 홈 카드 6개 우측 상단 2단계 배지(경고 20분~1시간 / 심각 1시간+, 장중에만, `--color-warning`/`--color-critical` 토큰 추가·다크 대응), 지수 상세·보유종목·종목 상세에 「마지막 갱신」 상시 표기, 빈 Redis empty state 문구.

## 구현 중 확정한 사항

1. **상세 정보 블록 4종도 잡 이관** (질문드려 승인받음): 밤·주말에 상세 페이지를 열어도 KIS 0콜. 가격 무관 부분(순위·배당·실적)은 `market:stockInfo:{code}`에 저장, 시가배당률 등 가격 의존 값은 읽기 시 계산.
2. **갱신 주기 차등**: 현재가 스냅샷은 매 회차, 종가 히스토리·정보 블록은 **15:40·18:15 확정 회차에만**(확정 종가 의미 유지 + 호출량 절감). 신규 종목은 어느 회차든 즉시 백필.
3. `market:lastRefreshAt`은 성공 실행만 기록 — 연속 실패 시 배지가 정확히 낡은 시각 기준으로 뜹니다.

## 검증 결과

- **KIS 직접 호출 경로 0건**: KIS client import는 잡 경로 3파일뿐임을 grep으로 확인. `unstable_cache`/`revalidateTag`/fetch 캐시 옵션/`revalidate` export 전부 0건.
- **엔드포인트 실측**: 무인증·오류 토큰 401, 유효 토큰 + 오늘(토요일) → `{"ok":true,"skipped":"outside KIS call window..."}` 200 — 가드가 설계대로 재시도 없이 스킵.
- **staleness 경계 12케이스** 단위 검증 전부 통과(창 경계 08:59/18:40/18:41/18:20/18:21, 주말 억제, 20분/1시간 경계).
- lint·tsc·build 통과, `/api/jobs/refresh-market-data` 라우트 생성 확인.

## 배포 체크리스트 (사용자 작업 — plan.md §11.11에도 기록)

1. **Vercel env**에 `QSTASH_CURRENT_SIGNING_KEY`·`QSTASH_NEXT_SIGNING_KEY` 등록(Upstash 콘솔 → QStash → Signing Keys). 로컬 `.env.local`에도 추가 권장(없으면 CRON_SECRET 폴백으로 동작).
2. **Upstash 콘솔 스케줄 4개** 등록 — Destination 전부 `https://{도메인}/api/jobs/refresh-market-data`(POST): `CRON_TZ=Asia/Seoul */10 9-14 * * 1-5`(Retries 1) / `0,10,20,30 15 * * 1-5`(Retries 1) / `40 15 * * 1-5`(Retries 0) / `15 18 * * 1-5`(Retries 1 + Retry Delay 5분).
3. **배포 직후 장중에 수동 1회 시딩**: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://{도메인}/api/jobs/refresh-market-data` — 시딩 전까지 홈·상세는 empty state 문구가 표시됩니다. 주말인 지금 배포하면 월요일 09:00 첫 회차 전까지 화면이 비므로 **장중 배포(또는 월요일 시딩)를 권장**합니다.
4. 첫 거래일에 스케줄 실행 로그·15:40/18:15 확정 반영·DLQ 비어있음 확인.

plan.md는 요약 표와 §11.11 작업 목록·완료 조건을 갱신했고, 완료 조건 중 "스케줄 실 실행"과 "회차 실패 자연 복구"만 배포 후 확인 항목으로 남겼습니다. 다음 단계로는 배포 후 Phase 10(알림) 착수 시 `evaluateAlertsHook` 빈 훅에 연결하면 됩니다.
