import type { ReactNode } from "react";
import { ClientProviders } from "../lib/client-providers";

// @privy-io/react-auth pulls in WalletConnect/Reown AppKit's external-wallet
// connector stack (unused here — this app only uses Privy's embedded
// wallet), which in turn pulls in viem's experimental "tempo" chain
// definition. That chain's worker-pool module does a dynamic `require()`
// that Next.js's Node-based SSR pass can't resolve, crashing the server the
// first time a request actually renders the tree ("Critical dependency:
// the request of a dependency is an expression" during build, a crashed
// dev server / 502 at request time). lib/client-providers.tsx keeps that
// whole chain out of the SSR pass entirely by loading Providers as a
// client-only dynamic import; nothing under it is meaningfully
// server-rendered today anyway (StoryUnlock fetches its content
// client-side in a useEffect), so this costs nothing currently.

export const metadata = {
  title: "Story unlock",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
