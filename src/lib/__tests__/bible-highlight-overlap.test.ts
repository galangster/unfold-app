import { planHighlightApplication, planHighlightRemoval } from '../bible-highlight-overlap';
import type { BibleHighlight } from '@/lib/store';

function makeHighlight(
  id: string,
  verseStart: number,
  verseEnd: number,
  color: BibleHighlight['color'],
  translation = 'BSB',
  note?: string,
): BibleHighlight {
  return {
    id,
    bookId: 1,
    bookName: 'Genesis',
    chapter: 1,
    verseStart,
    verseEnd,
    text: `verses ${verseStart}-${verseEnd}`,
    color,
    note,
    translation,
    createdAt: new Date().toISOString(),
  };
}

const defaultArgs = {
  bookId: 1,
  bookName: 'Genesis',
  chapter: 1,
  translation: 'BSB',
  verseText: (v: number) => `t${v}`,
};

describe('planHighlightApplication', () => {
  it('non-contiguous selection produces one record per run', () => {
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [],
      selectedVerses: [2, 9],
      color: 'yellow',
    });
    expect(plan.toRemove).toEqual([]);
    expect(plan.toAdd).toHaveLength(2);
    // One for verse 2, one for verse 9
    const starts = plan.toAdd.map((h) => h.verseStart).sort((a, b) => a - b);
    expect(starts).toEqual([2, 9]);
    const ends = plan.toAdd.map((h) => h.verseEnd).sort((a, b) => a - b);
    expect(ends).toEqual([2, 9]);
  });

  it('partial overlap splits instead of destroying', () => {
    const existing = makeHighlight('h1', 1, 10, 'yellow', 'BSB');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [existing],
      selectedVerses: [5],
      color: 'green',
    });
    // The existing yellow (1-10) must be removed and two remainders added
    expect(plan.toRemove).toContain('h1');
    // New green (5,5) + yellow (1,4) + yellow (6,10)
    const colors = plan.toAdd.map((h) => h.color).sort();
    expect(colors.filter((c) => c === 'yellow')).toHaveLength(2);
    expect(colors.filter((c) => c === 'green')).toHaveLength(1);
    const greenRecord = plan.toAdd.find((h) => h.color === 'green')!;
    expect(greenRecord.verseStart).toBe(5);
    expect(greenRecord.verseEnd).toBe(5);
    const remainders = plan.toAdd.filter((h) => h.color === 'yellow');
    const remainderStarts = remainders.map((h) => h.verseStart).sort((a, b) => a - b);
    expect(remainderStarts).toEqual([1, 6]);
    const remainderEnds = remainders.map((h) => h.verseEnd).sort((a, b) => a - b);
    expect(remainderEnds).toEqual([4, 10]);
  });

  it('notes survive a re-color', () => {
    const existing = makeHighlight('h1', 3, 4, 'yellow', 'BSB', 'study');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [existing],
      selectedVerses: [3, 4],
      color: 'blue',
    });
    expect(plan.toRemove).toContain('h1');
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0].color).toBe('blue');
    expect(plan.toAdd[0].note).toBe('study');
  });

  it('note-only entries are never removed', () => {
    const noteOnly = makeHighlight('h1', 5, 5, null, 'BSB', 'n');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [noteOnly],
      selectedVerses: [5],
      color: 'red',
    });
    expect(plan.toRemove).toEqual([]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0].color).toBe('red');
    expect(plan.toAdd[0].note).toBeUndefined();
  });

  it('other translations untouched', () => {
    const kjvHighlight = makeHighlight('h1', 2, 3, 'yellow', 'KJV');
    const plan = planHighlightApplication({
      ...defaultArgs,
      translation: 'BSB',
      chapterHighlights: [kjvHighlight],
      selectedVerses: [2],
      color: 'yellow',
    });
    expect(plan.toRemove).toEqual([]);
  });

  it('merges notes when one selection replaces two noted highlights (REVM-5)', () => {
    const h1 = makeHighlight('h1', 2, 3, 'yellow', 'BSB', 'first thought');
    const h2 = makeHighlight('h2', 5, 6, 'yellow', 'BSB', 'second thought');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [h1, h2],
      selectedVerses: [2, 3, 4, 5, 6], // one run fully covering both → no remainders
      color: 'blue',
    });
    expect(plan.toRemove).toEqual(['h1', 'h2']);
    expect(plan.toAdd).toHaveLength(1);
    // Merge order by source verseStart: h1 (v2) before h2 (v5).
    expect(plan.toAdd[0].note).toBe('first thought\n\nsecond thought');
  });

  it('a transferred note lands on the run overlapping its source, not runs[0] (REVM-5)', () => {
    const h = makeHighlight('h1', 9, 9, 'yellow', 'BSB', 'keep me');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [h],
      selectedVerses: [2, 9], // two runs: [2,2] and [9,9]; h overlaps only the second
      color: 'blue',
    });
    const v2 = plan.toAdd.find((a) => a.verseStart === 2)!;
    const v9 = plan.toAdd.find((a) => a.verseStart === 9)!;
    expect(v2.note).toBeUndefined();
    expect(v9.note).toBe('keep me');
  });

  it('text is built per run from the run\'s verses only', () => {
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [],
      selectedVerses: [2, 3, 9],
      color: 'yellow',
      verseText: (v: number) => `t${v}`,
    });
    // Two runs: [2,3] and [9]
    const run23 = plan.toAdd.find((h) => h.verseStart === 2);
    const run9 = plan.toAdd.find((h) => h.verseStart === 9);
    expect(run23?.text).toBe('t2 t3');
    expect(run9?.text).toBe('t9');
  });
});

describe('planHighlightRemoval', () => {
  it('removes overlapping highlights for the same translation, skips note-only and other translations', () => {
    const bsb = makeHighlight('h1', 2, 5, 'yellow', 'BSB');
    const kjv = makeHighlight('h2', 2, 5, 'yellow', 'KJV');
    const noteOnly = makeHighlight('h3', 3, 3, null, 'BSB', 'note');

    const result = planHighlightRemoval({
      chapterHighlights: [bsb, kjv, noteOnly],
      selectedVerses: [3],
      translation: 'BSB',
    });

    expect(result.toRemove).toContain('h1');
    expect(result.toRemove).not.toContain('h2');
    expect(result.toRemove).not.toContain('h3');
  });
});
