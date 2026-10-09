/**
 * RS10-1: syncWidgets() fingerprint guard.
 *
 * Two calls with identical shared-props inputs must collapse to a single
 * native updateTimeline call per widget. A state change must fire again.
 *
 * The inputs that drive the fingerprint are:
 *   streakCurrent, streakLastReadDate (→ hasReadToday),
 *   current day id/title/scripture, weeklyProgress (from allDevotionals).
 */

// ── Mock native widget modules — jest.fn() inside factory avoids hoisting ──
jest.mock('@/widgets/ios/UnfoldStreak', () => ({
  __esModule: true,
  default: { updateTimeline: jest.fn() },
}));
jest.mock('@/widgets/ios/UnfoldToday', () => ({
  __esModule: true,
  default: { updateTimeline: jest.fn() },
}));
jest.mock('@/widgets/ios/UnfoldDashboard', () => ({
  __esModule: true,
  default: { updateTimeline: jest.fn() },
}));
jest.mock('@/widgets/ios/UnfoldVerse', () => ({
  __esModule: true,
  default: { updateTimeline: jest.fn() },
}));
jest.mock('@/widgets/ios/UnfoldReadingSession', () => ({
  __esModule: true,
  default: { start: jest.fn(), end: jest.fn(), update: jest.fn() },
}));

// ── Mock widget-timeline ───────────────────────────────────────────────────────
// getWeeklyProgress is re-implemented minimally so fingerprint detects
// devotional readAt changes without depending on the real module.
jest.mock('@/lib/widget-timeline', () => ({
  getLockScreenProps: jest.requireActual('@/lib/widget-timeline').getLockScreenProps,
  getTodayReadingProps: jest.requireActual('@/lib/widget-timeline').getTodayReadingProps,
  getNextMidnight: jest.requireActual('@/lib/widget-timeline').getNextMidnight,
  buildWidgetTimelineEntries: jest.fn(() => [{ date: new Date(), props: {} }]),
  getWeeklyProgress: (
    devotionals: { days?: { readAt?: string }[] }[],
    forDate: Date
  ): string => {
    const dayOfWeek = forDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(forDate);
      d.setDate(d.getDate() + mondayOffset + i);
      const dateStr = d.toDateString();
      return devotionals.some((devo) =>
        (devo.days ?? []).some(
          (day) => day.readAt && new Date(day.readAt).toDateString() === dateStr
        )
      )
        ? '1'
        : '0';
    }).join(',');
  },
}));

// ── Logger no-op ──────────────────────────────────────────────────────────────
jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Zustand store stub — mutable object shared across tests ───────────────────
const mockStoreState = {
  streakCurrent: 3,
  streakLongest: 10,
  streakLastReadDate: null as string | null,
  user: null as null | { readingDuration: number },
  devotionals: [] as {
    id?: string;
    days?: { dayNumber?: number; title?: string; readAt?: string }[];
  }[],
  getCurrentDevotional: (): null | {
    id: string;
    currentDay: number;
    days?: {
      dayNumber: number;
      title?: string;
      scriptureReference?: string;
      scriptureText?: string;
    }[];
  } => null,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: { getState: () => mockStoreState },
}));

// ── Imports AFTER all mocks ───────────────────────────────────────────────────
import { syncWidgets, clearWidgets, resetWidgetSyncFingerprintForTesting } from '@/lib/widget-bridge';
import UnfoldStreakDefault from '@/widgets/ios/UnfoldStreak';
import UnfoldTodayDefault from '@/widgets/ios/UnfoldToday';
import UnfoldDashboardDefault from '@/widgets/ios/UnfoldDashboard';
import UnfoldVerseDefault from '@/widgets/ios/UnfoldVerse';

// Access mock functions from the already-mocked modules
function updateTimelineMocks(): jest.Mock[] {
  return [
    (UnfoldStreakDefault as unknown as { updateTimeline: jest.Mock }).updateTimeline,
    (UnfoldTodayDefault as unknown as { updateTimeline: jest.Mock }).updateTimeline,
    (UnfoldDashboardDefault as unknown as { updateTimeline: jest.Mock }).updateTimeline,
    (UnfoldVerseDefault as unknown as { updateTimeline: jest.Mock }).updateTimeline,
  ];
}

function totalUpdateTimelineCalls(): number {
  return updateTimelineMocks().reduce((acc, fn) => acc + fn.mock.calls.length, 0);
}

beforeEach(() => {
  updateTimelineMocks().forEach((fn) => fn.mockClear());
  resetWidgetSyncFingerprintForTesting();
  // Reset store state to baseline
  mockStoreState.streakCurrent = 3;
  mockStoreState.streakLongest = 10;
  mockStoreState.streakLastReadDate = null;
  mockStoreState.user = null;
  mockStoreState.devotionals = [];
  mockStoreState.getCurrentDevotional = () => null;
});

