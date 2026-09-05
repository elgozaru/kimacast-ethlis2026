/// Instagram Graph API publisher - a real two-step call (create a media
/// container, then publish it), unlike X/Telegram's one-shot send.
/// Not exercised against the live Graph API from this environment.
///
/// Real constraint worth flagging: Instagram's Content Publishing API has
/// no text-only post type - every IMAGE container requires an image_url.
/// This pipeline's generation output (short_post/three_post_thread/
/// linkedin_summary) is text-only, so there's no image to attach yet.
/// Rather than silently dropping the post or guessing at a stock image,
/// this throws a clear, actionable error until an image-per-post feature
/// exists - see the imageUrl param below.
const GRAPH_VERSION = "v21.0";

export type InstagramPublishOptions = { accessToken: string; igUserId: string; imageUrl?: string; dryRun?: boolean };

export async function publishInstagramPost(
  caption: string,
  { accessToken, igUserId, imageUrl, dryRun = false }: InstagramPublishOptions,
): Promise<{ id: string; text: string; posted: boolean }> {
  if (dryRun) return { id: `dry-run-${Date.now()}`, text: caption, posted: false };

  if (!imageUrl) {
    throw new Error(
      "Instagram requires an image for every post (no text-only post type exists in the Graph API) - " +
        "this post has no attached image yet, so it can't be published to Instagram.",
    );
  }

  const containerRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
  });
  const containerData = (await containerRes.json()) as { id?: string; error?: { message: string } };
  if (!containerRes.ok || !containerData.id) {
    throw new Error(`Instagram media container creation failed: ${containerData.error?.message ?? containerRes.statusText}`);
  }

  const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
  });
  const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } };
  if (!publishRes.ok || !publishData.id) {
    throw new Error(`Instagram media_publish failed: ${publishData.error?.message ?? publishRes.statusText}`);
  }

  return { id: publishData.id, text: caption, posted: true };
}
