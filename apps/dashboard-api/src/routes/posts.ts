import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { Agent, Post } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { splitFreeGated } from "../content/split.js";
import { PUBLISHERS } from "../social/publishers.js";
import { CONNECTABLE_PLATFORMS, resolveDefaultConnectionId } from "../social/connectionDefaults.js";
import { decryptToken } from "../social/tokenCrypto.js";

export const postsRouter = Router();

/// A bound connection is considered too close to expiring to schedule
/// against once it would expire within this margin of the scheduled time -
/// catches both "will already be expired by then" and "expires suspiciously
/// soon after", giving the creator time to reconnect before the poller runs
/// into it. Purely an in-dashboard warning surfaced from /schedule's
/// response for now - no email/push channel exists yet to alert the
/// creator out-of-band if they don't happen to look.
const EXPIRY_WARNING_MARGIN_MS = 48 * 60 * 60 * 1000;

type PublicationWithConnection = Awaited<ReturnType<typeof loadPublications>>[number];

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

/// Binds this post's channels to concrete SocialConnections right now -
/// called once, at the moment the creator hits "Publish now" or "Schedule"
/// (never re-called for a post that already has publications), so a
/// scheduled post's account can't silently change if the creator
/// reconnects/revokes something before the scheduled time arrives.
/// `overrides` lets the creator pick something other than the derived
/// default for this one action; anything not overridden falls back to
/// resolveDefaultConnectionId.
async function createPublications(post: Post, agent: Agent, overrides: Record<string, string> = {}) {
  const channels: string[] = (agent.settings as any)?.socialChannels ?? ["x"];
  const rows = [];
  for (const channel of channels) {
    if (!PUBLISHERS[channel]) continue;
    const needsConnection = (CONNECTABLE_PLATFORMS as readonly string[]).includes(channel);
    const socialConnectionId = needsConnection
      ? (overrides[channel] ?? (await resolveDefaultConnectionId(agent.id, agent.creatorId, channel)))
      : null;
    rows.push(
      await getDb().postPublication.create({
        data: { postId: post.id, agentId: agent.id, channel, socialConnectionId, status: "pending" },
      }),
    );
  }
  return loadPublications(post.id);
}

function loadPublications(postId: string) {
  return getDb().postPublication.findMany({
    where: { postId },
    include: { socialConnection: { select: { platform: true, platformUserId: true, platformUsername: true, expiresAt: true } } },
  });
}

/// Reuses this post's already-bound publications if it was scheduled
/// earlier (manual "Publish now" on a still-pending scheduled post honors
/// that binding rather than silently re-resolving it); otherwise this is
/// the first publish/schedule action for the post, so binds fresh.
async function getOrCreatePublications(post: Post, agent: Agent, overrides?: Record<string, string>) {
  const existing = await loadPublications(post.id);
  if (existing.length > 0) return existing;
  return createPublications(post, agent, overrides);
}

function warningsForPublications(scheduledFor: Date, publications: PublicationWithConnection[]) {
  const warnings: { channel: string; message: string }[] = [];
  for (const pub of publications) {
    const expiresAt = pub.socialConnection?.expiresAt;
    if (!expiresAt) continue;
    if (expiresAt.getTime() - scheduledFor.getTime() < EXPIRY_WARNING_MARGIN_MS) {
      const already = expiresAt.getTime() < scheduledFor.getTime();
      warnings.push({
        channel: pub.channel,
        message: already
          ? `@${pub.socialConnection?.platformUsername}'s ${pub.channel} connection will have already expired by the scheduled time - reconnect it before this post goes out.`
          : `@${pub.socialConnection?.platformUsername}'s ${pub.channel} connection expires within 48 hours of the scheduled time - reconnect it soon so this post doesn't fail.`,
      });
    }
  }
  return warnings;
}

/// Runs every bound publication for a post: sends through the matching
/// channel publisher (using the publication's bound connection's decrypted
/// token, if any), and records the real per-channel outcome. A connection
/// that's expired by the time this actually runs fails that one channel
/// with a clear reason instead of throwing and losing every other
/// channel's result. Post.status only flips to "published" if at least one
/// channel actually went out; "failed" if every bound channel didn't,
/// so the creator sees something needs attention rather than a silent
/// no-op reported as success.
async function executePublications(post: Post, agent: Agent, publications: PublicationWithConnection[], dryRun?: boolean) {
  const webOrigin = process.env.WEB_APP_ORIGIN || "http://localhost:3000";
  const unlockUrl = `${webOrigin}/p/${post.id}`;
  const baseText = `${post.teaser}\n\n${unlockUrl}`;
  const settings = agent.settings as any;

  // The connections included on `publications` deliberately omit
  // accessTokenEnc (loadPublications' results also flow straight back into
  // API responses - see /publish and /schedule below - so they must never
  // carry an encrypted token). Fetch the encrypted tokens for just the
  // connections actually bound here, in one batched query.
  const connectionIds = publications.map((p) => p.socialConnectionId).filter((id): id is string => Boolean(id));
  const tokensByConnectionId = new Map(
    (await getDb().socialConnection.findMany({ where: { id: { in: connectionIds } }, select: { id: true, accessTokenEnc: true } })).map(
      (c) => [c.id, decryptToken(c.accessTokenEnc)],
    ),
  );

  for (const pub of publications) {
    if (pub.status !== "pending") continue;
    try {
      if (pub.socialConnection?.expiresAt && pub.socialConnection.expiresAt.getTime() < Date.now()) {
        throw new Error(`Connection expired at ${pub.socialConnection.expiresAt.toISOString()} - reconnect and retry.`);
      }
      const publisher = PUBLISHERS[pub.channel];
      const text = pub.channel === "x" ? baseText.slice(0, 280) : baseText.slice(0, 4000);
      const accessToken = pub.socialConnectionId ? tokensByConnectionId.get(pub.socialConnectionId) : undefined;
      const result = await publisher(text, {
        dryRun,
        chatId: settings?.telegramChatId,
        connection:
          pub.socialConnection && accessToken ? { accessToken, platformUserId: pub.socialConnection.platformUserId } : undefined,
      });
      await getDb().postPublication.update({
        where: { id: pub.id },
        data: { status: "published", platformPostId: result.id, publishedAt: new Date() },
      });
    } catch (err) {
      await getDb().postPublication.update({
        where: { id: pub.id },
        data: { status: "failed", errorMessage: (err as Error).message },
      });
    }
  }

  const finalPublications = await loadPublications(post.id);
  const anyPublished = finalPublications.some((p) => p.status === "published");
  const updated = await getDb().post.update({
    where: { id: post.id },
    data: { status: anyPublished ? "published" : "failed" },
  });
  return { updated, unlockUrl, publications: finalPublications };
}

