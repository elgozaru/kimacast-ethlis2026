import type { GenerationContent } from "../types.js";

/// Shared by every generation backend (claude.ts, zgCompute.ts, ...): each
/// one gets raw completion text back from its own model/provider, but they
/// all have to produce the same validated GenerationContent shape, so the
/// parsing/validation logic itself is provider-agnostic and lives here once.
export function parseAndValidate(text: string, sourceUrl: string): GenerationContent {
  const jsonText = stripMarkdownFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`generate: model did not return valid JSON: ${(err as Error).message}\n---\n${text}`);
  }

  const obj = parsed as Record<string, unknown>;
  const missing = ["short_post", "three_post_thread", "linkedin_summary", "claims_used", "source_url"].filter(
    (key) => !(key in obj),
  );
  if (missing.length > 0) {
    throw new Error(`generate: response missing required field(s): ${missing.join(", ")}`);
  }
  if (!Array.isArray(obj.three_post_thread) || obj.three_post_thread.length !== 3) {
    throw new Error("generate: three_post_thread must be an array of exactly 3 strings");
  }
  if (!Array.isArray(obj.claims_used)) {
    throw new Error("generate: claims_used must be an array of strings");
  }

  return {
    short_post: String(obj.short_post),
    three_post_thread: obj.three_post_thread as string[],
    linkedin_summary: String(obj.linkedin_summary),
    claims_used: obj.claims_used as string[],
    // The model is instructed to echo this verbatim, but pinning it here
    // too means a source-URL mismatch is impossible regardless of the
    // model's fidelity to that instruction.
    source_url: sourceUrl || String(obj.source_url ?? ""),
  };
}

export function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text;
}
