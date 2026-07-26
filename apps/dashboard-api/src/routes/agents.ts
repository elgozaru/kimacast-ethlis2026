import { Router } from "express";
import { ethers } from "ethers";
import { getDb } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { getCreatorWalletAddress } from "../auth.js";
import { mintSubname } from "../ens/subname.js";
import * as agentRegistry from "../contracts/agentRegistry.js";
import type { AgentContext } from "../types.js";

export const agentsRouter = Router();

agentsRouter.post("/agents", async (req: AuthedRequest, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

agentsRouter.get("/agents", async (req: AuthedRequest, res) => {
  try {
    const agents = await getDb().agent.findMany({ where: { creatorId: req.creatorId! }, orderBy: { createdAt: "desc" } });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

agentsRouter.get("/agents/:id", async (req: AuthedRequest, res) => {
  try {
    const agent = await getDb().agent.findFirst({ where: { id: req.params.id, creatorId: req.creatorId! } });
    if (!agent) return res.status(404).json({ error: "not_found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

agentsRouter.patch("/agents/:id", async (req: AuthedRequest, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/// Deploys the agent: mints its ENS subname and writes the recommended
/// records (description, url, agent-context) - the on-chain step that
/// turns a draft dashboard config into a discoverable, addressable agent.
agentsRouter.post("/agents/:id/deploy", async (req: AuthedRequest, res) => {
  try {
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

    const { subname } = await mintSubname(label, {
      description: `${agent.name} - content publisher agent`,
      url: (agent.settings as any)?.homepageUrl ?? "",
      "agent-context": JSON.stringify(agentContext),
    });

    // AgentRegistry.sol (packages/contracts) is a separate,
    // independently-queryable on-chain ledger, primarily for the ENS
    // sponsor-track bounty - not required for the platform to function
    // (the ENS subname above is what actually makes the agent addressable
    // /payable). A failure here is logged and surfaced back to the
    // dashboard, but does NOT fail the overall deploy, since the ENS
    // subname mint above already succeeded and shouldn't be rolled back
    // over an optional add-on.
    let onChainAgentId: string | null = null;
    if (agentRegistry.isConfigured()) {
      try {
        const policyHash = ethers.keccak256(ethers.toUtf8Bytes(agent.sourcePolicy));
        const result = await agentRegistry.registerAgent(
          walletAddress,
          subname,
          `agent-context:${subname}`,
          policyHash,
        );
        onChainAgentId = result.agentId;
      } catch (err) {
        console.error("[dashboard-api] AgentRegistry.registerAgent failed (non-fatal):", err);
      }
    }

    const updated = await getDb().agent.update({
      where: { id: agent.id },
      data: { ensSubname: subname, status: "deployed", onChainAgentId },
    });
    res.json(updated);
  } catch (err) {
    // Any failure here (Privy API misconfigured, ENS RPC unreachable, the
    // operator not yet approved, etc.) must land here rather than escape as
    // an unhandled rejection - the latter crashes the whole dashboard-api
    // process, taking down every other creator's in-flight request too.
    res.status(502).json({ error: "deploy_failed", message: (err as Error).message });
  }
});
