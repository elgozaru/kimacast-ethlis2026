/// When true, the viewer page skips the real teaser fetch and the entire
/// Privy/Hedera/x402 flow, and instead renders a hardcoded example bundle
/// (see mockPost.ts) so the paywall UI can be evaluated visually without a
/// working ENS/Hedera/Privy backend. Never true in a real deployment - set
/// only in apps/web/.env.local for local UI work.
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";
