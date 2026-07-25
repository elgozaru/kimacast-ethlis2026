import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { PrivyHederaSigner } from "./hedera-privy-signer";

const RESOURCE_SERVER_URL = process.env.NEXT_PUBLIC_RESOURCE_SERVER_URL ?? "http://localhost:4000";

/**
 * One 402 round trip: request the gated route, and if the server asks for
 * payment, build + sign the Hedera transfer with the viewer's Privy wallet,
 * retry with the `X-PAYMENT` header, and return the unlocked story. The
 * viewer sees this as a single "Unlock" tap; the second fetch and its retry
 * both happen inside that one click handler.
 */
export async function unlockStory(postId: string, signer: PrivyHederaSigner) {
  const coreClient = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
  const client = new x402HTTPClient(coreClient);

  const url = `${RESOURCE_SERVER_URL}/api/stories/${postId}/full`;
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
    throw new Error(`Payment was rejected (${paid.status}): ${await paid.text()}`);
  }

  return paid.json();
}
