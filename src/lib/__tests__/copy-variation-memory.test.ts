/**
 * The copy memory kept beside the seed, on this device only: the completion
 * order the last overlay used, the order each day finished here took, and
 * the tap cue each check-in fire date carried.
 */
import { ACT_OUTCOME_NOTES, actOutcomeNote, completionCopy, completionVariation } from '@/constants/daily-copy';
import type { CopyVariation } from '@/lib/variation-bag';
import { getCompletionNextStep } from '../completion-next-step';
import {
  actNoteOrdinal,
  COPY_MEMORY_KEY_PREFIX,
  cueCarriedBefore,
  holdActNoteOrdinal,
  readCarriedCues,
  rememberCarriedCues,
  takeCompletionOrdinal,
} from '../copy-variation';
import { countReadsBefore } from '../devotional-day-access';

const mockValues = new Map<string, string>();
jest.mock('@/lib/mmkv-storage', () => ({
  getDeviceId: () => 'install-a',
  mmkvStorage: {
    getItem: (key: string) => mockValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mockValues.set(key, value);
    },
    removeItem: (key: string) => {
      mockValues.delete(key);
    },
  },
}));

beforeEach(() => mockValues.clear());

const NOON = new Date(2026, 9, 16, 12);

/** Every field the overlay draws, for one completion. */
const OVERLAY_FIELDS: Record<string, (variation: CopyVariation) => string> = {
  dayTitle: (v) => completionCopy('day', v).title,
  dayLine: (v) => completionCopy('day', v).message,
  seriesTitle: (v) => completionCopy('series', v).title,
  seriesLine: (v) => completionCopy('series', v).message,
  nextStepAhead: (v) => getCompletionNextStep(null, 2, 'day', NOON, v.seed, v.dayIndex).detail,
  nextStepSeries: (v) => getCompletionNextStep(null, 2, 'series', NOON, v.seed, v.dayIndex).detail,
};
const ACT_OUTCOMES = Object.keys(ACT_OUTCOME_NOTES) as (keyof typeof ACT_OUTCOME_NOTES)[];

const read = (dayNumber: number, at: Date) => ({ dayNumber, isRead: true, readAt: at.toISOString() });

/**
 * Day 1 is finished with a one-reading series before it in the history. That
 * series is deleted, and the next day Day 2 is finished. Each completion
 * takes its order as the reader takes it (reading.tsx handleComplete).
 */
function finishTwoDaysAroundADelete() {
  const firstReading = { days: [read(1, new Date(2026, 9, 14, 9))] };
  const firstAt = new Date(2026, 9, 15, 9);
  const first = takeCompletionOrdinal(
    countReadsBefore([firstReading, { days: [] }], firstAt),
    { devotionalId: 'series', dayNumber: 1 },
  );
  const secondAt = new Date(2026, 9, 16, 9);
  const beforeSecond = [{ days: [read(1, firstAt)] }];
  const second = takeCompletionOrdinal(
    countReadsBefore(beforeSecond, secondAt),
    { devotionalId: 'series', dayNumber: 2 },
  );
  const history = [{ days: [read(1, firstAt), read(2, secondAt)] }];
  return { first, second, history, firstAt, secondAt };
}

