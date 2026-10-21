import { parseHTML } from 'linkedom';
import { decodeHTML } from 'entities';

/** Parses a full HTML page with linkedom. */
export function parseDocument(html: string) {
  return parseHTML(html).document as unknown as Document;
}

/** Decodes HTML entities once (Greenhouse returns its description HTML entity-encoded). */
export function decodeEntities(s: string): string {
  return /&[#a-z0-9]+;/i.test(s) ? decodeHTML(s) : s;
}

/** Collapses whitespace in a short single-line value (titles, names, locations). */
export function cleanLine(s: string | null | undefined): string | undefined {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v || undefined;
}

export function metaContent(doc: Document, ...selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const v = cleanLine(doc.querySelector(sel)?.getAttribute('content'));
    if (v) return v;
  }
  return undefined;
}

/** "acme-corp" → "Acme Corp", used when an ATS API returns no company name. */
export function titleCaseSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
