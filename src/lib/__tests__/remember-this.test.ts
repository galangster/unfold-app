import type { BibleHighlight, Devotional, Highlight } from '@/lib/store';
import { pickRememberThis, rememberThisQuote, rememberThisSource } from '@/lib/remember-this';

const devotionalHighlight = {
  id: 'h1', devotionalId: 'dev1', devotionalTitle: 'Quiet Path', dayNumber: 3, highlightedText: 'Be still', color: 'yellow', createdAt: '2026-09-01T00:00:00.000Z',
} as unknown as Highlight;
const verse = {
  id: 'b1', bookId: 19, bookName: 'Psalms', chapter: 23, verseStart: 1, verseEnd: 1, translation: 'BSB', text: 'The LORD is my shepherd', color: 'green', createdAt: '2026-09-02T00:00:00.000Z',
} as unknown as BibleHighlight;
const noteOnly = { ...verse, id: 'b2', color: null, note: 'Rest' } as unknown as BibleHighlight;
const devotionals = [{ id: 'dev1', title: 'Quiet Path Series', days: [] }] as unknown as Devotional[];

describe('pickRememberThis', () => {
  it('returns null with nothing saved', () => {
    expect(pickRememberThis([], [], '2026-09-10')).toBeNull();
  });

  it('draws from Bible highlights too, skipping note-only verses', () => {
    const picks = new Set<string>();
    for (let day = 1; day <= 9; day += 1) {
      const pick = pickRememberThis([devotionalHighlight], [verse, noteOnly], `2026-09-0${day}`);
      picks.add(pick!.highlight.id);
    }
    expect(picks).toEqual(new Set(['h1', 'b1']));
  });

  it('skips a devotional highlight with no text', () => {
    const empty = { ...devotionalHighlight, id: 'h-empty', highlightedText: '  ' } as unknown as Highlight;
    expect(pickRememberThis([empty], [], '2026-09-10')).toBeNull();
  });

  it('is stable for a given day', () => {
    const a = pickRememberThis([devotionalHighlight], [verse], '2026-09-10');
    const b = pickRememberThis([devotionalHighlight], [verse], '2026-09-10');
    expect(a).toEqual(b);
  });

  it('formats quote and source per kind', () => {
    const d = { kind: 'devotional' as const, highlight: devotionalHighlight };
    const v = { kind: 'bible' as const, highlight: verse };
    expect(rememberThisQuote(d)).toBe('Be still');
    expect(rememberThisQuote(v)).toBe('The LORD is my shepherd');
    expect(rememberThisSource(d, devotionals)).toBe('Day 3 · Quiet Path Series');
    expect(rememberThisSource(v, devotionals)).toBe('Psalm 23:1 (BSB)');
  });
});
