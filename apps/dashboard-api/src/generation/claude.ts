import type { GenerationContent } from "../types.js";
import type { BuiltPrompt } from "./promptBuilder.js";
import { parseAndValidate } from "./parseGenerationContent.js";

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
