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

## Posting one specific, already-written post

`index.js` runs the *full* pipeline (Claude researches a URL and drafts new
copy from it). If you already have exact text you want posted - e.g. one of
the tweets in `../story402/content/sample-x-posts-arbredespossibles.md` -
use `post-text.js` instead, which skips straight to the Publishing Agent:

```bash
node post-text.js --text "The human genome got fully decoded. Within a decade, every ethical taboo around genetics quietly disappeared with it."
```

or from a file:

```bash
echo "Your tweet text here" > my-post.txt
node post-text.js --file ./my-post.txt
```

### Doing this from a GitHub Codespace

1. Open this repo in a Codespace (or open the existing one).
2. `cd x-agent && npm install` (installs `twitter-api-v2`, `dotenv`, etc. - only needed once per Codespace, since `node_modules` isn't committed).
3. Get X API credentials with **write** access:
   - In the [X Developer Portal](https://developer.x.com), open your App → **User authentication settings** → set **App permissions** to "Read and write" (posting fails with a 403 if it's still "Read only").
   - After changing permissions, **regenerate your Access Token and Secret** under "Keys and tokens" - the old ones stay read-only even after you flip the setting.
4. `cp .env.example .env`, then open `.env` in the Codespace's file editor (not the terminal, so the values never land in your shell history) and paste in your **four** X credentials (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`) plus `ANTHROPIC_API_KEY` if you want the full pipeline too.
5. Run it:
   ```bash
   node post-text.js --text "..."
   ```
   You'll see `Posted: tweet id <id>` instead of the dry-run message once real credentials are picked up.

Since posting is public and hard to undo, do a dry run first (leave the `.env`
X fields blank) to confirm the exact text, then fill in credentials only when
you're ready to actually publish.

### Troubleshooting a 401 Unauthorized

A `401` from `twitter-api-v2` (as opposed to a `403`) means the four
credentials themselves don't line up - it's an authentication problem, not
a permissions one. Run:

```bash
node check-credentials.js
```

This checks the *shape* of each of the four `X_*` values (length, stray
whitespace/newlines/quotes) without ever printing the actual secrets, which
catches the most common copy-paste mistakes. If it reports everything as
`[OK]` and you're still getting 401, check, in order:

1. **Mismatched pair** - the Access Token/Secret must come from the *same*
   App as the Consumer Key/Secret. Regenerating one and not the other is
   the most common cause.
2. **Regenerated in the wrong order** - Access Token/Secret must be
   (re)generated *after* setting App permissions to "Read and write," not
   before.
3. **App not attached to a Project** - in the X Developer Portal, confirm
   the App sits under a Project (required for v2 endpoints).
4. **Container clock skew** - OAuth1.0a signs requests with a timestamp;
   run `date -u` and confirm the Codespace's clock is actually correct.

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
