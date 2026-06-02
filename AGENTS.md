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

## 2. API 및 보안 (공공데이터포털)

- `DATA_GO_KR_SERVICE_KEY` 서버 전용 · `NEXT_PUBLIC_` 금지 · 클라이언트에서 `apis.data.go.kr` 직접 호출 금지
- `items.item` → 항상 `ensureItemsArray`로 정규화

## 3. 컴포넌트 · React 19

- 페칭·로직: Server Component 우선 · Recharts만 Client (`'use client'`, 필요 시 `dynamic` + `ssr: false`)

## 4. 워크플로우

- 구현 전 `research.md` + `plan.md` 필독 · 승인된 Phase만 진행 · 파일 단위로 작성·검토
<!-- END:jusik-constitution -->
