import { Suspense, lazy, useEffect, useState } from "react";
import { tinybarsToHbar } from "../lib/hedera";

export type Teaser = { id: string; teaser: string; priceTinybars: string; sourceUrl: string };

// Loaded only once a viewer taps "Unlock", not on every page visit — see
// UnlockFlow.tsx for why that matters. Unlike under Next.js's webpack dev
// compiler (where this split didn't defer any dev-time compile cost —
// verified empirically), Vite's dev server transforms modules on demand
// per-request over native ESM, so this genuinely means Privy's bundle
// isn't even fetched until the viewer taps Unlock.
const UnlockFlow = lazy(() => import("./UnlockFlow").then((mod) => ({ default: mod.UnlockFlow })));

/**
 * The page an Instagram bio-link / story link points at. The teaser and
 * "Unlock" button need nothing from Privy, so they render immediately;
 * everything wallet/payment-related only loads once the viewer actually
 * taps Unlock, so there's still no redirect away from the post thread at
 * any point.
 */
export function StoryUnlock({ postId }: { postId: string }) {
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    fetch(`/api/stories/${postId}/teaser`)
      .then((r) => r.json())
      .then(setTeaser);
  }, [postId]);

  if (!teaser) return null;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>{teaser.teaser}</p>

      {started ? (
        <Suspense fallback={<button disabled>Loading…</button>}>
          <UnlockFlow postId={postId} teaser={teaser} />
        </Suspense>
      ) : (
        <button onClick={() => setStarted(true)}>Unlock for {tinybarsToHbar(BigInt(teaser.priceTinybars))} ℏ</button>
      )}
    </main>
  );
}
