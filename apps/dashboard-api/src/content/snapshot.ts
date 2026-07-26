import { createHash } from "node:crypto";
import type { ImmutableSourceSnapshot } from "../types.js";

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

export type SourceInput =
  | { kind: "url"; url: string; author?: string }
  | { kind: "text"; title: string; content: string; author?: string; canonicalUrl?: string };
// PDF and RSS ingestion are deliberately not implemented yet - the MVP
// content in data/input-article.md was extracted from an uploaded PDF by
// hand. Adding them later means adding two more `kind` variants here
// (`kind: "pdf"` via a PDF-text-extraction lib, `kind: "rss"` via
// rss-parser) that both resolve to the same { title, content } shape
// before hashing, so nothing downstream of this function needs to change.

function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf-8").digest("hex")}`;
}

/// Builds the immutable source snapshot for a piece of content, at the
/// moment it's retrieved. Two calls with the same input always produce the
/// same contentHash (pure function of the normalized text), which is what
/// lets a caller detect "the source changed" by comparing hashes across
/// requests to the same canonicalUrl.
export async function buildSnapshot(input: SourceInput): Promise<ImmutableSourceSnapshot> {
  if (input.kind === "text") {
    return {
      author: input.author ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      title: input.title,
      retrievedAt: new Date().toISOString(),
      content: input.content,
      contentHash: contentHash(input.content),
    };
  }

  const res = await fetch(input.url, {
    headers: { "User-Agent": "KimacastAgent/0.1 (+content-syndication-agent)" },
  });
  if (!res.ok) {
    throw new Error(`buildSnapshot: ${input.url} responded ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? titleMatch[1].trim() : input.url;
  const content = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(TAG_RE, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();

  return {
    author: input.author ?? null,
    canonicalUrl: input.url,
    title,
    retrievedAt: new Date().toISOString(),
    content,
    contentHash: contentHash(content),
  };
}
