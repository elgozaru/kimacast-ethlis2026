import "dotenv/config";
import { randomUUID } from "node:crypto";
import { fetchSource } from "../content/fetchSource.js";
import { splitStory } from "../content/splitStory.js";
import { ZgComputeClient } from "../compute/zgCompute.js";
import { ZgStorageClient } from "../storage/zgStorage.js";
import { buildInstagramPost, publishToInstagram } from "../social/instagram.js";
import type { InstagramPost } from "./types.js";

interface RunOptions {
  sourceUrls: string[];
  priceUsd: number;
  publish: boolean;
}

/**
 * Story402 orchestrator: source -> split -> store paid half on 0G Storage ->
 * price it behind x402/Hedera -> post the free teaser to Instagram.
 */
export async function runStory402(options: RunOptions): Promise<InstagramPost[]> {
  const compute = new ZgComputeClient();
  const storage = new ZgStorageClient();
  const posts: InstagramPost[] = [];

  for (const url of options.sourceUrls) {
    const article = await fetchSource(url);
    const story = await splitStory(article, compute);
    const id = randomUUID();
    const stored = await storage.uploadPaidContent(id, story.paidBody);
    const post = buildInstagramPost(id, article, story, stored, options.priceUsd);
    posts.push(post);

    if (options.publish) {
      await publishToInstagram(post, `${article.url}#cover`);
    }
  }

  return posts;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      args.set(argv[i].slice(2), argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.get("source") ?? process.env.SOURCE_URL ?? "https://www.bbc.com/news";
  const count = Number(args.get("count") ?? 1);

  const posts = await runStory402({
    sourceUrls: Array.from({ length: count }, () => source),
    priceUsd: Number(process.env.X402_PRICE_USD ?? "0.05"),
    publish: false,
  });

  console.log(JSON.stringify(posts, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
