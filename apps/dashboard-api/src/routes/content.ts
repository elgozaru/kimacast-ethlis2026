import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { buildSnapshot } from "../content/snapshot.js";
import { ZgStorageClient, hasSourceChanged } from "../storage/zgStorage.js";
import { buildPrompt } from "../generation/promptBuilder.js";
import { generate } from "../generation/claude.js";
import type { AuthorProfile, PromptVariant } from "../types.js";
import { createHash } from "node:crypto";

export const contentRouter = Router();
const storage = new ZgStorageClient();

async function assertOwnedAgent(agentId: string, creatorId: string) {
  const agent = await getDb().agent.findFirst({ where: { id: agentId, ownerAddress: creatorId } });
  if (!agent) throw Object.assign(new Error("not_found"), { status: 404 });
  return agent;
}

/// Ingests one source (URL or pasted text), snapshots it immutably, uploads
/// it to 0G Storage, and - if a prior ContentSource exists for the same
/// canonicalUrl with a different contentHash - flags that the agent's
/// existing suggestions are stale (reevaluateOnHashChange).
contentRouter.post("/agents/:agentId/sources", async (req: AuthedRequest, res) => {
  try {
    const agent = await assertOwnedAgent(req.params.agentId, req.creatorId!);
    const input = req.body.url
      ? { kind: "url" as const, url: req.body.url, author: req.body.author }
      : { kind: "text" as const, title: req.body.title, content: req.body.content, author: req.body.author, canonicalUrl: req.body.canonicalUrl };

    const snapshot = await buildSnapshot(input);
    const { rootHash, verified } = await storage.uploadAndVerify(snapshot.content);

    const previous = snapshot.canonicalUrl
      ? await getDb().contentSource.findFirst({
          where: { agentId: agent.id, canonicalUrl: snapshot.canonicalUrl },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const source = await getDb().contentSource.create({
      data: {
        agentId: agent.id,
        author: snapshot.author,
        canonicalUrl: snapshot.canonicalUrl,
        title: snapshot.title,
        content: snapshot.content,
        contentHash: snapshot.contentHash,
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
      const { content, provider, model } = await generate(prompt, source.canonicalUrl ?? "");
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