describe('completion order on this device', () => {
  it('follows the history, and never goes back past the last overlay', () => {
    expect(takeCompletionOrdinal(4)).toBe(4);
    // The same history again, as when a day is finished a second time.
    expect(takeCompletionOrdinal(4)).toBe(5);
    // A deleted series took reads out of the history.
    expect(takeCompletionOrdinal(2)).toBe(6);
    // Reads synced in from another device move it on.
    expect(takeCompletionOrdinal(9, { devotionalId: 'series', dayNumber: 3 })).toBe(9);
    // The finished day keeps that order, and every key is one the full reset sweeps.
    expect(actNoteOrdinal([], { devotionalId: 'series', dayNumber: 3 })).toBe(9);
    expect([...mockValues.keys()].every((key) => key.startsWith(COPY_MEMORY_KEY_PREFIX))).toBe(true);
  });

  it.each(Object.entries(OVERLAY_FIELDS))(
    '%s differs between two completions with a one-reading series deleted between them',
    (_name, draw) => {
      const { first, second, history, secondAt } = finishTwoDaysAroundADelete();

      // By the history alone the second would take the first one's place.
      expect(countReadsBefore(history, secondAt)).toBe(first);
      expect(second).toBe(first + 1);
      expect(draw(completionVariation('install-a', second))).not.toBe(draw(completionVariation('install-a', first)));
    },
  );

  it.each(ACT_OUTCOMES)(
    'the %s act note differs between those two days, drawn as DevotionalContent draws it',
    (outcome) => {
      const { first, history, firstAt, secondAt } = finishTwoDaysAroundADelete();
      const note = (dayNumber: number, at: Date) => actOutcomeNote(
        outcome,
        completionVariation('install-a', actNoteOrdinal(history, { devotionalId: 'series', dayNumber, readAt: at.toISOString() })),
      );
      const atOrdinal = (ordinal: number) => actOutcomeNote(outcome, completionVariation('install-a', ordinal));

      // Day 1 keeps the note it showed when it was finished, after the delete too.
      expect(note(1, firstAt)).toBe(atOrdinal(first));
      // By the history alone, Day 2 would show that same note.
      expect(atOrdinal(countReadsBefore(history, secondAt))).toBe(note(1, firstAt));
      expect(note(2, secondAt)).not.toBe(note(1, firstAt));
    },
  );

  it('draws the act note of a day not finished here by the history', () => {
    const readAt = new Date(2026, 9, 15, 9).toISOString();
    const history = [{ days: [read(1, new Date(2026, 9, 14, 9)), read(2, new Date(readAt))] }];
    // Finished on another device: the readings before its read time.
    expect(actNoteOrdinal(history, { devotionalId: 'series', dayNumber: 2, readAt })).toBe(1);
    // A damaged record reads as none.
    mockValues.set(`${COPY_MEMORY_KEY_PREFIX}day-ordinal-series:2`, 'not a number');
    expect(actNoteOrdinal(history, { devotionalId: 'series', dayNumber: 2, readAt })).toBe(1);
    // Without a series it goes by the history. Without a read time either, it draws at 0.
    expect(actNoteOrdinal(history, { readAt })).toBe(1);
    expect(actNoteOrdinal(history, {})).toBe(0);
  });
});

