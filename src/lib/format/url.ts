/**
 * 외부 링크 안전 검증 (Phase 84에서 공용화).
 *
 * 네이버 뉴스 링크(Phase 17-2)와 DART 원문에 적힌 회사 IR 홈페이지 URL(Phase 84)은
 * 둘 다 **외부가 준 문자열을 화면에서 `<a href>`로 그대로 렌더링**한다. `javascript:`
 * 같은 다른 스킴이 섞이지 않도록 저장 단계에서 걸러야 하는데, 같은 규칙을 API
 * 클라이언트마다 복제하면 한쪽만 고쳐질 수 있어 여기 하나로 모았다.
 */

/** http(s) URL만 통과 — 그 외 스킴·파싱 불가·빈 문자열은 null */
export function toSafeHttpUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  try {
    const { protocol } = new URL(trimmed);
    return protocol === "http:" || protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
