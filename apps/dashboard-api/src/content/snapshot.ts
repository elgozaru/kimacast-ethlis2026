import { createHash } from "node:crypto";
import type { ImmutableSourceSnapshot } from "../types.js";

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

export type SourceInput =
  | { kind: "url"; url: string; author?: string }
  | { kind: "text"; title: string; content: string; author?: string; canonicalUrl?: string }
  | { kind: "pdf"; pdfBase64: string; title?: string; author?: string }
  | { kind: "rss"; feedUrl: string; itemUrl?: string; author?: string };

function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf-8").digest("hex")}`;
}

/// Shared by the "url" and "rss" cases below - both retrieve HTML/XHTML
/// content that needs the same tag-stripping treatment before it's usable
/// as plain text for the generation pipeline.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(TAG_RE, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
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
      sourceType: "text",
    };
  }

  if (input.kind === "pdf") {
    // Dynamically imported so the (fairly large) pdfjs internals pdf-parse
    // pulls in only ever load when a PDF is actually ingested.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(input.pdfBase64, "base64") });
    try {
      const { text } = await parser.getText();
      const content = text.replace(WHITESPACE_RE, " ").trim();
      if (!content) {
        throw new Error("buildSnapshot: PDF produced no extractable text (scanned/image-only PDFs aren't supported)");
      }
      return {
        author: input.author ?? null,
        canonicalUrl: null,
        title: input.title ?? "Untitled PDF",
        retrievedAt: new Date().toISOString(),
        content,
        contentHash: contentHash(content),
        sourceType: "pdf",
      };
    } finally {
      await parser.destroy();
    }
  }

  if (input.kind === "rss") {
    const { default: Parser } = await import("rss-parser");
    const feed = await new Parser().parseURL(input.feedUrl);
    if (feed.items.length === 0) {
      throw new Error(`buildSnapshot: ${input.feedUrl} has no items`);
    }
    // Pick a specific item by link if asked, otherwise the newest one -
    // most feeds already list newest-first, but sort explicitly by date
    // where it's available instead of trusting that.
    const item = input.itemUrl
      ? feed.items.find((i) => i.link === input.itemUrl)
      : [...feed.items].sort((a, b) => new Date(b.isoDate ?? b.pubDate ?? 0).getTime() - new Date(a.isoDate ?? a.pubDate ?? 0).getTime())[0];
    if (!item) {
      throw new Error(`buildSnapshot: no item matching itemUrl ${input.itemUrl} in ${input.feedUrl}`);
    }
    const rawContent = item.content ?? item.summary ?? item.contentSnippet ?? "";
    const content = stripHtml(rawContent);
    if (!content) {
      throw new Error(`buildSnapshot: RSS item "${item.title ?? item.link}" has no usable content`);
    }
    return {
      author: item.creator ?? input.author ?? null,
      canonicalUrl: item.link ?? null,
      title: item.title ?? feed.title ?? input.feedUrl,
      retrievedAt: new Date().toISOString(),
      content,
      contentHash: contentHash(content),
      sourceType: "rss",
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
  const content = stripHtml(html);

  return {
    author: input.author ?? null,
    canonicalUrl: input.url,
    title,
    retrievedAt: new Date().toISOString(),
    content,
    contentHash: contentHash(content),
    sourceType: "url",
  };
}
