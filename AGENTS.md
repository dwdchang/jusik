<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:jusik-constitution -->
# jusik 프로젝트 AI 가이드라인 (헌법)

`.cursorrules`와 동일한 규칙. 상세 구현은 `research.md`, `plan.md`를 따른다.

## 1. 기술 스택 및 환경

- Next.js 16.2.6 (App Router, `src/app`), React 19.2.4, TypeScript Strict
- **Tailwind CSS 절대 금지** — 순수 CSS + CSS Modules만
- 디자인 토큰: `src/styles/tokens.css` · 숫자 UI: `globals.css`의 `.numeric` (`tabular-nums`)

## 2. API 및 보안 (한국투자증권 KIS OpenAPI)

- `KIS_APP_KEY`/`KIS_APP_SECRET`·`HOLDINGS_ENCRYPTION_KEY`·`CRON_SECRET` 등 모든 키는 서버 전용 · `NEXT_PUBLIC_` 금지
- KIS 호출은 QStash 갱신 잡 2종(`/api/jobs/refresh-market-data`, `/api/jobs/refresh-hot-stocks`) 경유만 허용 — 화면(Server Component)·Server Action은 KIS를 직접 호출하지 않고 Redis 스냅샷만 읽는다
- KIS 응답의 문자열 숫자·부호 코드는 항상 `parseNum`/`applyKisSign`(`lib/indices/kisMapper.ts`) 경유

## 3. 컴포넌트 · React 19

- 페칭·로직: Server Component 우선 · Recharts만 Client (`'use client'`, 필요 시 `dynamic` + `ssr: false`)

## 4. 워크플로우

- 구현 전 `research.md` + `plan.md` 필독 · 승인된 Phase만 진행 · 파일 단위로 작성·검토
- plan.md — Phase 단위 작업 이력. research.md — 현재 코드 구조 스냅샷(§1~10, 시간 무관, 항상 최신 유지).

## 5. Push 전 검증 워크플로우

"push해줘" 요청을 받으면 항상 아래 순서로 진행한다:

1. lint·typecheck 통과 확인
2. 커밋될 변경사항에 API 키, 토큰, 비밀번호 등 민감정보가 포함되어 있는지 확인 (`git diff --staged` 검토)
3. `npm audit` 실행 — high 이상 심각도의 알려진 취약점이 있으면 사용자에게 알리고 진행 여부 확인
4. 문제없으면 의미 단위로 커밋 메시지를 나누어 커밋 후 push

## 6. 보안 코드 리뷰 (요청 시 수행)

"보안 검토해줘" 또는 "보안 검증하고 push해줘" 요청을 받으면, 위 Push 전 검증 워크플로우에 더해 아래를 추가로 수행한다:

1. API 라우트에 인증 없이 접근 가능한 엔드포인트가 있는지 확인
2. 외부 입력(URL 파라미터, 헤더 등)을 검증 없이 그대로 사용하는 부분이 있는지 확인
3. 사용자 입력을 렌더링하는 부분이 있다면 `dangerouslySetInnerHTML` 같은 위험한 패턴을 쓰는지 확인
4. 발견된 사항은 심각도와 함께 정리해서 보고하고, push 진행 여부를 사용자에게 확인받는다
<!-- END:jusik-constitution -->
