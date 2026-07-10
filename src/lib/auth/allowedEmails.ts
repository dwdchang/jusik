function parseAllowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0)
  );
}

const allowedEmails = parseAllowedEmails();

/** 허용 이메일 전체 목록 — cron 등 세션 밖 배치 작업용 */
export function getAllowedEmails(): string[] {
  return [...allowedEmails];
}

export function isEmailAllowed(
  email: string | null | undefined
): email is string {
  if (!email) {
    return false;
  }
  return allowedEmails.has(email.trim().toLowerCase());
}
