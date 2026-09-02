import type { CheckIn, Devotional, DevotionalDay } from '@/lib/store';
import {
  decideEveningWindDownEntry,
  findTodayMiddayCheckIn,
  resolveEveningWindDownDayNumber,
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
