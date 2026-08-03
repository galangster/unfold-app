import type { Devotional } from './store';
import {
  getHighestContiguousRenderableDayNumber,
  selectRenderableDevotionalDay,
} from './devotional-canonical-days';

function isSameLocalDate(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === now.toDateString();
}

export function getCalendarDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional?.seriesStartDate) return null;

  const startDate = new Date(devotional.seriesStartDate);
  if (Number.isNaN(startDate.getTime())) return null;

  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNumber = Math.floor((today.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  return Math.max(1, dayNumber);
}

function isCurrentDayAfterCalendarDay(
  devotional: Devotional,
  now = new Date(),
): boolean {
  const calendarDayNumber = getCalendarDayNumber(devotional, now);
  if (calendarDayNumber == null) return true;
  return devotional.currentDay > calendarDayNumber;
}

export function getLatestReadDayNumberToday(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const readToday = (devotional.days ?? [])
    .filter((day) => day.isRead && isSameLocalDate(day.readAt, now))
    .map((day) => day.dayNumber);

  return readToday.length > 0 ? Math.max(...readToday) : null;
}

export function getLockedTodayDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const latestReadToday = getLatestReadDayNumberToday(devotional, now);
  if (latestReadToday == null) return null;

  const currentDay = devotional.days?.find((day) => day.dayNumber === devotional.currentDay);
  const currentDayIsTomorrowCandidate = devotional.currentDay > latestReadToday && !currentDay?.isRead;

  return currentDayIsTomorrowCandidate && isCurrentDayAfterCalendarDay(devotional, now) ? latestReadToday : null;
}

export function getTodayReaderDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number {
  if (!devotional) return 1;
  return getLockedTodayDayNumber(devotional, now) ?? Math.max(1, devotional.currentDay || 1);
}

export function getSelectableDayLimit(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number {
  if (!devotional) return 0;

  const highestRenderableDay = getHighestContiguousRenderableDayNumber(devotional);
  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);

  if (lockedTodayDayNumber != null) {
    return Math.min(lockedTodayDayNumber, Math.max(highestRenderableDay, lockedTodayDayNumber));
  }

  return Math.min(Math.max(1, devotional.currentDay || 1), highestRenderableDay);
}

export function isDevotionalDaySelectable(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
): boolean {
  if (!devotional || dayNumber < 1) return false;
  if (dayNumber > getSelectableDayLimit(devotional, now)) return false;
  return selectRenderableDevotionalDay(devotional, dayNumber).status === 'ready';
}

const WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// The app gates one additional day per calendar day from wherever the user
// currently IS (getSelectableDayLimit), not from seriesStartDate. A user who
// is behind schedule must read the intervening days first — so day N's
// unlock is `now + (N - selectableLimit)` days out, NOT
// `seriesStartDate + (N-1)` days out. (Those two agree for a user who is on
// schedule, since the limit itself advances one-for-one with the calendar
// in that case — but a behind-schedule reader would otherwise see every
// future day mislabeled "Tomorrow".) seriesStartDate is still required as a
// sanity check: a missing/invalid anchor means the day-access logic above
// has no calendar signal at all, so an unlock date would be a guess.
function getUnlockLabel(
  devotional: Devotional,
  dayNumber: number,
  now: Date,
): string | undefined {
  if (!devotional.seriesStartDate) return undefined;

  const startDate = new Date(devotional.seriesStartDate);
  if (Number.isNaN(startDate.getTime())) return undefined;

  const selectableLimit = getSelectableDayLimit(devotional, now);
  const daysUntilUnlock = dayNumber - selectableLimit;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const unlockDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilUnlock);

  if (daysUntilUnlock <= 1) return 'Tomorrow';
  if (daysUntilUnlock <= 6) return `Unlocks ${WEEKDAY_SHORT_NAMES[unlockDay.getDay()]}`;
  return `Unlocks ${MONTH_SHORT_NAMES[unlockDay.getMonth()]} ${unlockDay.getDate()}`;
}

export type DayMenuPresentationKind = 'ready' | 'locked-titled' | 'preparing' | 'coming-soon';

export interface DayMenuPresentation {
  kind: DayMenuPresentationKind;
  title: string;
  unlockLabel?: string;
}

// Classifies a day row for the day-selection sheet. There are four distinct
// situations that all used to render as an identical "Being prepared…" —
// collapsing them lost the difference between "calendar is holding this
// back" and "this genuinely doesn't exist yet":
//   - ready:          selectable now — show the real title (or `Day N` if a
//                      title is somehow missing; a selectable day must never
//                      look like a placeholder).
//   - locked-titled:  content is generated and on device, but paced/calendar
//                      gated — show the real title (dimmed) plus when it
//                      unlocks.
//   - preparing:      content is missing and due today — genuinely still
//                      being written.
//   - coming-soon:    content is missing and not due yet.
export function getDayMenuPresentation(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
): DayMenuPresentation {
  const fallbackTitle = `Day ${dayNumber}`;

  if (!devotional) {
    return { kind: 'coming-soon', title: 'Coming soon' };
  }

  const renderable = selectRenderableDevotionalDay(devotional, dayNumber);
  const contentIsReady = renderable.status === 'ready';

  if (isDevotionalDaySelectable(devotional, dayNumber, now)) {
    const title = contentIsReady ? renderable.day.title : undefined;
    return { kind: 'ready', title: title || fallbackTitle };
  }

  if (contentIsReady) {
    return {
      kind: 'locked-titled',
      title: renderable.day.title || fallbackTitle,
      unlockLabel: getUnlockLabel(devotional, dayNumber, now),
    };
  }

  const calendarDayNumber = getCalendarDayNumber(devotional, now);
  const isDueToday = calendarDayNumber != null && dayNumber <= calendarDayNumber;

  return isDueToday
    ? { kind: 'preparing', title: 'Being prepared…' }
    : { kind: 'coming-soon', title: 'Coming soon' };
}

export function resolveInitialReadingDayNumber(
  devotional: Devotional | null | undefined,
  requestedDayNumber: number | null | undefined,
  now = new Date(),
): number {
  const requested = requestedDayNumber && requestedDayNumber > 0 ? requestedDayNumber : null;
  if (!devotional) return requested ?? 1;

  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);
  if (lockedTodayDayNumber != null) {
    const target = requested ?? devotional.currentDay;
    return target > lockedTodayDayNumber ? lockedTodayDayNumber : Math.max(1, target);
  }

  if (requested) return requested;

  const currentDay = Math.max(1, devotional.currentDay || 1);
  const currentDayIsRenderable = selectRenderableDevotionalDay(devotional, currentDay).status === 'ready';
  if (currentDayIsRenderable) return currentDay;

  return devotional.days.length > 0 ? devotional.days.length : currentDay;
}
