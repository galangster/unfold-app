/**
 * Pure helpers for planning Bible highlight application and removal.
 *
 * Extracted so they can be unit-tested without native modules.
 *
 * Key invariants:
 *  - Non-contiguous selections produce one highlight record per consecutive run
 *    (e.g. selecting v2 and v9 creates two separate records, not verseStart:2 verseEnd:9)
 *  - Overlap removal is translation-aware: a KJV highlight is never affected
 *    by a BSB selection
 *  - Note-only entries (color: null) are never removed by the highlight tool
 *    (they may coexist with colored highlights)
 *  - Notes transfer to the first remainder segment, or — when a replaced
 *    highlight leaves no remainder — to the first new segment overlapping the
 *    source highlight; multiple notes on one segment merge ('\n\n', ordered
 *    by source verseStart). Notes are never dropped.
 *  - Partial overlaps split the existing highlight into remainder segments
 *    (the existing color/translation are preserved on the remainders)
 */

import type { BibleHighlight, BibleHighlightColor } from '@/lib/store';

export interface HighlightApplicationPlan {
  toRemove: string[]; // existing highlight ids
  toAdd: Array<Omit<BibleHighlight, 'id' | 'createdAt'>>;
}

export interface HighlightRemovalPlan {
  toRemove: string[];
}

/**
 * Decompose a set of verse numbers into maximal consecutive runs.
 * e.g. [1,2,3,7,8] → [[1,2,3],[7,8]]
 */
function toRuns(verses: number[]): [number, number][] {
  if (verses.length === 0) return [];
  const sorted = [...verses].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  let runStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      runs.push([runStart, prev]);
      runStart = sorted[i];
      prev = sorted[i];
    }
  }
  runs.push([runStart, prev]);
  return runs;
}

/**
 * Plan a highlight application:
 * - Non-contiguous selection → one record per consecutive run
 * - Overlapping same-translation, non-null-color highlights are replaced
 *   (remainder segments keep the old color/translation)
 * - Notes from removed highlights transfer to the first overlapping segment
 */
export function planHighlightApplication(args: {
  chapterHighlights: BibleHighlight[]; // already filtered to bookId+chapter
  selectedVerses: number[];            // unsorted ok
  color: BibleHighlightColor;
  translation: string;
  bookId: number;
  bookName: string;
  chapter: number;
  verseText: (verse: number) => string;
}): HighlightApplicationPlan {
  const { chapterHighlights, selectedVerses, color, translation, bookId, bookName, chapter, verseText } = args;

  const runs = toRuns(selectedVerses);
  const toRemove: string[] = [];
  const toAdd: Array<Omit<BibleHighlight, 'id' | 'createdAt'>> = [];
  // Notes from fully-replaced highlights that left no remainder segments.
  // Keyed by the index of the first new-color run that overlaps the SOURCE
  // highlight; merged on attach (REVM-5: merge, never drop).
  const pendingNotesByRun = new Map<number, Array<{ sourceStart: number; note: string }>>();

  // Find highlights that are affected (same translation, color !== null,
  // overlap with at least one run). Build remainder segments.
  for (const h of chapterHighlights) {
    if (h.color === null) continue;          // note-only: never remove
    if (h.translation !== translation) continue; // different translation: skip

    const overlaps = runs.some(([rStart, rEnd]) => h.verseStart <= rEnd && h.verseEnd >= rStart);
    if (!overlaps) continue;

    toRemove.push(h.id);

    // Compute the parts of [h.verseStart, h.verseEnd] that are NOT covered by
    // any selected run → those become remainder segments.
    // Build a sorted list of all "run boundaries" within h's range.
    const ranges: [number, number][] = [];
    let cursor = h.verseStart;
    const coveredRuns = runs.filter(([rStart, rEnd]) => h.verseStart <= rEnd && h.verseEnd >= rStart);
    const clampedRuns = coveredRuns.map(([rStart, rEnd]): [number, number] => [
      Math.max(rStart, h.verseStart),
      Math.min(rEnd, h.verseEnd),
    ]);

    for (const [cStart, cEnd] of clampedRuns.sort((a, b) => a[0] - b[0])) {
      if (cursor < cStart) {
        ranges.push([cursor, cStart - 1]); // gap before this selected run
      }
      cursor = cEnd + 1;
    }
    if (cursor <= h.verseEnd) {
      ranges.push([cursor, h.verseEnd]); // trailing remainder
    }

    // Note transfer: the note from the removed highlight goes to the first
    // remainder or, if no remainders, to the first new-color segment.
    const noteToTransfer = h.note;
    let noteTransferredToRemainder = false;

    for (let ri = 0; ri < ranges.length; ri++) {
      const [rStart, rEnd] = ranges[ri];
      const remainderText = Array.from({ length: rEnd - rStart + 1 }, (_, i) => verseText(rStart + i)).join(' ');
      const isFirstRemainder = ri === 0;
      toAdd.push({
        bookId,
        bookName,
        chapter,
        verseStart: rStart,
        verseEnd: rEnd,
        text: remainderText,
        color: h.color,
        translation: h.translation,
        ...(isFirstRemainder && noteToTransfer !== undefined ? { note: noteToTransfer } : {}),
      });
      if (isFirstRemainder && noteToTransfer !== undefined) {
        noteTransferredToRemainder = true;
      }
    }

    // No remainder segments — route the note to the first new-color run that
    // overlaps THIS highlight (guaranteed to exist: `overlaps` above used the
    // same predicate).
    if (!noteTransferredToRemainder && noteToTransfer !== undefined) {
      const runIndex = runs.findIndex(
        ([rStart, rEnd]) => h.verseStart <= rEnd && h.verseEnd >= rStart,
      );
      const list = pendingNotesByRun.get(runIndex) ?? [];
      list.push({ sourceStart: h.verseStart, note: noteToTransfer });
      pendingNotesByRun.set(runIndex, list);
    }
  }

  // Build new-color segments for each run
  for (let ri = 0; ri < runs.length; ri++) {
    const [rStart, rEnd] = runs[ri];
    const text = Array.from({ length: rEnd - rStart + 1 }, (_, i) => verseText(rStart + i)).join(' ');
    const pendingNotes = pendingNotesByRun.get(ri);
    const note = pendingNotes
      ? pendingNotes
          .sort((a, b) => a.sourceStart - b.sourceStart)
          .map((p) => p.note)
          .join('\n\n')
      : undefined;

    toAdd.push({
      bookId,
      bookName,
      chapter,
      verseStart: rStart,
      verseEnd: rEnd,
      text,
      color,
      translation,
      ...(note !== undefined ? { note } : {}),
    });
  }

  return { toRemove, toAdd };
}

/**
 * Plan explicit highlight removal:
 * - Removes whole overlapping highlights (user intent: remove the highlight)
 * - Respects translation filter
 * - Never removes note-only entries (color === null)
 */
export function planHighlightRemoval(args: {
  chapterHighlights: BibleHighlight[];
  selectedVerses: number[];
  translation: string;
}): HighlightRemovalPlan {
  const { chapterHighlights, selectedVerses, translation } = args;
  const sorted = [...selectedVerses].sort((a, b) => a - b);

  const toRemove: string[] = [];
  for (const h of chapterHighlights) {
    if (h.color === null) continue;          // note-only: never removed by highlight tool
    if (h.translation !== translation) continue; // different translation: skip
    if (sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)) {
      toRemove.push(h.id);
    }
  }

  return { toRemove };
}
