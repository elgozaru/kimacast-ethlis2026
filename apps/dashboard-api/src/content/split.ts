import type { GenerationContent } from "../types.js";

export type FreeGatedSplitSettings = {
  /// Which GenerationContent field is shown free, before payment.
  /// Defaults to "short_post" - the hook - with everything else (the
  /// thread + LinkedIn summary) behind the x402 paywall.
  freeField?: keyof GenerationContent;
};

/// Applies an agent's free/gated split criteria to one generation result,
/// producing the (teaser, full) pair apps/resource-server actually gates.
/// Kept intentionally simple for the MVP - one configurable "which field is
/// free" switch - rather than a general rules engine, since that's what the
/// dashboard settings spec actually asks for ("criteria for deciding which
/// part... is free... and which part is gated").
export function splitFreeGated(
  content: GenerationContent,
  settings: FreeGatedSplitSettings = {},
): { teaser: string; full: string } {
  const freeField = settings.freeField ?? "short_post";
  const teaser = String(content[freeField] ?? content.short_post);

  const full = [
    `Thread:\n${content.three_post_thread.join("\n\n")}`,
    `\nLinkedIn summary:\n${content.linkedin_summary}`,
  ].join("\n");

  return { teaser, full };
}
