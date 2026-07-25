import "dotenv/config";
import { research, generateContent } from "./agent.js";
import { writeMemory, readMemory } from "./storage.js";
import { publishTweet, getTweetMetrics } from "./twitter.js";

/**
 *   User -> Website URL
 *        -> Research Agent   (agent.js: research)
 *        -> 0G Storage       (storage.js: writeMemory)     [shared agent memory]
 *        -> Content Agent    (agent.js: generateContent)
 *        -> Publishing Agent (twitter.js: publishTweet)
 *        -> X API -> X Account
 *        -> Analytics Agent  (twitter.js: getTweetMetrics)
 *        -> 0G Storage       (storage.js: writeMemory)     [shared agent memory]
 */
async function runPipeline(url, { dryRun = false } = {}) {
  console.log(`Research Agent: analyzing ${url}`);
  const findings = await research(url);
  const findingsMemory = await writeMemory("research", findings);
  console.log(`  -> stored findings at ${findingsMemory.uri}`);

  console.log("Content Agent: drafting post from stored research");
  const storedFindings = await readMemory(findingsMemory.uri);
  const draft = await generateContent(storedFindings);
  const draftMemory = await writeMemory("content-draft", draft);
  console.log(`  -> stored draft at ${draftMemory.uri}`);

  console.log("Publishing Agent: posting to X");
  const postText = `${draft.text}\n\n${url}`.slice(0, 280);
  const published = await publishTweet(postText, { dryRun });
  if (published.posted) {
    console.log(`  -> posted, tweet id ${published.id}`);
  } else {
    console.log(dryRun ? "  -> dry-run (--dry-run passed)" : "  -> dry-run (no X credentials configured)");
  }

  console.log("Analytics Agent: fetching engagement metrics");
  const metrics = await getTweetMetrics(published.id, { dryRun });
  const analyticsMemory = await writeMemory("analytics", { ...metrics, url, postText });
  console.log(`  -> stored analytics at ${analyticsMemory.uri}`);

  return { findings, draft, published, metrics };
}

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
  const url = args.get("url") ?? process.env.SOURCE_URL;
  if (!url) throw new Error("Usage: node index.js --url <website> (or set SOURCE_URL in .env) [--dry-run]");

  const result = await runPipeline(url, { dryRun: args.has("dry-run") });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
