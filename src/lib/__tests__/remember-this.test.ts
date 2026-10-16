import type { BibleHighlight, Devotional, Highlight } from '@/lib/store';
import { pickRememberThis, rememberThisQuote, rememberThisSource } from '@/lib/remember-this';
import { dayIndexFor } from '@/lib/variation-bag';

const devotionalHighlight = {
  id: 'h1', devotionalId: 'dev1', devotionalTitle: 'Quiet Path', dayNumber: 3, highlightedText: 'Be still', color: 'yellow', createdAt: '2026-09-01T00:00:00.000Z',
} as unknown as Highlight;
const verse = {
  id: 'b1', bookId: 19, bookName: 'Psalms', chapter: 23, verseStart: 1, verseEnd: 1, translation: 'BSB', text: 'The LORD is my shepherd', color: 'green', createdAt: '2026-09-02T00:00:00.000Z',
} as unknown as BibleHighlight;
const noteOnly = { ...verse, id: 'b2', color: null, note: 'Rest' } as unknown as BibleHighlight;
const devotionals = [{ id: 'dev1', title: 'Quiet Path Series', days: [] }] as unknown as Devotional[];
const seed = 'test-install';
const START = dayIndexFor(new Date(2026, 0, 1));
const SEPTEMBER_10 = { seed, dayIndex: dayIndexFor(new Date(2026, 8, 10)) };

const tenHighlights = Array.from({ length: 10 }, (_, i) => ({
  ...devotionalHighlight,
  id: `h${String(i).padStart(2, '0')}`,
  highlightedText: `Line ${i}`,
})) as unknown as Highlight[];

describe('pickRememberThis', () => {
  it('returns null with nothing saved', () => {
    expect(pickRememberThis([], [], SEPTEMBER_10)).toBeNull();
  });

  it('draws from Bible highlights too, skipping note-only verses', () => {
    const picks = new Set<string>();
    for (let day = 1; day <= 9; day += 1) {
      const pick = pickRememberThis([devotionalHighlight], [verse, noteOnly], { seed, dayIndex: dayIndexFor(new Date(2026, 8, day)) });
      picks.add(pick!.highlight.id);
    }
    expect(picks).toEqual(new Set(['h1', 'b1']));
  });

  it('skips a devotional highlight with no text', () => {
    const empty = { ...devotionalHighlight, id: 'h-empty', highlightedText: '  ' } as unknown as Highlight;
    expect(pickRememberThis([empty], [], SEPTEMBER_10)).toBeNull();
  });

  it('is stable for a given day', () => {
    const a = pickRememberThis([devotionalHighlight], [verse], SEPTEMBER_10);
    const b = pickRememberThis([devotionalHighlight], [verse], SEPTEMBER_10);
    expect(a).toEqual(b);
  });

  it('never shows the same highlight two days running', () => {
    let previous = pickRememberThis(tenHighlights, [], { seed, dayIndex: START })!.highlight.id;
    for (let offset = 1; offset < 1500; offset += 1) {
      const next = pickRememberThis(tenHighlights, [], { seed, dayIndex: START + offset })!.highlight.id;
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it('reaches every highlight within twenty days', () => {
    // Any 19 days hold one whole pass of a 10-entry bag. The old char-code
    // seed had 19 values a year and left most of a long list unseen.
    const seen = new Set(Array.from({ length: 19 }, (_, offset) => pickRememberThis(tenHighlights, [], { seed, dayIndex: START + offset })!.highlight.id));
    expect(seen.size).toBe(10);
  });

  it('ignores store order, because the pool is sorted by id', () => {
    const reversed = [...tenHighlights].reverse();
    for (let offset = 0; offset < 30; offset += 1) {
      expect(pickRememberThis(reversed, [], { seed, dayIndex: START + offset })).toEqual(pickRememberThis(tenHighlights, [], { seed, dayIndex: START + offset }));
    }
  });

  it('never shows the same highlight two days running while the pool grows by one a day', () => {
    // A new pool length starts a new bag, so the card steps past yesterday's
    // pick. Ids follow the store's hl_<ms>_<rand> shape, one saved at noon
    // each day, from one highlight and from five.
    const savedAt = (offset: number) => new Date(2026, 0, 1 + offset, 12);
    const saved = (offset: number, n: number) => ({
      ...devotionalHighlight,
      id: `hl_${savedAt(offset).getTime()}_${String(n).padStart(4, '0')}`,
      highlightedText: `Line ${n}`,
      createdAt: savedAt(offset).toISOString(),
    }) as unknown as Highlight;
    for (const startSize of [1, 5]) {
      const earlier = Array.from({ length: startSize }, (_, n) => saved(-30, n));
      for (const installSeed of ['install-a', 'install-b', 'install-c']) {
        const pool = [...earlier];
        let previous: string | undefined;
        for (let offset = 0; offset < 300; offset += 1) {
          pool.push(saved(offset, startSize + offset));
          const id = pickRememberThis(pool, [], { seed: installSeed, dayIndex: dayIndexFor(savedAt(offset)) })!.highlight.id;
          expect(id).not.toBe(previous);
          previous = id;
        }
      }
    }
  });

  it('takes turns between two highlights, the newer one first on the day it is saved', () => {
    const older = { ...devotionalHighlight, id: 'h-older', createdAt: new Date(2026, 8, 1, 9).toISOString() } as unknown as Highlight;
    const newer = { ...devotionalHighlight, id: 'h-newer', createdAt: new Date(2026, 8, 5, 9).toISOString() } as unknown as Highlight;
    const pickOn = (date: number, pool: Highlight[]) => pickRememberThis(pool, [], { seed, dayIndex: dayIndexFor(new Date(2026, 8, date)) })!.highlight.id;
    expect(pickOn(4, [older])).toBe('h-older');
    const days = Array.from({ length: 20 }, (_, offset) => pickOn(5 + offset, [older, newer]));
    expect(days[0]).toBe('h-newer');
    for (let i = 1; i < days.length; i += 1) expect(days[i]).not.toBe(days[i - 1]);
  });

  it('puts two installs on different sequences', () => {
    const sequence = (installSeed: string) => Array.from({ length: 30 }, (_, offset) => (
      pickRememberThis(tenHighlights, [], { seed: installSeed, dayIndex: START + offset })!.highlight.id
    )).join(',');
    expect(sequence('install-a')).not.toBe(sequence('install-b'));
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
