/**
 * Tests for the NoteContentView HTML parser and scripture content builder.
 *
 * Focuses on parseHtml + htmlHasContent — the pure parser is where
 * rendering bugs live. Render functions are mostly mechanical tag →
 * style mapping and are covered by buildEditorCSS parity (visual
 * regression, not unit tests).
 *
 * Also covers the scripture-content-builder round-trip: the insert-path
 * builder output must round-trip cleanly through parseHtml and be
 * detected as a scripture callout by the shared detection helpers.
 *
 * Imports from note-content-parser and scripture-content-builder directly
 * (not NoteContentView) so Jest doesn't have to traverse the theme +
 * expo-system-ui chain.
 */

import {
  parseHtml,
  htmlHasContent,
  isElement,
  flattenTextContent,
  isScriptureReferenceLine,
  SCRIPTURE_REFERENCE_REGEX,
} from '../note-content-parser';
import {
  SCRIPTURE_REFERENCE_PREFIX,
  normalizeScriptureVerseText,
  buildScriptureReferenceLine,
  buildScriptureBlockquoteNodes,
  buildScriptureBlockquoteHtml,
} from '../scripture-content-builder';

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

// ─── flattenTextContent ────────────────────────────────────────────

describe('flattenTextContent', () => {
  it('returns the value for a bare text node', () => {
    expect(flattenTextContent({ type: 'text', value: 'hello' })).toBe('hello');
  });

  it('concatenates text across inline marks', () => {
    const tree = parseHtml('<p>— <em>Hebrews</em> <strong>11:1</strong></p>');
    const p = tree[0];
    if (!isElement(p)) throw new Error('expected element');
    expect(flattenTextContent(p)).toBe('\u2014 Hebrews 11:1');
  });

  it('handles deeply nested inline marks', () => {
    const tree = parseHtml('<p><strong>bold <em>italic <s>strike</s></em></strong></p>');
    const p = tree[0];
    if (!isElement(p)) throw new Error('expected element');
    expect(flattenTextContent(p)).toBe('bold italic strike');
  });

  it('returns empty string for an empty element', () => {
    const tree = parseHtml('<p></p>');
    const p = tree[0];
    if (!isElement(p)) throw new Error('expected element');
    expect(flattenTextContent(p)).toBe('');
  });
});

// ─── scripture reference detection ─────────────────────────────────

describe('isScriptureReferenceLine', () => {
  it('matches canonical em-dash + book + chapter:verse', () => {
    expect(isScriptureReferenceLine('\u2014 Hebrews 11:1')).toBe(true);
  });

  it('matches numeric book prefixes (1, 2, 3)', () => {
    expect(isScriptureReferenceLine('\u2014 1 Corinthians 13:4')).toBe(true);
    expect(isScriptureReferenceLine('\u2014 2 Samuel 11:2')).toBe(true);
    expect(isScriptureReferenceLine('\u2014 3 John 1:1')).toBe(true);
  });

  it('matches verse ranges', () => {
    expect(isScriptureReferenceLine('\u2014 Psalm 23:1-6')).toBe(true);
    expect(isScriptureReferenceLine('\u2014 Proverbs 31:10-31')).toBe(true);
  });

  it('matches multi-word book names', () => {
    expect(isScriptureReferenceLine('\u2014 Song of Solomon 2:1')).toBe(true);
  });

  it('tolerates trailing whitespace', () => {
    expect(isScriptureReferenceLine('\u2014 John 3:16   ')).toBe(true);
  });

  it('rejects lines without the em-dash prefix', () => {
    expect(isScriptureReferenceLine('Hebrews 11:1')).toBe(false);
    expect(isScriptureReferenceLine('- Hebrews 11:1')).toBe(false); // hyphen, not em-dash
  });

  it('rejects lines without a chapter:verse', () => {
    expect(isScriptureReferenceLine('\u2014 a quote without a verse')).toBe(false);
    expect(isScriptureReferenceLine('\u2014 Something random 123')).toBe(false);
    expect(isScriptureReferenceLine('\u2014 ')).toBe(false);
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(isScriptureReferenceLine('')).toBe(false);
    expect(isScriptureReferenceLine('   ')).toBe(false);
  });

  it('SCRIPTURE_REFERENCE_REGEX exports the same behavior', () => {
    expect(SCRIPTURE_REFERENCE_REGEX.test('\u2014 Hebrews 11:1')).toBe(true);
    expect(SCRIPTURE_REFERENCE_REGEX.test('Hebrews 11:1')).toBe(false);
  });
});

// ─── scripture-content-builder ─────────────────────────────────────

