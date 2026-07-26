import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Same rationale as apps/web/vite.config.ts: this config reads env vars
// directly (not exposed to the browser), and the dev proxy keeps the
// browser talking to one same-origin server, avoiding any CORS/forwarded
// hostname footgun.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 3010,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: env.DASHBOARD_API_URL || "http://localhost:4100",
          changeOrigin: true,
        },
      },
    },
  };
});
