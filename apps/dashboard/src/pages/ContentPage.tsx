import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_AGENTS, MOCK_DEFAULT_CONNECTIONS, MOCK_GENERATIONS, MOCK_SOCIAL_CONNECTIONS, MOCK_SOURCES } from "../lib/mockData";

type Agent = { id: string; name: string };
type Connection = { id: string; platform: string; platformUsername: string };
/// Platforms a connection can be picked for - Telegram stays on the
/// bot-admin model (agent.settings.telegramChatId), no connection to pick.
const CONNECTABLE_PLATFORMS = ["x", "instagram"] as const;
const PLATFORM_LABELS: Record<string, string> = { x: "X", instagram: "Instagram" };
type ContentSource = { id: string; title: string };
type SourceListItem = {
  id: string;
  title: string;
  sourceType: string;
  canonicalUrl: string | null;
  author: string | null;
  retrievedAt: string;
  createdAt: string;
};
type GenerationResult = {
  id: string;
  promptVersion: string;
  content: {
    short_post: string;
    three_post_thread: string[];
    linkedin_summary: string;
    claims_used: string[];
    source_url: string;
  };
};
type Post = { id: string; status: string; teaser: string; scheduledFor?: string | null };

const VARIANT_LABELS: Record<string, string> = {
  "v1-generic": "Generic summarization",
  "v2-author-tone": "Author tone profile",
  "v2-source-grounded": "Source-grounded rules",
};

type SourceKind = "text" | "url" | "pdf" | "rss";
const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  text: "Paste text",
  url: "Website URL",
  pdf: "Upload PDF",
  rss: "RSS feed",
};
const SOURCE_TYPE_LABELS: Record<string, string> = { text: "Pasted text", url: "Website", pdf: "PDF", rss: "RSS" };

