import { closesQuotation, isQuoteMark, opensQuotation } from '@/lib/quote-marks';
import { formatSelectionShareText } from '@/lib/selection-share';
import { findScriptureQuotes } from '@/components/reading/devotional-text-html';
import { parseScriptureReferences } from '@/lib/scripture-parser';

describe('quote marks', () => {
  it.each([
    ['“Come', 0, true],
    ['„Come', 0, true],
    ['Come”', 4, false],
    ['"Come', 0, true],
    ['said "Come', 5, true],
    ['said ("Come', 6, true],
    ['said —"Come', 6, true],
    ['Come"', 4, false],
  ])('reads the mark in %s at %i as opening: %s', (text, i, opens) => {
    expect(opensQuotation(text, i)).toBe(opens);
    expect(closesQuotation(text, i)).toBe(!opens);
  });

  it('knows only the four quote marks', () => {
    expect(['"', '“', '”', '„'].every(isQuoteMark)).toBe(true);
    expect(['\'', '‘', '’', '«', '', 'ab'].some(isQuoteMark)).toBe(false);
    expect(opensQuotation('Come', 0)).toBe(false);
    expect(closesQuotation('Come', 0)).toBe(false);
  });

  it('reads the low opening mark the same way in the share text and in Scripture quotations', () => {
    const text = 'Jesus said, „Come to me” (Matthew 11:28).';
    const quotes = findScriptureQuotes(text, parseScriptureReferences(text), {});
    expect(quotes.map((quote) => [text.slice(quote.start, quote.end), quote.reference]))
      .toEqual([['„Come to me”', 'Matthew 11:28']]);
    expect(formatSelectionShareText({ text: '„Come to me”' }).split('\n')[0]).toBe('“Come to me”');
    expect(formatSelectionShareText({ text: 'Come to me „' }).split('\n')[0]).toBe('“Come to me”');
  });
});
