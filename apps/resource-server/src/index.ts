import "dotenv/config";
import cors from "cors";
import express from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import type { RoutesConfig } from "@x402/core/server";
import { getPost } from "./posts.js";
import { resolveAgentHederaAccount } from "./ens.js";
import { handleHederaSign } from "./hedera-sign.js";

const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://localhost:4021";

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network as `hedera:${string}`,
  new ExactHederaScheme(),
);

// @x402/express's paymentMiddleware only forwards a verify/settle failure's
// real detail to the CLIENT when it's a FacilitatorResponseError (a
// malformed-response boundary error); every other failure - including a
// well-formed SettleError describing exactly why the Hedera settlement
// failed (errorReason/errorMessage/payer/transaction) - gets swallowed into
// a bare `res.status(402).json({})` (see @x402/express's
// paymentMiddlewareFromHTTPServer, the catch around processSettlement).
// That's a deliberate choice not to leak internals to a paying client, but
// it leaves nothing to debug from client-side alone. These hooks log the
// real error - including SettleError/VerifyError's extra fields, which
// aren't part of @x402/core's public exports but are own enumerable
// properties `console.error` prints anyway - to THIS process's console
// without changing what the client ever sees.
resourceServer.onVerifyFailure(async ({ error }) => {
  console.error("[resource-server] x402 verify failed:", error);
});
resourceServer.onSettleFailure(async ({ error }) => {
  console.error("[resource-server] x402 settle failed:", error);
});

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
      network: network as `hedera:${string}`,
      // payTo and price are resolved per-request from the postId in the path,
      // since every story is priced individually and paid to a different
      // agent's Hedera account (resolved through that agent's ENS name).
      payTo: async (context) => {
        const post = await getPost(postIdFromPath(context.path));
        if (!post) throw new Error("Unknown story");
        return resolveAgentHederaAccount(post.agentEns);
      },
      price: async (context) => {
        const post = await getPost(postIdFromPath(context.path));
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

  app.get("/api/stories/:postId/teaser", async (req, res) => {
    const post = await getPost(req.params.postId);
    if (!post) return res.status(404).json({ error: "not_found" });
    res.json({
      id: post.id,
      teaser: post.teaser,
      priceTinybars: post.priceTinybars,
      sourceUrl: post.sourceUrl,
      network,
    });
  });

  // Moved here from apps/web: the viewer's browser posts an unsigned Hedera
  // transaction here to get it co-signed via Privy's server Wallet API,
  // which needs a real server process to hold the Privy app secret — a
  // static Vite build (apps/web) has nowhere to keep that.
  app.post("/api/hedera/sign", handleHederaSign);

  app.use(paymentMiddleware(routes, resourceServer));

  app.get("/api/stories/:postId/full", async (req, res) => {
    const post = await getPost(req.params.postId);
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
