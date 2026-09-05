import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_SOCIAL_CONNECTIONS } from "../lib/mockData";

type Connection = {
  id: string;
  platform: string;
  platformUsername: string;
  expiresAt: string | null;
  createdAt: string;
};

const PLATFORM_LABELS: Record<string, string> = { x: "X (Twitter)", instagram: "Instagram" };
const EXPIRY_WARNING_DAYS = 14;

function expiryPill(expiresAt: string | null) {
  if (!expiresAt) return null;
  const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysLeft < 0) return <span className="pill pill-red">Expired</span>;
  if (daysLeft < EXPIRY_WARNING_DAYS) return <span className="pill pill-orange">Expires in {Math.ceil(daysLeft)}d</span>;
  return <span className="pill pill-green">Connected</span>;
}

/// Lets a creator connect their OWN X/Instagram account, independent of any
/// one agent - which specific connection an agent actually posts through
/// is chosen per publish/schedule action instead (see ContentPage), not
/// fixed here. Telegram isn't listed: it stays on the bot-admin model
/// (agent.settings.telegramChatId, set in Onboarding/Agent settings), with
/// no per-creator login to connect.
export function SocialConnectionsPage() {
  const { getAccessToken } = usePrivy();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();

  async function load() {
    if (DEV_MODE) {
      setConnections(MOCK_SOCIAL_CONNECTIONS);
      return;
    }
    const token = await getAccessToken();
    setConnections(await apiFetch<Connection[]>("/social/connections", token!));
  }

  useEffect(() => {
    load();
    const callbackError = params.get("error");
    if (callbackError) setError(callbackError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(platform: string) {
    setBusyPlatform(platform);
    setError(null);
    try {
      if (DEV_MODE) {
        window.alert(`DEV_MODE: would redirect to ${platform}'s OAuth consent screen here.`);
        return;
      }
      const token = await getAccessToken();
      const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(`/social/${platform}/connect`, token!);
      window.location.href = authorizeUrl;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyPlatform(null);
    }
  }

  async function disconnect(id: string) {
    if (DEV_MODE) {
      setConnections((prev) => prev?.filter((c) => c.id !== id) ?? null);
      return;
    }
    try {
      const token = await getAccessToken();
      await apiFetch(`/social/connections/${id}`, token!, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Connections</h1>
          <p>Connect the social accounts your agents can publish through. Choose which one to use per post when you publish or schedule.</p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20, borderColor: "#dc2626" }}>
          <p style={{ color: "#dc2626", margin: 0 }}>{error}</p>
        </div>
      )}

      {(["x", "instagram"] as const).map((platform) => (
        <div className="card" style={{ marginBottom: 20 }} key={platform}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{PLATFORM_LABELS[platform]}</h3>
            <button className="btn btn-primary" disabled={busyPlatform === platform} onClick={() => connect(platform)}>
              {busyPlatform === platform ? "Redirecting…" : `+ Connect ${PLATFORM_LABELS[platform]}`}
            </button>
          </div>

          {platform === "instagram" && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: -4, marginBottom: 12 }}>
              Requires a Professional (Business or Creator) Instagram account linked to a Facebook Page - personal accounts
              have no publishing API. Convert for free in the Instagram app under Settings → Account type.
            </p>
          )}

          {!connections && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}

          {connections && connections.filter((c) => c.platform === platform).length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>No {PLATFORM_LABELS[platform]} accounts connected yet.</p>
          )}

          {connections
            ?.filter((c) => c.platform === platform)
            .map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>@{c.platformUsername}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Connected {new Date(c.createdAt).toLocaleDateString()}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {expiryPill(c.expiresAt)}
                  <button className="btn btn-ghost" onClick={() => disconnect(c.id)}>
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
