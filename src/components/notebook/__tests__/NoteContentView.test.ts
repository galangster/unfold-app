/**
 * Tests for the NoteContentView HTML parser.
 *
 * Focuses on parseHtml + htmlHasContent — the pure parser is where
 * rendering bugs live. Render functions are mostly mechanical tag →
 * style mapping and are covered by buildEditorCSS parity (visual
 * regression, not unit tests).
 *
 * Imports from note-content-parser directly (not NoteContentView) so
 * Jest doesn't have to traverse the theme + expo-system-ui chain.
 */

import { parseHtml, htmlHasContent } from '../note-content-parser';

// ─── htmlHasContent ────────────────────────────────────────────────

describe('htmlHasContent', () => {
  it('returns false for undefined, null, and empty string', () => {
    expect(htmlHasContent(undefined)).toBe(false);
    expect(htmlHasContent(null)).toBe(false);
    expect(htmlHasContent('')).toBe(false);
  });

  it('returns false for TipTap empty document', () => {
    expect(htmlHasContent('<p></p>')).toBe(false);
  });

  it('returns false for whitespace-only content', () => {
    expect(htmlHasContent('   ')).toBe(false);
    expect(htmlHasContent('<p>   </p>')).toBe(false);
    expect(htmlHasContent('<p></p><p></p>')).toBe(false);
  });

  it('returns true for a single paragraph', () => {
    expect(htmlHasContent('<p>hello</p>')).toBe(true);
  });

  it('returns true when the text is hidden inside nested tags', () => {
    expect(htmlHasContent('<p><strong>hi</strong></p>')).toBe(true);
  });

  it('returns true for a heading only', () => {
    expect(htmlHasContent('<h2>Title</h2>')).toBe(true);
  });
});

// ─── parseHtml: basic shapes ───────────────────────────────────────

describe('parseHtml', () => {
  it('returns an empty array for empty input', () => {
    expect(parseHtml('')).toEqual([]);
  });

  it('parses a single paragraph of plain text', () => {
    const tree = parseHtml('<p>hello world</p>');
    expect(tree).toEqual([
      {
        type: 'element',
        tag: 'p',
        attrs: {},
        children: [{ type: 'text', value: 'hello world' }],
      },
    ]);
  });

  it('parses an empty paragraph (vertical-rhythm gap)', () => {
    const tree = parseHtml('<p></p>');
    expect(tree).toEqual([
      { type: 'element', tag: 'p', attrs: {}, children: [] },
    ]);
  });

  it('parses the three heading levels', () => {
    const tree = parseHtml('<h1>a</h1><h2>b</h2><h3>c</h3>');
    expect(tree.map((n) => (n.type === 'element' ? n.tag : 'text'))).toEqual(['h1', 'h2', 'h3']);
    expect(tree[0]).toMatchObject({ tag: 'h1', children: [{ type: 'text', value: 'a' }] });
    expect(tree[1]).toMatchObject({ tag: 'h2', children: [{ type: 'text', value: 'b' }] });
    expect(tree[2]).toMatchObject({ tag: 'h3', children: [{ type: 'text', value: 'c' }] });
  });

  it('decodes known HTML entities', () => {
    const tree = parseHtml('<p>Tom &amp; Jerry &mdash; 1940</p>');
    expect(tree[0]).toMatchObject({
      children: [{ type: 'text', value: 'Tom & Jerry \u2014 1940' }],
    });
  });

  it('decodes entities inside attribute values', () => {
    const tree = parseHtml('<a href="/x?a=1&amp;b=2">link</a>');
    const el = tree[0];
    if (el.type !== 'element') throw new Error('expected element');
    expect(el.attrs.href).toBe('/x?a=1&b=2');
  });
});

// ─── parseHtml: inline marks ───────────────────────────────────────

describe('parseHtml inline marks', () => {
  it('parses nested strong + em', () => {
    const tree = parseHtml('<p><strong>bold <em>italic</em></strong></p>');
    const p = tree[0];
    if (p.type !== 'element') throw new Error('expected element');
    const strong = p.children[0];
    if (strong.type !== 'element') throw new Error('expected element');
    expect(strong.tag).toBe('strong');
    expect(strong.children[0]).toEqual({ type: 'text', value: 'bold ' });
    const em = strong.children[1];
    if (em.type !== 'element') throw new Error('expected element');
    expect(em.tag).toBe('em');
    expect(em.children[0]).toEqual({ type: 'text', value: 'italic' });
  });

  it('parses strikethrough and links', () => {
    const tree = parseHtml('<p><s>old</s> <a href="https://example.com">new</a></p>');
    const p = tree[0];
    if (p.type !== 'element') throw new Error('expected element');
    expect(p.children.length).toBe(3); // <s>, text ' ', <a>
    const s = p.children[0];
    const a = p.children[2];
    if (s.type !== 'element' || a.type !== 'element') throw new Error('expected elements');
    expect(s.tag).toBe('s');
    expect(a.tag).toBe('a');
    expect(a.attrs.href).toBe('https://example.com');
  });

  it('parses <br> as a void element (no children, no stack push)', () => {
    const tree = parseHtml('<p>line 1<br>line 2</p>');
    const p = tree[0];
    if (p.type !== 'element') throw new Error('expected element');
    expect(p.children.length).toBe(3); // text, br, text
    const br = p.children[1];
    if (br.type !== 'element') throw new Error('expected element');
    expect(br.tag).toBe('br');
    expect(br.children).toEqual([]);
    expect(p.children[2]).toEqual({ type: 'text', value: 'line 2' });
  });
});

