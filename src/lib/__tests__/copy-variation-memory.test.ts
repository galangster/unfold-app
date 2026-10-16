/**
 * The copy memory kept beside the seed, on this device only: the completion
 * order the last overlay used, and the tap cue each check-in fire date carried.
 */
import { actOutcomeNote, completionCopy, completionVariation } from '@/constants/daily-copy';
import type { CopyVariation } from '@/lib/variation-bag';
import { getCompletionNextStep } from '../completion-next-step';
import {
  COPY_MEMORY_KEY_PREFIX,
  cueCarriedBefore,
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

/** Every field a completion draws, for one completion. */
const COMPLETION_FIELDS: Record<string, (variation: CopyVariation) => string> = {
  dayTitle: (v) => completionCopy('day', v).title,
  dayLine: (v) => completionCopy('day', v).message,
  seriesTitle: (v) => completionCopy('series', v).title,
  seriesLine: (v) => completionCopy('series', v).message,
  nextStepAhead: (v) => getCompletionNextStep(null, 2, 'day', NOON, v.seed, v.dayIndex).detail,
  nextStepSeries: (v) => getCompletionNextStep(null, 2, 'series', NOON, v.seed, v.dayIndex).detail,
  actDone: (v) => actOutcomeNote('done', v),
  actSkipped: (v) => actOutcomeNote('skipped', v),
};

describe('completion order on this device', () => {
  it('follows the history, and never goes back past the last overlay', () => {
    expect(takeCompletionOrdinal(4)).toBe(4);
    // The same history again, as when a day is finished a second time.
    expect(takeCompletionOrdinal(4)).toBe(5);
    // A deleted series took reads out of the history.
    expect(takeCompletionOrdinal(2)).toBe(6);
    // Reads synced in from another device move it on.
    expect(takeCompletionOrdinal(9)).toBe(9);
    expect([...mockValues.keys()].every((key) => key.startsWith(COPY_MEMORY_KEY_PREFIX))).toBe(true);
  });

  it.each(Object.entries(COMPLETION_FIELDS))(
    '%s differs between two completions with a one-reading series deleted between them',
    (_name, draw) => {
      const read = (dayNumber: number, at: Date) => ({ dayNumber, isRead: true, readAt: at.toISOString() });
      const firstReading = { days: [read(1, new Date(2026, 9, 14, 9))] };
      // Day 1 is finished with the first reading before it in the history.
      const firstAt = new Date(2026, 9, 15, 9);
      const first = takeCompletionOrdinal(countReadsBefore([firstReading, { days: [] }], firstAt));
      // The first reading is deleted. The next day, Day 2 is finished.
      const series = { days: [read(1, firstAt)] };
      const secondAt = new Date(2026, 9, 16, 9);
      const second = takeCompletionOrdinal(countReadsBefore([series], secondAt));

      // By the history alone the second would take the first one's place.
      expect(countReadsBefore([series], secondAt)).toBe(first);
      expect(second).toBe(first + 1);
      expect(draw(completionVariation('install-a', second))).not.toBe(draw(completionVariation('install-a', first)));
    },
  );
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
