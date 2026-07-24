# Story402

Story402 is a content-monetization agent: point it at a web article, and it
produces a **half-free, half-paid** social post — a hook + free teaser
that's shareable on its own, plus a paid continuation that only unlocks
after a few-cent crypto micropayment.

It's built for the 0G stack end-to-end:

- **0G Compute** (`src/compute/zgCompute.ts`) — runs the hook-writing /
  splitting inference against 0G's decentralized GPU-provider marketplace
  instead of a single centralized LLM API.
- **0G Storage** (`src/storage/zgStorage.ts`) — the paid half of every
  story is uploaded to 0G's erasure-coded storage network and referenced
  by content hash (`0g://<rootHash>`), not hosted on our own server.
- **x402** (`src/payments/x402.ts`) — the HTTP 402 "Payment Required"
  micropayment protocol gates access to the stored paid content.
- **Hedera** (`src/payments/x402.ts`) — the x402 payment is settled on
  Hedera, via its EVM-compatible JSON-RPC relay (Hashio), using HBAR (or
  an HTS stablecoin) as the payment asset.
- **Privy + ZeroDev** (`src/payments/wallet.ts`) — onboards a viewer with
  no wallet at all: Privy issues an embedded signer they fund via Apple
  Pay / Google Pay, and ZeroDev wraps it in an ERC-4337 smart account with
  a session key scoped to "pay small amounts to Story402 paywalls" so they
  never see a raw signing prompt.
- **Instagram** (`src/social/instagram.ts`) — publishes the free teaser +
  hook via the Meta Graph API's Content Publishing endpoints.

## Pipeline

```
fetchSource(url)              -- pull article text
  -> splitStory(article)      -- hook + free teaser + paid body (0G Compute)
  -> uploadPaidContent(body)  -- 0G Storage, returns 0g://<rootHash>
  -> buildInstagramPost(...)  -- caption + CTA + price
  -> publishToInstagram(...)  -- Meta Graph API (optional, dry-run by default)
```

Viewer-side unlock flow:

```
viewer taps "unlock for $0.05"
  -> WalletOnboarding.onboard()   -- Privy embedded wallet + Apple/Google Pay top-up,
                                     wrapped in a ZeroDev smart account
  -> paywall(resourceId, ...)     -- 402 quote issued (payments/x402.ts)
  -> viewer's smart account pays  -- settled on Hedera (EVM JSON-RPC)
  -> facilitator confirms         -- paywall() unlocks
  -> content streamed from 0G Storage
```

## Running it

```bash
cd story402
npm install
cp .env.example .env   # fill in whichever integrations you have live credentials for
npm run dev             # runs src/agent/index.ts against SOURCE_URL
```

Every external integration (0G Compute, 0G Storage, Privy, ZeroDev,
Instagram Graph API, an x402 facilitator) is optional at the code level:
each client checks `isConfigured()` and falls back to a deterministic
local/dry-run behavior when credentials are absent, so `npm run dev` works
immediately in a sandbox with zero keys, and you can wire in real
credentials for one integration at a time.

See `content/sample-instagram-posts.md` for 10 example posts in the exact
shape this pipeline produces (hook, free teaser, paywalled body, price,
hashtags) — built from BBC News' evergreen coverage pillars, since this
sandbox's outbound network blocks bbc.com/bbc.co.uk directly. Point
`SOURCE_URL` at a live BBC RSS/API endpoint from a deployment with normal
network access and the same code fills the template with real headlines.

## Layout

```
src/
  agent/       orchestrator + shared types
  content/     fetch + free/paid split
  compute/     0G Compute client
  storage/     0G Storage client
  payments/    wallet onboarding (Privy/ZeroDev) + x402/Hedera paywall
  social/      Instagram caption builder + Graph API publisher
content/
  sample-instagram-posts.md   10 example posts
```
