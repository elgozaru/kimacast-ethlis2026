"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Next.js only allows `ssr: false` dynamic imports inside a Client
// Component, not a Server Component like app/layout.tsx — hence this
// wrapper. See app/layout.tsx for why Providers needs to skip SSR at all.
const Providers = dynamic(() => import("./providers").then((mod) => mod.Providers), { ssr: false });

export function ClientProviders({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
