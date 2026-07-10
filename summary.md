# 보안 검토 결과 보고 (2026-07-10)

보안 검토 완료했습니다. **차단 사유(high 이상) 없음** — 발견 사항을 심각도와 함께 정리합니다.

## Push 전 검증 워크플로우

| 항목 | 결과 |
|---|---|
| 1. lint·typecheck | ✅ eslint·`tsc --noEmit` 모두 통과 |
| 2. 민감정보 | ✅ 없음 — 전체 diff(113KB)와 미추적 파일을 시크릿 패턴(키 형태 문자열·Bearer·upstash.io URL 등)으로 스캔, 검출 0건. 문서에는 env **변수명**만 언급되고 값 없음. `.env.local`은 git 제외 확인(이번 변경에 `.gitignore`에 `.env*.local` 추가된 것도 확인 — 바람직) |
| 3. npm audit | ⚠️ **high 이상 0건**, moderate 3·low 1 — 전부 Next.js 16.2.6이 내부 의존하는 postcss의 XSS advisory 체인입니다. 제시된 fix가 `next@9.3.3` 다운그레이드라 적용 불가하고, postcss는 빌드 타임 도구라 런타임 노출이 없어 실위험 낮음. Next 업그레이드 시 자연 해소될 항목으로 보고만 드립니다 |

## 보안 코드 리뷰 (추가 3항목)

1. **무인증 접근 가능 엔드포인트** — 문제 없음. API 라우트는 2개뿐: `/api/auth`(NextAuth 자체 처리), `/api/cron/revalidate-indices`(proxy 예외지만 라우트 내부에서 `CRON_SECRET` Bearer를 `timingSafeEqual`로 검증). 신규 페이지(`/holdings`, `/indices/*`)는 전부 미들웨어 인증 뒤에 있고, `/holdings`는 페이지(`ensureAllowedSession`)와 Server Action(`requireEmail`) **양쪽에서** 세션+허용목록을 재확인합니다 — 액션 단독 호출 우회 불가.
2. **외부 입력 검증** — 양호. Server Actions에서 `symbolCode` 6자리 정규식, `name` 1~50자, `quantity` 양의 정수, `avgPrice` 유한 양수 검증. `?error=` 쿼리 파라미터는 고정 메시지 사전(`ERROR_MESSAGES`)으로만 매핑되고 원문은 렌더링되지 않으며, 수정/삭제의 `id`는 본인 보유목록 내에서만 조회됩니다.
3. **위험 렌더링 패턴** — `dangerouslySetInnerHTML` 1곳(`layout.tsx` 테마 초기화 스크립트)뿐인데, 내용이 코드 상수만 포함한 정적 문자열이라 사용자 입력 유입 경로가 없습니다. 안전.

## Phase 12(암호화) 추가 점검

- `secureJson`은 `store.ts`에서만 import — 클라이언트 컴포넌트로 유입되는 경로 없음, 키는 서버 env에서만 읽고 키·암호문을 로그에 남기는 코드 없음. ✅

## 정보성 관찰 1건 (보안 이슈 아님)

- `addHoldingAction`의 KIS 실존 검증 호출(`fetchKisStockPrice`)은 Phase 11 확정사항(§11.10-A4: 실존 검증 제거)과 충돌하는 현재 코드입니다 — Phase 11 구현 시 제거 예정이므로 지금은 그대로 둡니다.

**결론: push를 막을 보안 문제는 발견되지 않았습니다.** 이대로 push를 진행할까요? 진행 시 의미 단위(Phase 9 구현 / Phase 11 설계 문서 / Phase 12 암호화)로 커밋을 나눠 올리겠습니다. 참고로 push 후 배포 전에 Vercel env에 `HOLDINGS_ENCRYPTION_KEY` 등록이 선행되어야 `/holdings` 저장 기능이 동작합니다.
