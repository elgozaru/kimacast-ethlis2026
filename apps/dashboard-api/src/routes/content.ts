import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { buildSnapshot, type SourceInput } from "../content/snapshot.js";
import { ZgStorageClient, hasSourceChanged } from "../storage/zgStorage.js";
import { buildPrompt } from "../generation/promptBuilder.js";
import { generate } from "../generation/providers.js";
import { listProviders as listZgComputeProviders } from "../generation/zgCompute.js";
import type { AuthorProfile, PromptVariant } from "../types.js";
import { createHash } from "node:crypto";

export const contentRouter = Router();
const storage = new ZgStorageClient();

async function assertOwnedAgent(agentId: string, creatorId: string) {
  const agent = await getDb().agent.findFirst({ where: { id: agentId, creatorId } });
  if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
  return agent;
}

/// Picks the SourceInput variant from whichever fields the request body
/// actually sent - the dashboard's ContentPage source-type tabs each send
/// a distinct shape (url / pdfBase64 / feedUrl / plain title+content), and
/// this is the one place that has to know all four.
function sourceInputFromBody(body: any): SourceInput {
  if (body.pdfBase64) return { kind: "pdf", pdfBase64: body.pdfBase64, title: body.title, author: body.author };
  if (body.feedUrl) return { kind: "rss", feedUrl: body.feedUrl, itemUrl: body.itemUrl, author: body.author };
  if (body.url) return { kind: "url", url: body.url, author: body.author };
  return { kind: "text", title: body.title, content: body.content, author: body.author, canonicalUrl: body.canonicalUrl };
}

/// Ingests one source (pasted text, website URL, PDF upload, or RSS feed
/// item), snapshots it immutably, uploads it to 0G Storage, and - if a
/// prior ContentSource exists for the same canonicalUrl with a different
/// contentHash - flags that the agent's existing suggestions are stale
/// (reevaluateOnHashChange).
contentRouter.post("/agents/:agentId/sources", async (req: AuthedRequest, res) => {
  try {
    const agent = await assertOwnedAgent(req.params.agentId, req.creatorId!);
    const input = sourceInputFromBody(req.body);

    const snapshot = await buildSnapshot(input);

    const previous = snapshot.canonicalUrl
      ? await getDb().contentSource.findFirst({
          where: { agentId: agent.id, canonicalUrl: snapshot.canonicalUrl },
          orderBy: { createdAt: "desc" },
        })
      : null;

    // This exact content was already ingested for this agent - e.g.
    // re-submitting the same pasted article to try a different generation
    // provider against it, or just resubmitting by habit. contentHash is
    // unique per (agentId, contentHash) precisely so this is a safe,
    // expected case, not an error: reuse the existing row (and skip a
    // redundant 0G Storage re-upload of identical bytes) instead of
    // attempting a doomed second insert.
    const existing = await getDb().contentSource.findUnique({
      where: { agentId_contentHash: { agentId: agent.id, contentHash: snapshot.contentHash } },
    });
    if (existing) {
      return res.json({
        ...existing,
        storageVerified: true,
        staleSuggestions: hasSourceChanged(previous?.contentHash, snapshot.contentHash),
      });
    }

    const { rootHash, verified } = await storage.uploadAndVerify(snapshot.content);

    const source = await getDb().contentSource.create({
      data: {
        agentId: agent.id,
        author: snapshot.author,
        canonicalUrl: snapshot.canonicalUrl,
        title: snapshot.title,
        content: snapshot.content,
        contentHash: snapshot.contentHash,
        sourceType: snapshot.sourceType,
        storageUri: `0g://${rootHash}`,
        retrievedAt: new Date(snapshot.retrievedAt),
      },
    });

    res.status(201).json({
      ...source,
      storageVerified: verified,
      staleSuggestions: hasSourceChanged(previous?.contentHash, snapshot.contentHash),
    });
  } catch (err) {
    respondError(res, err);
  }
});

/// Runs the generation pipeline for one ContentSource. `variant` selects
/// one of the 3 required prompt variants; omit it to run all 3 (used for
/// the comparison run in the article-to-micro-content challenge).
contentRouter.post("/sources/:sourceId/generate", async (req: AuthedRequest, res) => {
  try {
    const source = await getDb().contentSource.findUnique({ where: { id: req.params.sourceId } });
    if (!source) return res.status(404).json({ error: "not_found" });
    const agent = await assertOwnedAgent(source.agentId, req.creatorId!);

    const authorProfileId = req.body.authorProfileId as string | undefined;
    const authorProfileRow = authorProfileId
      ? await getDb().authorProfile.findUnique({ where: { id: authorProfileId } })
      : null;
    const authorProfile = authorProfileRow?.data as unknown as AuthorProfile | undefined;

    const variants: PromptVariant[] = req.body.variant ? [req.body.variant] : ["generic", "author-tone", "source-grounded"];

    const results = [];
    for (const variant of variants) {
      const prompt = buildPrompt(variant, source as any, authorProfile);
      const { content, provider, model } = await generate(prompt, source.canonicalUrl ?? "", (agent.settings as any) ?? {});
      const { rootHash } = await storage.upload(JSON.stringify(content, null, 2));

      const result = await getDb().generationResult.create({
        data: {
          agentId: agent.id,
          sourceId: source.id,
          authorProfileId: authorProfileRow?.id ?? null,
          sourceHash: source.contentHash,
          authorProfileHash: authorProfileRow?.profileHash ?? null,
          outputStorageId: `0g://${rootHash}`,
          content: content as any,
          provider,
          model,
          promptVersion: prompt.promptVersion,
        },
      });
      results.push(result);
    }

    res.status(201).json(results);
  } catch (err) {
    respondError(res, err);
  }
});

contentRouter.post("/agents/:agentId/author-profile", async (req: AuthedRequest, res) => {
  try {
    const agent = await assertOwnedAgent(req.params.agentId, req.creatorId!);
    const data = req.body;
    const profileHash = `sha256:${createHash("sha256").update(JSON.stringify(data)).digest("hex")}`;

    const profile = await getDb().authorProfile.create({
      data: { agentId: agent.id, profileHash, toneDescription: data.toneDescription ?? "", data },
    });
    res.status(201).json(profile);
  } catch (err) {
    respondError(res, err);
  }
});

/// Lists 0G Compute Network providers/models directly from the chain, so
/// the dashboard can offer a real picker instead of asking a creator to
/// paste a provider address. Read-only on-chain data (no wallet/private
/// key needed for THIS call - see generation/zgCompute.ts's listProviders),
/// so it works even before an agent's own ZEROG_COMPUTE_PRIVATE_KEY-backed
/// generation call would.
contentRouter.get("/zg-compute/providers", async (_req: AuthedRequest, res) => {
  try {
    res.json(await listZgComputeProviders());
  } catch (err) {
    respondError(res, err);
  }
});

contentRouter.get("/agents/:agentId/generations", async (req: AuthedRequest, res) => {
  try {
    const agent = await assertOwnedAgent(req.params.agentId, req.creatorId!);
    const results = await getDb().generationResult.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(results);
  } catch (err) {
    respondError(res, err);
  }
});

function respondError(res: any, err: unknown) {
  const status = (err as any)?.status ?? 500;
  res.status(status).json({ error: (err as Error).message });
}
