# Phase 13 보안 검토 보고 (2026-07-11)

**결론: high 이상 취약점 및 push 차단 사유 없음.** 발견 사항은 moderate 의존성 취약점 1건(기존, Phase 13과 무관)과 정보성 참고 2건입니다.

## 1. 무인증 접근 가능 엔드포인트 — 문제 없음

- API 라우트는 여전히 2개뿐: `/api/auth/*`(NextAuth 자체 처리), `/api/cron/revalidate-indices`(proxy 매처 예외지만 라우트 내부에서 `CRON_SECRET` Bearer를 `timingSafeEqual`로 검증 — 길이 불일치 조기 반환 포함).
- 신규 `/holdings/[symbolCode]` 페이지는 proxy 매처 예외 목록에 없어 **미들웨어 인증 + 페이지의 `ensureAllowedSession` 이중 확인**을 통과해야 하고, 추가로 **본인이 보유하지 않은 종목코드는 `/holdings`로 리다이렉트**되므로 이 서비스를 임의 종목 조회기로 쓰는 것도 차단됩니다.
- Server Actions(`addHoldingAction` 등)는 페이지 인증과 별개로 `requireEmail`(세션 + `isEmailAllowed`)을 매번 재검증 — 액션 단독 호출 우회 불가.

## 2. 외부 입력 검증 — 문제 없음

- **URL 파라미터 `symbolCode`**: Redis 키(`stock:{code}:history`)·KIS 호출에 쓰이기 전에 항상 `/^\d{6}$/` 검증(상세 페이지·추가 액션 모두). KIS URL 조립은 `URLSearchParams`라 인코딩도 보장됩니다.
- **`?error=`**: `ERROR_MESSAGES[error] ?? null` 화이트리스트 조회만 하고 원본 값은 렌더링하지 않음. **`?edit=`**: `=== "1"` 엄격 비교.
- **폼 입력**: 수량은 양의 정수, 총 매입금액은 양의 유한수만 통과, `id`는 조회 키로만 사용. 중복 종목코드 차단.
- **KIS 응답값**(자동 저장되는 종목명 포함)은 JSX 텍스트로만 렌더링되어 React가 이스케이프합니다.

## 3. 위험 렌더링 패턴 — 신규 코드에 없음

`dangerouslySetInnerHTML`은 `layout.tsx`의 테마 초기화 스크립트 1곳뿐(기존 코드) — 정적 상수 문자열이고 사용자 입력이 섞이지 않아 안전합니다. Phase 13 신규/수정 파일에는 해당 패턴이 없습니다.

## 4. 민감정보 스캔 — 통과

diff에는 `process.env.KIS_APP_SECRET` 같은 **변수 참조만** 있고 실제 값은 없습니다. `.env.local`을 로드하던 임시 실측 스크립트 2개는 스크래치패드에서 삭제 완료했습니다.

## 5. npm audit — moderate 3건, low 1건 (high 이상 없음)

next가 의존하는 **postcss의 XSS advisory**(GHSA-qx2v-qp2m-jg93)가 원인입니다. `npm audit fix --force`는 next를 9.3.3으로 **다운그레이드**하는 잘못된 해법이라 실행하면 안 되고, 추후 next 패치 버전 업그레이드로 해소하는 게 맞습니다. 빌드 타임 CSS 처리 경로라 실사용 위험은 낮습니다.

## 참고 (조치 불요, 정보성)

- `stock:{symbolCode}:history`는 설계대로 평문 공용 키입니다 — 공개 시세 데이터라 암호화 대상이 아니며(plan.md §13.3), 개인 보유 정보(`holdings:{email}*`)는 기존 AES-256-GCM 암호화가 그대로 유지됩니다(store.ts 경계 무변경).
- cron 응답 JSON에 허용 이메일이 포함되지만 `CRON_SECRET` 인증 뒤에서만 노출됩니다(기존 동작).

lint·typecheck·build는 앞서 통과 확인했습니다. push 진행 시 의미 단위(13-2 모델 전환 / 13-3·13-4 폼·히스토리 / 13-5 상세 페이지 / 문서)로 커밋을 나눠 올립니다.
