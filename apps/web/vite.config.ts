import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Vite only auto-exposes VITE_-prefixed vars to import.meta.env in app
  // code; this config file itself needs an explicit loadEnv call to read
  // .env/.env.local at all (the empty third argument means "load every
  // var, not just VITE_-prefixed ones", since RESOURCE_SERVER_URL below is
  // deliberately unprefixed — it's consumed here in Node, never shipped to
  // the browser).
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
      // Cloud dev environments (this one included) serve the page from a
      // forwarded preview hostname, not localhost; Vite 5+ rejects unknown
      // Host headers by default as a DNS-rebinding protection. This is a
      // dev server only (production is a static `vite build`, no
      // Host-header surface at all), so disabling the check here is
      // low-risk — narrow it to a specific suffix (e.g. [".app.github.dev"])
      // instead if you want to keep the check for a specific known provider.
      allowedHosts: true,
      proxy: {
        // Same-origin from the browser's point of view, in both dev and any
        // production deployment that reverse-proxies resource-server under
        // this same origin — this is what makes lib/hedera-privy-signer.ts's
        // relative `fetch("/api/hedera/sign", ...)` and the rest of the
        // app's `/api/*` calls work without any CORS or "which forwarded
        // hostname is the API on" logic at all.
        "/api": {
          target: env.RESOURCE_SERVER_URL || "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});
