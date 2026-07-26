import type { GenerationContent } from "../types.js";
import type { BuiltPrompt } from "./promptBuilder.js";

const MODEL = "claude-sonnet-5";

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function getClient() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type GenerateResult = {
  content: GenerationContent;
  provider: string;
  model: string;
};

/// Runs one prompt variant against Claude and validates the structured
/// output against the required response shape. Falls back to a deterministic
/// heuristic (no LLM call) when ANTHROPIC_API_KEY isn't set, matching the
/// rest of this repo's "runnable with zero keys" convention - but note this
/// fallback is NOT a meaningful test of the 3 prompt variants, since it
/// ignores tone/grounding instructions entirely; it exists only so the rest
/// of the pipeline (storage, DB writes, routes) is exercisable without a key.
export async function generate(prompt: BuiltPrompt, sourceUrl: string): Promise<GenerateResult> {
  if (!isConfigured()) {
    return {
      content: localFallback(prompt, sourceUrl),
      provider: "local-fallback",
      model: "heuristic-v0",
    };
  }

  const client = await getClient();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  return {
    content: parseAndValidate(text, sourceUrl),
    provider: "anthropic",
    model: message.model,
  };
}

function parseAndValidate(text: string, sourceUrl: string): GenerationContent {
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

function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text;
}

function localFallback(prompt: BuiltPrompt, sourceUrl: string): GenerationContent {
  const excerpt = prompt.user.slice(0, 200).replace(/\s+/g, " ").trim();
  return {
    short_post: excerpt.slice(0, 120),
    three_post_thread: [excerpt.slice(0, 90), excerpt.slice(90, 180), excerpt.slice(180, 270)],
    linkedin_summary: excerpt,
    claims_used: [],
    source_url: sourceUrl,
  };
}
