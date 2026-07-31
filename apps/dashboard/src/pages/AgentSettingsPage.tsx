import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_AGENTS, MOCK_ZG_COMPUTE_PROVIDERS } from "../lib/mockData";

type Agent = { id: string; name: string; settings: Record<string, any> };
type ZgComputeProvider = { provider: string; model: string; verifiability: string; inputPrice: string; outputPrice: string };

/// Edits an EXISTING agent's settings - the counterpart to OnboardingPage's
/// create form, which only ever writes these fields once, at creation.
/// Deliberately does NOT touch ENS/deploy: settings (including which
/// generation provider an agent uses) are read fresh from the database on
/// every /sources/:sourceId/generate call, so switching providers here
/// takes effect on the next generation - no redeploy, no ENS re-mint.
export function AgentSettingsPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { getAccessToken } = usePrivy();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [toneDescription, setToneDescription] = useState("");
  const [freeField, setFreeField] = useState<"short_post" | "linkedin_summary">("short_post");
  const [defaultPriceTinybars, setDefaultPriceTinybars] = useState("2000000");
  const [socialChannels, setSocialChannels] = useState<string[]>(["x"]);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [generationProvider, setGenerationProvider] = useState<"anthropic" | "0g-compute">("anthropic");
  const [zgComputeProviders, setZgComputeProviders] = useState<ZgComputeProvider[] | null>(null);
  const [zgComputeSelection, setZgComputeSelection] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      let loaded: Agent | null;
      if (DEV_MODE) {
        const mock = MOCK_AGENTS.find((a) => a.id === agentId);
        loaded = mock ? { ...mock, settings: (mock as any).settings ?? {} } : null;
      } else {
        const token = await getAccessToken();
        loaded = await apiFetch<Agent>(`/agents/${agentId}`, token!);
      }
      setAgent(loaded);
      const settings = loaded?.settings ?? {};
      setToneDescription(settings.toneDescription ?? "");
      setFreeField(settings.freeGatedSplit?.freeField ?? "short_post");
      setDefaultPriceTinybars(settings.defaultPriceTinybars ?? "2000000");
      setSocialChannels(settings.socialChannels ?? ["x"]);
      setTelegramChatId(settings.telegramChatId ?? "");
      setGenerationProvider(settings.generationProvider === "0g-compute" ? "0g-compute" : "anthropic");
      if (settings.zgComputeProviderAddress) {
        setZgComputeSelection(`${settings.zgComputeProviderAddress}|${settings.zgComputeModel ?? ""}`);
        loadZgComputeProviders();
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, getAccessToken]);

  async function loadZgComputeProviders() {
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

  async function handleSave() {
    if (!agent) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const [zgComputeProviderAddress, zgComputeModel] = zgComputeSelection.split("|");
    const settings = {
      toneDescription,
      freeGatedSplit: { freeField },
      defaultPriceTinybars,
      socialChannels,
      telegramChatId,
      generationProvider,
      ...(generationProvider === "0g-compute" ? { zgComputeProviderAddress, zgComputeModel } : {}),
    };
    if (DEV_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSaved(true);
      setBusy(false);
      return;
    }
    try {
      const token = await getAccessToken();
      await apiFetch(`/agents/${agent.id}`, token!, { method: "PATCH", json: { settings } });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  if (!agent) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Agent not found</h2>
      </div>
    );
  }

  return (
    <div className="grid" style={{ maxWidth: 560 }}>
      <div className="page-header">
        <div>
          <h1>Agent settings</h1>
          <p>{agent.name} - changes apply on the next generation run, no redeploy needed.</p>
        </div>
      </div>

      <div className="card">
        <div className="form-field">
          <label>Prompt tone / voice</label>
          <textarea value={toneDescription} onChange={(e) => setToneDescription(e.target.value)} />
        </div>

        <div className="form-field">
          <label>Generation model</label>
          <select
            value={generationProvider}
            onChange={(e) => {
              const value = e.target.value as typeof generationProvider;
              setGenerationProvider(value);
              if (value === "0g-compute" && !zgComputeProviders) loadZgComputeProviders();
            }}
          >
            <option value="anthropic">Claude (Anthropic API)</option>
            <option value="0g-compute">0G Compute Network (paid in 0G testnet tokens)</option>
          </select>
          {generationProvider === "0g-compute" && (
            <>
              <select value={zgComputeSelection} onChange={(e) => setZgComputeSelection(e.target.value)} style={{ marginTop: 6 }}>
                <option value="">{zgComputeProviders ? "Choose a provider/model…" : "Loading providers…"}</option>
                {zgComputeProviders?.map((p) => (
                  <option key={`${p.provider}|${p.model}`} value={`${p.provider}|${p.model}`}>
                    {p.model} — {p.provider.slice(0, 10)}… ({p.verifiability})
                  </option>
                ))}
              </select>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                Same prompts either way - only the model producing the output changes. Requires{" "}
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

        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-primary" disabled={busy} onClick={handleSave}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate(`/agents/${agent.id}`)}>
            Back to overview
          </button>
        </div>

        {saved && <p className="pill pill-green" style={{ marginTop: 12 }}>Saved</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      </div>
    </div>
  );
}
