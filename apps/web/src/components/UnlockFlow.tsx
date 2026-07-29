import { useEffect, useRef, useState } from "react";
import { PrivyProvider, useSessionSigners, usePrivy, useWallets } from "@privy-io/react-auth";
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
  const { addSessionSigners } = useSessionSigners();
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
      // Grants apps/resource-server's Privy authorization key server-side
      // access to THIS wallet - without it, the server-side secp256k1Sign
      // call in hedera-sign.ts can't act on the wallet at all (that's what
      // was causing wallet.publicKey to never populate no matter how long
      // we retried: it wasn't a propagation-lag problem, access had simply
      // never been granted). This app's embedded wallets use Privy's TEE
      // execution model, not on-device execution, so the delegation API is
      // useSessionSigners/addSessionSigners rather than
      // useDelegatedActions/delegateWallet (Privy throws a runtime error if
      // you use the on-device hook against a TEE-execution app). The
      // signerId is the PUBLIC id of the authorization key registered in
      // the Privy dashboard (Wallet infrastructure -> Authorization keys) -
      // the matching private half lives server-side only, as
      // PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY in apps/resource-server/.env.
      // Safe to call on every unlock attempt - once a wallet already has
      // this signer, it's a no-op from the viewer's perspective.
      await addSessionSigners({
        address: embeddedWallet.address,
        signers: [{ signerId: import.meta.env.VITE_PRIVY_SESSION_SIGNER_ID }],
      });

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
      <div className="card">
        <p className="pill pill-green">Bundle unlocked</p>
        <p style={{ marginTop: 12 }}>{full}</p>
        <a href={teaser.sourceUrl}>Visit the original source →</a>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="card">
        <button className="btn btn-orange" disabled>
          {ready ? "Signing you in…" : "Loading…"}
        </button>
      </div>
    );
  }

  // Wallet creation (createOnLogin: "all-users") happens right after
  // authentication completes, not atomically with it — useWallets()/user
  // only pick up the new embedded wallet once Privy's SDK state updates,
  // typically a beat later. Without this check the "Unlock" button below
  // renders immediately post-auth and silently does nothing on tap until
  // that update lands (handleUnlock's embeddedWallet/embeddedWalletId
  // guard just returns early).
  if (!embeddedWallet || !embeddedWalletId) {
    return (
      <div className="card">
        <button className="btn btn-orange" disabled>
          Creating your wallet…
        </button>
      </div>
    );
  }

  return (
    <div className="card payment-card">
      <div className="payment-badge-row">
        <div className="payment-badge">402</div>
        <div>
          <h2>Payment required</h2>
          <p className="lede" style={{ margin: 0 }}>
            One request. One settlement. No subscription.
          </p>
        </div>
      </div>

      <div className="price-display">{tinybarsToHbar(BigInt(teaser.priceTinybars))} ℏ</div>

      <div className="payment-field">
        <div className="label">Network</div>
        <div className="value">Hedera Testnet</div>
      </div>

      <span className="pill pill-teal" style={{ marginBottom: 16 }}>
        Facilitator sponsors network fee
      </span>

      <button className="btn btn-orange" onClick={handleUnlock} disabled={stage === "checking-balance" || stage === "paying"}>
        {stage === "paying" ? "Signing…" : "Sign & unlock bundle"}
      </button>

      {stage === "needs-funding" && embeddedWallet && (
        <div style={{ marginTop: 16 }}>
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

      {stage === "error" && (
        <p role="alert" style={{ color: "#dc2626", marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
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
