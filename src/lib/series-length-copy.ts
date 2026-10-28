/**
 * Reader-facing length copy for the 4-week series (spec r2 rows 3, 4, 38 and
 * 39). Length 28 is the four-week length; every other length keeps its words.
 */
import { FOUR_WEEK_SERIES_DAYS, MONTH_SERIES_DAYS } from './series-length';

/** Premium sheet description for the series-length feature (row 3). */
export function premiumLengthDescription(chapteredSeriesEnabled: boolean): string {
  const longest = chapteredSeriesEnabled ? '4-week' : '30-day';
  return `Go deeper with 14-day and ${longest} series. Free users can create up to 7-day series.`;
}

/** Paywall comparison row, premium column (row 4). */
export function paywallSeriesLengthRow(chapteredSeriesEnabled: boolean): string {
  return chapteredSeriesEnabled ? '3 days to 4 weeks' : '3 to 30 days';
}

/** PDF cover subtitle (row 39). */
export function pdfCoverSubtitle(totalDays: number): string {
  return totalDays === FOUR_WEEK_SERIES_DAYS
    ? 'A Four-Week Devotional Series'
    : `A ${totalDays}-Day Devotional Series`;
}

/** "4-week" for a 28-day series, else "N-day". */
export function seriesLengthPhrase(totalDays: number): string {
  return totalDays === FOUR_WEEK_SERIES_DAYS ? '4-week' : `${totalDays}-day`;
}

/** The read count that earns the recap's long closing: 28 once the reader holds a 4-week series, else 30 (row 38). */
export function recapLongRhythmDays(series: readonly { totalDays: number }[]): number {
  return series.some((item) => item.totalDays === FOUR_WEEK_SERIES_DAYS) ? FOUR_WEEK_SERIES_DAYS : MONTH_SERIES_DAYS;
}

export function recapClosingMessage(totalDaysRead: number, longRhythmDays: number): string {
  if (totalDaysRead >= longRhythmDays) {
    return 'You have built something rare — a rhythm of returning. Whatever comes next, you have the roots for it.';
  }
  if (totalDaysRead >= 7) {
    return 'A week of showing up changes more than you think. The seeds are already taking root.';
  }
  return 'It has begun. The most important step is the next one.';
}
