import type { ReactNode } from "react";

export const metadata = {
  title: "Story unlock",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
