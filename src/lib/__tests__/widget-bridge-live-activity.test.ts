/**
 * NAT-5: reading-session Live Activity lifecycle.
 *
 * The Live Activity ref lives only in JS. If the app is killed mid-session,
 * the system-side activity lingers on the lock screen forever. The bridge
 * must (a) end the tracked activity on endReadingSession(), and (b) sweep
 * orphaned instances from a previous app run at cold start.
 */

const mockStart = jest.fn();
const mockGetInstances = jest.fn(() => [] as { end: jest.Mock }[]);

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
jest.mock('@/widgets/ios/UnfoldReadingSession', () => ({
  __esModule: true,
  default: {
    start: (...args: unknown[]) => mockStart(...args),
    getInstances: () => mockGetInstances(),
  },
}));

jest.mock('@/lib/widget-timeline', () => ({
  buildWidgetTimelineEntries: jest.fn(() => []),
  getWeeklyProgress: jest.fn(() => '0,0,0,0,0,0,0'),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: {
    getState: () => ({
      streakCurrent: 3,
      streakLongest: 10,
      streakLastReadDate: null,
      user: null,
      devotionals: [],
      getCurrentDevotional: () => null,
    }),
  },
}));

// Keep Live Activities enabled: the bridge's simulator detection reads
// expo-constants at import time and disables itself when isDevice is falsy.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { isDevice: true, executionEnvironment: 'bare' },
}));

import {
  startReadingSession,
  endReadingSession,
  endOrphanedReadingSessions,
  isReadingSessionActive,
} from '@/lib/widget-bridge';

function makeActivity() {
  return { end: jest.fn(() => Promise.resolve()), update: jest.fn() };
}

const START_PARAMS = {
  devotionalTitle: 'Test Series',
  dayTitle: 'Day 1',
  dayNumber: 1,
  totalDays: 7,
  totalMinutes: 5,
  isListening: true,
};

beforeEach(() => {
  jest.useFakeTimers();
  mockStart.mockReset();
  mockGetInstances.mockReset().mockReturnValue([]);
  // Drain any session left tracked by a previous test
  endReadingSession();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('endOrphanedReadingSessions (NAT-5 cold-start sweep)', () => {
  it('ends every orphaned instance with immediate dismissal', () => {
    const orphans = [makeActivity(), makeActivity()];
    mockGetInstances.mockReturnValue(orphans);

    endOrphanedReadingSessions();

    for (const orphan of orphans) {
      expect(orphan.end).toHaveBeenCalledWith('immediate');
    }
  });

  it('is a no-op when there are no instances', () => {
    endOrphanedReadingSessions();
    expect(mockGetInstances).toHaveBeenCalled();
  });

  it('does not sweep while a session started this run is active', () => {
    const live = makeActivity();
    mockStart.mockReturnValue(live);
    startReadingSession(START_PARAMS);
    jest.runAllTimers(); // start() is deferred a tick

    expect(isReadingSessionActive()).toBe(true);

    mockGetInstances.mockReturnValue([live]);
    endOrphanedReadingSessions();

    expect(live.end).not.toHaveBeenCalled();
  });

  it('survives a native getInstances error', () => {
    mockGetInstances.mockImplementation(() => {
      throw new Error('native boom');
    });
    expect(() => endOrphanedReadingSessions()).not.toThrow();
  });
});

describe('endReadingSession', () => {
  it('ends the tracked activity and clears the active flag', () => {
    const live = makeActivity();
    mockStart.mockReturnValue(live);
    startReadingSession(START_PARAMS);
    jest.runAllTimers();

    expect(isReadingSessionActive()).toBe(true);

    endReadingSession();

    expect(live.end).toHaveBeenCalledWith('default');
    expect(isReadingSessionActive()).toBe(false);
  });

  it('is safe to call with no active session', () => {
    expect(() => endReadingSession()).not.toThrow();
  });
});
