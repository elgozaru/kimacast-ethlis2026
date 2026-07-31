import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_AGENTS } from "../lib/mockData";

type Agent = {
  id: string;
  name: string;
  ensSubname: string | null;
  status: string;
  reputationScore: number;
};

/// The "My agents" list: every agent this creator owns, so a creator
/// running several syndication identities (e.g. one per topic/publication)
/// can switch between them instead of the dashboard only ever showing one.
/// Each row links into that agent's own Overview and Content pages
/// (/agents/:agentId, /agents/:agentId/content).
export function AgentsListPage() {
  const { getAccessToken } = usePrivy();
  const [agents, setAgents] = useState<Agent[] | null>(null);

  useEffect(() => {
    if (DEV_MODE) {
      setAgents(MOCK_AGENTS);
      return;
    }
    (async () => {
      const token = await getAccessToken();
      setAgents(await apiFetch<Agent[]>("/agents", token!));
    })();
  }, [getAccessToken]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My agents</h1>
          <p>Every content-publisher agent you've created.</p>
        </div>
        <Link className="btn btn-primary" to="/onboarding" style={{ textDecoration: "none" }}>
          + Create agent
        </Link>
      </div>

      {agents === null && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}

      {agents?.length === 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>No agents yet</h2>
          <p style={{ color: "var(--text-muted)" }}>Create your first content-publisher agent to get started.</p>
          <Link className="btn btn-primary" to="/onboarding" style={{ textDecoration: "none", display: "inline-block" }}>
            + Create agent
          </Link>
        </div>
      )}

      {agents && agents.length > 0 && (
        <div className="grid" style={{ gap: 12 }}>
          {agents.map((agent) => (
            <div className="card" key={agent.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0 }}>{agent.name}</h3>
                <p style={{ color: "var(--text-muted)", margin: "4px 0 0" }}>{agent.ensSubname ?? "(not deployed yet)"}</p>
                <div className="pill-row" style={{ marginTop: 8 }}>
                  <span className="pill pill-green">{agent.status === "deployed" ? "Active · discoverable" : agent.status}</span>
                  <span className="pill pill-orange">Reputation {agent.reputationScore}/100</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="btn btn-ghost" to={`/agents/${agent.id}`} style={{ textDecoration: "none" }}>
                  Overview
                </Link>
                <Link className="btn btn-primary" to={`/agents/${agent.id}/content`} style={{ textDecoration: "none" }}>
                  Content
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