describe('clearWidgets (P3-4 full reset)', () => {
  it('pushes an empty timeline to every widget regardless of store state and resets the fingerprint', () => {
    mockStoreState.streakCurrent = 5;
    mockStoreState.getCurrentDevotional = () => ({ id: 'd1', currentDay: 2, days: [{ dayNumber: 2, title: 'Day 2' }] });
    syncWidgets();
    expect(totalUpdateTimelineCalls()).toBe(4);

    clearWidgets();
    expect(totalUpdateTimelineCalls()).toBe(8);

    const { buildWidgetTimelineEntries } = jest.requireMock('@/lib/widget-timeline') as {
      buildWidgetTimelineEntries: jest.Mock;
    };
    const calls = buildWidgetTimelineEntries.mock.calls;
    expect(calls[calls.length - 1][0]).toEqual({
      streakCurrent: 0,
      streakLongest: 0,
      streakLastReadDate: null,
      readingDuration: 5,
      currentDevotional: null,
      allDevotionals: [],
    });

    // Fingerprint was reset: an unchanged store still re-syncs afterwards.
    syncWidgets();
    expect(totalUpdateTimelineCalls()).toBe(12);
  });

  it('is non-fatal when a widget module throws', () => {
    updateTimelineMocks()[0].mockImplementationOnce(() => {
      throw new Error('no widget extension');
    });
    expect(() => clearWidgets()).not.toThrow();
  });
});

describe('syncWidgets fingerprint guard (RS10-1)', () => {
  it('two consecutive syncs with identical state → only ONE native updateTimeline call per widget', () => {
    syncWidgets();
    syncWidgets();

    // 4 widgets × 1 call each = 4 total (not 8)
    expect(totalUpdateTimelineCalls()).toBe(4);
  });

  it('state change (streakCurrent) → second sync fires updateTimeline again', () => {
    syncWidgets();
    mockStoreState.streakCurrent = 4;
    syncWidgets();

    // 4 widgets × 2 calls each = 8
    expect(totalUpdateTimelineCalls()).toBe(8);
  });

  it('state change (streakLastReadDate) → second sync fires updateTimeline again', () => {
    syncWidgets();
    mockStoreState.streakLastReadDate = '2026-06-10';
    syncWidgets();

    expect(totalUpdateTimelineCalls()).toBe(8);
  });

  it('state change (current day title) → second sync fires updateTimeline again', () => {
    const devo = { id: 'd1', currentDay: 1, days: [{ dayNumber: 1, title: 'Day 1' }] };
    mockStoreState.getCurrentDevotional = () => devo;
    syncWidgets();

    mockStoreState.getCurrentDevotional = () => ({
      ...devo,
      days: [{ dayNumber: 1, title: 'Day 1 Updated' }],
    });
    syncWidgets();

    expect(totalUpdateTimelineCalls()).toBe(8);
  });

  it('state change (current day scripture) → second sync fires updateTimeline again (UnfoldVerse)', () => {
    const day = {
      dayNumber: 1,
      title: 'Day 1',
      scriptureReference: 'Isaiah 40:28',
      scriptureText: 'Do you not know? Have you not heard?',
    };
    mockStoreState.getCurrentDevotional = () => ({ id: 'd1', currentDay: 1, days: [day] });
    syncWidgets();

    mockStoreState.getCurrentDevotional = () => ({
      id: 'd1',
      currentDay: 1,
      days: [{ ...day, scriptureText: 'The LORD is the everlasting God.' }],
    });
    syncWidgets();
    expect(totalUpdateTimelineCalls()).toBe(8);

    mockStoreState.getCurrentDevotional = () => ({
      id: 'd1',
      currentDay: 1,
      days: [
        {
          ...day,
          scriptureReference: 'Isaiah 40:28-31',
          scriptureText: 'The LORD is the everlasting God.',
        },
      ],
    });
    syncWidgets();
    expect(totalUpdateTimelineCalls()).toBe(12);
  });

  it('finishing the last day after reading another series that day → fires again (UnfoldVerse ring)', () => {
    jest.useFakeTimers({ now: new Date(2026, 5, 10, 14, 0) });
    try {
      // Series b was read this morning, so the streak and the week already show today.
      const readThisMorning = new Date(2026, 5, 10, 9, 0).toISOString();
      const other = { id: 'b', currentDay: 2, totalDays: 7, days: [{ dayNumber: 1, isRead: true, readAt: readThisMorning }] };
      const series = (lastDayRead: boolean) => ({
        id: 'a',
        currentDay: 7,
        totalDays: 7,
        days: Array.from({ length: 7 }, (_, i) => ({
          dayNumber: i + 1,
          title: `Day ${i + 1}`,
          scriptureReference: 'Psalm 23:1',
          scriptureText: 'The LORD is my shepherd; I shall not want.',
          isRead: i < 6 || lastDayRead,
          readAt: i < 6 ? new Date(2026, 5, 3 + i, 9, 0).toISOString() : lastDayRead ? new Date(2026, 5, 10, 13, 0).toISOString() : undefined,
        })),
      });
      mockStoreState.streakLastReadDate = readThisMorning;
      mockStoreState.devotionals = [other, series(false)];
      mockStoreState.getCurrentDevotional = () => series(false);
      syncWidgets();
      expect(totalUpdateTimelineCalls()).toBe(4);

      // Day 7 read: currentDay cannot advance past the last day, and the
      // streak (already read today) and the week do not change.
      mockStoreState.devotionals = [other, series(true)];
      mockStoreState.getCurrentDevotional = () => series(true);
      syncWidgets();
      expect(totalUpdateTimelineCalls()).toBe(8);
    } finally {
      jest.useRealTimers();
    }
  });

  it('state change (weeklyProgress via devotionals readAt) → second sync fires updateTimeline again', () => {
    syncWidgets();
    mockStoreState.devotionals = [
      { id: 'd1', days: [{ readAt: new Date().toISOString() }] },
    ];
    syncWidgets();

    expect(totalUpdateTimelineCalls()).toBe(8);
  });

  it('state change (readingDuration / readingMinutes) → second sync fires updateTimeline again (FAP-LIB-4)', () => {
    // Baseline: user with readingDuration=5
    mockStoreState.user = { readingDuration: 5 };
    syncWidgets();

    // Change reading duration — widgets render this value (totalMinutes) so
    // the fingerprint must include it to trigger a re-sync.
    mockStoreState.user = { readingDuration: 15 };
    syncWidgets();

    // 4 widgets × 2 calls = 8
    expect(totalUpdateTimelineCalls()).toBe(8);
  });

  it('same readingDuration repeated → second sync does not fire updateTimeline again', () => {
    mockStoreState.user = { readingDuration: 15 };
    syncWidgets();
    syncWidgets(); // identical state

    expect(totalUpdateTimelineCalls()).toBe(4);
  });

  it('three syncs: first fires, second and third (same state) skip', () => {
    syncWidgets();
    syncWidgets();
    syncWidgets();

    // Only the first fires: 4 widgets × 1 call = 4
    expect(totalUpdateTimelineCalls()).toBe(4);
  });
});

