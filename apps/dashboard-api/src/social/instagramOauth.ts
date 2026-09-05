/// Instagram OAuth via Facebook Login for Business - there's no direct
/// "Instagram login" for publishing; the connected identity is actually a
/// Facebook Page with a linked Instagram professional (Business/Creator)
/// account, resolved as a second hop after the initial token exchange. The
/// creator must have already converted to a Professional account and
/// linked a Page - see docs/SETUP.md's Instagram section, and the caller
/// (routes/socialConnections.ts) surfaces a clear error if no linked
/// Instagram account is found rather than silently connecting the wrong
/// thing. Not exercised against the live Graph API from this environment
/// (no egress to graph.facebook.com here); shapes match Meta's published
/// Graph API docs as of writing (v21.0).
export type ExchangedConnection = {
  platformUserId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

const GRAPH_VERSION = "v21.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function redirectUri(): string {
  const origin = process.env.DASHBOARD_API_ORIGIN || `http://localhost:${process.env.PORT ?? 4100}`;
  return `${origin}/api/social/instagram/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("META_APP_ID"),
    redirect_uri: redirectUri(),
    state,
    scope: "instagram_basic,instagram_content_publish,pages_show_list,business_management",
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<ExchangedConnection> {
  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");

  const shortLivedRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri(),
      code,
    })}`,
  );
  const shortLived = (await shortLivedRes.json()) as { access_token?: string; error?: { message: string } };
  if (!shortLivedRes.ok || !shortLived.access_token) {
    throw new Error(`Instagram OAuth token exchange failed: ${shortLived.error?.message ?? shortLivedRes.statusText}`);
  }

  // Exchange the short-lived user token for a long-lived one (~60 days)
  // right away - this is what expiresAt tracks, and what the "connection
  // will expire before your scheduled post goes out" check compares
  // against (see routes/posts.ts).
  const longLivedRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    })}`,
  );
  const longLived = (await longLivedRes.json()) as { access_token?: string; expires_in?: number; error?: { message: string } };
  if (!longLivedRes.ok || !longLived.access_token) {
    throw new Error(`Instagram long-lived token exchange failed: ${longLived.error?.message ?? longLivedRes.statusText}`);
  }
  const accessToken = longLived.access_token;

  // Resolve the linked Instagram Business/Creator account: the token is
  // for a Facebook user, who may manage several Pages, each of which may
  // (or may not) have an Instagram professional account linked.
  const pagesRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${new URLSearchParams({
      fields: "id,name,instagram_business_account",
      access_token: accessToken,
    })}`,
  );
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; instagram_business_account?: { id: string } }>;
    error?: { message: string };
  };
  if (!pagesRes.ok) throw new Error(`Instagram GET /me/accounts failed: ${pagesData.error?.message ?? pagesRes.statusText}`);

  const pageWithIg = pagesData.data?.find((page) => page.instagram_business_account);
  if (!pageWithIg?.instagram_business_account) {
    throw new Error(
      "No Instagram professional (Business/Creator) account is linked to any of your Facebook Pages. " +
        "Convert your Instagram account to Professional in the Instagram app, link it to a Facebook Page, then try connecting again.",
    );
  }
  const igAccountId = pageWithIg.instagram_business_account.id;

  const igRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${igAccountId}?${new URLSearchParams({ fields: "username", access_token: accessToken })}`,
  );
  const igData = (await igRes.json()) as { username?: string; error?: { message: string } };
  if (!igRes.ok) throw new Error(`Instagram account lookup failed: ${igData.error?.message ?? igRes.statusText}`);

  return {
    platformUserId: igAccountId,
    platformUsername: igData.username ?? igAccountId,
    accessToken,
    expiresAt: longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : undefined,
  };
}
