import "dotenv/config";

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function getClient() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function fetchPageText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "XAgent/0.1 (+research-agent)" } });
  if (!res.ok) throw new Error(`fetchPageText: ${url} responded ${res.status} ${res.statusText}`);
  const html = await res.text();

  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? titleMatch[1].trim() : url;

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(TAG_RE, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();

  return { title, text };
}

/**
 * Research Agent: fetches the source URL and asks Claude to pull out the
 * most tweet-worthy facts/angles. Falls back to a plain excerpt (no Claude
 * call) when ANTHROPIC_API_KEY isn't set, so the pipeline still runs.
 */
export async function research(url) {
  const { title, text } = await fetchPageText(url);

  if (!isConfigured()) {
    return { url, title, summary: text.slice(0, 1000), model: "local-fallback" };
  }

  const client = await getClient();
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `Read this page content and extract the 5 most interesting, tweet-worthy facts or angles. ` +
          `Be concise, factual, and note anything uncertain.\n\nTitle: ${title}\n\nContent:\n${text.slice(0, 8000)}`,
      },
    ],
  });

  const summary = message.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  return { url, title, summary, model: message.model };
}

/**
 * Content Agent: reads the Research Agent's findings back out of 0G Storage
 * and drafts an X-ready post. Falls back to a trimmed excerpt of the
 * research summary when ANTHROPIC_API_KEY isn't set.
 */
export async function generateContent(researchMemory) {
  if (!isConfigured()) {
    return { text: researchMemory.summary.slice(0, 260), model: "local-fallback" };
  }

  const client = await getClient();
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          `Write a single X (Twitter) post, under 280 characters, based on this research. ` +
          `Make it a hook that drives curiosity and links back to the source - don't include a URL, ` +
          `that gets appended separately. Return only the post text.\n\n` +
          `Title: ${researchMemory.title}\nResearch notes:\n${researchMemory.summary}`,
      },
    ],
  });

  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("\n").trim();
  return { text, model: message.model };
}
