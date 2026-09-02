import type { CheckIn, Devotional } from '@/lib/store';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';
import { getEveningWindDownDayNumber } from '@/lib/today-companion-state';

/**
 * Pure derivations for the evening wind-down screen, kept out of the
 * component so they can be tested without rendering it.
 */

function isSameLocalDate(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === now.toDateString();
}

/**
 * The examen reflects on the midday check-in the user made today. Midday
 * check-ins are recorded against the readable day (getMiddayCheckInDayNumber)
 * while the evening targets the day completed today
 * (getEveningWindDownDayNumber); after a morning read those differ by one, so
 * a lookup by the evening day silently drops the afternoon check-in. Find
 * today's midday check-in by its timestamp first (newest wins), and fall back
 * to the evening-day lookup for records without a usable one.
 */
export function findTodayMiddayCheckIn(
  checkIns: readonly CheckIn[],
  devotionalId: string,
  eveningDayNumber: number | null | undefined,
  now = new Date(),
): CheckIn | undefined {
  const midday = checkIns.filter(
    (checkIn) => checkIn.devotionalId === devotionalId && checkIn.timeOfDay === 'midday',
  );

  const today = midday
    .filter((checkIn) => isSameLocalDate(checkIn.createdAt, now))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (today.length > 0) return today[0];

  if (eveningDayNumber == null) return undefined;
  return midday.find((checkIn) => checkIn.dayNumber === eveningDayNumber);
}

/**
 * A dayNumber route param wins only when that day exists in the devotional;
 * an unknown day would render the "Start a devotional" empty state while a
 * devotional is active. Otherwise the day completed today is the target.
 */
export function resolveEveningWindDownDayNumber(
  devotional: Devotional | null | undefined,
  requestedDayNumber: number | null,
  now = new Date(),
): number {
  if (!devotional) return requestedDayNumber ?? 1;

  const hasRequestedDay =
    requestedDayNumber != null &&
    (devotional.days ?? []).some((day) => day.dayNumber === requestedDayNumber);
  if (hasRequestedDay) return requestedDayNumber;

  return getEveningWindDownDayNumber(devotional, now) ?? 1;
}

export type EveningWindDownEntryDecision = 'allow' | 'wait' | 'gate';

/**
 * The Today card runs the creation gate before pushing this screen; a
 * notification tap pushes it directly. The screen mirrors the gate:
 * 'granted' loads, 'unknown' waits for RevenueCat (no upsell flash while
 * entitlement resolves), 'denied' runs the gate (paywall or exclusive offer,
 * exactly as the Today entry point) and loads nothing.
 */
export function decideEveningWindDownEntry(policy: PremiumAccessPolicy): EveningWindDownEntryDecision {
  if (policy === 'granted') return 'allow';
  if (policy === 'unknown') return 'wait';
  return 'gate';
}