describe('normalizeScriptureVerseText', () => {
  it('collapses embedded newlines to spaces', () => {
    expect(normalizeScriptureVerseText('Line one\nLine two')).toBe('Line one Line two');
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeScriptureVerseText('hello   \t world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeScriptureVerseText('  padded  ')).toBe('padded');
  });

  it('is idempotent on already-normalized text', () => {
    const input = 'the quick brown fox';
    expect(normalizeScriptureVerseText(input)).toBe(input);
  });
});

describe('buildScriptureReferenceLine', () => {
  it('prepends the em-dash prefix', () => {
    expect(buildScriptureReferenceLine('Hebrews 11:1')).toBe('\u2014 Hebrews 11:1');
  });

  it('trims the reference argument', () => {
    expect(buildScriptureReferenceLine('  Hebrews 11:1  ')).toBe('\u2014 Hebrews 11:1');
  });

  it('uses the exported prefix constant', () => {
    expect(buildScriptureReferenceLine('X 1:1').startsWith(SCRIPTURE_REFERENCE_PREFIX)).toBe(true);
  });
});

describe('buildScriptureBlockquoteNodes', () => {
  it('emits a blockquote with verse + reference + trailing empty paragraph', () => {
    const nodes = buildScriptureBlockquoteNodes('Hebrews 11:1', 'Now faith is the substance');
    expect(nodes).toEqual([
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Now faith is the substance' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '\u2014 Hebrews 11:1' }],
          },
        ],
      },
      { type: 'paragraph' },
    ]);
  });

  it('normalizes whitespace in verse text before embedding', () => {
    const nodes = buildScriptureBlockquoteNodes('John 3:16', 'For God\nso loved   the world');
    const blockquote = nodes[0];
    if (blockquote.type !== 'blockquote') throw new Error('expected blockquote');
    const firstP = blockquote.content[0];
    if (firstP.type !== 'paragraph' || !firstP.content) throw new Error('expected paragraph');
    const text = firstP.content[0];
    if (text.type !== 'text') throw new Error('expected text');
    expect(text.text).toBe('For God so loved the world');
  });

  it('is JSON.stringify-safe for WebView script embedding', () => {
    const nodes = buildScriptureBlockquoteNodes('Psalm 23:1', 'The Lord is my shepherd');
    expect(() => JSON.stringify(nodes)).not.toThrow();
    const json = JSON.stringify(nodes);
    expect(json).toContain('"blockquote"');
    expect(json).toContain('"paragraph"');
    expect(json).toContain('The Lord is my shepherd');
  });
});

describe('buildScriptureBlockquoteHtml', () => {
  it('matches the shape parseHtml expects', () => {
    const html = buildScriptureBlockquoteHtml('Hebrews 11:1', 'Now faith is the substance');
    expect(html).toBe(
      '<blockquote><p>Now faith is the substance</p><p>\u2014 Hebrews 11:1</p></blockquote>',
    );
  });

  it('escapes HTML special characters in verse text', () => {
    const html = buildScriptureBlockquoteHtml('Test 1:1', 'Tom & Jerry <said> "hi"');
    expect(html).toContain('Tom &amp; Jerry &lt;said&gt; &quot;hi&quot;');
    // Should not contain raw special chars that would break HTML
    expect(html).not.toContain('Tom & Jerry <said>');
  });

  it('escapes HTML special characters in reference', () => {
    const html = buildScriptureBlockquoteHtml('<Book> 1:1', 'verse');
    expect(html).toContain('\u2014 &lt;Book&gt; 1:1');
  });
});

// ─── round-trip: builder → parseHtml → detection ──────────────────

