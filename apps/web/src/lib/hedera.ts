// Via @x402/hedera's re-export, not a direct @hiero-ledger/sdk dependency —
// see the note in lib/hedera-privy-signer.ts on why that matters.
import { AccountId } from "@x402/hedera";

const MIRROR_NODE_URL =
  import.meta.env.VITE_HEDERA_NETWORK === "hedera:mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";

/**
 * A Privy embedded wallet is a plain secp256k1 keypair with a standard EVM
 * address. Hedera accepts that same address, unmodified, as an account
 * "alias" everywhere an AccountId is expected — including as the
 * destination of a plain HBAR transfer. Sending HBAR to this alias for the
 * first time auto-creates a real (initially "hollow") Hedera account behind
 * it, so there is no separate "create my Hedera account" step for a viewer
 * to click through. See docs/SETUP.md "Why hollow accounts".
 */
export function hederaAliasFromEvmAddress(evmAddress: string): string {
  return AccountId.fromEvmAddress(0, 0, evmAddress).toString();
}

export type MirrorAccountState = {
  exists: boolean;
  /** true once the account has signed a transaction and completed itself. */
  isHollow: boolean;
  balanceTinybars: bigint;
};

const MIRROR_NODE_INDEXING_RETRIES = 4;
const MIRROR_NODE_RETRY_DELAY_MS = 1500;

/**
 * The mirror node indexes asynchronously from consensus, typically a few
 * seconds behind — so a transfer that already landed can still 404 here
 * for a moment right afterward (observed in practice: 404 on the first
 * check straight after funding, 200 moments later with no other change).
 * Retrying a few times with a short delay absorbs that lag transparently
 * instead of making the viewer notice and tap Unlock a second time. This
 * does add latency for a genuinely never-funded account (every retry
 * plays out before landing on `exists: false`), which is an acceptable
 * trade against the more common case of "just funded, checking right
 * after."
 */
export async function fetchAccountState(evmAddress: string): Promise<MirrorAccountState> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${evmAddress}`);
    if (res.status === 404) {
      if (attempt < MIRROR_NODE_INDEXING_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, MIRROR_NODE_RETRY_DELAY_MS));
        continue;
      }
      return { exists: false, isHollow: false, balanceTinybars: 0n };
    }
    if (!res.ok) throw new Error(`Mirror node error ${res.status}`);
    const data = await res.json();
    return {
      exists: true,
      isHollow: data.key === null,
      balanceTinybars: BigInt(data.balance?.balance ?? 0),
    };
  }
}

export function tinybarsToHbar(tinybars: bigint): string {
  return (Number(tinybars) / 1e8).toFixed(4);
}