/// Publishes an approved (or still-pending-scheduled) post's teaser through
/// every bound channel. `connections` in the body ({ x: "conn_id", ... })
/// overrides the derived default per channel for a fresh publish; ignored
/// if this post was already bound at schedule time (see
/// getOrCreatePublications above).
postsRouter.post("/posts/:postId/publish", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "approved" && post.status !== "scheduled" && post.status !== "failed") {
      return res.status(409).json({ error: "post_not_approved" });
    }
    const agent = await assertOwnedAgent(post.agentId, req.creatorId!);

    // Retrying a "failed" post: give its previously-failed channels (only -
    // any that already succeeded stay untouched) a fresh pending attempt,
    // reusing the same bound connections rather than re-resolving them.
    if (post.status === "failed") {
      await getDb().postPublication.updateMany({
        where: { postId: post.id, status: "failed" },
        data: { status: "pending", errorMessage: null },
      });
    }

    const publications = await getOrCreatePublications(post, agent, req.body.connections);
    const { updated, unlockUrl, publications: finalPublications } = await executePublications(
      post,
      agent,
      publications,
      req.body.dryRun,
    );
    res.json({ ...updated, unlockUrl, publications: finalPublications });
  } catch (err) {
    respondError(res, err);
  }
});

/// Queues an approved post to auto-publish at a future time instead of
/// requiring a creator to come back and click Publish themselves. Binds
/// this post's channels to concrete connections right now (see
/// createPublications) rather than waiting until runScheduledPublishes()
/// actually fires - and warns (without blocking) if a bound connection
/// will have expired, or be close to it, by the scheduled time.
postsRouter.post("/posts/:postId/schedule", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "approved") return res.status(409).json({ error: "post_not_approved" });
    const agent = await assertOwnedAgent(post.agentId, req.creatorId!);

    const scheduledFor = new Date(req.body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ error: "scheduledFor must be a valid date/time" });
    }

    const publications = await createPublications(post, agent, req.body.connections);
    const updated = await getDb().post.update({
      where: { id: post.id },
      data: { status: "scheduled", scheduledFor },
    });
    res.json({ ...updated, publications, warnings: warningsForPublications(scheduledFor, publications) });
  } catch (err) {
    respondError(res, err);
  }
});

/// Reverses schedule(): back to "approved", no scheduledFor, and drops the
/// publications bound at schedule time so a future schedule/publish action
/// binds fresh (rather than carrying forward a possibly-stale choice from
/// before the creator changed their mind about timing).
postsRouter.post("/posts/:postId/unschedule", async (req: AuthedRequest, res) => {
  try {
    const post = await getDb().post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: "not_found" });
    if (post.status !== "scheduled") return res.status(409).json({ error: "post_not_scheduled" });
    await assertOwnedAgent(post.agentId, req.creatorId!);

    await getDb().postPublication.deleteMany({ where: { postId: post.id } });
    const updated = await getDb().post.update({
      where: { id: post.id },
      data: { status: "approved", scheduledFor: null },
    });
    res.json(updated);
  } catch (err) {
    respondError(res, err);
  }
});

/// Publishes every post whose scheduledFor has passed, using the
/// connections bound back at schedule time (never re-resolved here - see
/// createPublications). Called on a timer from index.ts, not an HTTP
/// route; each post is handled independently so one failure can't block
/// the rest of the batch or crash the poller.
export async function runScheduledPublishes(): Promise<void> {
  const due = await getDb().post.findMany({
    where: { status: "scheduled", scheduledFor: { lte: new Date() } },
    include: { agent: true },
  });
  for (const post of due) {
    try {
      const publications = await loadPublications(post.id);
      await executePublications(post, post.agent, publications);
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

    const counts: Record<string, number> = {
      new: newCount,
      approved: 0,
      rejected: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
      pending: 0,
    };
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
