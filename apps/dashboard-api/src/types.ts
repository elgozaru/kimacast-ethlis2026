/// An immutable snapshot of one piece of source content at the moment it
/// was retrieved. Re-fetching the same canonicalUrl later and getting a
/// different contentHash is what triggers reevaluateOnHashChange.
export type ImmutableSourceSnapshot = {
  author: string | null;
  canonicalUrl: string | null;
  title: string;
  retrievedAt: string;
  content: string;
  contentHash: string;
  /// "text" | "url" | "pdf" | "rss" - how this snapshot was retrieved.
  sourceType: string;
};

/// The author's tone/style profile used to steer generation.
export type AuthorProfile = {
  toneDescription: string;
  examplePosts?: string[];
  doNotUse?: string[];
};

/// The structured output every generation run must produce, regardless of
/// prompt variant.
export type GenerationContent = {
  short_post: string;
  three_post_thread: [string, string, string] | string[];
  linkedin_summary: string;
  claims_used: string[];
  source_url: string;
};

/// Matches the "author configuration" / "required response object" shape
/// given in the spec.
export type GenerationRecord = {
  agentId: string;
  sourceHash: string;
  authorProfileHash: string | null;
  outputStorageId: string | null;
  content: GenerationContent;
  generation: {
    provider: string;
    model: string;
    promptVersion: string;
  };
};

/// A deployed agent's public identity, as published in its ENS text
/// records (agent-context) and used by the dashboard/reputation surfaces.
export type AgentContext = {
  name: string;
  owner: string;
  capabilities: string[];
  sourcePolicy: string;
  profileUri: string | null;
  reputationUri: string | null;
  version: string;
};

export type PromptVariant = "generic" | "author-tone" | "source-grounded";
