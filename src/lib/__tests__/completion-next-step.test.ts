import { getCompletionNextStep } from '../completion-next-step';
import { buildTrialSeriesSeed } from '../dev-seed';

const now = new Date(2026, 8, 23, 12);

it('keeps a generated tomorrow reading locked after completing today', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'today-day2-read', now });
  const next = getCompletionNextStep(devotional, 2, 'day', now);
  expect(next.title).toContain('The Faithful Close');
  expect(next.detail).toContain('tomorrow');
  expect(next.nextDay).toBeUndefined();
});

it('offers the next available day when catching up on an older reading', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'today-day3', now });
  const next = getCompletionNextStep(devotional, 1, 'day', now);
  expect(next.nextDay).toBe(2);
  expect(next.title).toContain('The Middle Hour');
});

it('does not offer navigation into a missing day that is still preparing', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'today-day3-preparing', now });
  const next = getCompletionNextStep(devotional, 2, 'day', now);
  expect(next.detail).toContain('being prepared');
  expect(next.nextDay).toBeUndefined();
});

it('does not promise a due date without a series schedule', () => {
  const next = getCompletionNextStep(null, 2, 'day', now);
  expect(next.detail).not.toContain('tomorrow');
  expect(next.nextDay).toBeUndefined();
});

it('offers existing next-study choices after series completion, without inventing another day', () => {
  const { devotional } = buildTrialSeriesSeed({ state: 'series-complete', now });
  const next = getCompletionNextStep(devotional, 3, 'series', now);
  expect(next.detail).toContain('recommended study');
  expect(next.detail).toContain('library');
  expect(next.nextDay).toBeUndefined();
});
