import type { CheckIn, Devotional, DevotionalDay } from '@/lib/store';
import {
  decideEveningWindDownEntry,
  findTodayMiddayCheckIn,
  resolveEveningLoadingCaption,
  resolveEveningWindDownDayNumber,
  resolveEveningWindDownReadiness,
} from '../evening-wind-down-state';

// Evening of a day on which Day 6 was read in the morning; the store has
// advanced currentDay to 7, the readable day, which is where the afternoon
// check-in was recorded.
const NOW = new Date('2026-05-11T20:30:00');

function day(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning was the Word.',
    bodyText: 'Body',
    quotableLine: 'Quote.',
    isRead: false,
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'Series',
    totalDays: 7,
    currentDay: 7,
    days: [
      day(5, { isRead: true, readAt: '2026-05-10T08:00:00' }),
      day(6, { isRead: true, readAt: '2026-05-11T08:05:00' }),
      day(7),
    ],
    createdAt: '2026-05-05T08:00:00',
    generationMode: 'progressive',
    userContext: {
      name: 'Nick',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    ...overrides,
  };
}

function checkIn(overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    id: 'ci-1',
    devotionalId: 'dev-1',
    dayNumber: 7,
    mood: 4,
    moodLabel: 'Good',
    chipAnswer: 'Grateful',
    createdAt: '2026-05-11T14:10:00',
    timeOfDay: 'midday',
    ...overrides,
  };
}

describe('findTodayMiddayCheckIn', () => {
  it("finds today's midday check-in by date although it was recorded against the readable day", () => {
    const afternoon = checkIn({ dayNumber: 7 });

    expect(findTodayMiddayCheckIn([afternoon], 'dev-1', 6, NOW)).toBe(afternoon);
  });

  it('prefers the newest of several check-ins made today', () => {
    const earlier = checkIn({ id: 'ci-early', createdAt: '2026-05-11T12:05:00' });
    const later = checkIn({ id: 'ci-late', createdAt: '2026-05-11T15:40:00' });

    expect(findTodayMiddayCheckIn([earlier, later], 'dev-1', 6, NOW)).toBe(later);
  });

  it('ignores evening check-ins and other devotionals', () => {
    const evening = checkIn({ id: 'ci-evening', timeOfDay: 'evening' });
    const other = checkIn({ id: 'ci-other', devotionalId: 'dev-2' });

    expect(findTodayMiddayCheckIn([evening, other], 'dev-1', 6, NOW)).toBeUndefined();
  });

  it('falls back to the evening-day lookup when nothing was recorded today', () => {
    const yesterdayForDay6 = checkIn({ id: 'ci-yesterday', dayNumber: 6, createdAt: '2026-05-10T13:00:00' });
    const olderForDay5 = checkIn({ id: 'ci-older', dayNumber: 5, createdAt: '2026-05-09T13:00:00' });

    expect(findTodayMiddayCheckIn([olderForDay5, yesterdayForDay6], 'dev-1', 6, NOW)).toBe(yesterdayForDay6);
    expect(findTodayMiddayCheckIn([olderForDay5], 'dev-1', 6, NOW)).toBeUndefined();
    expect(findTodayMiddayCheckIn([yesterdayForDay6], 'dev-1', null, NOW)).toBeUndefined();
  });

  it('treats an unparsable timestamp as not today', () => {
    const broken = checkIn({ id: 'ci-broken', dayNumber: 6, createdAt: 'not-a-date' });

    // Not matched by date, still reachable through the day-number fallback.
    expect(findTodayMiddayCheckIn([broken], 'dev-1', 6, NOW)).toBe(broken);
    expect(findTodayMiddayCheckIn([broken], 'dev-1', 7, NOW)).toBeUndefined();
  });
});

