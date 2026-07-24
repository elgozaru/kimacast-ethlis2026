import type { SourceArticle } from "../agent/types.js";

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

/**
 * Fetches a page and extracts a plain-text version of it.
 * Kept dependency-free (no cheerio/jsdom) so the agent has no heavier
 * footprint than the 0G / Hedera / Privy SDKs it already carries.
 */
export async function fetchSource(url: string, section = "News"): Promise<SourceArticle> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Story402Agent/0.1 (+content-monetization-agent)" },
  });
  if (!res.ok) {
    throw new Error(`fetchSource: ${url} responded ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? titleMatch[1].trim() : url;

  const rawText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(TAG_RE, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();

  return { url, title, section, rawText };
}

/**
 * Convenience wrapper for cases where the caller already has the article
 * text (e.g. pasted in, or pulled from a licensed news API/RSS feed rather
 * than scraping the rendered page directly).
 */
export function fromRawText(url: string, title: string, section: string, rawText: string): SourceArticle {
  return { url, title, section, rawText };
}