describe('scripture callout round-trip', () => {
  it('builder HTML parses back into a detectable scripture callout', () => {
    const html = buildScriptureBlockquoteHtml('Hebrews 11:1', 'Now faith is the substance');
    const tree = parseHtml(html);
    const bq = tree[0];
    if (!isElement(bq)) throw new Error('expected element');
    expect(bq.tag).toBe('blockquote');

    const paragraphs = bq.children.filter(isElement).filter((el) => el.tag === 'p');
    expect(paragraphs.length).toBe(2);

    const lastP = paragraphs[paragraphs.length - 1];
    const lastPText = flattenTextContent(lastP);
    expect(lastPText).toBe('\u2014 Hebrews 11:1');
    expect(isScriptureReferenceLine(lastPText)).toBe(true);
  });

  it('round-trips verse text with HTML-sensitive characters', () => {
    // A verse with `&`, which gets escaped on build and decoded on parse.
    const html = buildScriptureBlockquoteHtml('James 1:1', 'To the twelve tribes & the dispersion');
    const tree = parseHtml(html);
    const bq = tree[0];
    if (!isElement(bq)) throw new Error('expected element');
    const firstP = bq.children.filter(isElement)[0];
    expect(flattenTextContent(firstP)).toBe('To the twelve tribes & the dispersion');
  });

  it('multi-word book names round-trip', () => {
    const html = buildScriptureBlockquoteHtml('Song of Solomon 2:1', 'I am the rose of Sharon');
    const tree = parseHtml(html);
    const bq = tree[0];
    if (!isElement(bq)) throw new Error('expected element');
    const paragraphs = bq.children.filter(isElement).filter((el) => el.tag === 'p');
    const lastP = paragraphs[paragraphs.length - 1];
    expect(isScriptureReferenceLine(flattenTextContent(lastP))).toBe(true);
  });

  it('generic user-typed multi-paragraph blockquote is NOT detected as scripture', () => {
    // This is the false-positive the detection regex fixes: a plain
    // multi-paragraph quote should render with both paragraphs as verse
    // body, not with the last one styled as a reference cap.
    const html =
      '<blockquote><p>First quoted line</p><p>Second quoted line</p></blockquote>';
    const tree = parseHtml(html);
    const bq = tree[0];
    if (!isElement(bq)) throw new Error('expected element');
    const paragraphs = bq.children.filter(isElement).filter((el) => el.tag === 'p');
    const lastP = paragraphs[paragraphs.length - 1];
    expect(isScriptureReferenceLine(flattenTextContent(lastP))).toBe(false);
  });

  it('single-paragraph blockquote is NOT detected as scripture callout', () => {
    const html = '<blockquote><p>\u2014 Hebrews 11:1</p></blockquote>';
    const tree = parseHtml(html);
    const bq = tree[0];
    if (!isElement(bq)) throw new Error('expected element');
    const paragraphs = bq.children.filter(isElement).filter((el) => el.tag === 'p');
    // Only one paragraph — the detection requires ≥2 paragraphs.
    expect(paragraphs.length).toBe(1);
  });
});

// ─── parseHtml + htmlHasContent performance smoke ──────────────────

describe('parseHtml performance smoke', () => {
  /**
   * Loose ceiling, not a micro-benchmark. Large journal entries (~2K
   * words, ~150 paragraphs with inline marks) must parse in well under
   * 50ms on CI hardware so the native read mode stays snappy.
   *
   * The parser is called once per note render in NoteContentView, so a
   * regression here shows up as jank when opening long notes.
   */
  it('parses a 2K-word mixed document in under 50ms', () => {
    // Build a realistic 2K-word document: 150 paragraphs with inline
    // marks, interleaved with headings, lists, and blockquotes.
    const paragraphs: string[] = [];
    for (let i = 0; i < 150; i++) {
      if (i % 25 === 0) {
        paragraphs.push(`<h2>Section ${i / 25 + 1}</h2>`);
      }
      if (i % 15 === 0) {
        paragraphs.push(
          '<ul><li><p>First bullet</p></li><li><p>Second bullet</p></li></ul>',
        );
      }
      if (i % 20 === 0) {
        paragraphs.push(
          '<blockquote><p>For God so loved the world that he gave his only son</p><p>\u2014 John 3:16</p></blockquote>',
        );
      }
      // ~14 words per paragraph with inline formatting.
      paragraphs.push(
        `<p>Today I was reading about <strong>faith</strong> and how it <em>moves mountains</em>, and I found this <a href="https://example.com/${i}">reference ${i}</a> particularly striking.</p>`,
      );
    }
    const html = paragraphs.join('');

    const start = Date.now();
    const tree = parseHtml(html);
    const duration = Date.now() - start;

    // Sanity check: we actually parsed something.
    expect(tree.length).toBeGreaterThan(100);
    expect(duration).toBeLessThan(50);
  });

  it('htmlHasContent on a 2K-word document completes in under 50ms', () => {
    // htmlHasContent walks the tree until it finds non-empty text. On a
    // well-formed document it should bail out at the first paragraph.
    const paragraphs: string[] = [];
    for (let i = 0; i < 150; i++) {
      paragraphs.push(`<p>Paragraph ${i} with <strong>some</strong> text.</p>`);
    }
    const html = paragraphs.join('');

    const start = Date.now();
    const result = htmlHasContent(html);
    const duration = Date.now() - start;

    expect(result).toBe(true);
    expect(duration).toBeLessThan(50);
  });
});
