import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { Agent, Post } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { splitFreeGated } from "../content/split.js";
import { PUBLISHERS, type PublishResult } from "../social/publishers.js";

export const postsRouter = Router();

async function assertOwnedAgent(agentId: string, creatorId: string) {
  const agent = await getDb().agent.findFirst({ where: { id: agentId, creatorId } });
  if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
  return agent;
}

/// Turns one GenerationResult into a concrete, price-able Post by applying
/// the agent's free/gated split settings. This is the row
/// apps/resource-server serves through its existing
/// GET /api/stories/:postId/{teaser,full} route.
postsRouter.post("/generations/:generationId/posts", async (req: AuthedRequest, res) => {
  try {
    const result = await getDb().generationResult.findUnique({ where: { id: req.params.generationId } });
    if (!result) return res.status(404).json({ error: "not_found" });
    const agent = await assertOwnedAgent(result.agentId, req.creatorId!);

    const { teaser, full } = splitFreeGated(result.content as any, (agent.settings as any)?.freeGatedSplit);
    const priceTinybars = req.body.priceTinybars ?? (agent.settings as any)?.defaultPriceTinybars ?? "2000000";
    const sourceUrl = (result.content as any).source_url ?? "";

    const post = await getDb().post.create({
      data: {
        agentId: agent.id,
        generationResultId: result.id,
        teaser,
        full,
        priceTinybars: String(priceTinybars),
        sourceUrl,
        status: "pending",
      },
    });
    res.status(201).json(post);
  } catch (err) {
    respondError(res, err);
  }
});

postsRouter.get("/agents/:agentId/posts", async (req: AuthedRequest, res) => {
  try {
    const agent = await assertOwnedAgent(req.params.agentId, req.creatorId!);
    const posts = await getDb().post.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: "desc" } });
    res.json(posts);
  } catch (err) {
    respondError(res, err);
  }
});

async function setStatus(req: AuthedRequest, res: any, status: "approved" | "rejected") {
  const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
  if (!post) return res.status(404).json({ error: "not_found" });
  await assertOwnedAgent(post.agentId, req.creatorId!);
  const updated = await getDb().post.update({ where: { id: post.id }, data: { status } });
  res.json(updated);
}

postsRouter.post("/posts/:postId/approve", async (req: AuthedRequest, res) => {
  try {
    await setStatus(req, res, "approved");
  } catch (err) {
    respondError(res, err);
  }
});

postsRouter.post("/posts/:postId/reject", async (req: AuthedRequest, res) => {
  try {
    await setStatus(req, res, "rejected");
  } catch (err) {
    respondError(res, err);
  }
});

/// Publishes an approved post's teaser (the free hook) to every channel the
/// agent has enabled (agent.settings.socialChannels, defaulting to just
/// ["x"] for agents created before multi-channel publishing existed), and
/// returns the gated URL the caption should link to - the URL that, when a
/// viewer taps it and hits "Unlock", triggers the x402 flow against
/// apps/resource-server / apps/facilitator. An unrecognized channel name
/// (e.g. a settings value from before a channel was removed) is skipped
/// rather than failing the whole publish. Shared between the manual
/// publish route below and runScheduledPublishes()'s automatic publish.
async function publishPost(post: Post, agent: Agent, dryRun?: boolean) {
  const webOrigin = process.env.WEB_APP_ORIGIN || "http://localhost:3000";
  const unlockUrl = `${webOrigin}/p/${post.id}`;
  const baseText = `${post.teaser}\n\n${unlockUrl}`;
  const settings = agent.settings as any;
  const channels: string[] = settings?.socialChannels ?? ["x"];

  const results: Record<string, PublishResult> = {};
  for (const channel of channels) {
    const publisher = PUBLISHERS[channel];
    if (!publisher) continue;
    // X's 280-char limit doesn't apply to Telegram (4096); truncate per
    // channel rather than to the tightest common denominator.
    const text = channel === "x" ? baseText.slice(0, 280) : baseText.slice(0, 4000);
    results[channel] = await publisher(text, { dryRun, chatId: settings?.telegramChatId });
  }

  const updated = await getDb().post.update({
    where: { id: post.id },
    data: { status: "published", publishedTweetId: results.x?.id ?? null, publishResults: results },
  });
  return { updated, unlockUrl, results };
}

postsRouter.post("/posts/:postId/publish", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "approved") return res.status(409).json({ error: "post_not_approved" });
    const agent = await assertOwnedAgent(post.agentId, req.creatorId!);

    const { updated, unlockUrl, results } = await publishPost(post, agent, req.body.dryRun);
    res.json({ ...updated, unlockUrl, results });
  } catch (err) {
    respondError(res, err);
  }
});

/// Queues an approved post to auto-publish at a future time instead of
/// requiring a creator to come back and click Publish themselves -
/// runScheduledPublishes() (called on a timer from index.ts) does the
/// actual publishing once scheduledFor arrives.
postsRouter.post("/posts/:postId/schedule", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "approved") return res.status(409).json({ error: "post_not_approved" });
    await assertOwnedAgent(post.agentId, req.creatorId!);

    const scheduledFor = new Date(req.body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ error: "scheduledFor must be a valid date/time" });
    }

    const updated = await getDb().post.update({
      where: { id: post.id },
      data: { status: "scheduled", scheduledFor },
    });
    res.json(updated);
  } catch (err) {
    respondError(res, err);
  }
});

/// Reverses schedule(): back to "approved", no scheduledFor. Cheap safety
/// valve for "I changed my mind about the timing" without losing approval.
postsRouter.post("/posts/:postId/unschedule", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "scheduled") return res.status(409).json({ error: "post_not_scheduled" });
    await assertOwnedAgent(post.agentId, req.creatorId!);

    const updated = await getDb().post.update({
      where: { id: post.id },
      data: { status: "approved", scheduledFor: null },
    });
    res.json(updated);
  } catch (err) {
    respondError(res, err);
  }
});

/// Publishes every post whose scheduledFor has passed. Called on a timer
/// from index.ts, not an HTTP route - each post is handled independently
/// (one failure is logged and skipped, not allowed to block the rest of
/// the batch or crash the poller).
export async function runScheduledPublishes(): Promise<void> {
  const due = await getDb().post.findMany({
    where: { status: "scheduled", scheduledFor: { lte: new Date() } },
    include: { agent: true },
  });
  for (const post of due) {
    try {
      await publishPost(post, post.agent);
    } catch (err) {
      console.error(`[dashboard-api] scheduled publish failed for post ${post.id}:`, err);
    }
  }
}

/// State counts for an agent's suggestions/posts: "new" is a GenerationResult
/// with no Post created from it yet (see routes/content.ts's
/// GET /agents/:agentId/generations for the per-item equivalent); the rest
/// are Post.status values.
postsRouter.get("/agents/:agentId/metrics", async (req: AuthedRequest, res) => {
  try {
    const agent = await assertOwnedAgent(req.params.agentId, req.creatorId!);

    const newCount = await getDb().generationResult.count({
      where: { agentId: agent.id, posts: { none: {} } },
    });
    const postCounts = await getDb().post.groupBy({
      by: ["status"],
      where: { agentId: agent.id },
      _count: { _all: true },
    });

    const counts: Record<string, number> = { new: newCount, approved: 0, rejected: 0, scheduled: 0, published: 0, pending: 0 };
    for (const row of postCounts) counts[row.status] = row._count._all;

    res.json(counts);
  } catch (err) {
    respondError(res, err);
  }
});

function respondError(res: any, err: unknown) {
  const status = (err as any)?.status ?? 500;
  res.status(status).json({ error: (err as Error).message });
}
