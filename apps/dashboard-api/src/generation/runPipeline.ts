import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSnapshot } from "../content/snapshot.js";
import { buildPrompt } from "./promptBuilder.js";
import { generate, isConfigured } from "./claude.js";
import type { AuthorProfile, PromptVariant } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");

/// Standalone runner for the article-to-micro-content challenge: reads
/// data/input-article.md + data/author-profile.json, runs all 3 required
/// prompt variants against Claude, and writes the required artifacts
/// (promptVersion-named prompt files + generation-result.json) back into
/// data/. Run with: pnpm --filter dashboard-api run run-pipeline
async function main() {
  if (!isConfigured()) {
    console.warn(
      "WARNING: ANTHROPIC_API_KEY is not set - this run will use the local " +
        "heuristic fallback, which does NOT meaningfully exercise the 3 " +
        "prompt variants (tone/grounding instructions are ignored). Set " +
        "ANTHROPIC_API_KEY in apps/dashboard-api/.env for a real comparison.",
    );
  }

  const articleRaw = await readFile(join(DATA_DIR, "input-article.md"), "utf-8");
  // Strip the leading HTML comment (provenance note) and the markdown
  // heading before treating this as plain article content for the prompt.
  const content = articleRaw.replace(/<!--[\s\S]*?-->/, "").trim();
  const authorProfile: AuthorProfile = JSON.parse(await readFile(join(DATA_DIR, "author-profile.json"), "utf-8"));

  const snapshot = await buildSnapshot({
    kind: "text",
    title: "Et si nous parvenions à décrypter les ondes cérébrales? (V187)",
    content,
    author: "arbredespossibles.com contributors (reader-submitted, reference V187)",
    canonicalUrl: "https://arbredespossibles.com/FutursTechno3.html#V187",
  });

  const variants: PromptVariant[] = ["generic", "author-tone", "source-grounded"];
  const results = [];

  for (const [i, variant] of variants.entries()) {
    const prompt = buildPrompt(variant, snapshot, authorProfile);
    await writeFile(join(DATA_DIR, `prompt-v${i + 1}-${variant}.txt`), `SYSTEM:\n${prompt.system}\n\nUSER:\n${prompt.user}`);

    console.log(`\n=== Running variant ${i + 1}/3: ${variant} ===`);
    const result = await generate(prompt, snapshot.canonicalUrl ?? "");
    console.log(JSON.stringify(result.content, null, 2));

    results.push({
      agentId: "temporary-agent-id",
      sourceHash: snapshot.contentHash,
      authorProfileHash: variant === "author-tone" ? "sha256:local-sample-author-profile" : null,
      outputStorageId: null, // filled in once 0G Storage credentials are configured
      content: result.content,
      generation: { provider: result.provider, model: result.model, promptVersion: prompt.promptVersion },
    });
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, "generation-result.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} results to data/generation-result.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
