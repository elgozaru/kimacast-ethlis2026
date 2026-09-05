/// X (Twitter) OAuth 2.0 Authorization Code flow with PKCE - the per-creator
/// login that lets a creator connect their OWN X account, as opposed to
/// social/twitter.ts's static platform-level API keys (which still work as
/// a fallback when no SocialConnection is bound for a post's "x" channel -
/// see generation/providers.ts-style registry in social/publishers.ts).
/// Not exercised against the live X API from this environment - egress to
/// api.twitter.com wasn't available to verify the token exchange here; the
/// request/response shapes below match X's published OAuth 2.0 docs.
export type ExchangedConnection = {
  platformUserId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function redirectUri(): string {
  const origin = process.env.DASHBOARD_API_ORIGIN || `http://localhost:${process.env.PORT ?? 4100}`;
  return `${origin}/api/social/x/callback`;
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("X_OAUTH_CLIENT_ID"),
    redirect_uri: redirectUri(),
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<ExchangedConnection> {
  const clientId = requireEnv("X_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("X_OAUTH_CLIENT_SECRET");
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: codeVerifier,
    }),
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`X OAuth token exchange failed: ${tokenData.error_description ?? tokenRes.statusText}`);
  }

  const meRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const meData = (await meRes.json()) as { data?: { id: string; username: string } };
  if (!meRes.ok || !meData.data) {
    throw new Error(`X GET /users/me failed: ${meRes.statusText}`);
  }

  return {
    platformUserId: meData.data.id,
    platformUsername: meData.data.username,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
  };
}
