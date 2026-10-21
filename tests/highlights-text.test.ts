import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { walkText } from '../src/lib/highlights/walk';
import {
  htmlToText,
  textToHtml,
  prepareDescription,
  renderHighlightedHtml,
  sanitizeDescriptionHtml,
} from '../src/lib/highlights/html';

const hl = (id: string, text: string, quote: string, category = 'requirement', from = 0) => {
  const start = text.indexOf(quote, from);
  if (start < 0) throw new Error(`quote not found: ${quote}`);
  return { id, startOffset: start, endOffset: start + quote.length, quote, category };
};

describe('htmlToText', () => {
  it('separates blocks with single newlines and collapses whitespace', () => {
    const html = '<h2>About  us</h2>\n  <p>We build\n   tools.</p>\n<ul>\n <li>Remote</li>\n <li>401k</li>\n</ul>';
    expect(htmlToText(html)).toBe('About us\nWe build tools.\nRemote\n401k');
  });

  it('keeps inline spacing between elements', () => {
    expect(htmlToText('<p>Use <strong>TypeScript</strong> and <em>Astro</em>.</p>')).toBe('Use TypeScript and Astro.');
    expect(htmlToText('<p>foo <b> bar</b></p>')).toBe('foo bar');
    expect(htmlToText('<p>a<br>b<br><br>c</p>')).toBe('a\nb\nc');
  });

  it('ignores scripts and styles and handles empty input', () => {
    expect(htmlToText('<p>x</p><style>p{}</style><script>1</script>')).toBe('x');
    expect(htmlToText('')).toBe('');
  });

  it('keeps non-breaking spaces', () => {
    expect(htmlToText('<p>a&nbsp;&nbsp;b</p>')).toBe('a  b');
  });
});

describe('textToHtml / prepareDescription', () => {
  it('turns pasted text into escaped paragraphs', () => {
    expect(textToHtml('Line one\nline two\n\n<Second> & para\r\n')).toBe('<p>Line one<br>line two</p><p>&lt;Second&gt; &amp; para</p>');
  });

  it('derives text from the sanitized html', () => {
    const r = prepareDescription({ html: '<p onclick="x()">Hi <script>bad()</script><a href="javascript:x">there</a></p>' });
    expect(r.descriptionHtml).not.toMatch(/onclick|script|javascript/);
    expect(r.descriptionText).toBe('Hi there');
  });

  it('is stable when the derived text is fed back in', () => {
    const first = prepareDescription({ text: 'Para one\nline\n\nPara two' });
    const second = prepareDescription({ text: first.descriptionText });
    expect(second.descriptionText).toBe(first.descriptionText);
  });

  it('returns nulls for empty descriptions', () => {
    expect(prepareDescription({ text: '  ' })).toEqual({ descriptionHtml: null, descriptionText: null });
  });

  it('keeps div blocks so separate paragraphs stay separate', () => {
    const r = prepareDescription({ html: '<div class="x">First block</div><div>Second block</div>' });
    expect(r.descriptionHtml).toBe('<div>First block</div><div>Second block</div>');
    expect(r.descriptionText).toBe('First block\nSecond block');
  });

  it('adds safe rel and target to links', () => {
    expect(sanitizeDescriptionHtml('<a href="https://example.com">x</a>')).toContain('rel="noopener noreferrer"');
  });
});

describe('renderHighlightedHtml', () => {
  const html = '<p>Requires <strong>5+ years</strong> of TypeScript.</p><ul><li>Remote first</li></ul>';
  const text = htmlToText(html);

  it('wraps a simple range', () => {
    const r = renderHighlightedHtml(html, [hl('a', text, 'TypeScript')]);
    expect(r.html).toContain('<mark class="hl hl-requirement" data-id="a">TypeScript</mark>');
    expect(r.orphaned).toHaveLength(0);
  });

  it('splits marks across element boundaries', () => {
    const r = renderHighlightedHtml(html, [hl('a', text, 'Requires 5+ years of')]);
    expect(r.html.match(/data-id="a"/g)).toHaveLength(3);
    expect(r.html).toContain('<strong><mark class="hl hl-requirement" data-id="a">5+ years</mark></strong>');
  });

  it('spans block boundaries without marking the separator', () => {
    const r = renderHighlightedHtml(html, [hl('a', text, 'TypeScript.\nRemote')]);
    expect(r.html).toContain('<li><mark class="hl hl-requirement" data-id="a">Remote</mark> first</li>');
  });

  it('nests overlapping ranges with the shortest innermost', () => {
    const r = renderHighlightedHtml(html, [hl('long', text, '5+ years', 'nice'), hl('short', text, 'years', 'redflag')]);
    expect(r.html).toContain(
      '<mark class="hl hl-nice" data-id="long">5+ </mark><mark class="hl hl-nice" data-id="long"><mark class="hl hl-redflag" data-id="short">years</mark></mark>'
    );
  });

  it('reports highlights whose quote no longer matches', () => {
    const bad = { id: 'x', startOffset: 0, endOffset: 4, quote: 'Nope', category: 'requirement' };
    const r = renderHighlightedHtml(html, [bad]);
    expect(r.orphaned).toEqual([bad]);
    expect(r.html).not.toContain('<mark');
  });

  it('renders HTML that walks back to the same text', () => {
    const messy = '<div>\n  <p>  Lots   of\n space </p>\n\n<p><em>x</em> <b>y</b></p></div>';
    const t = htmlToText(messy);
    const r = renderHighlightedHtml(messy, [hl('a', t, 'of space'), hl('b', t, 'x y')]);
    const { document } = parseHTML(`<!doctype html><html><body><div id="r">${r.html}</div></body></html>`);
    expect(walkText(document.getElementById('r')!).text).toBe(t);
  });
});