describe('syncWidgets follows the day Today shows', () => {
  const readThisMorning = new Date(2026, 9, 7, 8, 0).toISOString();
  // Day 5 was read this morning, so advanceDay moved currentDay to Day 6.
  const series = ({ day5Title = 'Title 5', withDay6 = false } = {}) => ({
    id: 'd1',
    currentDay: 6,
    totalDays: 7,
    days: [
      ...[1, 2, 3, 4, 5].map((n) => ({
        dayNumber: n,
        title: n === 5 ? day5Title : `Title ${n}`,
        scriptureReference: `Psalm ${n}:1`,
        scriptureText: `Verse ${n}.`,
        quotableLine: `Line ${n}`,
        isRead: true,
        readAt: n === 5 ? readThisMorning : new Date(2026, 9, 2 + n, 8, 0).toISOString(),
      })),
      ...(withDay6
        ? [{ dayNumber: 6, title: 'Title 6', scriptureReference: 'Psalm 6:1', scriptureText: 'Verse 6.', quotableLine: 'Line 6', isRead: false }]
        : []),
    ],
  });
  function showSeries(devotional: ReturnType<typeof series>) {
    mockStoreState.streakLastReadDate = readThisMorning;
    mockStoreState.devotionals = [devotional];
    mockStoreState.getCurrentDevotional = () => devotional;
  }

  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 7, 14, 0) }));
  afterEach(() => jest.useRealTimers());

  it('pushes the day read today, then pushes once more when the next day lands', () => {
    const { buildWidgetTimelineEntries } = jest.requireMock('@/lib/widget-timeline') as {
      buildWidgetTimelineEntries: jest.Mock;
    };
    buildWidgetTimelineEntries.mockImplementation(
      jest.requireActual('@/lib/widget-timeline').buildWidgetTimelineEntries
    );
    try {
      const todayWidget = (UnfoldTodayDefault as unknown as { updateTimeline: jest.Mock }).updateTimeline;
      const titles = (call: number) =>
        (todayWidget.mock.calls[call][0] as { props: { dayTitle: string } }[]).map((e) => e.props.dayTitle);

      showSeries(series());
      syncWidgets();
      syncWidgets();
      expect(todayWidget).toHaveBeenCalledTimes(1);
      expect(titles(0)).toEqual(['Title 5', 'Day 6 isn’t available yet']);

      // The focus pull or the day watch lands Day 6 on the device.
      showSeries(series({ withDay6: true }));
      syncWidgets();
      expect(todayWidget).toHaveBeenCalledTimes(2);
      expect(titles(1)).toEqual(['Title 5', 'Title 6']);
      expect(todayWidget.mock.calls[1][0][0].props.nextDayTitle).toBe('Title 6');
    } finally {
      buildWidgetTimelineEntries.mockImplementation(() => [{ date: new Date(), props: {} }]);
    }
  });

  it('pushes again when the day read today changes, though currentDay did not', () => {
    showSeries(series());
    syncWidgets();

    showSeries(series({ day5Title: 'Title 5, as the server wrote it' }));
    syncWidgets();
    expect(totalUpdateTimelineCalls()).toBe(8);
  });
});
