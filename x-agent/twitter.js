import "dotenv/config";

function isConfigured() {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_TOKEN_SECRET
  );
}

async function getClient() {
  const { TwitterApi } = await import("twitter-api-v2");
  return new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

/**
 * Publishing Agent: posts to X. Falls back to a dry-run (no network call,
 * no real post) when X_* credentials aren't set, or when `dryRun` is
 * explicitly passed - posting is a public, hard-to-reverse action (and,
 * depending on your X plan, a billed one), so this only ever hits the
 * real API when credentials are configured AND dry-run wasn't requested.
 */
export async function publishTweet(text, { dryRun = false } = {}) {
  if (dryRun || !isConfigured()) {
    return { id: `dry-run-${Date.now()}`, text, posted: false };
  }

  const client = await getClient();
  const { data } = await client.v2.tweet(text);
  return { id: data.id, text: data.text, posted: true };
}

/**
 * Analytics Agent: pulls public metrics for a published tweet.
 */
export async function getTweetMetrics(tweetId, { dryRun = false } = {}) {
  if (dryRun || !isConfigured() || tweetId.startsWith("dry-run-")) {
    return { tweetId, impressions: null, likes: null, retweets: null, replies: null, dryRun: true };
  }

  const client = await getClient();
  const { data } = await client.v2.singleTweet(tweetId, {
    "tweet.fields": ["public_metrics"],
  });

  const metrics = data.public_metrics ?? {};
  return {
    tweetId,
    impressions: metrics.impression_count ?? null,
    likes: metrics.like_count ?? null,
    retweets: metrics.retweet_count ?? null,
    replies: metrics.reply_count ?? null,
    dryRun: false,
  };
}
