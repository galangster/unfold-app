import { formatSelectionShareText, UNFOLD_SHARE_LINE } from '@/lib/selection-share';

describe('formatSelectionShareText', () => {
  it('formats prose as an excerpt with the series, day, and link', () => {
    expect(formatSelectionShareText({
      text: 'Grace meets you in the next act of trust.',
      seriesTitle: 'A Quiet Path',
      dayNumber: 3,
      dayTitle: 'Held in Grace',
    })).toBe([
      '“Grace meets you in the next act of trust.”',
      '',
      'Excerpt from A Quiet Path, Day 3: Held in Grace',
      'Shared from Unfold · https://unfoldapp.co',
    ].join('\n'));
  });

  it('formats Scripture in the YouVersion style with its reference', () => {
    expect(formatSelectionShareText({
      text: 'Be still, and know that I am God.',
      scriptureReference: 'Psalm 46:10',
      seriesTitle: 'A Quiet Path',
      dayNumber: 3,
      dayTitle: 'Held in Grace',
    })).toBe([
      '“Be still, and know that I am God.”',
      'Psalm 46:10',
      '',
      'Shared from Unfold · https://unfoldapp.co',
    ].join('\n'));
  });

  it('collapses whitespace and trims the selection', () => {
    expect(formatSelectionShareText({ text: '  Grace\n\n meets \t you.  ' }).split('\n')[0])
      .toBe('“Grace meets you.”');
  });

  it.each([
    ['curly quotes', '“Be still.”'],
    ['straight quotes', '"Be still."'],
    ['an opening quote only', '“Be still.'],
    ['a closing quote only', 'Be still.”'],
    ['a closing quote and a comma', '“Be still.”,'],
  ])('does not double the quote marks when the selection has %s', (_label, text) => {
    expect(formatSelectionShareText({ text }).split('\n')[0]).toBe('“Be still.”');
  });

  it('keeps a quote pair that opens inside the selection', () => {
    expect(formatSelectionShareText({ text: 'He said “go”' }).split('\n')[0])
      .toBe('“He said “go””');
    expect(formatSelectionShareText({ text: 'He said "go"' }).split('\n')[0])
      .toBe('“He said "go"”');
  });

  it.each([
    ['“Come to me,” Jesus says.', '““Come to me,” Jesus says.”'],
    ['"Go," he said.', '“"Go," he said.”'],
    ['“For God so loved the world” (John 3:16)', '““For God so loved the world” (John 3:16)”'],
    ['He said “go” and “stay”', '“He said “go” and “stay””'],
    ['” Rest is a gift.', '“Rest is a gift.”'],
  ])('keeps every quote mark paired when a quotation closes inside the selection (%s)', (text, expected) => {
    expect(formatSelectionShareText({ text }).split('\n')[0]).toBe(expected);
  });

  it.each([
    [{ dayNumber: 3, dayTitle: 'Held in Grace' }, 'Excerpt from Day 3: Held in Grace'],
    [{ seriesTitle: 'A Quiet Path', dayTitle: 'Held in Grace' }, 'Excerpt from A Quiet Path, Held in Grace'],
    [{ seriesTitle: 'A Quiet Path', dayNumber: 3 }, 'Excerpt from A Quiet Path, Day 3'],
    [{ seriesTitle: 'A Quiet Path' }, 'Excerpt from A Quiet Path'],
    [{ dayNumber: 0, dayTitle: '' }, null],
    [{}, null],
  ])('omits each missing part of the excerpt line (%o)', (source, expected) => {
    const lines = formatSelectionShareText({ text: 'Grace', ...source }).split('\n');
    expect(lines[0]).toBe('“Grace”');
    expect(lines[1]).toBe('');
    if (expected) {
      expect(lines.slice(2)).toEqual([expected, UNFOLD_SHARE_LINE]);
    } else {
      expect(lines.slice(2)).toEqual([UNFOLD_SHARE_LINE]);
    }
  });

  it('falls back to the prose format when the Scripture reference is empty', () => {
    expect(formatSelectionShareText({
      text: 'Grace',
      scriptureReference: ' ',
      seriesTitle: 'A Quiet Path',
    })).toBe(['“Grace”', '', 'Excerpt from A Quiet Path', UNFOLD_SHARE_LINE].join('\n'));
  });

  it('puts the link in the message exactly once', () => {
    const message = formatSelectionShareText({
      text: 'Grace',
      scriptureReference: 'John 1:16',
      seriesTitle: 'A Quiet Path',
      dayNumber: 1,
      dayTitle: 'Grace',
    });
    expect(message.match(/https:\/\/unfoldapp\.co/g)).toHaveLength(1);
  });

  it('returns an empty message for an empty selection', () => {
    expect(formatSelectionShareText({ text: '   ' })).toBe('');
    expect(formatSelectionShareText({ text: '“”' })).toBe('');
  });
});
