import type { Devotional, DevotionalDay } from './store';
import {
  getHighestContiguousRenderableDayNumber,
  selectRenderableDevotionalDay,
} from './devotional-canonical-days';

export interface DevotionalReadingProgress {
  currentDay: number;
  days: readonly { dayNumber: number; isRead?: boolean; readAt?: string }[];
}

function isSameLocalDate(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === now.toDateString();
}

function isDevotionalDayRead(devotional: Devotional, dayNumber: number): boolean {
  return devotional.days.some((day) => day.dayNumber === dayNumber && day.isRead);
}

export function getCalendarDayNumber(
  devotional: Devotional | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional?.seriesStartDate) return null;

  const startDate = new Date(devotional.seriesStartDate);
  if (Number.isNaN(startDate.getTime())) return null;

  const startDay = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNumber = Math.floor((today - startDay) / (24 * 60 * 60 * 1000)) + 1;

  return Math.max(1, dayNumber);
}

/** Generation time is preparation metadata, not the date a reading is due. */
export function getReadingDayLabel(
  devotional: Devotional | null | undefined,
  day: DevotionalDay | null | undefined,
  now = new Date(),
): 'Overdue' | 'Today' | 'Tomorrow' {
  if (!devotional || !day || day.isRead) return 'Today';
  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);
  if (lockedTodayDayNumber != null && day.dayNumber > lockedTodayDayNumber) return 'Tomorrow';
  const calendarDay = getCalendarDayNumber(devotional, now);
  if (calendarDay == null) return 'Today';
  if (day.dayNumber > calendarDay) return 'Tomorrow';
  return day.dayNumber < calendarDay ? 'Overdue' : 'Today';
}

export function getLatestReadDayNumberToday(
  devotional: Pick<DevotionalReadingProgress, 'days'> | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const readToday = (devotional.days ?? [])
    .filter((day) => day.isRead && isSameLocalDate(day.readAt, now))
    .map((day) => day.dayNumber);

  return readToday.length > 0 ? Math.max(...readToday) : null;
}

export function getLockedTodayDayNumber(
  devotional: DevotionalReadingProgress | null | undefined,
  now = new Date(),
): number | null {
  if (!devotional) return null;

  const latestReadToday = getLatestReadDayNumberToday(devotional, now);
  if (latestReadToday == null) return null;

  const currentDay = devotional.days?.find((day) => day.dayNumber === devotional.currentDay);
  const currentDayIsTomorrowCandidate = devotional.currentDay > latestReadToday && !currentDay?.isRead;

  // Completion sets the daily pace even when the series started before the first reading.
  return currentDayIsTomorrowCandidate ? latestReadToday : null;
}

export type BlockedForwardReason = 'series-finished' | 'daily-pace' | 'not-ready';

/**
 * Why a forward swipe from `viewingDay` went nowhere: the series has no
 * later day, today's reading already set the daily pace, or the next day is
 * not on this device yet (still being prepared, missing, or paused).
 */
export function resolveBlockedForwardReason(
  devotional: DevotionalReadingProgress | null | undefined,
  viewingDay: number,
  totalDays: number,
  now = new Date(),
): BlockedForwardReason {
  if (viewingDay >= totalDays) return 'series-finished';
  if (getLockedTodayDayNumber(devotional, now) != null) return 'daily-pace';
  return 'not-ready';
}

export const BLOCKED_FORWARD_MESSAGES: Record<BlockedForwardReason, string> = {
  'series-finished': 'This is the last day of this series',
  'daily-pace': "Tomorrow's reading unlocks after midnight",
  'not-ready': "The next day isn't ready yet",
};

