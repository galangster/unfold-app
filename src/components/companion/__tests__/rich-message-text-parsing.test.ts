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
