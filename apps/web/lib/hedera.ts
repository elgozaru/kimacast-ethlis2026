import { AccountId } from "@hiero-ledger/sdk";

const MIRROR_NODE_URL =
  process.env.NEXT_PUBLIC_HEDERA_NETWORK === "hedera:mainnet"
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

export async function fetchAccountState(evmAddress: string): Promise<MirrorAccountState> {
  const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${evmAddress}`);
  if (res.status === 404) {
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

export function tinybarsToHbar(tinybars: bigint): string {
  return (Number(tinybars) / 1e8).toFixed(4);
}
