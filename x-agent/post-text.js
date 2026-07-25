import "dotenv/config";
import { readFile } from "node:fs/promises";
import { publishTweet, getTweetMetrics } from "./twitter.js";
import { writeMemory } from "./storage.js";

/**
 * Publishes one already-written post verbatim - e.g. a tweet picked out of
 * content/sample-x-posts-arbredespossibles.md - instead of running the full
 * Research -> Content pipeline in index.js. Useful when you already know
 * exactly what you want posted and just need the Publishing Agent step.
 *
 * Usage:
 *   node post-text.js --text "Some tweet text"
 *   node post-text.js --file ./my-post.txt
 *   node post-text.js --text "..." --dry-run   # force dry-run even with real credentials configured
 */
function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.set(key, next);
        i += 1;
      } else {
        args.set(key, "true");
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromFile = args.get("file");
  const text = fromFile ? (await readFile(fromFile, "utf-8")).trim() : args.get("text");
  const dryRun = args.has("dry-run");

  if (!text) {
    throw new Error('Usage: node post-text.js --text "..." (or --file ./path/to/post.txt) [--dry-run]');
  }
  if (text.length > 280) {
    throw new Error(`post-text.js: text is ${text.length} chars, over X's 280-char limit`);
  }

  const published = await publishTweet(text, { dryRun });
  if (published.posted) {
    console.log(`Posted: tweet id ${published.id}`);
  } else {
    console.log(dryRun ? "Dry-run (--dry-run passed) - nothing was actually posted" : "Dry-run (no X credentials configured) - nothing was actually posted");
  }
  console.log(published.text);

  const memory = await writeMemory("published-post", published);
  console.log(`Stored publish record at ${memory.uri}`);

  if (published.posted) {
    const metrics = await getTweetMetrics(published.id, { dryRun });
    console.log("Initial metrics:", metrics);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
