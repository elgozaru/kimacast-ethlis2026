/**
 * Turns "no HBAR" into "one Apple/Google Pay tap" without leaving the page.
 *
 * IMPORTANT — confirm before relying on this: as of this writing, no major
 * onramp aggregator has been verified to deliver funds directly to a Hedera
 * network address (Circle's CCTP, which several ramps use for delivery,
 * lists Hedera on its 2026 roadmap but hadn't shipped it at research time).
 * Before wiring this up for real, check the live currency/network list of
 * your chosen provider (Onramper, Transak, MoonPay, Coinbase Onramp) for a
 * Hedera destination network — HBAR itself is commonly listed as a
 * *purchasable* asset, which is not the same as "deliverable to a Hedera
 * account". See docs/SETUP.md "Funding the viewer's account" for the two
 * paths depending on what you find:
 *
 *  A) Provider supports a Hedera destination network: point it straight at
 *     `destinationAddress` below — this single purchase both funds AND
 *     auto-creates the viewer's hollow Hedera account (see lib/hedera.ts).
 *
 *  B) No provider supports Hedera yet: buy USDC on an EVM chain the
 *     provider does support (e.g. Base) into this *same* address — a Privy
 *     embedded wallet's secp256k1 key is chain-agnostic, so the Base
 *     address and the Hedera alias are the same string — then have your
 *     backend sweep/convert that into HBAR or Hedera-USDC for the viewer
 *     from a treasury float, since a trustless bridge (CCTP) isn't live for
 *     Hedera yet. This adds float/reconciliation risk that path A avoids.
 */
export type OnrampRequest = {
  destinationAddress: string;
  network: "hedera:testnet" | "hedera:mainnet";
  amountUsd: number;
};

export function buildOnrampUrl(_req: OnrampRequest): string {
  throw new Error(
    "Wire this to your chosen onramp provider's widget/session-token endpoint once you've confirmed its Hedera (path A) or Base-fallback (path B) support — see the comment above.",
  );
}
