import { publishTweet } from "./twitter.js";
import { publishTelegramMessage } from "./telegram.js";

export type PublishResult = { id: string; text: string; posted: boolean };
export type PublishOptions = { dryRun?: boolean; chatId?: string };

/// Every channel an agent's settings.socialChannels can name. Facebook and
/// Instagram are deliberately not here yet - both need Meta App Review and
/// a real OAuth connection flow per creator (X and Telegram both use one
/// shared platform-level credential instead, which is far simpler but
/// means every agent posts through the same X account / Telegram bot -
/// fine for this iteration, but worth knowing if that's ever a problem).
export const PUBLISHERS: Record<string, (text: string, opts: PublishOptions) => Promise<PublishResult>> = {
  x: (text, opts) => publishTweet(text, { dryRun: opts.dryRun }),
  telegram: (text, opts) => publishTelegramMessage(text, { chatId: opts.chatId, dryRun: opts.dryRun }),
};

export const AVAILABLE_CHANNELS = Object.keys(PUBLISHERS);
