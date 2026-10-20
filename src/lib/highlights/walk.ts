/**
 * The single text model for job descriptions. `description_text` is defined as
 * the output of this walk over the sanitized description HTML, and highlight
 * offsets index into it. It only uses standard DOM properties so the same code
 * runs on the server (linkedom) and in the browser (Phase 5 highlighter).
 *
 * Rules:
 * - Text nodes are visited in document order; runs of ASCII whitespace collapse
 *   to one space (non-breaking spaces are kept, as browsers do).
 * - A leading space is dropped at the start of the text, after a line break, or
 *   after another space.
 * - Block elements (and <br>) produce a single "\n" before the next non-blank
 *   text. Line breaks never repeat and never lead or trail the text.
 * - Whitespace-only text while a break is pending is dropped.
 */

export interface TextSegment {
  /** The DOM text node this segment came from. */
  node: Text;
  /** Offset of this segment's first character in the walked text. */
  start: number;
  /** The node's normalized contribution (may be empty). */
  text: string;
}

export interface WalkResult {
  text: string;
  segments: TextSegment[];
}

const BLOCK_ELEMENTS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

const SKIPPED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const FRAGMENT_NODE = 11;

export function walkText(root: Node): WalkResult {
  let out = '';
  let pendingBreak = false;
  const segments: TextSegment[] = [];

  const visit = (node: Node) => {
    if (node.nodeType === TEXT_NODE) {
      const textNode = node as Text;
      let t = textNode.data.replace(/[ \t\n\r\f]+/g, ' ');
      const blank = t === '' || t === ' ';

      if (blank && pendingBreak) {
        segments.push({ node: textNode, start: out.length, text: '' });
        return;
      }
      if (pendingBreak && out.length > 0 && !out.endsWith('\n')) out += '\n';
      if (!blank) pendingBreak = false;

      if (t.startsWith(' ') && (out.length === 0 || out.endsWith('\n') || out.endsWith(' '))) {
        t = t.slice(1);
      }
      segments.push({ node: textNode, start: out.length, text: t });
      out += t;
      return;
    }

    if (node.nodeType !== ELEMENT_NODE && node.nodeType !== DOCUMENT_NODE && node.nodeType !== FRAGMENT_NODE) {
      return;
    }

    const name = node.nodeType === ELEMENT_NODE ? node.nodeName.toUpperCase() : '';
    if (SKIPPED_ELEMENTS.has(name)) return;
    const block = BLOCK_ELEMENTS.has(name);

    if (block) pendingBreak = true;
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
    if (block) pendingBreak = true;
  };

  visit(root);
  return { text: out, segments };
}
