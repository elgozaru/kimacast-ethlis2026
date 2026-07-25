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

export function getPost(id: string): Post | undefined {
  return posts[id];
}
