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

```
apps/
  facilitator/       platform-operated x402 facilitator for Hedera
  resource-server/   the paywall (teaser + gated full story per post)
  web/                the Instagram-linked unlock page (Privy + x402 client)
```
