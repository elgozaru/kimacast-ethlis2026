/// Encrypts OAuth access/refresh tokens before they touch SocialConnection
/// rows - unlike X's static env-var credentials or Telegram's single bot
/// token, these are per-creator secrets sitting in Postgres, so they're
/// encrypted at rest rather than stored as plaintext columns. AES-256-GCM:
/// authenticated (tampering with the ciphertext fails decryption instead of
/// silently returning garbage), and doesn't need a separate MAC.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing required env var: SOCIAL_TOKEN_ENCRYPTION_KEY");
  // Accepts either a 64-char hex string or a base64 string that decodes to
  // 32 bytes - whichever's more convenient to generate
  // (`openssl rand -hex 32` vs `openssl rand -base64 32`).
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

/// Returns `${ivHex}:${authTagHex}:${ciphertextHex}` - a fresh random IV
/// every call, so encrypting the same token twice never produces the same
/// ciphertext (not that anything currently relies on that, but it's the
/// standard GCM hygiene rule: never reuse an IV under the same key).
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptToken(encoded: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Malformed encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
