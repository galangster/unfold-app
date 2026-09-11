import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import type { Devotional } from '@/lib/store';

export function countReadDaysWithinBoundary(d: Devotional): number {
  const totalDays = getServerOwnedSeriesTotalDays(d);
  return (d.days ?? []).filter((day) => (
    day.isRead && (totalDays <= 0 || day.dayNumber <= totalDays)
  )).length;
}
