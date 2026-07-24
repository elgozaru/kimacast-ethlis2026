import "dotenv/config";
import type { PaywallQuote } from "../agent/types.js";

/**
 * x402 is the HTTP-native "402 Payment Required" micropayment protocol:
 * a server responds 402 with a payment quote, the client's wallet signs a
 * payment authorization, retries the request with an X-PAYMENT header, and
 * a facilitator verifies + settles it on-chain before the server releases
 * the resource.
 *
 * Hedera exposes an EVM-compatible JSON-RPC relay (Hashio), so an
 * x402 facilitator can settle payments there like any other EVM chain -
 * that's what lets us combine "x402 protocol" with "Hedera settlement" in
 * one flow, using HBAR (or an HTS stablecoin) as the payment asset instead
 * of Base/USDC.
 */
export function buildPaywallQuote(resourceId: string): PaywallQuote {
  return {
    priceUsd: Number(process.env.X402_PRICE_USD ?? "0.05"),
    payToAddress: process.env.X402_RECEIVING_ADDRESS ?? "0x0000000000000000000000000000000000000000",
    network: "hedera",
    asset: process.env.HEDERA_PAYMENT_TOKEN ?? "HBAR",
    resourceId,
  };
}

/**
 * Express-style middleware factory: wraps a route so that, absent a valid
 * X-PAYMENT header, it replies 402 with the quote above; once a facilitator
 * confirms settlement on Hedera, the wrapped handler runs and streams back
 * the 0G-Storage-hosted paid content.
 *
 * Kept framework-light (no hard Express import at module scope) so this
 * file is inspectable without pulling in a server dependency.
 */
export function paywall(resourceId: string, onUnlocked: () => Promise<string>) {
  return async (req: { headers: Record<string, string | undefined> }) => {
    const paymentHeader = req.headers["x-payment"];

    if (!paymentHeader) {
      return { status: 402, body: buildPaywallQuote(resourceId) };
    }

    const settled = await verifyHederaSettlement(paymentHeader, resourceId);
    if (!settled) {
      return { status: 402, body: { ...buildPaywallQuote(resourceId), error: "payment not yet confirmed" } };
    }

    return { status: 200, body: await onUnlocked() };
  };
}

async function verifyHederaSettlement(paymentHeader: string, resourceId: string): Promise<boolean> {
  const facilitatorUrl = process.env.X402_FACILITATOR_URL;
  if (!facilitatorUrl) {
    // No facilitator configured (local/dev mode): trust the presence of a
    // well-formed header so the rest of the pipeline is exercisable offline.
    return paymentHeader.length > 0;
  }

  const res = await fetch(`${facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentHeader, resourceId, network: "hedera" }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.settled);
}
