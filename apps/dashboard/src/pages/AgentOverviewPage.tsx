import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_AGENT, MOCK_PENDING_POST } from "../lib/mockData";

type Agent = {
  id: string;
  name: string;
  ensSubname: string | null;
  status: string;
  reputationScore: number;
};

type Post = {
  id: string;
  teaser: string;
  status: string;
};

/// Mirrors the "Agent overview" mockup: ENS identity card + status pills,
/// a 2x2 stat-tile grid, the latest source, and the latest generated
/// bundle with an inline Approve action - the "preview posts in the same
/// page" requirement.
export function AgentOverviewPage() {
  const { getAccessToken } = usePrivy();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [pendingPost, setPendingPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEV_MODE) {
      setAgent(MOCK_AGENT);
      setPendingPost(MOCK_PENDING_POST);
      setLoading(false);
      return;
    }
    (async () => {
      const token = await getAccessToken();
      const agents = await apiFetch<Agent[]>("/agents", token!);
      const first = agents[0] ?? null;
      setAgent(first);
      if (first) {
        const posts = await apiFetch<Post[]>(`/agents/${first.id}/posts`, token!);
        setPendingPost(posts.find((p) => p.status === "pending") ?? null);
      }
      setLoading(false);
    })();
  }, [getAccessToken]);

  async function approve(postId: string) {
    if (DEV_MODE) {
      setPendingPost(null);
      return;
    }
    const token = await getAccessToken();
    await apiFetch(`/posts/${postId}/approve`, token!, { json: {} });
    setPendingPost(null);
  }

  if (loading) return null;

  if (!agent) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>No agents yet</h2>
        <p style={{ color: "var(--text-muted)" }}>Create your first content-publisher agent to get started.</p>
        <Link className="btn btn-primary" to="/onboarding" style={{ textDecoration: "none", display: "inline-block" }}>
          + Create agent
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Agent overview</h1>
          <p>Monitor identity, generation, revenue, and demand.</p>
        </div>
        <Link className="btn btn-primary" to="/onboarding" style={{ textDecoration: "none" }}>
          + Create agent
        </Link>
      </div>

      <div className="grid grid-cols-2" style={{ marginBottom: 20 }}>
        <div className="card identity-card">
          <div className="ens-badge">ENS</div>
          <div>
            <h2>{agent.ensSubname ?? "(not deployed yet)"}</h2>
            <p className="subtitle">{agent.name}</p>
            <div className="pill-row">
              <span className="pill pill-green">{agent.status === "deployed" ? "Active · discoverable" : agent.status}</span>
              <span className="pill pill-purple">0G connected</span>
              <span className="pill pill-orange">x402 live</span>
            </div>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-tile">
            <div className="label">Revenue</div>
            <div className="value">— HBAR</div>
          </div>
          <div className="stat-tile">
            <div className="label">Paid deliveries</div>
            <div className="value">—</div>
          </div>
          <div className="stat-tile">
            <div className="label">Unique buyers</div>
            <div className="value">—</div>
          </div>
          <div className="stat-tile">
            <div className="label">Reputation</div>
            <div className="value">{agent.reputationScore} / 100</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Latest source</h3>
          <p style={{ color: "var(--text-muted)" }}>
            Ingest a source and run generation from the <Link to="/content">Content</Link> page.
          </p>

          <h3>Generated bundle</h3>
          {pendingPost ? (
            <div className="bundle-block">
              <div className="label">X post</div>
              <p>{pendingPost.teaser}</p>
              <div className="bundle-actions">
                <button className="btn btn-primary" onClick={() => approve(pendingPost.id)}>
                  Approve
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>No pending suggestions right now.</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Next-content campaign</h3>
          <p style={{ color: "var(--text-muted)" }}>Let followers pre-fund the next topic.</p>
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Not part of this iteration yet.</p>
        </div>
      </div>
    </div>
  );
}
