import { getDb } from "@kimacast/db";

/// Platforms that need a per-creator SocialConnection at all. Telegram
/// stays on the bot-admin model (see PublishOptions in publishers.ts) so
/// it's deliberately excluded here.
export const CONNECTABLE_PLATFORMS = ["x", "instagram"] as const;

/// The connection a publish/schedule action should default to for one
/// agent+channel: whichever connection this agent most recently published
/// through successfully, or - if it's never published on this platform
/// before - the creator's most-recently-connected account for it. Derived
/// on every call rather than stored, same reasoning as GenerationResult's
/// status: one source of truth (PostPublication rows), no second field
/// that could drift.
export async function resolveDefaultConnectionId(
  agentId: string,
  creatorId: string,
  platform: string,
): Promise<string | null> {
  const lastUsed = await getDb().postPublication.findFirst({
    where: { agentId, channel: platform, status: "published", socialConnectionId: { not: null } },
    orderBy: { publishedAt: "desc" },
  });
  if (lastUsed?.socialConnectionId) return lastUsed.socialConnectionId;

  const fallback = await getDb().socialConnection.findFirst({
    where: { creatorId, platform },
    orderBy: { createdAt: "desc" },
  });
  return fallback?.id ?? null;
}
