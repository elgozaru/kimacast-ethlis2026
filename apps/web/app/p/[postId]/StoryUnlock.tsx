"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { tinybarsToHbar } from "../../../lib/hedera";
import { resourceServerUrl } from "../../../lib/resource-server-url";

export type Teaser = { id: string; teaser: string; priceTinybars: string; sourceUrl: string };

// Loaded only once a viewer taps "Unlock", not on every page visit — see
// UnlockFlow.tsx for why that matters. This is the one thing standing
// between "instant page load" and "wait on Privy's entire wallet-connector
// bundle before you can even read the teaser."
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
    fetch(`${resourceServerUrl()}/api/stories/${postId}/teaser`)
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