export function getTodayReaderDayNumber(
  devotional: DevotionalReadingProgress | null | undefined,
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

  const lockedTodayDayNumber = getLockedTodayDayNumber(devotional, now);
  if (lockedTodayDayNumber != null) return lockedTodayDayNumber;

  // A read day never holds back the days after it, even when this device has
  // only a local copy of it: the reader restores that copy with a pull. A
  // missing unread day still holds back every later day.
  const readDayNumbers = new Set(devotional.days.filter((day) => day.isRead).map((day) => day.dayNumber));
  const highestReachableDay = getHighestContiguousRenderableDayNumber(
    devotional,
    (dayNumber) => readDayNumbers.has(dayNumber),
  );

  // Read days right after the current day stay in reach too, so a reader who
  // read out of order can move between them. The first unread day still stops.
  let limit = Math.min(Math.max(1, devotional.currentDay || 1), highestReachableDay);
  while (limit < highestReachableDay && readDayNumbers.has(limit + 1)) limit += 1;
  return limit;
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

// Read days stay open. When this device has only a local copy of a read day,
// the reader restores it with a pull. A day opens only where
// resolveInitialReadingDayNumber lands, so the day rows match the reader and
// today's completed reading still holds the reader in place.
export function canOpenDevotionalDay(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
): boolean {
  if (isDevotionalDaySelectable(devotional, dayNumber, now)) return true;
  if (!devotional || !isDevotionalDayRead(devotional, dayNumber)) return false;
  return resolveInitialReadingDayNumber(devotional, dayNumber, now) === dayNumber;
}

// Only the current series gets new days: the server prepares days for the
// current series alone, and the reader never requests a day for any other
// series. Every other series is paused, or finished, and keeps what it has.
export function isPausedSeries(
  devotional: Pick<Devotional, 'id'> | null | undefined,
  currentDevotionalId: string | null | undefined,
): boolean {
  return devotional != null && devotional.id !== currentDevotionalId;
}

// An unread day that a paused series is missing will not be prepared, so it
// must not be presented as being prepared. It stays open to the reader: a pull
// there restores a copy the server already has, or confirms the day is missing.
export function isPausedSeriesUnpreparedDay(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  seriesPaused: boolean,
): boolean {
  if (!seriesPaused || !devotional) return false;
  if (isDevotionalDayRead(devotional, dayNumber)) return false;
  return selectRenderableDevotionalDay(devotional, dayNumber).status !== 'ready';
}

export type PausedSeriesMissingDayKind = 'not-prepared' | 'restore-failed';

// Why a paused series lacks a day once a full pull confirms the server has no
// copy: an unread day was never prepared, but a read day was, and only its
// restore failed.
export function getPausedSeriesMissingDayKind(
  devotional: Devotional,
  dayNumber: number,
): PausedSeriesMissingDayKind {
  return isDevotionalDayRead(devotional, dayNumber) ? 'restore-failed' : 'not-prepared';
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

export type DayMenuPresentationKind = 'ready' | 'restore' | 'locked-titled' | 'preparing' | 'not-prepared' | 'coming-soon';

export interface DayMenuPresentation {
  kind: DayMenuPresentationKind;
  title: string;
  unlockLabel?: string;
}

// Classifies a day row for the day-selection sheet. There are four distinct
// situations that all used to render as an identical "Being prepared…" —
// collapsing them lost the difference between "calendar is holding this
// back" and "this genuinely doesn't exist yet":
//   - ready:          opens now — show the real title (or `Day N` if a
//                      title is somehow missing; an open day must never
//                      look like a placeholder).
//   - locked-titled:  content is generated and on device, but paced/calendar
//                      gated — show the real title (dimmed) plus when it
//                      unlocks.
//   - preparing:      content is missing and due today — genuinely still
//                      being written.
//   - coming-soon:    content is missing and not due yet.
// A paused series adds a fifth situation:
//   - not-prepared:   content is missing and will never arrive, because only
//                      the current series gets new days.
// A read day adds a sixth, in any series:
//   - restore:        the day was read, but this device has only a local
//                      copy of it. It opens, and the reader restores it.
export function getDayMenuPresentation(
  devotional: Devotional | null | undefined,
  dayNumber: number,
  now = new Date(),
  seriesPaused = false,
): DayMenuPresentation {
  const fallbackTitle = `Day ${dayNumber}`;

  if (!devotional) {
    return { kind: 'coming-soon', title: 'Coming soon' };
  }

  if (isPausedSeriesUnpreparedDay(devotional, dayNumber, seriesPaused)) {
    return { kind: 'not-prepared', title: 'Not prepared' };
  }

  const renderable = selectRenderableDevotionalDay(devotional, dayNumber);
  const contentIsReady = renderable.status === 'ready';

  if (canOpenDevotionalDay(devotional, dayNumber, now)) {
    return contentIsReady
      ? { kind: 'ready', title: renderable.day.title || fallbackTitle }
      : { kind: 'restore', title: 'Tap to restore reading' };
  }

  if (contentIsReady) {
    return {
      kind: 'locked-titled',
      title: renderable.day.title || fallbackTitle,
      unlockLabel: getUnlockLabel(devotional, dayNumber, now),
    };
  }

  const calendarDayNumber = getCalendarDayNumber(devotional, now);
  const isDueToday = calendarDayNumber != null
    && dayNumber <= calendarDayNumber
    && dayNumber <= getTodayReaderDayNumber(devotional, now);

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
