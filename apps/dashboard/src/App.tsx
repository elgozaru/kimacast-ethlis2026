import { Route, Routes } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { Sidebar } from "./components/Sidebar";
import { OnboardingPage } from "./pages/OnboardingPage";
import { AgentOverviewPage } from "./pages/AgentOverviewPage";
import { ContentPage } from "./pages/ContentPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export function App() {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) return null;

  if (!authenticated) {
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
          <Route path="/agents" element={<PlaceholderPage title="My agents" />} />
          <Route path="/sales" element={<PlaceholderPage title="Sales" />} />
          <Route path="/campaigns" element={<PlaceholderPage title="Campaigns" />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Routes>
      </main>
    </div>
  );
}
