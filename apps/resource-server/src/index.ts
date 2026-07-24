import "dotenv/config";
import cors from "cors";
import express from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import type { RoutesConfig } from "@x402/core/server";
import { getPost } from "./posts.js";
import { resolveAgentHederaAccount } from "./ens.js";

const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://localhost:4021";

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network as `hedera:${string}`,
  new ExactHederaScheme(),
);

const FULL_STORY_PATTERN = /^\/api\/stories\/([^/]+)\/full$/;

function postIdFromPath(path: string): string {
  const match = FULL_STORY_PATTERN.exec(path);
  if (!match) throw new Error(`Unexpected path for gated route: ${path}`);
  return match[1];
}

const routes: RoutesConfig = {
  "GET /api/stories/:postId/full": {
    description: "Unlock the rest of this story",
    mimeType: "application/json",
    accepts: {
      scheme: "exact",
      network,
      // payTo and price are resolved per-request from the postId in the path,
      // since every story is priced individually and paid to a different
      // agent's Hedera account (resolved through that agent's ENS name).
      payTo: async (context) => resolveAgentHederaAccount(getPost(postIdFromPath(context.path))!.agentEns),
      price: (context) => {
        const post = getPost(postIdFromPath(context.path));
        if (!post) throw new Error("Unknown story");
        return { asset: "0.0.0", amount: post.priceTinybars };
      },
    },
  },
};

async function main() {
  await resourceServer.initialize(); // fetches /supported from the facilitator once at boot

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/stories/:postId/teaser", (req, res) => {
    const post = getPost(req.params.postId);
    if (!post) return res.status(404).json({ error: "not_found" });
    res.json({
      id: post.id,
      teaser: post.teaser,
      priceTinybars: post.priceTinybars,
      sourceUrl: post.sourceUrl,
      network,
    });
  });

  app.use(paymentMiddleware(routes, resourceServer));

  app.get("/api/stories/:postId/full", (req, res) => {
    const post = getPost(req.params.postId);
    if (!post) return res.status(404).json({ error: "not_found" });
    // paymentMiddleware only lets a request reach here once the facilitator
    // has verified AND settled the payment on Hedera.
    res.json({ id: post.id, full: post.full, sourceUrl: post.sourceUrl });
  });

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`[resource-server] listening on :${port}, facilitator=${facilitatorUrl}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
