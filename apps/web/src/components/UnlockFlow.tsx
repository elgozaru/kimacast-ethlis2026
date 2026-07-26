import { useEffect, useRef, useState } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { fetchAccountState, hederaAliasFromEvmAddress, tinybarsToHbar } from "../lib/hedera";
import { PrivyHederaSigner } from "../lib/hedera-privy-signer";
import { unlockStory } from "../lib/x402-fetch";
import type { Teaser } from "./StoryUnlock";

type Stage = "idle" | "checking-balance" | "needs-funding" | "paying" | "unlocked" | "error";

/**
 * Everything that actually needs Privy, split out from StoryUnlock and
 * loaded only once a viewer taps "Unlock" (see StoryUnlock.tsx). Privy
 * pulls in WalletConnect/Reown AppKit's external-wallet connector stack
 * (unused here — this app only uses Privy's embedded wallet) and viem's
 * full chain list, which is a genuinely large dependency graph; mounting
 * PrivyProvider here rather than at the app root means that cost is paid
 * once, on first interaction, instead of on every single page load before
 * anyone has even decided to pay.
 */
function UnlockFlowInner({ postId, teaser }: { postId: string; teaser: Teaser }) {
  const { login, authenticated, ready, user } = usePrivy();
  const { wallets } = useWallets();
  const [stage, setStage] = useState<Stage>("idle");
  const [full, setFull] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The tap that loaded this component already expressed the intent to
  // unlock, so kick off login immediately rather than making the viewer
  // tap twice. Guarded by a ref, not just the dependency array: Privy's
  // `login` function is a new reference on every render of usePrivy(), so
  // without the ref this effect re-fires on every render it causes (open
  // the modal -> Privy's context updates -> re-render -> new `login` ->
  // effect fires again -> ...), which React eventually kills with "Maximum
  // update depth exceeded". The ref makes the call fire exactly once per
  // mount regardless of how often the effect itself re-runs afterward.
  const hasTriggeredLogin = useRef(false);
  useEffect(() => {
    if (ready && !authenticated && !hasTriggeredLogin.current) {
      hasTriggeredLogin.current = true;
      login();
    }
  }, [ready, authenticated, login]);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  // The resource-server's sign route (POST /api/hedera/sign) looks the
  // wallet up by Privy's internal wallet id, not its address. That id
  // lives on the matching `linkedAccounts` entry — confirm the field name
  // against your installed @privy-io/react-auth version if this shape has
  // changed.
  const embeddedWalletId = (user?.linkedAccounts.find(
    (a: any) => a.type === "wallet" && a.walletClientType === "privy",
  ) as any)?.id as string | undefined;

  async function handleUnlock() {
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

  if (stage === "unlocked" && full) {
    return (
      <>
        <p>{full}</p>
        <a href={teaser.sourceUrl}>Visit the original source →</a>
      </>
    );
  }

  if (!authenticated) {
    return <button disabled>{ready ? "Signing you in…" : "Loading…"}</button>;
  }

  // Wallet creation (createOnLogin: "all-users") happens right after
  // authentication completes, not atomically with it — useWallets()/user
  // only pick up the new embedded wallet once Privy's SDK state updates,
  // typically a beat later. Without this check the "Unlock" button below
  // renders immediately post-auth and silently does nothing on tap until
  // that update lands (handleUnlock's embeddedWallet/embeddedWalletId
  // guard just returns early).
  if (!embeddedWallet || !embeddedWalletId) {
    return <button disabled>Creating your wallet…</button>;
  }

  return (
    <>
      <button onClick={handleUnlock} disabled={stage === "checking-balance" || stage === "paying"}>
        Unlock for {tinybarsToHbar(BigInt(teaser.priceTinybars))} ℏ
      </button>

      {stage === "needs-funding" && embeddedWallet && (
        <div>
          <p>Your account needs a few cents of HBAR first.</p>
          {/*
            No onramp provider is wired up yet (see lib/onramp.ts and
            docs/SETUP.md "Funding the viewer's account") — which provider,
            and whether it can deliver directly to a Hedera address, is
            still an open decision, not a bug or a platform limitation.
            Until that's wired up, showing the address lets a tester fund
            it manually (e.g. the Hedera testnet faucet at
            portal.hedera.com accepts this same EVM-style address as an
            alias — see hederaAliasFromEvmAddress in lib/hedera.ts).
          */}
          <p>
            Send HBAR to: <code>{embeddedWallet.address}</code>
            <br />
            (Hedera alias: <code>{hederaAliasFromEvmAddress(embeddedWallet.address)}</code>)
          </p>
        </div>
      )}

      {stage === "error" && <p role="alert">{error}</p>}
    </>
  );
}

export function UnlockFlow(props: { postId: string; teaser: Teaser }) {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        // Email OTP covers "the email associated with their social media
        // account"; Google/Apple login are enabled too since most viewers
        // arriving from Instagram already have one signed in on-device.
        loginMethods: ["email", "google", "apple"],
        embeddedWallets: {
          // Every logged-in viewer gets a non-custodial secp256k1 wallet
          // automatically, with no extra confirmation step.
          createOnLogin: "all-users",
          showWalletUIs: false,
        },
        appearance: {
          walletChainType: "ethereum-only",
          showWalletLoginFirst: false,
        },
      }}
    >
      <UnlockFlowInner {...props} />
    </PrivyProvider>
  );
}
