import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch } from "../lib/api";
import { DEV_MODE } from "../lib/devMode";
import { MOCK_AGENT, MOCK_GENERATIONS } from "../lib/mockData";

type Agent = { id: string; name: string };
type ContentSource = { id: string; title: string };
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
type Post = { id: string; status: string; teaser: string };

const VARIANT_LABELS: Record<string, string> = {
  "v1-generic": "Generic summarization",
  "v2-author-tone": "Author tone profile",
  "v2-source-grounded": "Source-grounded rules",
};

/// The "preview posts in the same page" surface: paste/point at a source,
/// run all 3 required prompt variants, compare them side by side, and
/// either approve the one that reads best (creating a real, price-able
/// Post) or go tweak the agent's tone settings and try again.
export function ContentPage() {
  const { getAccessToken } = usePrivy();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [postsByGeneration, setPostsByGeneration] = useState<Record<string, Post>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEV_MODE) {
      setAgent(MOCK_AGENT);
      return;
    }
    (async () => {
      const token = await getAccessToken();
      const agents = await apiFetch<Agent[]>("/agents", token!);
      setAgent(agents[0] ?? null);
    })();
  }, [getAccessToken]);

  async function runPipeline() {
    if (!agent) return;
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
      const source = await apiFetch<ContentSource>(`/agents/${agent.id}/sources`, token!, {
        json: { title, content },
      });
      const generations = await apiFetch<GenerationResult[]>(`/sources/${source.id}/generate`, token!, { json: {} });
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
            <div className="form-field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title" />
            </div>
            <div className="form-field">
              <label>Article text</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the article content here..." style={{ minHeight: 160 }} />
            </div>
            <button className="btn btn-primary" disabled={!title || !content || busy} onClick={runPipeline}>
              {busy ? "Generating…" : "Generate suggestions (3 variants)"}
            </button>
            {error && <p style={{ color: "#dc2626" }}>{error}</p>}
          </div>

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

                    {post ? (
                      <p className="pill pill-green">Approved</p>
                    ) : (
                      <button className="btn btn-primary" onClick={() => createAndApprove(r.id)}>
                        Approve this suggestion
                      </button>
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
