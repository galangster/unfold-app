/** The onboarding series-length cards. "4 weeks" replaces "30 days" while chapters are on (Ruled 4, Q6). */
import type { DevotionalLength } from './series-length';

export interface SeriesLengthOption {
  value: DevotionalLength;
  label: string;
  description: string;
  accessibilityLabel: string;
}

function option(value: DevotionalLength, label: string, description: string, accessibilityLabel = label): SeriesLengthOption {
  return { value, label, description, accessibilityLabel };
}

const SHORT_OPTIONS: readonly SeriesLengthOption[] = [
  option(3, '3 days', 'Just a taste'),
  option(7, '7 days', 'Enough to build a rhythm'),
  option(14, '14 days', 'Room to go deep'),
];

/** Chapters off or unreadable: today's four cards. */
export const SERIES_LENGTH_OPTIONS_CHAPTERS_OFF: readonly SeriesLengthOption[] = [
  ...SHORT_OPTIONS,
  option(30, '30 days', 'A real transformation'),
];

/** Chapters on: the ruled "4 weeks" card in place of "30 days". */
export const SERIES_LENGTH_OPTIONS_CHAPTERS_ON: readonly SeriesLengthOption[] = [
  ...SHORT_OPTIONS,
  option(
    28,
    '4 weeks',
    'Four weekly chapters. Each week is prepared as you go.',
    '4 weeks. Four weekly chapters. Each week is prepared as you go.',
  ),
];

export function seriesLengthOptions(chapteredSeriesEnabled: boolean): readonly SeriesLengthOption[] {
  return chapteredSeriesEnabled ? SERIES_LENGTH_OPTIONS_CHAPTERS_ON : SERIES_LENGTH_OPTIONS_CHAPTERS_OFF;
}
