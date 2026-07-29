import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

// bn.js (pulled in by @privy-io/react-auth's wallet-crypto deps) checks
// `window.Buffer` first and only falls back to `require('buffer')` if it's
// missing - and that fallback is what breaks under Vite, which
// externalizes Node built-ins by default (surfacing as "Module 'buffer'
// has been externalized" then a hard "Buffer is not defined" crash mid
// Hedera-signing). Setting this global before any other module runs makes
// bn.js take the first branch and never touch the broken one. This is
// deliberately just the one global bn.js actually reads, set directly,
// rather than routing everything through a bundler plugin - a prior
// attempt at that (vite-plugin-node-polyfills) fixed the crash but made
// cold dependency pre-bundles roughly 3x slower by hooking into esbuild's
// optimizeDeps pipeline for every module, not just this one.
globalThis.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
