# x402 on Hedera: gated Instagram stories, unlocked from a fresh email

This covers the piece of the platform this session focused on: a viewer taps
"see the rest" on a gated story, and — with as little disconnection from the
original post as possible — ends up with a working Hedera account and a
completed micropayment.

## Why this shape

Three real, verified building blocks make the "minimal disconnection" goal
achievable today, and they compose almost for free:

1. **Hedera's own x402 "exact" scheme pays the network fee for the viewer.**
   Hedera's x402 integration ([hedera.com/blog/hedera-and-the-x402-payment-standard](https://hedera.com/blog/hedera-and-the-x402-payment-standard/))
   uses a *partially-signed transaction* model: the viewer signs a transfer
   authorizing the debit from their own account, but the transaction's
   declared fee-payer is the **facilitator's** operator account. The
   facilitator adds its own signature and submits. The viewer never needs
   HBAR for gas — full stop, no paymaster contract required. This is
   implemented for real in the `@x402/hedera` npm package (Coinbase's x402
   monorepo), which this repo uses directly (`apps/facilitator`,
   `apps/resource-server`).

2. **Hedera accounts auto-create from a Privy embedded wallet's address.**
   A Privy embedded wallet is a secp256k1 keypair with a standard EVM
   address (Hedera enabled ECDSA/secp256k1 keys via
   [HIP-222](https://hips.hedera.com/hip/hip-222)). Hedera lets you reference
   an account that doesn't exist yet by that same EVM address (an "alias" —
   [HIP-583](https://hips.hedera.com/HIP/hip-583.html)). The *first* transfer
   to that alias auto-creates a real ("hollow") account behind it. So: Privy
   login creates the wallet, and the very next HBAR transfer to it (the
   on-ramp top-up) is simultaneously the "create my Hedera account" step —
   there's no separate account-creation screen at all.

3. **HBAR needs no token association.** HTS tokens (including USDC on
   Hedera) require an explicit `TokenAssociateTransaction` on *both* sender
   and receiver before they can hold the token — an extra signed transaction,
   and one more thing that can fail (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`) for a
   first-time viewer. Native HBAR has no such requirement. That's why
   `apps/resource-server` prices stories in tinybars, not Hedera-USDC — it's
   the difference between "one tap" and "two taps plus an association fee."

Given (1) and (2), **this repo does not use ZeroDev/ERC-4337 for the core
payment flow** — Hedera's native fee-payer/signer separation and hollow
account auto-creation already deliver "no pre-funded gas, no explicit account
creation," which is the problem account abstraction would otherwise be
solving. Nothing was found confirming ZeroDev has shipped Hedera support; if
you want it later, it'd slot in as an *optional* layer on Hedera's EVM JSON-RPC
relay (Hedera's Smart Contract Service is EVM-equivalent, so ERC-4337
infrastructure can in principle be deployed there) purely for session-keys —
letting a repeat viewer unlock a second and third story without a fresh Privy
signing prompt each time. Treat that as a v2 nice-to-have, not a dependency.

## Request flow

```mermaid
sequenceDiagram
    participant IG as Instagram bio/story link
    participant Web as apps/web (viewer page)
    participant Privy
    participant RS as apps/resource-server
    participant Fac as apps/facilitator
    participant Hedera as Hedera network

    IG->>Web: viewer taps link
    Web->>RS: GET /api/stories/:id/teaser (free)
    Web-->>Web: shows teaser + "Unlock" button
    Web->>Privy: login() (email/Google/Apple) + embedded wallet auto-created
    Web->>RS: GET /api/stories/:id/full
    RS-->>Web: 402 Payment Required (price, payTo, feePayer)
    Web->>Web: build + sign partial TransferTransaction (viewer signs debit)
    Web->>RS: retry GET with X-PAYMENT header
    RS->>Fac: POST /verify, POST /settle
    Fac->>Hedera: adds fee-payer signature, submits
    Hedera-->>Fac: consensus receipt
    Fac-->>RS: settlement result
    RS-->>Web: 200 + full story
```

## What's implemented here

- `apps/facilitator` — the platform's own x402 facilitator for Hedera. Holds
  the operator key that pays every settlement's network fee. Exposes the
  three routes (`/verify`, `/settle`, `/supported`) that `@x402/core`'s
  `HTTPFacilitatorClient` expects.
- `apps/resource-server` — the paywall itself. One dynamic route,
  `GET /api/stories/:postId/full`, priced and paid-to per story (payTo is
  resolved from the authoring agent's ENS text record, `me.hedera.account`
  — the thin seam connecting this to the platform's ENS-identity piece).
- `apps/web` — the Next.js page an Instagram bio/story link points at:
  teaser → Privy login → balance check → (funding prompt) → sign & pay →
  unlocked content, all on one screen.

## Setup steps

### 1. Hedera testnet accounts

1. Go to the [Hedera Portal](https://portal.hedera.com/), sign up, and claim
   a funded testnet account — this gives you an account ID and an ECDSA
   private key. Create (at least) two: one for the **facilitator** operator,
   one to use as a **test creator payout account** (`payTo` for a demo
   story).
2. Put the facilitator's account ID + key into `apps/facilitator/.env`
   (`HEDERA_FACILITATOR_ACCOUNT_ID`, `HEDERA_FACILITATOR_PRIVATE_KEY`).
3. For a demo story priced in HTS-USDC instead of HBAR, mint testnet USDC
   from the [Circle faucet](https://faucet.circle.com/) (pick "Hedera
   Testnet") and associate it on both accounts with
   `TokenAssociateTransaction` (see the `@x402/hedera` README for the exact
   snippet) — but note the default in this repo is HBAR, precisely to skip
   this step for viewers.

### 2. ENS for the demo agent

Set a text record `me.hedera.account` on the agent's ENS name (or subdomain)
to the Hedera account ID you want story payments to land in. `apps/resource-server/src/ens.ts`
resolves this at request time (5 min cache). Point `ETH_RPC_URL` at any
Ethereum RPC provider (Alchemy, Infura, etc.) — it's a read-only lookup.

### 3. Privy

1. Create an app at [dashboard.privy.io](https://dashboard.privy.io).
2. Enable **Email**, **Google**, and **Apple** login methods.
3. Under Embedded Wallets, set wallet creation to happen for all users on
   login (this repo's `lib/providers.tsx` also sets `createOnLogin:
   "all-users"` client-side).
4. Copy the App ID into `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_ID`, and
   generate an **App Secret** (Settings → API Keys) for `PRIVY_APP_SECRET` —
   this is only ever used server-side, in `app/api/hedera/sign`.
5. **Verify the raw-signing call.** `app/api/hedera/sign/route.ts` needs a
   Privy Wallet API method that returns a raw secp256k1 signature over an
   arbitrary digest (the same primitive Privy's Bitcoin PSBT-signing support
   uses) — confirm the exact method name/params against Privy's current
   Wallet API reference before relying on the `secp256k1_sign` call stubbed
   in that file.

### 4. Funding the viewer's account (the open gap)

No onramp aggregator was confirmed at research time to deliver funds
directly to a Hedera network address, and Circle's CCTP (which many ramps
use for delivery) lists Hedera on its 2026 roadmap but hadn't shipped it.
Two ways to close this, in order of preference — check first, build second:

- **Path A**: query your chosen provider's live currency/network list
  (Onramper, Transak, MoonPay, Coinbase Onramp) for a Hedera destination.
  HBAR is commonly *purchasable* on these platforms; that's not the same as
  *deliverable to a Hedera account*, so confirm the destination-network
  support specifically. If it exists, this is a genuine one-tap flow:
  Apple/Google Pay → HBAR lands on the viewer's alias address → auto-creates
  their hollow account in the same step.
- **Path B (works today, adds float risk)**: onramp USDC on a
  well-supported EVM chain (e.g. Base) into the *same* address (a Privy
  embedded wallet's secp256k1 key is one address across every EVM chain,
  and Hedera accepts that same address as an alias). Your backend then
  advances the equivalent HBAR/Hedera-USDC to the viewer's Hedera account
  from a treasury float and reconciles the Base-side USDC asynchronously.
  This is a real, common pattern (front liquidity, true up later) but it's
  custodial float, not a trustless bridge — treat it as an interim measure.

`apps/web/lib/onramp.ts` documents this decision point in code; wire
`buildOnrampUrl()` up once you've picked a path.

### 5. Run it

```bash
pnpm install
cp apps/facilitator/.env.example apps/facilitator/.env      # fill in
cp apps/resource-server/.env.example apps/resource-server/.env
cp apps/web/.env.example apps/web/.env.local

pnpm dev:facilitator      # :4021
pnpm dev:resource-server  # :4000, talks to the facilitator over HTTP
pnpm dev:web              # :3000, visit /p/abc123
```

## Known verification TODOs

Everything above is grounded against the real `@x402/core` / `@x402/hedera`
packages (fetched and inspected from the npm registry while building this),
Hedera's public HIPs, and Hedera's own x402 announcement. Two seams are
flagged inline in code because they depend on SDK/API surfaces that
couldn't be fully confirmed in this session and should be pinned against
current docs before shipping:

- `app/api/hedera/sign/route.ts` — exact Privy raw-signing RPC method name.
- The same file's `Signer` object passed to `Transaction.signWithSigner` —
  confirm the interface shape against your installed `@hiero-ledger/sdk`
  version.
