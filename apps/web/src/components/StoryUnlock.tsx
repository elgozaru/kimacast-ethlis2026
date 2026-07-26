import { Suspense, lazy, useEffect, useState } from "react";
import { tinybarsToHbar } from "../lib/hedera";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_BUNDLE, MOCK_TEASER } from "../lib/mockPost";

export type Teaser = { id: string; teaser: string; priceTinybars: string; sourceUrl: string };

// Loaded only once a viewer taps "Unlock", not on every page visit — see
// UnlockFlow.tsx for why that matters. Unlike under Next.js's webpack dev
// compiler (where this split didn't defer any dev-time compile cost —
// verified empirically), Vite's dev server transforms modules on demand
// per-request over native ESM, so this genuinely means Privy's bundle
// isn't even fetched until the viewer taps Unlock.
const UnlockFlow = lazy(() => import("./UnlockFlow").then((mod) => ({ default: mod.UnlockFlow })));

function IdentityBar({ ensName, reputation }: { ensName: string; reputation: number }) {
  return (
    <div className="identity-bar">
      <div className="identity-bar-left">
        <div className="ens-badge">ENS</div>
        <div>
          <h1>{ensName}</h1>
          <p className="subtitle">Verified publisher agent</p>
        </div>
      </div>
      <span className="pill pill-green">Reputation {reputation}</span>
    </div>
  );
}

function BundlePreviewCard({ teaser, bundle }: { teaser: Teaser; bundle: typeof MOCK_BUNDLE | null }) {
  return (
    <div className="card bundle-card">
      <h2>Premium syndication bundle</h2>
      <p className="lede">Source-grounded, creator-authorized derivatives for downstream publishing.</p>

      <div className="source-block">
        <div className="label">Original source</div>
        <h3>{teaser.teaser}</h3>
        <p className="meta">Includes source hash and 0G provenance reference</p>
      </div>

      <ul className="checklist">
        <li className="checklist-item">
          <div className="checkmark">✓</div>
          <div style={{ flex: 1 }}>
            <div className="title">X thread</div>
            <div className="detail">3 source-grounded posts</div>
            {bundle && (
              <div className="body">
                {bundle.three_post_thread.map((t, i) => (
                  <p key={i} style={{ margin: "6px 0" }}>
                    {t}
                  </p>
                ))}
              </div>
            )}
          </div>
        </li>
        <li className="checklist-item">
          <div className="checkmark">✓</div>
          <div style={{ flex: 1 }}>
            <div className="title">LinkedIn summary</div>
            <div className="detail">Professional-register summary</div>
            {bundle && <p className="body">{bundle.linkedin_summary}</p>}
          </div>
        </li>
        <li className="checklist-item">
          <div className="checkmark">✓</div>
          <div style={{ flex: 1 }}>
            <div className="title">Citation pack</div>
            <div className="detail">Claims + canonical source URL</div>
            {bundle && (
              <ul className="body" style={{ paddingLeft: 18, margin: "6px 0" }}>
                {bundle.claims_used.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
        <li className="checklist-item">
          <div className="checkmark">✓</div>
          <div style={{ flex: 1 }}>
            <div className="title">Commercial terms</div>
            <div className="detail">Machine-readable republishing policy</div>
          </div>
        </li>
      </ul>

      {!bundle && <div className="preview-banner">Preview only · full bundle unlocks after settlement</div>}
    </div>
  );
}

/**
 * The page an Instagram bio-link / story link points at. The teaser and
 * "Unlock" button need nothing from Privy, so they render immediately;
 * everything wallet/payment-related only loads once the viewer actually
 * taps Unlock, so there's still no redirect away from the post thread at
 * any point.
 *
 * DEV_MODE (VITE_DEV_MODE=true) bypasses the real teaser fetch and the
 * entire Privy/Hedera/x402 flow with a hardcoded example bundle, so this
 * page's visual design can be evaluated without a working ENS/Hedera/Privy
 * backend - see lib/mockPost.ts.
 */
export function StoryUnlock({ postId }: { postId: string }) {
  const [teaser, setTeaser] = useState<Teaser | null>(DEV_MODE ? MOCK_TEASER : null);
  const [started, setStarted] = useState(false);
  const [devUnlocked, setDevUnlocked] = useState(false);

  useEffect(() => {
    if (DEV_MODE) return;
    fetch(`/api/stories/${postId}/teaser`)
      .then((r) => r.json())
      .then(setTeaser);
  }, [postId]);

  if (!teaser) return null;

  return (
    <div className="paywall-shell">
      {DEV_MODE && (
        <div className="dev-mode-banner">
          DEV_MODE preview — no real payment, ENS, or Hedera call happens on this page.
        </div>
      )}

      <IdentityBar ensName={DEV_MODE ? "alice-tech.kymacast.eth (mock)" : "publisher-agent.kymacast.eth"} reputation={84} />

      <div className="paywall-grid">
        <BundlePreviewCard teaser={teaser} bundle={devUnlocked ? MOCK_BUNDLE : null} />

        {DEV_MODE ? (
          devUnlocked ? (
            <div className="card">
              <p className="pill pill-green">Bundle unlocked</p>
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 10 }}>
                This is a DEV_MODE simulation — no HBAR moved, no ENS/Hedera call was made.
              </p>
            </div>
          ) : (
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
                <div className="label">Pay to</div>
                <div className="value">alice-tech.kymacast.eth (mock)</div>
              </div>
              <div className="payment-field">
                <div className="label">Network</div>
                <div className="value">Hedera Testnet</div>
              </div>

              <span className="pill pill-teal" style={{ marginBottom: 16 }}>
                Facilitator sponsors network fee
              </span>

              <button className="btn btn-orange" onClick={() => setDevUnlocked(true)}>
                Sign &amp; unlock bundle (mock)
              </button>
              <p className="disclaimer">DEV_MODE — clicking this does not call Privy, Hedera, or the facilitator.</p>
            </div>
          )
        ) : started ? (
          <Suspense fallback={<div className="card">Loading…</div>}>
            <UnlockFlow postId={postId} teaser={teaser} />
          </Suspense>
        ) : (
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
            <button className="btn btn-orange" onClick={() => setStarted(true)}>
              Sign &amp; unlock bundle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
