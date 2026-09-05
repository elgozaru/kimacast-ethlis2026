import { Route, Routes } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { Sidebar } from "./components/Sidebar";
import { OnboardingPage } from "./pages/OnboardingPage";
import { AgentOverviewPage } from "./pages/AgentOverviewPage";
import { AgentsListPage } from "./pages/AgentsListPage";
import { AgentSettingsPage } from "./pages/AgentSettingsPage";
import { ContentPage } from "./pages/ContentPage";
import { SocialConnectionsPage } from "./pages/SocialConnectionsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { DEV_MODE } from "./lib/devMode";

export function App() {
  const { ready, authenticated, login } = usePrivy();

  // DEV_MODE skips Privy login entirely (as well as every dashboard-api
  // call, inside each page) - see lib/devMode.ts and lib/mockData.ts.
  if (!DEV_MODE && !ready) return null;

  if (!DEV_MODE && !authenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="card" style={{ textAlign: "center", maxWidth: 360 }}>
          <h2>Publisher Agents</h2>
          <p style={{ color: "var(--text-muted)" }}>Sign in to create and manage your content-publisher agents.</p>
          <button className="btn btn-primary" onClick={() => login()}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<AgentOverviewPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/agents" element={<AgentsListPage />} />
          <Route path="/agents/:agentId" element={<AgentOverviewPage />} />
          <Route path="/agents/:agentId/content" element={<ContentPage />} />
          <Route path="/agents/:agentId/settings" element={<AgentSettingsPage />} />
          <Route path="/connections" element={<SocialConnectionsPage />} />
          <Route path="/sales" element={<PlaceholderPage title="Sales" />} />
          <Route path="/campaigns" element={<PlaceholderPage title="Campaigns" />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Routes>
      </main>
    </div>
  );
}
