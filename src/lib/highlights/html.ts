import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { walkText } from './walk';
import { applyHighlights, type RenderableHighlight } from './marks';

/** Allowlist for stored description HTML (see docs/decisions.md). */
const DESCRIPTION_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    // div is kept (as a plain block) because ATS markup like Lever's uses it for paragraphs;
    // stripping it would run separate blocks together.
    'p', 'div', 'br', 'b', 'i', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre', 'a', 'hr',
  ],
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

export function sanitizeDescriptionHtml(html: string): string {
  return sanitizeHtml(html, DESCRIPTION_SANITIZE).trim();
}

function parseFragment(html: string) {
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`);
  return { document, root: document.getElementById('root')! as unknown as HTMLElement };
}

/** Plain text of (already sanitized) description HTML. This defines `description_text`. */
export function htmlToText(html: string): string {
  if (!html) return '';
  return walkText(parseFragment(html).root).text;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Converts pasted plain text to HTML: blank lines separate paragraphs, single newlines become <br>. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Produces the stored pair for a job description. HTML wins when given; otherwise the
 * plain text is converted to HTML. Either way the text is derived from the sanitized HTML
 * so highlight offsets stay consistent with what is rendered.
 */
export function prepareDescription(input: { html?: string | null; text?: string | null }): {
  descriptionHtml: string | null;
  descriptionText: string | null;
} {
  const html = input.html?.trim()
    ? sanitizeDescriptionHtml(input.html)
    : input.text?.trim()
      ? textToHtml(input.text)
      : '';
  if (!html) return { descriptionHtml: null, descriptionText: null };
  return { descriptionHtml: html, descriptionText: htmlToText(html) };
}

export type { RenderableHighlight } from './marks';

/**
 * Wraps highlight ranges in marks (see applyHighlights). Highlights whose quote no longer
 * matches the text at their offsets are returned as `orphaned` and not rendered.
 */
export function renderHighlightedHtml<H extends RenderableHighlight>(html: string, highlights: H[]) {
  const { root } = parseFragment(html);
  const { text, orphaned } = applyHighlights(root, highlights);
  return { html: root.innerHTML, text, orphaned };
}

/**
 * Description HTML for display: stored HTML is re-sanitized on output (rows written before
 * sanitize-on-save existed), and plain-text-only rows are converted.
 */
export function renderDescription<H extends RenderableHighlight>(
  job: { descriptionHtml: string | null; descriptionText: string | null },
  highlights: H[] = []
) {
  const html = job.descriptionHtml?.trim()
    ? sanitizeDescriptionHtml(job.descriptionHtml)
    : textToHtml(job.descriptionText ?? '');
  if (!html) return { html: '', baseHtml: '', text: '', orphaned: highlights };
  const base = renderHighlightedHtml(html, [] as H[]);
  const marked = highlights.length ? renderHighlightedHtml(html, highlights) : base;
  // baseHtml: normalized, without marks, for the client highlighter to re-render from.
  return { html: marked.html, baseHtml: base.html, text: marked.text, orphaned: marked.orphaned };
}