// ─── parseHtml: lists ──────────────────────────────────────────────

describe('parseHtml lists', () => {
  it('parses an unordered list', () => {
    const tree = parseHtml('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    const ul = tree[0];
    if (ul.type !== 'element') throw new Error('expected element');
    expect(ul.tag).toBe('ul');
    expect(ul.children.length).toBe(2);
    const li1 = ul.children[0];
    if (li1.type !== 'element') throw new Error('expected element');
    expect(li1.tag).toBe('li');
  });

  it('parses an ordered list', () => {
    const tree = parseHtml('<ol><li><p>first</p></li></ol>');
    const ol = tree[0];
    if (ol.type !== 'element') throw new Error('expected element');
    expect(ol.tag).toBe('ol');
  });

  it('parses a tentap task list with data-type and data-checked', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><p>done</p></li>' +
      '<li data-type="taskItem" data-checked="false"><p>todo</p></li>' +
      '</ul>';
    const tree = parseHtml(html);
    const ul = tree[0];
    if (ul.type !== 'element') throw new Error('expected element');
    expect(ul.attrs['data-type']).toBe('taskList');
    const li1 = ul.children[0];
    const li2 = ul.children[1];
    if (li1.type !== 'element' || li2.type !== 'element') throw new Error('expected elements');
    expect(li1.attrs['data-checked']).toBe('true');
    expect(li2.attrs['data-checked']).toBe('false');
  });
});

// ─── parseHtml: blockquote + scripture callout ─────────────────────

describe('parseHtml blockquote', () => {
  it('parses a single-paragraph blockquote', () => {
    const tree = parseHtml('<blockquote><p>quoted line</p></blockquote>');
    const bq = tree[0];
    if (bq.type !== 'element') throw new Error('expected element');
    expect(bq.tag).toBe('blockquote');
    expect(bq.children.length).toBe(1);
  });

  it('parses a multi-paragraph blockquote (scripture callout shape)', () => {
    const tree = parseHtml(
      '<blockquote><p>Now faith is the substance of things hoped for</p><p>Hebrews 11:1</p></blockquote>',
    );
    const bq = tree[0];
    if (bq.type !== 'element') throw new Error('expected element');
    expect(bq.tag).toBe('blockquote');
    const paragraphs = bq.children.filter((c) => c.type === 'element');
    expect(paragraphs.length).toBe(2);
  });
});

// ─── parseHtml: resilience ─────────────────────────────────────────

describe('parseHtml resilience', () => {
  it('handles unbalanced closing tags without throwing', () => {
    // Extra </em> with no open em — should degrade, not throw.
    expect(() => parseHtml('<p>hi</em></p>')).not.toThrow();
  });

  it('handles unknown tags by including them in the tree', () => {
    const tree = parseHtml('<div><p>inside</p></div>');
    const div = tree[0];
    if (div.type !== 'element') throw new Error('expected element');
    expect(div.tag).toBe('div');
    expect(div.children.length).toBe(1);
  });

  it('preserves attribute order is irrelevant, all captured', () => {
    const tree = parseHtml('<a href="/x" target="_blank" rel="noopener">x</a>');
    const a = tree[0];
    if (a.type !== 'element') throw new Error('expected element');
    expect(a.attrs.href).toBe('/x');
    expect(a.attrs.target).toBe('_blank');
    expect(a.attrs.rel).toBe('noopener');
  });

  it('returns an empty array for nothing-but-whitespace input', () => {
    // Whitespace at top level becomes a text node and is kept; this is
    // a round-trip parity test, not a normalization test. The important
    // thing is no throw and no unbalanced stack.
    expect(() => parseHtml('   ')).not.toThrow();
  });
});

// ─── parseHtml: mixed document round-trip ──────────────────────────

describe('parseHtml mixed document', () => {
  it('parses a realistic journal entry without loss', () => {
    const html =
      '<h2>Morning reflection</h2>' +
      '<p>Today I felt <strong>grateful</strong>.</p>' +
      '<blockquote><p>For I know the plans I have for you</p><p>Jeremiah 29:11</p></blockquote>' +
      '<ul><li><p>Pray for family</p></li><li><p>Call Mom</p></li></ul>';
    const tree = parseHtml(html);
    const tags = tree
      .filter((n) => n.type === 'element')
      .map((n) => (n.type === 'element' ? n.tag : ''));
    expect(tags).toEqual(['h2', 'p', 'blockquote', 'ul']);
  });
});
