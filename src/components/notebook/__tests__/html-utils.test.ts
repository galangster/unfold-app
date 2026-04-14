/**
 * Tests for the html-utils pure module.
 *
 * `stripHtml` and `isHtmlContent` sit on NoteCard's preview path and
 * on note-detail's legacy-vs-html content branch. Both run on every
 * note render in the journal list, so a regression here surfaces as
 * blank card previews or the editor loading plain text through the
 * HTML code path (or vice versa).
 *
 * Imports from `../html-utils` directly so the suite stays pure and
 * mirrors the extraction pattern of scripture-ack.test.ts.
 */

import { stripHtml, isHtmlContent } from '../html-utils';

describe('stripHtml — block tags become spaces', () => {
  it('strips a plain paragraph to its inner text', () => {
    expect(stripHtml('<p>Hello world</p>')).toBe('Hello world');
  });

  it('joins two paragraphs with a single space, not a merged word', () => {
    // Without the block-to-space replacement this would read "Firstline",
    // which is the classic NoteCard preview regression.
    expect(stripHtml('<p>First</p><p>line</p>')).toBe('First line');
  });

  it('joins list items with spaces', () => {
    expect(stripHtml('<ul><li>one</li><li>two</li><li>three</li></ul>')).toBe(
      'one two three',
    );
  });

  it('joins headings and body text with spaces', () => {
    expect(stripHtml('<h1>Title</h1><p>body</p>')).toBe('Title body');
  });

  it('handles all six heading levels', () => {
    for (let level = 1; level <= 6; level++) {
      expect(stripHtml(`<h${level}>Heading ${level}</h${level}>`)).toBe(
        `Heading ${level}`,
      );
    }
  });

  it('joins blockquote content with spaces', () => {
    expect(stripHtml('<blockquote><p>verse</p><p>— Ref 1:1</p></blockquote>')).toBe(
      'verse — Ref 1:1',
    );
  });

  it('treats div tags as block boundaries', () => {
    expect(stripHtml('<div>a</div><div>b</div>')).toBe('a b');
  });
});

describe('stripHtml — inline tags are elided without adding space', () => {
  it('removes strong/em/u/s wrappers without injecting spaces', () => {
    expect(stripHtml('<p><strong>bold</strong> and <em>italic</em></p>')).toBe(
      'bold and italic',
    );
  });

  it('removes anchor wrappers but keeps the link text', () => {
    expect(stripHtml('<p>Read <a href="https://x.y">here</a> now</p>')).toBe(
      'Read here now',
    );
  });

  it('removes br tags without crashing', () => {
    expect(stripHtml('<p>line one<br>line two</p>')).toBe('line one line two');
  });

  it('removes attributes along with their opening tag', () => {
    expect(stripHtml('<p class="x" data-type="note">text</p>')).toBe('text');
  });
});

describe('stripHtml — entity decoding', () => {
  it('decodes &nbsp; to a space', () => {
    expect(stripHtml('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('decodes &amp; to ampersand', () => {
    expect(stripHtml('<p>Rock &amp; Roll</p>')).toBe('Rock & Roll');
  });

  it('decodes &lt; and &gt; to angle brackets', () => {
    expect(stripHtml('<p>1 &lt; 2 &gt; 0</p>')).toBe('1 < 2 > 0');
  });

  it('decodes &quot; to double quote', () => {
    expect(stripHtml('<p>She said &quot;hi&quot;</p>')).toBe('She said "hi"');
  });
});

describe('stripHtml — whitespace collapsing + edge cases', () => {
  it('collapses runs of whitespace into a single space', () => {
    expect(stripHtml('<p>a     b</p>')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtml('   <p>x</p>   ')).toBe('x');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('returns empty string for whitespace-only HTML', () => {
    expect(stripHtml('   \n\t  ')).toBe('');
  });

  it('returns empty string for TipTap empty document', () => {
    expect(stripHtml('<p></p>')).toBe('');
  });

  it('handles text without any tags as-is', () => {
    expect(stripHtml('already plain text')).toBe('already plain text');
  });

  it('handles a realistic journal entry without mangling', () => {
    const html =
      '<h2>Today</h2>' +
      '<p>I am <strong>grateful</strong> for <em>small things</em>.</p>' +
      '<ul><li>coffee</li><li>sunrise</li></ul>' +
      '<blockquote><p>Rejoice always</p><p>— 1 Thessalonians 5:16</p></blockquote>';
    expect(stripHtml(html)).toBe(
      'Today I am grateful for small things. coffee sunrise Rejoice always — 1 Thessalonians 5:16',
    );
  });
});

describe('isHtmlContent', () => {
  it('returns true for content starting with an element', () => {
    expect(isHtmlContent('<p>hello</p>')).toBe(true);
  });

  it('returns true for content starting with a heading', () => {
    expect(isHtmlContent('<h1>Title</h1>')).toBe(true);
  });

  it('returns true even when there is leading whitespace before the tag', () => {
    // trimStart() handles the legacy migration path where saved HTML
    // picked up a newline at the top of the file.
    expect(isHtmlContent('   <p>hello</p>')).toBe(true);
    expect(isHtmlContent('\n<p>hello</p>')).toBe(true);
    expect(isHtmlContent('\t<p>hello</p>')).toBe(true);
  });

  it('returns false for plain-text content', () => {
    expect(isHtmlContent('just plain text')).toBe(false);
  });

  it('returns false for markdown-style content', () => {
    // Legacy notes saved before the tentap migration — must take the
    // non-HTML render path.
    expect(isHtmlContent('# heading\n\nparagraph')).toBe(false);
    expect(isHtmlContent('* bullet\n* bullet')).toBe(false);
  });

  it('returns false for empty and whitespace-only strings', () => {
    expect(isHtmlContent('')).toBe(false);
    expect(isHtmlContent('   ')).toBe(false);
  });

  it('returns false for content that happens to contain < in the middle', () => {
    expect(isHtmlContent('1 < 2 is true')).toBe(false);
  });

  it('returns true for blockquote-prefixed content', () => {
    expect(isHtmlContent('<blockquote><p>verse</p></blockquote>')).toBe(true);
  });
});
