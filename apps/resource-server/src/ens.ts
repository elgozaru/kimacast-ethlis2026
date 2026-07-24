import { JsonRpcProvider } from "ethers";

/**
 * Each content agent publishes its payout account under its own ENS
 * subdomain's text records, e.g. `food.storyagent.eth` ->
 * text record `me.hedera.account` = "0.0.6001". This keeps the
 * human-readable identity (ENS, used for discovery/reputation) and the
 * settlement destination (Hedera account) linked without a separate
 * off-chain database — anyone can `dig` the agent's payout account.
 *
 * ENS itself lives on Ethereum L1 (or an L2 with an ENS deployment); this is
 * a read-only lookup, so any funded operator key is unnecessary here.
 */
const HEDERA_ACCOUNT_TEXT_KEY = "me.hedera.account";

const provider = new JsonRpcProvider(requireEnv("ETH_RPC_URL"));
const cache = new Map<string, { payTo: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function resolveAgentHederaAccount(ensName: string): Promise<string> {
  const cached = cache.get(ensName);
  if (cached && cached.expiresAt > Date.now()) return cached.payTo;

  const resolver = await provider.getResolver(ensName);
  if (!resolver) throw new Error(`No ENS resolver for ${ensName}`);

  const payTo = await resolver.getText(HEDERA_ACCOUNT_TEXT_KEY);
  if (!payTo) {
    throw new Error(
      `${ensName} has no "${HEDERA_ACCOUNT_TEXT_KEY}" text record set — the agent has not published a Hedera payout account`,
    );
  }

  cache.set(ensName, { payTo, expiresAt: Date.now() + CACHE_TTL_MS });
  return payTo;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
