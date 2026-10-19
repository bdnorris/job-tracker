import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'a', 'hr', 'del',
];

/** Renders user-authored markdown (event bodies) to sanitized HTML. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md || !md.trim()) return '';
  const raw = marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      // Headings in an event body shouldn't outrank page headings.
      h1: 'h4',
      h2: 'h4',
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
