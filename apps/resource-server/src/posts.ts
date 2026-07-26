import { getDb } from "@kimacast/db";

export type Post = {
  id: string;
  /** ENS subdomain of the agent that authored this story; resolves to a Hedera payTo (see ens.ts). */
  agentEns: string;
  /** Free teaser shown to every viewer, and used as the Instagram caption. */
  teaser: string;
  /** Full story, only released after a settled payment. */
  full: string;
  /** Price in tinybars (1 HBAR = 10^8 tinybars). Native HBAR needs no token
   *  association, so a never-before-seen Hedera account can pay it the
   *  instant it receives its first HBAR — see docs/SETUP.md "Why HBAR". */
  priceTinybars: string;
  sourceUrl: string;
};

const posts: Record<string, Post> = {
  abc123: {
    id: "abc123",
    agentEns: "food.storyagent.eth",
    teaser:
      "The secret to Lisbon's best pastel de nata isn't the custard, it's the 200-year-old lamination technique that almost died with one baker...",
    full:
      "...the full 420-word story, plus the exact bakery address, opening hours, and the archived 1834 recipe scan the agent sourced this from. Tap through to the original site for photos and the walking route.",
    priceTinybars: "2000000", // 0.02 HBAR
    sourceUrl: "https://original-site.example.com/pastel-de-nata",
  },
};

/**
 * Checks the shared Prisma database (populated by apps/dashboard-api once a
 * creator approves an agent's post) first, so a dashboard-created post
 * becomes a real x402-gated URL through this same route without any new
 * route being needed. Falls back to the hardcoded demo map when no
 * DATABASE_URL is configured (or the id isn't found there) - this repo's
 * established "runs with zero extra config" convention.
 */
export async function getPost(id: string): Promise<Post | undefined> {
  if (process.env.DATABASE_URL) {
    const row = await getDb().post.findUnique({ where: { id }, include: { agent: true } });
    if (row) {
      return {
        id: row.id,
        agentEns: row.agent.ensSubname ?? "",
        teaser: row.teaser,
        full: row.full,
        priceTinybars: row.priceTinybars,
        sourceUrl: row.sourceUrl,
      };
    }
  }
  return posts[id];
}
