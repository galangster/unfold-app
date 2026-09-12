export const TRIAL_SERIES_FIXTURE_STATES = [
  'reveal-generating',
  'reveal-failed',
  'reveal-exhausted',
  'confirmation',
  'later-entry-notify',
  'today-day1',
  'today-day2',
  'today-day2-read',
  'today-day3',
  'today-day3-preparing',
  'today-lapsed-before-day3',
  'series-complete',
] as const;

export type TrialSeriesFixtureState = (typeof TRIAL_SERIES_FIXTURE_STATES)[number];

export function isTrialSeriesFixtureState(value: string | undefined): value is TrialSeriesFixtureState {
  return value != null && (TRIAL_SERIES_FIXTURE_STATES as readonly string[]).includes(value);
}
