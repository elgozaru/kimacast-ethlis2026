import type { BuiltPrompt } from "./promptBuilder.js";
import * as claude from "./claude.js";
import * as zgCompute from "./zgCompute.js";
import type { GenerateResult } from "./claude.js";

export type GenerationSettings = {
  /// "anthropic" (default) | "0g-compute". Absent/unrecognized falls back
  /// to Claude, so agents created before 0G Compute support existed are
  /// unaffected.
  generationProvider?: string;
  /// Required when generationProvider is "0g-compute" - the chosen
  /// provider's on-chain address (see GET /zg-compute/providers).
  zgComputeProviderAddress?: string;
  /// Optional - only meaningful for multi-model providers; omit to use the
  /// provider's on-chain default model.
  zgComputeModel?: string;
};

/// Picks the generation backend from the agent's settings, so
/// /sources/:sourceId/generate doesn't need to know which provider it's
/// calling.
export async function generate(prompt: BuiltPrompt, sourceUrl: string, settings: GenerationSettings): Promise<GenerateResult> {
  if (settings.generationProvider === "0g-compute") {
    if (!settings.zgComputeProviderAddress) {
      throw new Error('Agent settings.zgComputeProviderAddress is required when generationProvider is "0g-compute"');
    }
    return zgCompute.generate(prompt, sourceUrl, {
      providerAddress: settings.zgComputeProviderAddress,
      model: settings.zgComputeModel,
    });
  }
  return claude.generate(prompt, sourceUrl);
}
