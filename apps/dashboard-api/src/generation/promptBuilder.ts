import type { AuthorProfile, ImmutableSourceSnapshot, PromptVariant } from "../types.js";

const RESPONSE_SCHEMA = `{
  "short_post": "string, a single punchy hook post under 280 characters, no hashtags",
  "three_post_thread": ["string", "string", "string"],
  "linkedin_summary": "string, 3-5 sentences, professional register",
  "claims_used": ["string", "... one entry per factual claim drawn from the source"],
  "source_url": "string, must be exactly the canonical URL given below"
}`;

export type BuiltPrompt = { system: string; user: string; promptVersion: string };

/// Builds the 3 prompt variants required by the article-to-micro-content
/// spec: a plain baseline, one steered by the author's tone profile, and
/// one with explicit source-grounding rules layered on top of the baseline.
/// All three request the exact same structured JSON shape so their outputs
/// are directly comparable.
export function buildPrompt(
  variant: PromptVariant,
  source: ImmutableSourceSnapshot,
  authorProfile?: AuthorProfile,
): BuiltPrompt {
  const sourceBlock = `Title: ${source.title}\nAuthor: ${source.author ?? "unknown"}\nCanonical URL: ${source.canonicalUrl ?? "(none - pasted content)"}\n\nContent:\n${source.content}`;

  if (variant === "generic") {
    return {
      promptVersion: "v1-generic",
      system:
        "You are a social-media syndication agent. Summarize the given source content into " +
        "several social-post formats. Return ONLY a single JSON object matching exactly this shape " +
        `(no markdown fences, no commentary):\n${RESPONSE_SCHEMA}`,
      user: sourceBlock,
    };
  }

  if (variant === "author-tone") {
    const tone = authorProfile
      ? `Tone profile: ${authorProfile.toneDescription}\n` +
        (authorProfile.examplePosts?.length
          ? `Example posts in this author's voice:\n${authorProfile.examplePosts.map((p) => `- ${p}`).join("\n")}\n`
          : "") +
        (authorProfile.doNotUse?.length ? `Avoid: ${authorProfile.doNotUse.join(", ")}\n` : "")
      : "Tone profile: (none provided - use a neutral, engaging voice)\n";

    return {
      promptVersion: "v2-author-tone",
      system:
        "You are a social-media syndication agent ghostwriting in a specific author's voice. " +
        "Match the tone profile below as closely as possible while summarizing the source content. " +
        "Return ONLY a single JSON object matching exactly this shape " +
        `(no markdown fences, no commentary):\n${RESPONSE_SCHEMA}\n\n${tone}`,
      user: sourceBlock,
    };
  }

  // source-grounded
  return {
    promptVersion: "v2-source-grounded",
    system:
      "You are a social-media syndication agent operating under strict source-grounding rules:\n" +
      "1. Every claim in claims_used MUST be directly traceable to a specific sentence in the source content - " +
      "quote or closely paraphrase it, never infer or extrapolate beyond what the source states.\n" +
      "2. Do not invent facts, statistics, quotes, or outcomes not present in the source.\n" +
      "3. If the source is speculative fiction or a hypothetical scenario, present it as such - " +
      "do not state speculative content as settled fact.\n" +
      "4. source_url must be copied exactly from the Canonical URL given below, verbatim.\n" +
      "Return ONLY a single JSON object matching exactly this shape " +
      `(no markdown fences, no commentary):\n${RESPONSE_SCHEMA}`,
    user: sourceBlock,
  };
}
