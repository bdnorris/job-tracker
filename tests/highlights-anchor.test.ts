import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { htmlToText, prepareDescription, renderHighlightedHtml } from '../src/lib/highlights/html';
import { applyHighlights, offsetsFor, pointToOffset } from '../src/lib/highlights/marks';
import { walkText } from '../src/lib/highlights/walk';
import { reanchor, reanchorAll } from '../src/lib/highlights/anchor';

const dom = (html: string) => {
  const { document } = parseHTML(`<!doctype html><html><body><p id="before">Outside</p><div id="root">${html}</div><p id="after">Outside</p></body></html>`);
  return { document, root: document.getElementById('root')! };
};

const make = (id: string, text: string, quote: string, category = 'requirement', from = 0) => {
  const r = offsetsFor(text, text.indexOf(quote, from), text.indexOf(quote, from) + quote.length)!;
  return { id, category, ...r };
};

const FIXTURE = '<h2>About  the role</h2>\n<p>We need <strong>5+ years</strong> of TypeScript and React.</p>\n<ul>\n <li>Own the design system</li>\n <li>Frequent on-call</li>\n</ul>\n<p>Unlimited PTO.</p>';

describe('client and server agree on offsets', () => {
  const { descriptionHtml, descriptionText } = prepareDescription({ html: FIXTURE });
  const text = descriptionText!;

  it('the rendered HTML walks back to description_text, with and without marks', () => {
    const plain = renderHighlightedHtml(descriptionHtml!, []);
    const marked = renderHighlightedHtml(descriptionHtml!, [make('a', text, 'years of TypeScript'), make('b', text, 'TypeScript', 'keyword')]);
    for (const html of [plain.html, marked.html]) expect(walkText(dom(html).root).text).toBe(text);
  });

  it('maps DOM selection points in rendered marks to the same offsets', () => {
    const h = make('a', text, '5+ years of TypeScript');
    const { root } = dom(renderHighlightedHtml(descriptionHtml!, [h]).html);
    const walk = walkText(root);
    // Select exactly the text of the rendered mark pieces, as a user would.
    const marks = Array.from(root.querySelectorAll('mark[data-id="a"]'));
    const first = marks[0].firstChild!;
    const last = marks[marks.length - 1].firstChild as Text;
    const start = pointToOffset(root, walk, first, 0);
    const end = pointToOffset(root, walk, last, last.data.length);
    expect(offsetsFor(text, start, end)).toMatchObject({ startOffset: h.startOffset, endOffset: h.endOffset, quote: h.quote });
  });

  it('handles element boundary points and clamps points outside the container', () => {
    const { document, root } = dom(renderHighlightedHtml(descriptionHtml!, []).html);
    const walk = walkText(root);
    const ul = root.querySelector('ul')!;
    expect(text.slice(pointToOffset(root, walk, ul, 0))).toMatch(/^Own the design system/);
    expect(pointToOffset(root, walk, root, root.childNodes.length)).toBe(text.length);
    expect(pointToOffset(root, walk, document.getElementById('before')!.firstChild!, 3)).toBe(0);
    expect(pointToOffset(root, walk, document.getElementById('after')!.firstChild!, 3)).toBe(text.length);
  });

  it('trims whitespace and ignores empty selections', () => {
    const i = text.indexOf('Own');
    expect(offsetsFor(text, i - 1, i + 3)?.quote).toBe('Own');
    expect(offsetsFor(text, i - 1, i)).toBeNull();
    expect(offsetsFor(text, 5, 5)).toBeNull();
    const sel = offsetsFor(text, text.indexOf('React'), text.indexOf('React') + 5)!;
    expect(sel.prefix).toBe(text.slice(sel.startOffset - 32, sel.startOffset));
    expect(sel.suffix).toBe(text.slice(sel.endOffset, sel.endOffset + 32));
  });

  it('applyHighlights reports orphans and gives only the first piece an id', () => {
    const { root } = dom(descriptionHtml!);
    const bad = { id: 'x', startOffset: 0, endOffset: 3, quote: 'Nope', category: 'requirement' };
    const span = make('s', text, 'React.\nOwn the');
    const { orphaned } = applyHighlights(root, [bad, span]);
    expect(orphaned).toEqual([bad]);
    expect(root.querySelectorAll('mark[data-id="s"]')).toHaveLength(2);
    expect(root.querySelectorAll('#hl-s')).toHaveLength(1);
  });
});

describe('reanchor', () => {
  const original = htmlToText('<p>Requirements: TypeScript, React. Nice to have: React Native.</p><p>Remote.</p>');
  const hl = make('a', original, 'React', 'requirement', original.indexOf('React Native'));

  it('keeps highlights whose quote still matches', () => {
    expect(reanchor(hl, original)).toMatchObject({ startOffset: hl.startOffset, endOffset: hl.endOffset });
  });

  it('moves a highlight when text is inserted before it, choosing the occurrence with matching context', () => {
    const edited = `Updated posting. ${original}`;
    const r = reanchor(hl, edited)!;
    expect(edited.slice(r.startOffset, r.endOffset)).toBe('React');
    // The second "React" (before " Native"), not the first one.
    expect(edited.slice(r.endOffset, r.endOffset + 7)).toBe(' Native');
    expect(r.prefix).toBe(edited.slice(r.startOffset - 32, r.startOffset));
  });

  it('matches across a line break that became a space', () => {
    const text = htmlToText('<p>Lead the design</p><p>system work.</p>');
    const h = make('b', text, 'design\nsystem');
    const r = reanchor(h, htmlToText('<p>Lead the design system work.</p>'))!;
    expect(r.quote).toBe('design system');
  });

  it('orphans a highlight whose quote was deleted, and handles empty text', () => {
    expect(reanchor(hl, 'Completely different text.')).toBeNull();
    expect(reanchor(hl, null)).toBeNull();
  });

  it('reanchorAll returns only changed anchors plus orphans', () => {
    const unchanged = make('u', original, 'Remote');
    const gone = make('g', original, 'Nice to have');
    const edited = `New intro. ${original.replace('Nice to have', 'Bonus')}`;
    const { updates, orphaned } = reanchorAll([unchanged, gone, hl], edited);
    expect(updates.map((u) => u.id).sort()).toEqual(['a', 'u']);
    expect(orphaned.map((o) => o.id)).toEqual(['g']);
    const { updates: none } = reanchorAll([unchanged], original);
    expect(none).toEqual([]);
  });
});
