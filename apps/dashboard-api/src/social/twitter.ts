/// TS port of x-agent/twitter.js so the dashboard's "publish approved post"
/// action reuses the same, already-working X (Twitter) client instead of a
/// second implementation. Same env vars (X_API_KEY etc.), same dry-run
/// fallback behavior - see x-agent/README.md for credential setup and
/// troubleshooting (401 vs 402 causes, App permission gotchas, etc.).
function isConfigured(): boolean {
  return Boolean(
    process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET,
  );
}

async function getClient() {
  const { TwitterApi } = await import("twitter-api-v2");
  return new TwitterApi({
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  });
}

export async function publishTweet(
  text: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<{ id: string; text: string; posted: boolean }> {
  if (dryRun || !isConfigured()) {
    return { id: `dry-run-${Date.now()}`, text, posted: false };
  }
  const client = await getClient();
  const { data } = await client.v2.tweet(text);
  return { id: data.id, text: data.text, posted: true };
}
