/// Telegram publisher, alongside social/twitter.ts's X client. Same
/// dry-run fallback shape, but a different credential model: one Telegram
/// bot token serves every agent (like X's static API keys), but the
/// DESTINATION varies per agent - a bot has to be added as an admin to
/// each target channel/group, and the caller passes which chat to post
/// into (agent.settings.telegramChatId - see routes/posts.ts). Unlike
/// social/twitter.ts, this hasn't been exercised against the live Telegram
/// API from this environment (no route to api.telegram.org here) - the
/// request/response shape below matches Telegram's public Bot API docs
/// (sendMessage), but smoke-test it with a real bot token before relying
/// on it in production.
function isConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function publishTelegramMessage(
  text: string,
  { chatId, dryRun = false }: { chatId?: string; dryRun?: boolean } = {},
): Promise<{ id: string; text: string; posted: boolean }> {
  if (dryRun || !isConfigured() || !chatId) {
    return { id: `dry-run-${Date.now()}`, text, posted: false };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
  if (!res.ok || !data.ok || !data.result) {
    throw new Error(`Telegram sendMessage failed: ${data.description ?? res.statusText}`);
  }
  return { id: String(data.result.message_id), text, posted: true };
}
