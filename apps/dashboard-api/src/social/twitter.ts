/// TS port of x-agent/twitter.js so the dashboard's "publish approved post"
/// action reuses the same, already-working X (Twitter) client instead of a
/// second implementation. Same env vars (X_API_KEY etc.), same dry-run
/// fallback behavior - see x-agent/README.md for credential setup and
/// troubleshooting (401 vs 402 causes, App permission gotchas, etc.).
///
/// Two credential paths: a per-creator OAuth 2.0 access token (from a
/// connected SocialConnection - see social/xOauth.ts), used as a plain
/// bearer token, when one is bound to this post's "x" channel; otherwise
/// the static platform-level OAuth 1.0a keys below, same as before
/// per-creator connections existed.
function isConfigured(): boolean {
  return Boolean(
    process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET,
  );
}

async function getClient(accessToken?: string) {
  const { TwitterApi } = await import("twitter-api-v2");
  if (accessToken) return new TwitterApi(accessToken);
  return new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  });
}

export async function publishTweet(
  text: string,
  { dryRun = false, accessToken }: { dryRun?: boolean; accessToken?: string } = {},
): Promise<{ id: string; text: string; posted: boolean }> {
  if (dryRun || (!accessToken && !isConfigured())) {
    return { id: `dry-run-${Date.now()}`, text, posted: false };
  }
  const client = await getClient(accessToken);
  const { data } = await client.v2.tweet(text);
  return { id: data.id, text: data.text, posted: true };
}
