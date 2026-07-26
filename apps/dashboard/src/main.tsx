import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { App } from "./App";
import "./styles.css";

// Unlike apps/web, PrivyProvider IS mounted at the root here: the dashboard
// is a creator tool behind a login wall from the first screen, not a public
// viewer page - there's no "read the teaser without Privy" path to protect,
// so there's nothing to gain from lazy-loading it.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "apple", "wallet"],
        embeddedWallets: { createOnLogin: "all-users" },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>,
);
