import { publishTweet } from "./twitter.js";
import { publishTelegramMessage } from "./telegram.js";
import { publishInstagramPost } from "./instagram.js";

export type PublishResult = { id: string; text: string; posted: boolean };
/// `connection` carries the decrypted per-creator OAuth token bound to
/// this channel for this post (see routes/posts.ts's resolveConnections) -
/// absent for Telegram (bot-admin model, no per-creator connection) and
/// optional for X (falls back to the static platform-level credential).
export type PublishOptions = {
  dryRun?: boolean;
  chatId?: string;
  connection?: { accessToken: string; platformUserId: string };
  imageUrl?: string;
};

/// Every channel an agent's settings.socialChannels can name.
export const PUBLISHERS: Record<string, (text: string, opts: PublishOptions) => Promise<PublishResult>> = {
  x: (text, opts) => publishTweet(text, { dryRun: opts.dryRun, accessToken: opts.connection?.accessToken }),
  telegram: (text, opts) => publishTelegramMessage(text, { chatId: opts.chatId, dryRun: opts.dryRun }),
  instagram: (text, opts) => {
    if (!opts.dryRun && !opts.connection) throw new Error("Instagram requires a connected account - see /connections.");
    return publishInstagramPost(text, {
      accessToken: opts.connection?.accessToken ?? "",
      igUserId: opts.connection?.platformUserId ?? "",
      imageUrl: opts.imageUrl,
      dryRun: opts.dryRun,
    });
  },
};

export const AVAILABLE_CHANNELS = Object.keys(PUBLISHERS);
