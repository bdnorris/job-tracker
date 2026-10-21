import { isAnchored } from './marks';

/**
 * Re-anchoring after a description edit (spec: Highlighter > Re-anchoring). A highlight
 * whose quote still matches at its offsets is kept. Otherwise every occurrence of the quote
 * in the new text is scored by how well the surrounding text matches the stored
 * prefix/suffix, with closeness to the old position as a tie-breaker. If the exact quote is
 * gone, a whitespace-tolerant match is tried (edits often turn a line break into a space).
 * No match means the highlight is orphaned and shown under "Needs review".
 */

export interface AnchorableHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
  category: string;
}

export interface Anchor {
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
}

const CONTEXT = 32;

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function candidates(text: string, quote: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (!quote) return out;
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) out.push({ start: i, end: i + quote.length });
  if (out.length) return out;

  const words = quote.split(/\s+/).filter(Boolean);
  if (words.length === 0) return out;
  const re = new RegExp(words.map(escapeRe).join('\\s+'), 'g');
  for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length });
  return out;
}

export function reanchor(h: AnchorableHighlight, text: string | null | undefined): Anchor | null {
  if (!text) return null;
  if (isAnchored(h, text)) {
    return { startOffset: h.startOffset, endOffset: h.endOffset, quote: h.quote, prefix: h.prefix, suffix: h.suffix };
  }

  let best: { start: number; end: number; score: number } | null = null;
  for (const c of candidates(text, h.quote)) {
    const context =
      commonSuffixLength(h.prefix, text.slice(Math.max(0, c.start - CONTEXT), c.start)) +
      commonPrefixLength(h.suffix, text.slice(c.end, c.end + CONTEXT));
    // Context dominates; distance only breaks ties (it is always < 1).
    const score = context - Math.abs(c.start - h.startOffset) / (text.length + 1);
    if (!best || score > best.score) best = { ...c, score };
  }
  if (!best) return null;

  return {
    startOffset: best.start,
    endOffset: best.end,
    quote: text.slice(best.start, best.end),
    prefix: text.slice(Math.max(0, best.start - CONTEXT), best.start),
    suffix: text.slice(best.end, best.end + CONTEXT),
  };
}

/** Re-anchors every highlight; returns the ones whose stored anchor needs updating, and the orphans. */
export function reanchorAll<H extends AnchorableHighlight>(highlights: H[], text: string | null | undefined) {
  const updates: { id: string; anchor: Anchor }[] = [];
  const orphaned: H[] = [];
  for (const h of highlights) {
    const anchor = reanchor(h, text);
    if (!anchor) orphaned.push(h);
    else if (anchor.startOffset !== h.startOffset || anchor.endOffset !== h.endOffset || anchor.quote !== h.quote || anchor.prefix !== h.prefix || anchor.suffix !== h.suffix) {
      updates.push({ id: h.id, anchor });
    }
  }
  return { updates, orphaned };
}
