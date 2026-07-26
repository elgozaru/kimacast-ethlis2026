import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";

type Agent = {
  id: string;
  name: string;
  ensSubname: string | null;
  status: string;
};

/// Creates a content-publisher agent and deploys it (mints its ENS
/// subname). Settings here cover what the spec asks for: capabilities,
/// source policy, tone, the free/gated split criteria, and default price -
/// everything a generation run and a Post's paywall need downstream.
export function OnboardingPage() {
  const { getAccessToken } = usePrivy();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [toneDescription, setToneDescription] = useState("");
  const [freeField, setFreeField] = useState<"short_post" | "linkedin_summary">("short_post");
  const [defaultPriceTinybars, setDefaultPriceTinybars] = useState("2000000");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const created = await apiFetch<Agent>("/agents", token!, {
        json: {
          name,
          capabilities: ["article-summary", "short-social-post", "three-post-thread"],
          sourcePolicy: "author-authorized",
          settings: { toneDescription, freeGatedSplit: { freeField }, defaultPriceTinybars },
        },
      });
      setAgent(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeploy() {
    if (!agent) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const deployed = await apiFetch<Agent>(`/agents/${agent.id}/deploy`, token!, { json: { label } });
      setAgent(deployed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ maxWidth: 560 }}>
      <div className="page-header">
        <div>
          <h1>Create agent</h1>
          <p>Set up a new content-publisher agent and give it an on-chain identity.</p>
        </div>
      </div>

      <div className="card">
        <div className="form-field">
          <label>Agent name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice Technology Syndication Agent" />
        </div>

        <div className="form-field">
          <label>Prompt tone / voice</label>
          <textarea
            value={toneDescription}
            onChange={(e) => setToneDescription(e.target.value)}
            placeholder="Curious, slightly wry science-communicator voice..."
          />
        </div>

        <div className="form-field">
          <label>What's free vs. gated</label>
          <select value={freeField} onChange={(e) => setFreeField(e.target.value as typeof freeField)}>
            <option value="short_post">Short hook post is free; thread + LinkedIn summary gated</option>
            <option value="linkedin_summary">LinkedIn summary is free; thread + hook gated</option>
          </select>
        </div>

        <div className="form-field">
          <label>Default unlock price (tinybars)</label>
          <input value={defaultPriceTinybars} onChange={(e) => setDefaultPriceTinybars(e.target.value)} />
        </div>

        {!agent && (
          <button className="btn btn-primary" disabled={!name || busy} onClick={handleCreate}>
            Save settings
          </button>
        )}

        {agent && !agent.ensSubname && (
          <>
            <div className="form-field">
              <label>ENS label (e.g. "alice-tech")</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="alice-tech" />
            </div>
            <button className="btn btn-primary" disabled={!label || busy} onClick={handleDeploy}>
              Deploy agent (mint ENS subname)
            </button>
          </>
        )}

        {agent?.ensSubname && (
          <p className="pill pill-green">
            Deployed as <strong style={{ marginLeft: 4 }}>{agent.ensSubname}</strong>
          </p>
        )}

        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </div>
  );
}
