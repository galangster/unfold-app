import vm from 'vm';
import { READER_WORDS_PAGE_JS, readerWords, textContainsWords } from '@/lib/reader-words';

/** The page's copy, run the way the WebView runs it. */
const page = vm.runInNewContext(`${READER_WORDS_PAGE_JS}; ({ readerWords: readerWords });`) as {
  readerWords: (value: unknown) => string;
};

const INPUTS = [
  '',
  '   ',
  'Grace meets you.',
  '  Grace\n\n meets \t you.  ',
  'Be still, and know',
  'For God *so loved* the world',
  '**LECTIO — Read** Grace * peace',
  'FOR GOD SO LOVED',
  'ΛΟΓΟΣ, the Word',
  'İstanbul and ẞ',
  'Jesus said, “Come to me” (Matthew 11:28).',
  'Emoji 🙏 and 𐐀 stay',
];

describe('reader words', () => {
  it.each(INPUTS)('reads %j the same on both sides', (input) => {
    expect(page.readerWords(input)).toBe(readerWords(input));
  });

  it('drops emphasis marks, collapses white space, and ignores case', () => {
    expect(readerWords('  For God *so loved*\n\nthe  WORLD ')).toBe('for god so loved the world');
    // Each character folds on its own, so the page can map it back.
    expect(readerWords('ΛΟΓΟΣ')).toBe('λογοσ');
    expect(page.readerWords(null)).toBe('');
  });

  it('finds words across emphasis, paragraph breaks, and case, and never finds nothing', () => {
    const body = 'For God *so loved* the world.\n\nGrace meets you here.';
    expect(textContainsWords(body, 'so loved the world')).toBe(true);
    expect(textContainsWords(body, 'the world. GRACE meets')).toBe(true);
    expect(textContainsWords(body, 'not in the reading')).toBe(false);
    expect(textContainsWords(body, ' * ')).toBe(false);
  });
});
