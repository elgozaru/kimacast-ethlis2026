"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Privy is the entire "onboarding" surface for a viewer: no separate wallet
 * app, no seed phrase, no redirect away from the Instagram-linked page. The
 * modal below is what opens *in place* when a viewer taps "Unlock".
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
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
      {children}
    </PrivyProvider>
  );
}
