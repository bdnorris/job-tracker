import { walkText, type WalkResult } from './walk';

/**
 * DOM-only highlight rendering, shared by the server (linkedom) and the browser island so
 * both produce identical marks from the same offsets.
 */

export interface RenderableHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  category: string;
}

/** A highlight is anchored when its quote still matches the text at its offsets. */
export function isAnchored(h: RenderableHighlight, text: string): boolean {
  return h.startOffset >= 0 && h.endOffset > h.startOffset && text.slice(h.startOffset, h.endOffset) === h.quote;
}

/**
 * Normalizes `root`'s text nodes to the walked text and wraps each anchored highlight in
 * `<mark class="hl hl-<category>" data-id>` elements. Ranges are split at element
 * boundaries; overlapping ranges nest with the longest outermost, so the shortest
 * (innermost) range's color shows. The first piece of each highlight gets id="hl-<id>" so
 * it can be linked to and scrolled to. Returns the walk and the highlights that didn't
 * anchor.
 */
export function applyHighlights<H extends RenderableHighlight>(root: Element, highlights: H[]): WalkResult & { orphaned: H[] } {
  const doc = root.ownerDocument!;
  const walked = walkText(root);
  const { text, segments } = walked;

  const valid: H[] = [];
  const orphaned: H[] = [];
  for (const h of highlights) (isAnchored(h, text) ? valid : orphaned).push(h);

  // Normalize text nodes so the rendered DOM walks to exactly the same text.
  for (const seg of segments) if (seg.node.data !== seg.text) seg.node.data = seg.text;
  if (valid.length === 0) return { ...walked, orphaned };

  const outerFirst = (a: H, b: H) =>
    b.endOffset - b.startOffset - (a.endOffset - a.startOffset) || a.startOffset - b.startOffset || a.id.localeCompare(b.id);
  const firstPieceDone = new Set<string>();

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

    const fragment = doc.createDocumentFragment();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      let node: Node = doc.createTextNode(seg.text.slice(a, b));
      const covering = overlapping.filter((h) => h.startOffset <= segStart + a && h.endOffset >= segStart + b).sort(outerFirst);
      for (let j = covering.length - 1; j >= 0; j--) {
        const h = covering[j];
        const mark = doc.createElement('mark');
        // linkedom serializes attributes in reverse insertion order; set them so output reads class, data-id, id.
        if (!firstPieceDone.has(h.id)) {
          firstPieceDone.add(h.id);
          mark.setAttribute('id', `hl-${h.id}`);
        }
        mark.setAttribute('data-id', h.id);
        mark.setAttribute('class', `hl hl-${h.category}`);
        mark.appendChild(node);
        node = mark;
      }
      fragment.appendChild(node);
    }
    seg.node.parentNode!.replaceChild(fragment, seg.node);
  }

  return { ...walked, orphaned };
}

/** Ancestor walk instead of Node.contains, which isn't reliable in every DOM implementation. */
function isInside(root: Node, node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parentNode) if (n === root) return true;
  return false;
}

/** Pre-order positions of every node under `top`, plus each node's subtree size. */
function documentOrder(top: Node) {
  const index = new Map<Node, number>();
  const size = new Map<Node, number>();
  let i = 0;
  const visit = (n: Node) => {
    const at = i++;
    index.set(n, at);
    // childNodes rather than nextSibling: linkedom's doctype node has no nextSibling.
    for (const c of Array.from(n.childNodes)) visit(c);
    size.set(n, i - at);
  };
  visit(top);
  return { index, size };
}

/**
 * Maps a DOM boundary point (as in a Selection/Range) inside `root` to an offset in the
 * walked text. Points before `root` map to 0 and points after it to the text's length,
 * which clamps selections that extend outside the description. Document order is computed
 * explicitly rather than with compareDocumentPosition, which DOM implementations disagree on.
 */
export function pointToOffset(root: Node, walk: WalkResult, node: Node, offset: number): number {
  const { segments, text } = walk;

  if (!isInside(root, node)) {
    const top = root.ownerDocument ?? root;
    const { index } = documentOrder(top);
    return (index.get(node) ?? 0) < (index.get(root) ?? 0) ? 0 : text.length;
  }

  if (node.nodeType === 3) {
    const seg = segments.find((s) => s.node === node);
    if (!seg) return text.length;
    return seg.start + Math.max(0, Math.min(offset, seg.text.length));
  }

  // An element point is "before child[offset]": use the first text segment at or after it.
  const { index, size } = documentOrder(root);
  const child = node.childNodes[offset];
  const boundary = child ? index.get(child)! : index.get(node)! + size.get(node)!;
  const seg = segments.find((s) => (index.get(s.node) ?? -1) >= boundary);
  return seg ? seg.start : text.length;
}

export interface SelectionOffsets {
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
}

const CONTEXT = 32;

/** Offsets, quote and context for a range of the walked text, trimmed of surrounding whitespace. Null if empty. */
export function offsetsFor(text: string, start: number, end: number): SelectionOffsets | null {
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(text.length, Math.max(start, end));
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (e <= s) return null;
  return {
    startOffset: s,
    endOffset: e,
    quote: text.slice(s, e),
    prefix: text.slice(Math.max(0, s - CONTEXT), s),
    suffix: text.slice(e, e + CONTEXT),
  };
}
