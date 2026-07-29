import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { PrivyHederaSigner } from "./hedera-privy-signer";

/**
 * One 402 round trip: request the gated route, and if the server asks for
 * payment, build + sign the Hedera transfer with the viewer's Privy wallet,
 * retry with the `X-PAYMENT` header, and return the unlocked story. The
 * viewer sees this as a single "Unlock" tap; the second fetch and its retry
 * both happen inside that one click handler.
 *
 * `/api/...` here is a relative path — Vite's dev proxy (see
 * vite.config.ts) and any production reverse proxy route it to the
 * resource-server, so this never needs to know or guess that service's
 * actual hostname.
 */
export async function unlockStory(postId: string, signer: PrivyHederaSigner) {
  const coreClient = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
  const client = new x402HTTPClient(coreClient);

  const url = `/api/stories/${postId}/full`;
  const first = await fetch(url);
  if (first.status !== 402) {
    return first.json();
  }

  const paymentRequired = client.getPaymentRequiredResponse((name) => first.headers.get(name), await first.json());
  const paymentPayload = await client.createPaymentPayload(paymentRequired);

  const paid = await fetch(url, {
    headers: client.encodePaymentSignatureHeader(paymentPayload),
  });
  if (!paid.ok) {
    // The x402 v2 protocol deliberately keeps the JSON body minimal (often
    // literally `{}`) on a 402 - the real reason lives in a response
    // HEADER instead: `PAYMENT-RESPONSE` for a settlement failure (its
    // `errorReason`/`errorMessage`) or `PAYMENT-REQUIRED` for a
    // verification failure (its `error`). `processResponse` is the SDK's
    // own helper for decoding whichever of those is present - reading
    // `paid.text()` alone (the previous approach here) can never surface
    // this, no matter what the server-side failure actually was.
    const parsed = await client.processResponse(paid);
    const header = parsed.header as { errorReason?: string; errorMessage?: string; error?: string } | undefined;
    const detail =
      header?.errorReason || header?.errorMessage
        ? [header.errorReason, header.errorMessage].filter(Boolean).join(": ")
        : header?.error || JSON.stringify(parsed.body);
    throw new Error(`Payment was rejected (${paid.status}): ${detail}`);
  }

  return paid.json();
}