/// Base64-encodes a File's raw bytes for the /agents/:agentId/sources
/// route's `pdfBase64` field - a plain fetch() body, not FormData, so
/// dashboard-api needs no multipart-parsing middleware for this one route.
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/// The "preview posts in the same page" surface: paste/point at a source,
/// run all 3 required prompt variants, compare them side by side, and
/// either approve the one that reads best (creating a real, price-able
/// Post) or go tweak the agent's tone settings and try again.
export function ContentPage() {
  const { agentId } = useParams<{ agentId?: string }>();
  const { getAccessToken } = usePrivy();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [postsByGeneration, setPostsByGeneration] = useState<Record<string, Post>>({});
  const [scheduleInputs, setScheduleInputs] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<SourceListItem[] | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [defaultConnections, setDefaultConnections] = useState<Record<string, string>>({});
  const [channelSelections, setChannelSelections] = useState<Record<string, Record<string, string>>>({});
  const [scheduleWarnings, setScheduleWarnings] = useState<Record<string, { channel: string; message: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSources(currentAgentId: string) {
    if (DEV_MODE) {
      setSources(MOCK_SOURCES);
      return;
    }
    const token = await getAccessToken();
    setSources(await apiFetch<SourceListItem[]>(`/agents/${currentAgentId}/sources`, token!));
  }

  /// Every connected X/Instagram account (so the per-post picker below has
  /// options), and this agent's derived per-channel default (see
  /// social/connectionDefaults.ts) - "the latest one used", falling back to
  /// the creator's most-recently-connected account if this agent has never
  /// published on that platform yet.
  async function loadConnections(currentAgentId: string) {
    if (DEV_MODE) {
      setConnections(MOCK_SOCIAL_CONNECTIONS);
      setDefaultConnections(MOCK_DEFAULT_CONNECTIONS);
      return;
    }
    const token = await getAccessToken();
    const [allConnections, defaults] = await Promise.all([
      apiFetch<Connection[]>("/social/connections", token!),
      apiFetch<Record<string, string>>(`/agents/${currentAgentId}/default-connections`, token!),
    ]);
    setConnections(allConnections);
    setDefaultConnections(defaults);
  }

  useEffect(() => {
    if (DEV_MODE) {
      const selected = (agentId ? MOCK_AGENTS.find((a) => a.id === agentId) : MOCK_AGENTS[0]) ?? null;
      setAgent(selected);
      if (selected) {
        loadSources(selected.id);
        loadConnections(selected.id);
      }
      return;
    }
    (async () => {
      const token = await getAccessToken();
      const selected = agentId
        ? await apiFetch<Agent>(`/agents/${agentId}`, token!)
        : (await apiFetch<Agent[]>("/agents", token!))[0] ?? null;
      setAgent(selected);
      if (selected) {
        loadSources(selected.id);
        loadConnections(selected.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, getAccessToken]);

  /// The connection to use for one generation's channel right now: the
  /// creator's explicit pick for this suggestion if they changed it,
  /// otherwise this agent's derived default - editable up until the moment
  /// Publish/Schedule is actually clicked (see resolvedConnections below).
  function selectedConnectionFor(generationId: string, platform: string): string {
    return channelSelections[generationId]?.[platform] ?? defaultConnections[platform] ?? "";
  }

  function resolvedConnections(generationId: string): Record<string, string> {
    const picked: Record<string, string> = {};
    for (const platform of CONNECTABLE_PLATFORMS) {
      const value = selectedConnectionFor(generationId, platform);
      if (value) picked[platform] = value;
    }
    return picked;
  }

  // What counts as "ready to generate" differs per source type - content.ts's
  // sourceInputFromBody picks the SourceInput variant from whichever of
  // these fields is actually present, so this just mirrors that logic for
  // the button's disabled state.
  const canGenerate =
    sourceKind === "text" ? Boolean(title && content) : sourceKind === "url" ? Boolean(url) : sourceKind === "pdf" ? Boolean(pdfFile) : Boolean(feedUrl);

  async function runPipeline() {
    if (!agent || !canGenerate) return;
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      if (DEV_MODE) {
        // A beat of fake latency so the "Generating…" state is visible -
        // matches what running the real 3-variant pipeline actually feels
        // like, without needing dashboard-api at all.
        await new Promise((resolve) => setTimeout(resolve, 400));
        setResults(MOCK_GENERATIONS);
        return;
      }
      const token = await getAccessToken();
      const body =
        sourceKind === "text"
          ? { title, content }
          : sourceKind === "url"
            ? { url }
            : sourceKind === "pdf"
              ? { pdfBase64: await fileToBase64(pdfFile!), title: title || pdfFile!.name }
              : { feedUrl };
      const source = await apiFetch<ContentSource>(`/agents/${agent.id}/sources`, token!, { json: body });
      const generations = await apiFetch<GenerationResult[]>(`/sources/${source.id}/generate`, token!, { json: {} });
      setResults(generations);
      loadSources(agent.id); // pick up the newly-ingested (or reused) source
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /// Re-runs generation against a source that's already been ingested
  /// (see the "Previously registered sources" list below), instead of
  /// resubmitting the raw text/URL/PDF/feed - the same endpoint
  /// runPipeline() calls after ingesting, just skipping straight to it.
  /// Useful for re-generating with a different agent.settings.
  /// generationProvider (e.g. after switching to 0G Compute) without
  /// re-pasting the article.
  async function generateFromSource(sourceId: string) {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      if (DEV_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        setResults(MOCK_GENERATIONS);
        return;
      }
      const token = await getAccessToken();
      const generations = await apiFetch<GenerationResult[]>(`/sources/${sourceId}/generate`, token!, { json: {} });
      setResults(generations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndApprove(generationId: string) {
    if (DEV_MODE) {
      const generation = MOCK_GENERATIONS.find((g) => g.id === generationId)!;
      setPostsByGeneration((prev) => ({
        ...prev,
        [generationId]: { id: `dev-mock-post-${generationId}`, status: "approved", teaser: generation.content.short_post },
      }));
      return;
    }
    const token = await getAccessToken();
    const post = await apiFetch<Post>(`/generations/${generationId}/posts`, token!, { json: {} });
    const approved = await apiFetch<Post>(`/posts/${post.id}/approve`, token!, { json: {} });
    setPostsByGeneration((prev) => ({ ...prev, [generationId]: approved }));
  }

  async function publishNow(generationId: string) {
    const post = postsByGeneration[generationId];
    if (!post) return;
    if (DEV_MODE) {
      setPostsByGeneration((prev) => ({ ...prev, [generationId]: { ...post, status: "published" } }));
      return;
    }
    const token = await getAccessToken();
    // Ignored server-side if this post was already bound at schedule time -
    // see routes/posts.ts's getOrCreatePublications.
    const published = await apiFetch<Post>(`/posts/${post.id}/publish`, token!, {
      json: { connections: resolvedConnections(generationId) },
    });
    setPostsByGeneration((prev) => ({ ...prev, [generationId]: published }));
  }

  async function scheduleForLater(generationId: string) {
    const post = postsByGeneration[generationId];
    const scheduledFor = scheduleInputs[generationId];
    if (!post || !scheduledFor) return;
    if (DEV_MODE) {
      setPostsByGeneration((prev) => ({ ...prev, [generationId]: { ...post, status: "scheduled", scheduledFor } }));
      return;
    }
    const token = await getAccessToken();
    const scheduled = await apiFetch<Post & { warnings?: { channel: string; message: string }[] }>(
      `/posts/${post.id}/schedule`,
      token!,
      { json: { scheduledFor, connections: resolvedConnections(generationId) } },
    );
    setPostsByGeneration((prev) => ({ ...prev, [generationId]: scheduled }));
    setScheduleWarnings((prev) => ({ ...prev, [generationId]: scheduled.warnings ?? [] }));
  }

  async function unschedule(generationId: string) {
    const post = postsByGeneration[generationId];
    if (!post) return;
    setScheduleWarnings((prev) => ({ ...prev, [generationId]: [] }));
    if (DEV_MODE) {
      setPostsByGeneration((prev) => ({ ...prev, [generationId]: { ...post, status: "approved", scheduledFor: null } }));
      return;
    }
    const token = await getAccessToken();
    const updated = await apiFetch<Post>(`/posts/${post.id}/unschedule`, token!, { json: {} });
    setPostsByGeneration((prev) => ({ ...prev, [generationId]: updated }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Content</h1>
          <p>Paste a source, generate suggestions, and approve the ones worth publishing.</p>
        </div>
      </div>

      {!agent && <p style={{ color: "var(--text-muted)" }}>Create an agent first, on the Overview page.</p>}

      {agent && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="pill-row" style={{ marginBottom: 16 }}>
              {(Object.keys(SOURCE_KIND_LABELS) as SourceKind[]).map((kind) => (
                <button
                  key={kind}
                  className={sourceKind === kind ? "btn btn-primary" : "btn btn-ghost"}
                  onClick={() => setSourceKind(kind)}
                  type="button"
                >
                  {SOURCE_KIND_LABELS[kind]}
                </button>
              ))}
            </div>

            {sourceKind === "text" && (
              <>
                <div className="form-field">
                  <label>Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
                </div>
                <div className="form-field">
                  <label>Article text</label>
                  <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the article content here..." style={{ minHeight: 160 }} />
                </div>
              </>
            )}

            {sourceKind === "url" && (
              <div className="form-field">
                <label>Website URL</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" />
              </div>
            )}

            {sourceKind === "pdf" && (
              <div className="form-field">
                <label>PDF file</label>
                <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                  Text is extracted directly from the PDF - scanned/image-only pages won't have extractable text.
                </p>
              </div>
            )}

            {sourceKind === "rss" && (
              <div className="form-field">
                <label>RSS/Atom feed URL</label>
                <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://example.com/feed.xml" />
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Ingests the feed's newest item.</p>
              </div>
            )}

            <button className="btn btn-primary" disabled={!canGenerate || busy} onClick={runPipeline}>
              {busy ? "Generating…" : "Generate suggestions (3 variants)"}
            </button>
            {error && <p style={{ color: "#dc2626" }}>{error}</p>}
          </div>

          {sources && sources.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0 }}>Previously registered sources</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: -8, marginBottom: 12 }}>
                Generate again from a source you've already ingested - useful after changing the agent's generation provider
                or tone, without re-pasting/re-uploading it.
              </p>
              {sources.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.title}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType} · {new Date(s.retrievedAt).toLocaleString()}
                    </div>
                  </div>
                  <button className="btn btn-primary" disabled={busy} onClick={() => generateFromSource(s.id)}>
                    Generate suggestions
                  </button>
                </div>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
              {results.map((r) => {
                const post = postsByGeneration[r.id];
                return (
                  <div className="card" key={r.id}>
                    <h3 style={{ marginTop: 0 }}>{VARIANT_LABELS[r.promptVersion] ?? r.promptVersion}</h3>

                    <div className="source-block" style={{ marginBottom: 12 }}>
                      <div className="label">Short post</div>
                      <p>{r.content.short_post}</p>
                    </div>

                    <div className="label" style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
                      Three-post thread
                    </div>
                    <ol style={{ paddingLeft: 18, fontSize: 14 }}>
                      {r.content.three_post_thread.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>

                    <div className="label" style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
                      LinkedIn summary
                    </div>
                    <p style={{ fontSize: 14 }}>{r.content.linkedin_summary}</p>

                    {r.content.claims_used.length > 0 && (
                      <>
                        <div className="label" style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>
                          Claims used
                        </div>
                        <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--text-muted)" }}>
                          {r.content.claims_used.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {!post && (
                      <button className="btn btn-primary" onClick={() => createAndApprove(r.id)}>
                        Approve this suggestion
                      </button>
                    )}

                    {post?.status === "approved" && (
                      <div>
                        <p className="pill pill-green" style={{ marginBottom: 8 }}>
                          Approved
                        </p>
                        {CONNECTABLE_PLATFORMS.filter((platform) => connections.some((c) => c.platform === platform)).map(
                          (platform) => (
                            <div className="form-field" key={platform} style={{ marginBottom: 8 }}>
                              <label>{PLATFORM_LABELS[platform]} account</label>
                              <select
                                value={selectedConnectionFor(r.id, platform)}
                                onChange={(e) =>
                                  setChannelSelections((prev) => ({
                                    ...prev,
                                    [r.id]: { ...prev[r.id], [platform]: e.target.value },
                                  }))
                                }
                              >
                                {connections
                                  .filter((c) => c.platform === platform)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      @{c.platformUsername}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          ),
                        )}
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          <button className="btn btn-primary" onClick={() => publishNow(r.id)}>
                            Publish now
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="datetime-local"
                            value={scheduleInputs[r.id] ?? ""}
                            onChange={(e) => setScheduleInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            style={{ flex: 1 }}
                          />
                          <button className="btn btn-ghost" disabled={!scheduleInputs[r.id]} onClick={() => scheduleForLater(r.id)}>
                            Schedule
                          </button>
                        </div>
                      </div>
                    )}

                    {post?.status === "scheduled" && (
                      <div>
                        <p className="pill pill-orange" style={{ marginBottom: 8 }}>
                          Scheduled for {post.scheduledFor ? new Date(post.scheduledFor).toLocaleString() : "?"}
                        </p>
                        {(scheduleWarnings[r.id] ?? []).map((w, i) => (
                          <p key={i} style={{ color: "#c2410c", fontSize: 13, marginTop: 0 }}>
                            ⚠ {w.message}
                          </p>
                        ))}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-primary" onClick={() => publishNow(r.id)}>
                            Publish now
                          </button>
                          <button className="btn btn-ghost" onClick={() => unschedule(r.id)}>
                            Unschedule
                          </button>
                        </div>
                      </div>
                    )}

                    {post?.status === "published" && <p className="pill pill-green">Published</p>}
                    {post?.status === "failed" && (
                      <div>
                        <p className="pill pill-red" style={{ marginBottom: 8 }}>
                          Publish failed
                        </p>
                        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
                          Every channel failed to publish - often an expired connection. Check{" "}
                          <a href="/connections">Connections</a> and try again.
                        </p>
                        <button className="btn btn-primary" onClick={() => publishNow(r.id)}>
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
