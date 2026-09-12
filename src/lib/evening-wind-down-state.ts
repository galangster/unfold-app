import type { CheckIn, Devotional } from '@/lib/store';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';
import { getLatestReadDayNumberToday, getTodayReaderDayNumber } from '@/lib/devotional-day-access';

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
 * When nothing was finished today, aim at today's readable day — not the
 * last completed day. That fallback used to send "Read it now" at a day
 * the reader already finished yesterday.
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

  return getLatestReadDayNumberToday(devotional, now) ?? getTodayReaderDayNumber(devotional, now);
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

/**
 * Caption under the spinner. The two states look identical but are not: while
 * the entry decision is 'wait' the examen query is disabled, so nothing is
 * being prepared and the spinner can sit there for the whole session if the
 * RevenueCat identity sync failed (offline first launch). Say what is actually
 * happening, the way the Today card's gate() does, instead of promising a
 * prayer that is not being fetched.
 */
export function resolveEveningLoadingCaption(decision: EveningWindDownEntryDecision): string {
  return decision === 'wait' ? 'Checking your subscription…' : 'Preparing your evening prayer...';
}

/** Whether the reader has actually done the reading this reflection is about. */
export type EveningWindDownReadiness = 'ready' | 'unread' | 'preparing';

/**
 * Today only offers the wind-down once a day has been finished — the evening
 * slot in `context-slot-priority.ts` is gated on `hasReadToday`. The evening
 * push notification deep-links straight to this screen and honours no such
 * gate, so the two entry points disagreed.
 *
 * The notification can arrive before the day's completion is recorded.
 * Offer today's reader before reflecting, including its missing-day recovery.
 *
 * The invariant is Today's: did the reader finish a day TODAY. Two earlier
 * drafts each got half of it.
 *
 * Asking "was any day read today" ignored which day is on screen, and
 * `resolveEveningWindDownDayNumber` lets a deep-linkable `dayNumber` param
 * win — so a reader who finished Day 6 and followed a link naming Day 7 was
 * waved through to an examen about a reading they never opened.
 *
 * Asking only "is the target day read" looked tighter and was far weaker.
 * `getEveningWindDownDayNumber` falls back to `getHighestReadDayNumber`,
 * which deliberately hands back a day that IS read, so mid-series the target
 * was almost always an already-read day and the gate never fired at all. It
 * caught only a reader who had never finished anything — the one reader who
 * reported it, and nobody else.
 *
 * Both halves together: ready when a day was finished today AND that is the
 * day being reflected on. A day read yesterday does not qualify, because the
 * evening reflection speaks about this morning's reading, and Today would not
 * have offered the wind-down either.
 */
export function resolveEveningWindDownReadiness(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
): EveningWindDownReadiness {
  if (!devotional) return 'unread';
  if (!(devotional.days ?? []).some((day) => day.dayNumber === dayNumber)) return 'preparing';
  return getLatestReadDayNumberToday(devotional, now) === dayNumber ? 'ready' : 'unread';
}
