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

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return allowedEmails.has(email.trim().toLowerCase());
}
