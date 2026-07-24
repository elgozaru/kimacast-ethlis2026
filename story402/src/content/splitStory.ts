import type { SourceArticle, SplitStory } from "../agent/types.js";
import { ZgComputeClient } from "../compute/zgCompute.js";

const SENTENCE_RE = /(?<=[.!?])\s+(?=[A-Z0-9"'])/;

/**
 * Splits an article into a free teaser (the hook + enough context to be
 * useful and shareable on its own) and a paid body (the rest of the
 * story - detail, analysis, quotes, numbers) that only unlocks after an
 * x402 micropayment.
 *
 * The actual "writing" (turning source text into a punchy Instagram hook)
 * is delegated to 0G Compute; this module just decides where the free/paid
 * boundary sits and shapes the prompt.
 */
export async function splitStory(article: SourceArticle, compute: ZgComputeClient): Promise<SplitStory> {
  const sentences = article.rawText
    .split(SENTENCE_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 40);

  const teaserSentences = sentences.slice(0, Math.max(2, Math.ceil(sentences.length * 0.25)));
  const paidSentences = sentences.slice(teaserSentences.length);

  const hookResult = await compute.infer({
    system:
      "You are Story402, a social-media ghostwriter for a news monetization agent. " +
      "Write a single scroll-stopping Instagram hook line (under 18 words, no hashtags, " +
      "no emoji spam - at most one emoji) for the article below. Return only the hook line.",
    user: `Title: ${article.title}\nSection: ${article.section}\nOpening: ${teaserSentences.join(" ")}`,
  });

  return {
    hook: hookResult.text.trim() || article.title,
    freeTeaser: teaserSentences.join(" "),
    paidBody: paidSentences.join(" ") || teaserSentences.join(" "),
    cta: buildCta(article),
  };
}

function buildCta(article: SourceArticle): string {
  return (
    `Read it free at the source, or unlock the full breakdown here for a few cents. ` +
    `Source: ${article.url}`
  );
}
