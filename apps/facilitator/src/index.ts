import "dotenv/config";
import cors from "cors";
import express from "express";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactHederaScheme } from "@x402/hedera/exact/facilitator";
import { facilitatorSigner } from "./signer.js";

const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";
const aliasPolicy = (process.env.HEDERA_ALIAS_POLICY as "allow" | "reject") ?? "reject";

const facilitator = new x402Facilitator().register(
  network as `hedera:${string}`,
  new ExactHederaScheme(facilitatorSigner, { aliasPolicy }),
);

const app = express();
app.use(cors());
app.use(express.json());

// The three routes below are the entire wire contract that @x402/core's
// HTTPFacilitatorClient (used by the resource server, see
// apps/resource-server/src/index.ts) speaks — POST body shape and response
// shape are dictated by that client, not invented here.

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const result = await facilitator.verify(paymentPayload, paymentRequirements);
    res.status(result.isValid ? 200 : 402).json(result);
  } catch (err) {
    res.status(500).json({ isValid: false, invalidReason: (err as Error).message });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const result = await facilitator.settle(paymentPayload, paymentRequirements);
    res.status(result.success ? 200 : 402).json(result);
  } catch (err) {
    res.status(500).json({ success: false, errorReason: "transaction_failed", errorMessage: (err as Error).message });
  }
});

app.get("/supported", (_req, res) => {
  res.json(facilitator.getSupported());
});

const port = Number(process.env.PORT ?? 4021);
app.listen(port, () => {
  console.log(`[facilitator] listening on :${port}, network=${network}, aliasPolicy=${aliasPolicy}`);
});
