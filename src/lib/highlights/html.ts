import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { walkText } from './walk';

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

export interface RenderableHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  category: string;
}

/**
 * Wraps highlight ranges in `<mark class="hl hl-<category>" data-id>` elements. Ranges are
 * split at element boundaries, and overlapping ranges nest with the longest outermost so the
 * shortest (innermost) range's color shows. Highlights whose quote no longer matches the
 * text at their offsets are returned as `orphaned` and not rendered.
 */
export function renderHighlightedHtml(html: string, highlights: RenderableHighlight[]) {
  const { document, root } = parseFragment(html);
  const { text, segments } = walkText(root);

  const valid: RenderableHighlight[] = [];
  const orphaned: RenderableHighlight[] = [];
  for (const h of highlights) {
    const ok = h.startOffset >= 0 && h.endOffset > h.startOffset && text.slice(h.startOffset, h.endOffset) === h.quote;
    (ok ? valid : orphaned).push(h);
  }

  // Normalize text nodes so the rendered DOM walks to exactly the same text.
  for (const seg of segments) seg.node.data = seg.text;

  if (valid.length > 0) {
    const outerFirst = (a: RenderableHighlight, b: RenderableHighlight) =>
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset) || a.startOffset - b.startOffset || a.id.localeCompare(b.id);

    for (const seg of segments) {
      const segStart = seg.start;
      const segEnd = seg.start + seg.text.length;
      if (segEnd === segStart) continue;

      const overlapping = valid.filter((h) => h.startOffset < segEnd && h.endOffset > segStart);
      if (overlapping.length === 0) continue;

      const cuts = new Set<number>([0, seg.text.length]);
      for (const h of overlapping) {
        cuts.add(Math.max(0, h.startOffset - segStart));
        cuts.add(Math.min(seg.text.length, h.endOffset - segStart));
      }
      const points = [...cuts].sort((a, b) => a - b);

      const fragment = document.createDocumentFragment();
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        let node: Node = document.createTextNode(seg.text.slice(a, b));
        const covering = overlapping
          .filter((h) => h.startOffset <= segStart + a && h.endOffset >= segStart + b)
          .sort(outerFirst);
        for (let j = covering.length - 1; j >= 0; j--) {
          const mark = document.createElement('mark');
          // linkedom serializes attributes in reverse insertion order.
          mark.setAttribute('data-id', covering[j].id);
          mark.setAttribute('class', `hl hl-${covering[j].category}`);
          mark.appendChild(node);
          node = mark;
        }
        fragment.appendChild(node);
      }
      seg.node.parentNode!.replaceChild(fragment, seg.node);
    }
  }

  return { html: root.innerHTML, text, orphaned };
}

/**
 * Description HTML for display: stored HTML is re-sanitized on output (rows written before
 * sanitize-on-save existed), and plain-text-only rows are converted.
 */
export function renderDescription(
  job: { descriptionHtml: string | null; descriptionText: string | null },
  highlights: RenderableHighlight[] = []
) {
  const html = job.descriptionHtml?.trim()
    ? sanitizeDescriptionHtml(job.descriptionHtml)
    : textToHtml(job.descriptionText ?? '');
  if (!html) return { html: '', text: '', orphaned: highlights };
  return renderHighlightedHtml(html, highlights);
}
