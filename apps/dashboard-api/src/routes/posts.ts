import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { splitFreeGated } from "../content/split.js";
import { publishTweet } from "../social/twitter.js";

export const postsRouter = Router();

async function assertOwnedAgent(agentId: string, creatorId: string) {
  const agent = await getDb().agent.findFirst({ where: { id: agentId, ownerAddress: creatorId } });
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

/// Publishes an approved post's teaser (the free hook) to X, and returns
/// the gated URL the caption should link to - the URL that, when a viewer
/// taps it and hits "Unlock", triggers the x402 flow against
/// apps/resource-server / apps/facilitator.
postsRouter.post("/posts/:postId/publish", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "approved") return res.status(409).json({ error: "post_not_approved" });
    await assertOwnedAgent(post.agentId, req.creatorId!);

    const webOrigin = process.env.WEB_APP_ORIGIN || "http://localhost:3000";
    const unlockUrl = `${webOrigin}/p/${post.id}`;
    const tweetText = `${post.teaser}\n\n${unlockUrl}`.slice(0, 280);

    const tweet = await publishTweet(tweetText, { dryRun: req.body.dryRun });
    const updated = await getDb().post.update({
      where: { id: post.id },
      data: { status: "published", publishedTweetId: tweet.id },
    });
    res.json({ ...updated, unlockUrl, tweet });
  } catch (err) {
    respondError(res, err);
  }
});

function respondError(res: any, err: unknown) {
  const status = (err as any)?.status ?? 500;
  res.status(status).json({ error: (err as Error).message });
}
