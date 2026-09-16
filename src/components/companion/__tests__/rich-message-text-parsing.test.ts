jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: { accent: '#D4AF37', text: '#EEE' } }),
}));

import { parseSegments, preprocessMarkdown } from '../RichMessageText';

describe('parseSegments — emphasis markers around verse references', () => {
  it('swallows ** that directly wraps a bare verse reference instead of leaking asterisks', () => {
    const segments = parseSegments('So real. **Psalm 46:10** says it plainly.');
    const verse = segments.find((s) => s.type === 'verse');
    expect(verse).toEqual({ type: 'verse', reference: 'Psalm 46:10' });
    for (const seg of segments) {
      if (seg.type !== 'verse') {
        expect(seg.content).not.toContain('*');
      }
    }
  });

  it('swallows single * italic wrapping too', () => {
    const segments = parseSegments('Look at *1 Kings 19:11-12* tonight.');
    expect(segments.some((s) => s.type === 'verse' && s.reference === '1 Kings 19:11-12')).toBe(true);
    for (const seg of segments) {
      if (seg.type !== 'verse') {
        expect(seg.content).not.toContain('*');
      }
    }
  });

  it('keeps ordinary bold and italic working around references', () => {
    const segments = parseSegments('**Really** consider Psalm 23:1 *today*.');
    expect(segments).toEqual(
      expect.arrayContaining([
        { type: 'bold', content: 'Really' },
        { type: 'verse', reference: 'Psalm 23:1' },
        { type: 'italic', content: 'today' },
      ]),
    );
  });

  it('still parses plain references with no markers', () => {
    const segments = parseSegments('Romans 5:8 stands on its own.');
    expect(segments.some((s) => s.type === 'verse' && s.reference === 'Romans 5:8')).toBe(true);
  });

  it('keeps **Read …verse… aloud** as one bold span with a pill inside', () => {
    const segments = parseSegments('1. **Read Acts 5:27-32 aloud together.**');
    expect(segments).toEqual([
      { type: 'text', content: '1. ' },
      { type: 'bold', content: 'Read ' },
      { type: 'verse', reference: 'Acts 5:27-32' },
      { type: 'bold', content: ' aloud together.' },
    ]);
  });

  it('does the same when the verse is wrapped in brackets', () => {
    const segments = parseSegments('1. **Read [Acts 5:27-32] aloud together.**');
    expect(segments).toEqual([
      { type: 'text', content: '1. ' },
      { type: 'bold', content: 'Read ' },
      { type: 'verse', reference: 'Acts 5:27-32' },
      { type: 'bold', content: ' aloud together.' },
    ]);
  });

  it('still chips a citation when emphasis splits the book from the chapter', () => {
    const segments = parseSegments('**Read Acts** 5:27-32 tonight.');
    expect(segments).toEqual([
      { type: 'bold', content: 'Read ' },
      { type: 'verse', reference: 'Acts 5:27-32' },
      { type: 'text', content: ' tonight.' },
    ]);
  });

  it('chips Acts 5-7 as one chapter-range pill, not Acts 5 plus leftover -7', () => {
    const segments = parseSegments('Acts 5-7 is not theoretical.');
    expect(segments).toEqual([
      { type: 'verse', reference: 'Acts 5-7' },
      { type: 'text', content: ' is not theoretical.' },
    ]);
  });
});

describe('parseSegments — Jordan study list (items 1 / 3 / 4)', () => {
  const JORDAN_ITEMS = [
    '1. **Read Acts 5:27-32 aloud together.** Peter\'s answer to the council. Ask: What would you have said in that moment? What is he risking?',
    '3. **Read Stephen\'s speech (Acts 7:1-53) or at least the ending (Acts 7:51-53).** He does not soften his words to save his life.',
    '4. **The hard one: Acts 7:54-60.** Stephen is murdered. Ask directly: Does that change anything about whether following Jesus is worth it? If your faithfulness leads to suffering, does that mean you chose wrong?',
  ];

  it.each(JORDAN_ITEMS)('does not leak asterisks: %s', (item) => {
    const segments = parseSegments(item);
    for (const seg of segments) {
      if (seg.type !== 'verse') {
        expect(seg.content).not.toContain('*');
      }
    }
  });

  it('keeps the clipped item-4 sentence in the parse tree', () => {
    const segments = parseSegments(JORDAN_ITEMS[2]);
    const joined = segments
      .map((seg) => (seg.type === 'verse' ? seg.reference : seg.content))
      .join('');
    expect(joined).toContain('does that mean you chose wrong?');
    expect(segments.some((s) => s.type === 'verse' && s.reference === 'Acts 7:54-60')).toBe(true);
  });

  it('stream→stable promotion of the same items still has no literal **', () => {
    // WR-18 hides ** while the list is the streaming tail. Completing the
    // reply promotes it into RichMessageText — that swap must not put the
    // markers back.
    const promoted = JORDAN_ITEMS.flatMap((item) => parseSegments(item));
    for (const seg of promoted) {
      if (seg.type !== 'verse') {
        expect(seg.content).not.toContain('*');
      }
    }
  });
});

describe('preprocessMarkdown — list handling', () => {
  it('keeps consecutive bullets on their own lines instead of joining into one sentence', () => {
    const out = preprocessMarkdown('A few things:\n- First thing\n- Second thing\n- Third thing');
    expect(out).toBe('A few things:\n• First thing\n• Second thing\n• Third thing');
  });

  it('keeps numbered items on their own lines with ordinals preserved', () => {
    const out = preprocessMarkdown('1. Read slowly\n2. Pray briefly');
    expect(out).toBe('1. Read slowly\n2. Pray briefly');
  });

  it('still reflows plain prose lines into one paragraph line', () => {
    const out = preprocessMarkdown('One line\nsplit across\nthree.');
    expect(out).toBe('One line split across three.');
  });

  it('keeps paragraph breaks and headers intact', () => {
    const out = preprocessMarkdown('# Title\n\nBody text.');
    expect(out).toBe('__HEADER__Title__HEADER__\n\nBody text.');
  });
});