describe('an act first marked on this device', () => {
  it('takes the next order for a day finished on another device, so its note steps past the last one', () => {
    // 1. Day 1 is finished here, with a one-reading series before it.
    const firstReading = { id: 'first-reading', days: [read(1, new Date(2026, 9, 14, 9))] };
    const firstAt = new Date(2026, 9, 15, 9);
    const first = takeCompletionOrdinal(
      countReadsBefore([firstReading, { days: [] }], firstAt),
      { devotionalId: 'series', dayNumber: 1 },
    );
    // 2. That series is deleted. 3. Day 2 is finished on another device, and its read syncs here.
    const secondAt = new Date(2026, 9, 16, 9);
    const shelf = [{ id: 'series', days: [read(1, firstAt), read(2, secondAt)] }];
    // By the history alone, Day 2 would take Day 1's order.
    expect(countReadsBefore(shelf, secondAt)).toBe(first);

    // 4. Its act is marked here.
    holdActNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 2 });

    const second = actNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 2, readAt: secondAt.toISOString() });
    expect(second).toBe(first + 1);
    for (const outcome of ACT_OUTCOMES) {
      expect(actOutcomeNote(outcome, completionVariation('install-a', second)))
        .not.toBe(actOutcomeNote(outcome, completionVariation('install-a', first)));
    }
  });

  it('leaves a day that holds an order already, or whose act was marked before', () => {
    const readAt = new Date(2026, 9, 16, 9).toISOString();
    const shelf = [{ id: 'series', days: [read(1, new Date(2026, 9, 15, 9)), { ...read(2, new Date(readAt)), actOutcome: 'done' }] }];
    takeCompletionOrdinal(5, { devotionalId: 'series', dayNumber: 1 });

    holdActNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 1 });
    holdActNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 2 });

    expect(actNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 1 })).toBe(5);
    // Day 2 was marked before orders were kept, so it keeps its place in the history.
    expect(actNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 2, readAt })).toBe(1);
    // Neither call took an order.
    expect(takeCompletionOrdinal(0)).toBe(6);
  });

  it('keeps the history place when no other day holds it, even with no order kept on this device', () => {
    // Days finished before this build hold no order, and Day 2's act was marked then.
    const at = (day: number) => new Date(2026, 9, 10 + day, 9);
    const shelf = [{ id: 'series', days: [read(1, at(1)), { ...read(2, at(2)), actOutcome: 'done' }, read(3, at(3))] }];

    holdActNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 3 });

    expect(actNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 3, readAt: at(3).toISOString() })).toBe(2);
    // Keeping a place raises the floor to it, so the next overlay steps past it.
    expect(takeCompletionOrdinal(0)).toBe(3);
  });

  it('keeps the next overlay off a kept place when a series is deleted after the keep', () => {
    // A one-reading series, then Days 1 to 3 finished here (orders 1 to 3).
    const at = (day: number) => new Date(2026, 9, 10 + day, 9);
    const oneReading = { id: 'one-reading', days: [read(1, at(0))] };
    const series = { id: 'series', days: [1, 2, 3, 4].map((day) => read(day, at(day))) };
    for (const day of [1, 2, 3]) takeCompletionOrdinal(day, { devotionalId: 'series', dayNumber: day });
    // Day 4 is finished on another device; its act is marked here, keeping place 4.
    holdActNoteOrdinal([oneReading, series], { devotionalId: 'series', dayNumber: 4 });

    // The one-reading series is deleted, and Day 5 is finished here.
    const shelf = [{ ...series, days: [...series.days, read(5, at(5))] }];
    const fifth = takeCompletionOrdinal(countReadsBefore(shelf, at(5)), { devotionalId: 'series', dayNumber: 5 });

    const fourth = actNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 4, readAt: at(4).toISOString() });
    expect([fourth, fifth]).toEqual([4, 5]);
    for (const outcome of ACT_OUTCOMES) {
      expect(actOutcomeNote(outcome, completionVariation('install-a', fifth)))
        .not.toBe(actOutcomeNote(outcome, completionVariation('install-a', fourth)));
    }
  });

  it('takes the next order when a day of another series holds the place', () => {
    // Series A Days 1 to 4 are finished here after a one-reading series (orders 1 to 4).
    const at = (day: number) => new Date(2026, 9, 10 + day, 9);
    for (const day of [1, 2, 3, 4]) takeCompletionOrdinal(day, { devotionalId: 'series-a', dayNumber: day });
    // That series is deleted, and Series B Day 1 is finished on another device after A's Day 4.
    const shelf = [
      { id: 'series-a', days: [1, 2, 3, 4].map((day) => read(day, at(day))) },
      { id: 'series-b', days: [read(1, at(5))] },
    ];
    expect(countReadsBefore(shelf, at(5))).toBe(4);

    holdActNoteOrdinal(shelf, { devotionalId: 'series-b', dayNumber: 1 });

    expect(actNoteOrdinal(shelf, { devotionalId: 'series-b', dayNumber: 1, readAt: at(5).toISOString() })).toBe(5);
  });

  it('looks the day up in its own series', () => {
    const at = new Date(2026, 9, 16, 9);
    // Another series has a Day 1 whose act is marked, listed first.
    const shelf = [
      { id: 'other', days: [{ ...read(1, new Date(2026, 9, 15, 9)), actOutcome: 'done' }] },
      { id: 'series', days: [read(1, at)] },
    ];

    holdActNoteOrdinal(shelf, { devotionalId: 'series', dayNumber: 1 });

    expect(mockValues.get(`${COPY_MEMORY_KEY_PREFIX}day-ordinal-series:1`)).toBe('1');
  });
});

describe('the tap cue each fire date carried', () => {
  it('finds the cue of the fire date before a day, and keeps a batch’s cues for the next batch', () => {
    rememberCarriedCues('midday', {}, [{ dayIndex: 100, cue: 'A' }, { dayIndex: 101 }, { dayIndex: 103, cue: 'C' }]);
    const cues = readCarriedCues('midday');
    expect(cueCarriedBefore(cues, 100)).toBeUndefined();
    expect(cueCarriedBefore(cues, 101)).toBe('A');
    // Day 101's sentence left no room for a cue.
    expect(cueCarriedBefore(cues, 102)).toBe('');
    expect(cueCarriedBefore(cues, 104)).toBe('C');

    // The next batch starts on day 103: it keeps the dates before it and replaces its own.
    rememberCarriedCues('midday', cues, [{ dayIndex: 103, cue: 'D' }, { dayIndex: 104, cue: 'E' }]);
    expect(readCarriedCues('midday')).toEqual({ 100: 'A', 101: '', 103: 'D', 104: 'E' });
    expect(readCarriedCues('evening')).toEqual({});
  });

  it('drops fire dates more than two weeks before a batch, and reads a damaged record as empty', () => {
    rememberCarriedCues('midday', {}, [{ dayIndex: 100, cue: 'A' }, { dayIndex: 120, cue: 'B' }]);
    rememberCarriedCues('midday', readCarriedCues('midday'), [{ dayIndex: 130, cue: 'C' }]);
    expect(readCarriedCues('midday')).toEqual({ 120: 'B', 130: 'C' });

    mockValues.set(`${COPY_MEMORY_KEY_PREFIX}check-in-cues-midday`, 'not json');
    expect(readCarriedCues('midday')).toEqual({});
  });
});