describe('resolveEveningWindDownDayNumber', () => {
  it('honours a requested day the devotional actually has', () => {
    expect(resolveEveningWindDownDayNumber(devotional(), 6, NOW)).toBe(6);
    expect(resolveEveningWindDownDayNumber(devotional(), 5, NOW)).toBe(5);
  });

  it('falls back to the day completed today when the requested day does not exist', () => {
    expect(resolveEveningWindDownDayNumber(devotional(), 12, NOW)).toBe(6);
  });

  it('targets the day completed today without a param', () => {
    expect(resolveEveningWindDownDayNumber(devotional(), null, NOW)).toBe(6);
  });

  it('targets today\'s readable day when nothing was finished today', () => {
    // getEveningWindDownDayNumber falls back to the last completed day. That
    // made the unread prompt claim Day 5 was unfinished and sent Read it now
    // at a reading finished yesterday.
    const d = devotional({
      currentDay: 6,
      days: [day(5, { isRead: true, readAt: '2026-05-10T08:00:00' }), day(6)],
    });
    expect(resolveEveningWindDownDayNumber(d, null, NOW)).toBe(6);
    expect(resolveEveningWindDownReadiness(d, 6, NOW)).toBe('unread');
  });

  it('does not treat a completed-yesterday day as this morning\'s reading', () => {
    const d = devotional({
      currentDay: 6,
      days: [day(5, { isRead: true, readAt: '2026-05-10T08:00:00' }), day(6)],
    });
    expect(resolveEveningWindDownReadiness(d, 5, NOW)).toBe('unread');
  });

  it('is preparing when the series has no days yet', () => {
    const d = devotional({ currentDay: 1, days: [] });
    expect(resolveEveningWindDownDayNumber(d, null, NOW)).toBe(1);
    expect(resolveEveningWindDownReadiness(d, 1, NOW)).toBe('preparing');
  });

  it('opens recovery for the current progressive day when only yesterday exists', () => {
    const d = devotional({
      currentDay: 6,
      generationMode: 'progressive',
      seriesStartDate: '2026-05-06T00:00:00',
      days: [day(5, { isRead: true, readAt: '2026-05-10T08:00:00' })],
    });
    const target = resolveEveningWindDownDayNumber(d, null, NOW);
    expect(target).toBe(6);
    expect(resolveEveningWindDownReadiness(d, target, NOW)).toBe('preparing');
  });

  it('keeps the requested day (or 1) when there is no devotional to validate against', () => {
    expect(resolveEveningWindDownDayNumber(null, 3, NOW)).toBe(3);
    expect(resolveEveningWindDownDayNumber(undefined, null, NOW)).toBe(1);
  });
});

describe('decideEveningWindDownEntry', () => {
  it('loads for a granted policy, waits while unknown, gates when denied', () => {
    expect(decideEveningWindDownEntry('granted')).toBe('allow');
    expect(decideEveningWindDownEntry('unknown')).toBe('wait');
    expect(decideEveningWindDownEntry('denied')).toBe('gate');
  });
});

describe('resolveEveningLoadingCaption', () => {
  it("says what is happening while the entitlement is still resolving", () => {
    // The examen query is disabled in 'wait', so the spinner is not waiting on
    // a prayer — and it can sit there all session when the identity sync fails.
    expect(resolveEveningLoadingCaption('wait')).toBe('Checking your subscription…');
  });

  it('keeps the prayer copy while the examen is actually loading', () => {
    expect(resolveEveningLoadingCaption('allow')).toBe('Preparing your evening prayer...');
    expect(resolveEveningLoadingCaption('gate')).toBe('Preparing your evening prayer...');
  });
});

describe('resolveEveningWindDownReadiness', () => {
  it('is ready when the day on screen is the day finished today', () => {
    // The fixture has day 6 read this morning, and NOW is that evening.
    expect(resolveEveningWindDownReadiness(devotional(), 6, NOW)).toBe('ready');
  });

  it('is unread when nothing was read today', () => {
    // Reported 2026-09-12: the evening push deep-links past Today's
    // hasReadToday gate, so an unread day still produced an examen announced
    // as reflecting on "the reading this morning".
    const d = devotional({ currentDay: 1, days: [day(1)] });
    expect(resolveEveningWindDownReadiness(d, 1, NOW)).toBe('unread');
  });

  it('is unread mid-series when the reader skipped today', () => {
    // The hole that made the first fix almost useless. getEveningWindDownDayNumber
    // falls back to getHighestReadDayNumber, which hands back a day that IS
    // read, so asking only "is the target day read" answered yes for every
    // reader past day 1 and the gate never fired.
    const d = devotional({
      currentDay: 6,
      days: [day(5, { isRead: true, readAt: '2026-05-10T08:00:00' })],
    });
    expect(resolveEveningWindDownReadiness(d, 5, NOW)).toBe('unread');
  });

  it('is unread when a link names a different day than the one read today', () => {
    // Day 6 read today must not authorise an examen about Day 7. dayNumber is
    // deep-link allowlisted and wins in resolveEveningWindDownDayNumber.
    expect(resolveEveningWindDownReadiness(devotional(), 7, NOW)).toBe('unread');
  });

  it('is unread without a devotional at all', () => {
    // The resolver answers only "was this day finished today", so no
    // devotional is trivially unread. The SCREEN must not route on that
    // alone: with no series there is no day to send anyone to, so
    // evening-wind-down.tsx additionally requires currentDevotional and
    // currentDay before showing the prompt, and falls through to the
    // "Start a devotional" empty state otherwise.
    expect(resolveEveningWindDownReadiness(null, 1, NOW)).toBe('unread');
  });
});
