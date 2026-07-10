import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 개인 데이터 at-rest 암호화 유틸 — AES-256-GCM (인증 암호화, 위·변조 감지).
 * 저장 포맷: `enc:v1:{iv(base64)}:{authTag(base64)}:{ciphertext(base64)}`
 * 버전 프리픽스로 평문/암호문 구분(마이그레이션)과 향후 키 로테이션(v2)을 지원한다.
 * @see plan.md §12.1~12.3
 */

const ENC_PREFIX = "enc:v1:";
const IV_BYTES = 12; // GCM 권장 96bit — 같은 키로 재사용 금지, 매회 랜덤 생성
const KEY_BYTES = 32;
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const raw = process.env.HOLDINGS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("HOLDINGS_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `HOLDINGS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (base64)`
    );
  }
  return key;
}

/** `enc:v1:` 포맷 문자열인지 판별 — 레거시 평문(JSON 배열)과의 구분에 사용 */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("base64")}:${authTag.toString(
    "base64"
  )}:${ciphertext.toString("base64")}`;
}

/** 복호화 실패(키 불일치·값 손상)는 throw — 조용한 빈 값 반환 금지 (plan.md §12.3) */
export function decryptJson<T>(stored: string): T {
  if (!isEncrypted(stored)) {
    throw new Error("secureJson: value is not in enc:v1 format");
  }

  const [ivB64, tagB64, dataB64] = stored.slice(ENC_PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("secureJson: malformed enc:v1 payload");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}
