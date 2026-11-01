import { getCompletionNextStep } from '../completion-next-step';
import { buildTrialSeriesSeed } from '../dev-seed';

const now = new Date(2026, 8, 23, 12);
const seed = 'test-install';
/** This completion's place in the reader's history (countReadsBefore). */
const ordinal = 4;

it('keeps a generated tomorrow reading locked after completing today', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'today-day2-read', now });
  const next = getCompletionNextStep(devotional, 2, 'day', now, seed, ordinal);
  expect(next.title).toContain('The Faithful Close');
  expect(next.detail).toContain('tomorrow');
  expect(next.nextDay).toBeUndefined();
});

it('offers the next available day when catching up on an older reading', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'today-day3', now });
  const next = getCompletionNextStep(devotional, 1, 'day', now, seed, ordinal);
  expect(next.nextDay).toBe(2);
  expect(next.title).toContain('The Middle Hour');
});

it('does not offer navigation into a missing day that is still preparing', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'today-day3-preparing', now });
  const next = getCompletionNextStep(devotional, 2, 'day', now, seed, ordinal);
  expect(next.detail).toContain('being prepared');
  expect(next.nextDay).toBeUndefined();
});

it('does not promise a due date without a series schedule', () => {
  const next = getCompletionNextStep(null, 2, 'day', now, seed, ordinal);
  expect(next.detail).not.toContain('tomorrow');
  expect(next.nextDay).toBeUndefined();
});

it('offers existing next-study choices after series completion, without inventing another day', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'series-complete', now });
  const next = getCompletionNextStep(devotional, 3, 'series', now, seed, ordinal);
  expect(next.detail).toContain('recommended study');
  expect(next.detail).toContain('library');
  expect(next.nextDay).toBeUndefined();
});

it.each([
  ['a next day that is ready', 'today-day3', 1, 'day'],
  ['a next day that opens tomorrow', 'today-day2-read', 2, 'day'],
  ['a next day still being prepared', 'today-day3-preparing', 2, 'day'],
  ['a finished series', 'series-complete', 3, 'series'],
] as const)('gives %s a new paragraph at each completion, whatever the day', (_label, state, completedDay, type) => {
  // The paragraph steps by completion, so a run of completions on one day or
  // across midnight never shows one paragraph twice in a row.
  const { devotional } = buildTrialSeriesSeed({ state, now });
  const steps = Array.from({ length: 40 }, (_, place) => getCompletionNextStep(devotional, completedDay, type, now, seed, place));
  for (let place = 1; place < steps.length; place += 1) {
    expect(steps[place].detail).not.toBe(steps[place - 1].detail);
    // Only the paragraph moves: the day it offers stays the same.
    expect({ ...steps[place], detail: steps[0].detail }).toEqual(steps[0]);
  }
  // Each completion is drawn the same way every time.
  expect(getCompletionNextStep(devotional, completedDay, type, now, seed, 7)).toEqual(steps[7]);
});
