"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { fetchAccountState, tinybarsToHbar } from "../../../lib/hedera";
import { PrivyHederaSigner } from "../../../lib/hedera-privy-signer";
import { unlockStory } from "../../../lib/x402-fetch";
import { resourceServerUrl } from "../../../lib/resource-server-url";

type Teaser = { id: string; teaser: string; priceTinybars: string; sourceUrl: string };
type Stage = "idle" | "checking-balance" | "needs-funding" | "paying" | "unlocked" | "error";

/**
 * Everything a first-time viewer needs — login, wallet, funding, payment,
 * unlocked content — happens on this one screen, so there's no redirect
 * away from the Instagram post thread at any point.
 */
export function StoryUnlock({ postId }: { postId: string }) {
  const { login, authenticated, ready, user } = usePrivy();
  const { wallets } = useWallets();
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [full, setFull] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${resourceServerUrl()}/api/stories/${postId}/teaser`)
      .then((r) => r.json())
      .then(setTeaser);
  }, [postId]);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  // The server-side sign route (app/api/hedera/sign) looks the wallet up by
  // Privy's internal wallet id, not its address. That id lives on the
  // matching `linkedAccounts` entry — confirm the field name against your
  // installed @privy-io/react-auth version if this shape has changed.
  const embeddedWalletId = (user?.linkedAccounts.find(
    (a: any) => a.type === "wallet" && a.walletClientType === "privy",
  ) as any)?.id as string | undefined;

  async function handleUnlock() {
    if (!teaser) return;
    if (!authenticated) {
      await login();
      return; // effect below re-runs once `authenticated`/`wallets` update
    }
    if (!embeddedWallet || !embeddedWalletId) return;

    try {
      setStage("checking-balance");
      const account = await fetchAccountState(embeddedWallet.address);
      if (account.balanceTinybars < BigInt(teaser.priceTinybars)) {
        setStage("needs-funding");
        return;
      }

      setStage("paying");
      const signer = new PrivyHederaSigner(embeddedWallet.address, embeddedWalletId);
      const result = await unlockStory(postId, signer);
      setFull(result.full);
      setStage("unlocked");
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    }
  }

  if (!teaser) return null;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>{teaser.teaser}</p>

      {stage === "unlocked" && full ? (
        <>
          <p>{full}</p>
          <a href={teaser.sourceUrl}>Visit the original source →</a>
        </>
      ) : (
        <button onClick={handleUnlock} disabled={!ready || stage === "checking-balance" || stage === "paying"}>
          {authenticated
            ? `Unlock for ${tinybarsToHbar(BigInt(teaser.priceTinybars))} ℏ`
            : "Sign in to unlock the rest"}
        </button>
      )}

      {stage === "needs-funding" && embeddedWallet && (
        <p>
          Your account needs a few cents of HBAR first — tap below to add funds with Apple Pay / Google Pay.
          {/* Wire up buildOnrampUrl() from lib/onramp.ts here once a provider is chosen. */}
        </p>
      )}

      {stage === "error" && <p role="alert">{error}</p>}
    </main>
  );
}
