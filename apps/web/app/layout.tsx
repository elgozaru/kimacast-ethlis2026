import type { ReactNode } from "react";
import { Providers } from "../lib/providers";

export const metadata = {
  title: "Story unlock",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
