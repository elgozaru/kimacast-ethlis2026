import "dotenv/config";
import cors from "cors";
import express from "express";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactHederaScheme } from "@x402/hedera/exact/facilitator";
import { extractTransactionFromPayload, inspectHederaTransaction } from "@x402/hedera";
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

// The client-facing /verify and /settle response bodies are dictated by
// @x402/core's HTTPFacilitatorClient and deliberately terse (a paying
// client shouldn't see internal detail) - but that same detail is exactly
// what's needed to debug a real payment failure, and this is the one
// process where the actual Hedera-level reason (invalid signature,
// insufficient fee, expired transaction, wrong node, etc.) is available.
// Logging it here, even for the non-throwing `{success: false, ...}` /
// `{isValid: false, ...}` results the scheme returns for ordinary
// verification/settlement failures (not just thrown exceptions), is the
// only place this reason is guaranteed to surface at all.
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const result = await facilitator.verify(paymentPayload, paymentRequirements);
    if (!result.isValid) {
      console.warn("[facilitator] verify rejected:", result.invalidReason, result.invalidMessage);
      // "invalid_exact_hedera_payload_amount_mismatch" (and friends) only
      // say THAT the signed transaction's transfers didn't match
      // paymentRequirements, not what actually differed. Decode the same
      // transaction bytes the scheme itself just inspected, using the same
      // @x402/hedera utility, so the actual transfer list is visible
      // side-by-side with what was required.
      try {
        const transactionBase64 = extractTransactionFromPayload(paymentPayload.payload);
        const inspected = inspectHederaTransaction(transactionBase64);
        console.warn("[facilitator] required:", {
          payTo: paymentRequirements.payTo,
          amount: paymentRequirements.amount,
          asset: paymentRequirements.asset,
        });
        console.warn("[facilitator] actual hbarTransfers:", inspected.hbarTransfers);
      } catch (inspectErr) {
        console.warn("[facilitator] could not decode transaction for diagnostics:", inspectErr);
      }
    }
    res.status(result.isValid ? 200 : 402).json(result);
  } catch (err) {
    console.error("[facilitator] /verify threw:", err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ isValid: false, invalidReason: message });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const result = await facilitator.settle(paymentPayload, paymentRequirements);
    if (!result.success) {
      console.warn("[facilitator] settle failed:", result.errorReason, result.errorMessage);
    }
    res.status(result.success ? 200 : 402).json(result);
  } catch (err) {
    console.error("[facilitator] /settle threw:", err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, errorReason: "transaction_failed", errorMessage: message });
  }
});

app.get("/supported", (_req, res) => {
  res.json(facilitator.getSupported());
});

const port = Number(process.env.PORT ?? 4021);
app.listen(port, () => {
  console.log(`[facilitator] listening on :${port}, network=${network}, aliasPolicy=${aliasPolicy}`);
});
