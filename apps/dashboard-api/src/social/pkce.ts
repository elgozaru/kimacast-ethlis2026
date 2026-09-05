/// RFC 7636 PKCE helpers, shared by any OAuth 2.0 authorization-code flow
/// that needs it (currently just X - Instagram's Facebook Login for
/// Business flow doesn't use PKCE, only a client secret exchanged
/// server-side).
import { createHash, randomBytes } from "node:crypto";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function deriveCodeChallenge(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier).digest());
}

export function generateState(): string {
  return base64url(randomBytes(16));
}
