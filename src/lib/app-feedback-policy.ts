import type { Devotional } from '@/lib/store';
import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import { countReadDaysWithinBoundary } from '@/lib/series-path';

export const APP_FEEDBACK_MAX_LENGTH = 500;
const DAY_MS = 86_400_000;

export function getFeedbackProgress(devotionals: Devotional[]) {
  return devotionals.reduce((progress, devotional) => {
    const read = countReadDaysWithinBoundary(devotional);
    const total = getServerOwnedSeriesTotalDays(devotional);
    return {
      readings: progress.readings + read,
      series: progress.series + Number(total >= 3 && read >= total),
    };
  }, { readings: 0, series: 0 });
}

export function shouldOfferAppFeedback(options: {
  readings: number;
  series: number;
  lastDate: string | null;
  readingsAtLast: number;
  seriesAtLast: number;
  lastReviewDate: string | null;
}, now = new Date()): boolean {
  if (options.readings < 3 || (options.series === 0 && options.readings < 7)) return false;
  // Keep private feedback and App Store review requests on different days.
  if (options.lastReviewDate && now.getTime() - Date.parse(options.lastReviewDate) < DAY_MS) return false;
  if (!options.lastDate) return true;
  const elapsed = now.getTime() - Date.parse(options.lastDate);
  if (!Number.isFinite(elapsed) || elapsed < 30 * DAY_MS) return false;
  return options.series > options.seriesAtLast || options.readings >= options.readingsAtLast + 14;
}
