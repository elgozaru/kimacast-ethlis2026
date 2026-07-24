import "dotenv/config";
import type { InstagramPost, SourceArticle, SplitStory, StoredPaidContent } from "../agent/types.js";

const DEFAULT_HASHTAGS = ["#news", "#bbcnews", "#breakingnews", "#story402"];

export function buildInstagramPost(
  id: string,
  article: SourceArticle,
  story: SplitStory,
  stored: StoredPaidContent,
  priceUsd: number
): InstagramPost {
  const caption = [
    story.hook,
    "",
    story.freeTeaser,
    "",
    `🔓 Unlock the full story for $${priceUsd.toFixed(2)} - tap the link in bio.`,
    story.cta,
  ].join("\n");

  return {
    id,
    sourceUrl: article.url,
    section: article.section,
    caption,
    hashtags: [...DEFAULT_HASHTAGS, `#${article.section.toLowerCase().replace(/\s+/g, "")}`],
    paidContentUri: stored.storageUri,
    priceUsd,
  };
}

/**
 * Publishes via the Meta Graph API (Instagram Content Publishing API).
 * Only the free teaser + hook + CTA ever get posted publicly; the paid
 * body stays behind the x402 paywall and is only ever served from
 * 0G Storage after settlement.
 */
export async function publishToInstagram(post: InstagramPost, imageUrl: string): Promise<{ id: string }> {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const businessId = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !businessId) {
    return { id: `dry-run-${post.id}` };
  }

  const caption = `${post.caption}\n\n${post.hashtags.join(" ")}`;

  const container = await fetch(`https://graph.facebook.com/v21.0/${businessId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
  }).then((r) => r.json());

  const published = await fetch(`https://graph.facebook.com/v21.0/${businessId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
  }).then((r) => r.json());

  return { id: published.id };
}
