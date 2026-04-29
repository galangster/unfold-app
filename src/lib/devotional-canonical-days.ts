import type { Devotional, DevotionalDay } from './store';
import { isCanonicalProgressiveDevotional } from './reading-generation-policy';

export type RenderableDevotionalDay =
  | { status: 'ready'; day: DevotionalDay }
  | { status: 'awaiting-canonical-recovery'; dayNumber: number; reason: 'local_only_or_missing' };

export function canonicalGeneratedDayId(devotionalId: string, dayNumber: number): string {
  return `day-${devotionalId}-${dayNumber}`;
}

export function isCanonicalGeneratedDay(devotionalId: string, day: DevotionalDay): boolean {
  return day.id === canonicalGeneratedDayId(devotionalId, day.dayNumber);
}

export function selectRenderableDevotionalDay(
  devotional: Devotional | null | undefined,
  dayNumber: number,
): RenderableDevotionalDay {
  const day = devotional?.days.find((candidate) => candidate.dayNumber === dayNumber);

  if (!devotional || !day) {
    return { status: 'awaiting-canonical-recovery', dayNumber, reason: 'local_only_or_missing' };
  }

  if (!isCanonicalProgressiveDevotional(devotional)) {
    return { status: 'ready', day };
  }

  if (isCanonicalGeneratedDay(devotional.id, day)) {
    return { status: 'ready', day };
  }

  return { status: 'awaiting-canonical-recovery', dayNumber, reason: 'local_only_or_missing' };
}

export function selectNextRenderableDevotionalDay(
  devotional: Devotional | null | undefined,
  currentDayNumber: number,
): DevotionalDay | undefined {
  const result = selectRenderableDevotionalDay(devotional, currentDayNumber + 1);
  return result.status === 'ready' ? result.day : undefined;
}

export function getHighestContiguousRenderableDayNumber(
  devotional: Devotional | null | undefined,
): number {
  if (!devotional) return 0;

  if (!isCanonicalProgressiveDevotional(devotional)) {
    return devotional.days.length;
  }

  let highest = 0;
  for (let dayNumber = 1; dayNumber <= devotional.totalDays; dayNumber += 1) {
    if (selectRenderableDevotionalDay(devotional, dayNumber).status !== 'ready') {
      break;
    }
    highest = dayNumber;
  }

  return highest;
}

export function buildReadOnlyCanonicalDayData(
  devotionalId: string,
  day: DevotionalDay,
  readAt: string,
): Record<string, unknown> {
  return {
    devotionalId,
    dayNumber: day.dayNumber,
    isRead: true,
    readAt,
  };
}
