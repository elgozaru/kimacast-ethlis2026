import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { getCreatorWalletAddress } from "../auth.js";
import { mintSubname } from "../ens/subname.js";
import type { AgentContext } from "../types.js";

export const agentsRouter = Router();

agentsRouter.post("/agents", async (req: AuthedRequest, res) => {
  const { name, capabilities, sourcePolicy, settings } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const agent = await getDb().agent.create({
    data: {
      creatorId: req.creatorId!,
      name,
      capabilities: capabilities ?? ["article-summary", "short-social-post", "three-post-thread"],
      sourcePolicy: sourcePolicy ?? "author-authorized",
      settings: settings ?? {},
      status: "draft",
    },
  });
  res.status(201).json(agent);
});

agentsRouter.get("/agents", async (req: AuthedRequest, res) => {
  const agents = await getDb().agent.findMany({ where: { creatorId: req.creatorId! }, orderBy: { createdAt: "desc" } });
  res.json(agents);
});

agentsRouter.get("/agents/:id", async (req: AuthedRequest, res) => {
  const agent = await getDb().agent.findFirst({ where: { id: req.params.id, creatorId: req.creatorId! } });
  if (!agent) return res.status(404).json({ error: "not_found" });
  res.json(agent);
});

agentsRouter.patch("/agents/:id", async (req: AuthedRequest, res) => {
  const existing = await getDb().agent.findFirst({ where: { id: req.params.id, creatorId: req.creatorId! } });
  if (!existing) return res.status(404).json({ error: "not_found" });

  const { name, capabilities, sourcePolicy, settings, hederaPayTo } = req.body;
  const agent = await getDb().agent.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name }),
      ...(capabilities !== undefined && { capabilities }),
      ...(sourcePolicy !== undefined && { sourcePolicy }),
      ...(settings !== undefined && { settings }),
      ...(hederaPayTo !== undefined && { hederaPayTo }),
    },
  });
  res.json(agent);
});

/// Deploys the agent: mints its ENS subname and writes the recommended
/// records (description, url, agent-context) - the on-chain step that
/// turns a draft dashboard config into a discoverable, addressable agent.
agentsRouter.post("/agents/:id/deploy", async (req: AuthedRequest, res) => {
  const agent = await getDb().agent.findFirst({ where: { id: req.params.id, creatorId: req.creatorId! } });
  if (!agent) return res.status(404).json({ error: "not_found" });
  if (agent.ensSubname) return res.status(409).json({ error: "already_deployed", ensSubname: agent.ensSubname });

  const { label } = req.body as { label?: string };
  if (!label) return res.status(400).json({ error: "label is required (e.g. 'alice-tech')" });

  const walletAddress = await getCreatorWalletAddress(req.creatorId!);
  if (!walletAddress) {
    return res.status(422).json({
      error: "no_linked_wallet",
      message: "Your Privy account has no linked wallet yet - sign in and let the embedded wallet finish creating before deploying an agent.",
    });
  }

  const agentContext: AgentContext = {
    name: agent.name,
    owner: walletAddress,
    capabilities: agent.capabilities,
    sourcePolicy: agent.sourcePolicy,
    profileUri: null,
    reputationUri: null,
    version: "0.1",
  };

  try {
    const { subname } = await mintSubname(label, {
      description: `${agent.name} - content publisher agent`,
      url: (agent.settings as any)?.homepageUrl ?? "",
      "agent-context": JSON.stringify(agentContext),
    });

    const updated = await getDb().agent.update({
      where: { id: agent.id },
      data: { ensSubname: subname, status: "deployed" },
    });
    res.json(updated);
  } catch (err) {
    res.status(502).json({ error: "ens_deploy_failed", message: (err as Error).message });
  }
});
