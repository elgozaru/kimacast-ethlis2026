# x-agent

A Research → Content → Publishing → Analytics pipeline for X (Twitter),
using 0G Storage as shared memory between agents.

```
User -> Website URL
     -> Research Agent    (agent.js: research)
     -> 0G Storage         (storage.js: writeMemory)   [shared agent memory]
     -> Content Agent      (agent.js: generateContent)
     -> Publishing Agent   (twitter.js: publishTweet)
     -> X API -> X Account
     -> Analytics Agent    (twitter.js: getTweetMetrics)
     -> 0G Storage         (storage.js: writeMemory)   [shared agent memory]
```

- **agent.js** — the "Claude brain": fetches the source URL, asks Claude
  (via `@anthropic-ai/sdk`) to pull out tweet-worthy research notes, then
  later drafts the actual X post from those notes.
- **storage.js** — shared memory between agents, backed by 0G Storage.
  Every write returns a content-addressed `0g://<rootHash>` URI that the
  next agent reads back, instead of passing state through a shared database.
- **twitter.js** — the Publishing Agent (posts via `twitter-api-v2`) and
  the Analytics Agent (reads back public metrics for a posted tweet).
- **index.js** — orchestrates the full pipeline end to end.

## Setup

```bash
cd x-agent
npm install
cp .env.example .env   # fill in your own credentials - see below
node index.js --url https://example.com
```

## Credentials

**Do not paste real API keys into chat, commits, or anywhere outside your
own `.env` file.** `.env` is gitignored at the repo root, so it never gets
committed from here. If a key has ever been shared outside your own
machine (chat, screenshare, ticket), treat it as compromised and
regenerate it in the provider's dashboard before using it.

Every credential below is optional at the code level - each module checks
whether its env vars are set and falls back to a local dry-run/heuristic
when they aren't, so `node index.js` runs end-to-end with zero keys:

- `ANTHROPIC_API_KEY` — from the [Anthropic Console](https://console.anthropic.com/settings/keys). Powers the Research and Content agents. Without it, research falls back to a raw text excerpt and content generation falls back to a trimmed version of that excerpt.
- `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` — from the X Developer Portal, your App's "Keys and tokens" tab. All four are required together for posting; without them, `publishTweet` returns a dry-run result and nothing is actually posted.
- `ZEROG_STORAGE_RPC` / `ZEROG_STORAGE_INDEXER` / `ZEROG_STORAGE_PRIVATE_KEY` — 0G testnet endpoints + a funded wallet key. Without them, shared memory writes to a local `.local-memory/` folder instead of the real network.
