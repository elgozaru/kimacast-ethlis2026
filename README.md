# kimacast-ethlis2026

Content monetization agent platform: AI agents turn licensed source content
into half-free, half-paid social stories, sold per-view through x402,
settled on Hedera.

This repo currently implements the viewer-payment slice: a gated story
unlock flow where a first-time viewer goes from "email on an Instagram bio
link" to "paid, on-chain, unlocked story" without leaving the page. See
[`docs/SETUP.md`](docs/SETUP.md) for the architecture, the setup steps, and
the open questions (onramp support for Hedera, ZeroDev's role, a couple of
API surfaces to re-verify) that come with it.

This also includes the creator-facing side: an onboarding + dashboard where
a content publisher sets up an agent (with its own ENS subname), points it
at a source, gets X post suggestions generated from it, previews and
approves them, and publishes - producing the same gated unlock URLs the
viewer-payment slice above serves.

```
apps/
  facilitator/       platform-operated x402 facilitator for Hedera
  resource-server/   the paywall (teaser + gated full story per post)
  web/                the Instagram-linked unlock page (Privy + x402 client)
  dashboard-api/      creator backend: agent CRUD, ENS subname minting,
                      article-to-micro-content pipeline, 0G Storage, X posting
  dashboard/          creator dashboard UI (Privy onboarding, agent settings,
                      post preview/approve)
packages/
  db/                 shared Prisma schema/client (dashboard-api writes,
                      resource-server reads to gate dashboard-created posts)
story402/             standalone 0G Compute + 0G Storage + Instagram
                      prototype for the same "article -> social post" idea
x-agent/               standalone Research -> Content -> X -> Analytics
                      pipeline (0G Storage as shared agent memory)
```
