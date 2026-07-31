import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_ZG_COMPUTE_PROVIDERS } from "../lib/mockData";

type Agent = {
  id: string;
  name: string;
  ensSubname: string | null;
  status: string;
};

type ZgComputeProvider = { provider: string; model: string; verifiability: string; inputPrice: string; outputPrice: string };

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
  const [socialChannels, setSocialChannels] = useState<string[]>(["x"]);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [generationProvider, setGenerationProvider] = useState<"anthropic" | "0g-compute">("anthropic");
  const [zgComputeProviders, setZgComputeProviders] = useState<ZgComputeProvider[] | null>(null);
  const [zgComputeSelection, setZgComputeSelection] = useState(""); // "provider|model"
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadZgComputeProviders() {
    if (zgComputeProviders) return; // already loaded
    if (DEV_MODE) {
      setZgComputeProviders(MOCK_ZG_COMPUTE_PROVIDERS);
      return;
    }
    try {
      const token = await getAccessToken();
      setZgComputeProviders(await apiFetch<ZgComputeProvider[]>("/zg-compute/providers", token!));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    if (DEV_MODE) {
      // No dashboard-api call at all - see lib/devMode.ts. The agent
      // isn't "deployed" yet at this point (no ensSubname), matching the
      // real create->deploy two-step flow below.
      await new Promise((resolve) => setTimeout(resolve, 300));
      setAgent({ id: "dev-mock-agent-new", name, ensSubname: null, status: "draft" });
      setBusy(false);
      return;
    }
    try {
      const token = await getAccessToken();
      const [zgComputeProviderAddress, zgComputeModel] = zgComputeSelection.split("|");
      const created = await apiFetch<Agent>("/agents", token!, {
        json: {
          name,
          capabilities: ["article-summary", "short-social-post", "three-post-thread"],
          sourcePolicy: "author-authorized",
          settings: {
            toneDescription,
            freeGatedSplit: { freeField },
            defaultPriceTinybars,
            socialChannels,
            telegramChatId,
            generationProvider,
            ...(generationProvider === "0g-compute" ? { zgComputeProviderAddress, zgComputeModel } : {}),
          },
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
    if (DEV_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAgent({ ...agent, ensSubname: `${label}.kymacast.eth`, status: "deployed" });
      setBusy(false);
      return;
    }
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
          <label>Generation model</label>
          <select
            value={generationProvider}
            onChange={(e) => {
              const value = e.target.value as typeof generationProvider;
              setGenerationProvider(value);
              if (value === "0g-compute") loadZgComputeProviders();
            }}
          >
            <option value="anthropic">Claude (Anthropic API)</option>
            <option value="0g-compute">0G Compute Network (paid in 0G testnet tokens)</option>
          </select>
          {generationProvider === "0g-compute" && (
            <>
              <select
                value={zgComputeSelection}
                onChange={(e) => setZgComputeSelection(e.target.value)}
                style={{ marginTop: 6 }}
              >
                <option value="">{zgComputeProviders ? "Choose a provider/model…" : "Loading providers…"}</option>
                {zgComputeProviders?.map((p) => (
                  <option key={`${p.provider}|${p.model}`} value={`${p.provider}|${p.model}`}>
                    {p.model} — {p.provider.slice(0, 10)}… ({p.verifiability})
                  </option>
                ))}
              </select>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                Runs on 0G's decentralized inference marketplace instead of Claude - a different (open-weight) model, paid from
                your 0G Compute ledger balance rather than an Anthropic API key. Requires{" "}
                <code>ZEROG_COMPUTE_PRIVATE_KEY</code> configured on dashboard-api, funded with 0G testnet ("Galileo") tokens.
              </p>
            </>
          )}
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

        <div className="form-field">
          <label>Publish to</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={socialChannels.includes("x")}
              onChange={(e) => setSocialChannels((prev) => (e.target.checked ? [...prev, "x"] : prev.filter((c) => c !== "x")))}
            />
            X (Twitter)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 6 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={socialChannels.includes("telegram")}
              onChange={(e) =>
                setSocialChannels((prev) => (e.target.checked ? [...prev, "telegram"] : prev.filter((c) => c !== "telegram")))
              }
            />
            Telegram
          </label>
          {socialChannels.includes("telegram") && (
            <input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Telegram chat/channel ID (e.g. -1001234567890)"
              style={{ marginTop: 6, marginLeft: 24, width: "calc(100% - 24px)" }}
            />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 6, color: "var(--text-muted)" }}>
            <input type="checkbox" style={{ width: "auto" }} disabled />
            Facebook <span style={{ fontStyle: "italic" }}>(coming soon - requires Meta App Review)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, marginTop: 6, color: "var(--text-muted)" }}>
            <input type="checkbox" style={{ width: "auto" }} disabled />
            Instagram <span style={{ fontStyle: "italic" }}>(coming soon - requires Meta App Review)</span>
          </label>
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
