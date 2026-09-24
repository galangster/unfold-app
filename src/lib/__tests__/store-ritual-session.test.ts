function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string) => {
        mockMmkvStore.set(key, value);
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../check-in-flush', () => ({
  flushCheckInToServer: jest.fn(async () => 'sent'),
}));

jest.mock('../personal-data-sync-records', () => {
  const actual = jest.requireActual('../personal-data-sync-records') as typeof import('../personal-data-sync-records');
  return {
    ...actual,
    enqueuePersonalDataSyncChange: jest.fn(),
  };
});

// eslint-disable-next-line import/first
import { useUnfoldStore, type Devotional, type DevotionalDay } from '../store';
import { resolveRitualCompletion } from '../ritual-session';

const MONDAY_NIGHT = new Date(2026, 8, 14, 23, 50, 0);
const TUESDAY_MORNING = new Date(2026, 8, 15, 0, 20, 0);
const THURSDAY_MORNING = new Date(2026, 8, 17, 8, 0, 0);

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 5,
    title: 'Stay with Monday',
    scriptureReference: 'John 14:27',
    scriptureText: 'Peace I leave with you.',
    bodyText: 'A short body.',
    quotableLine: 'Peace.',
    isRead: false,
    studyMethod: 'soap_journal',
    ...overrides,
  };
}

function series(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'Midnight series',
    totalDays: 7,
    currentDay: 5,
    days: [day({ dayNumber: 4, isRead: true }), day()],
    createdAt: '2026-09-10T00:00:00.000Z',
    userContext: {
      name: 'Ben',
      aboutMe: 'QA',
      currentSituation: 'Interrupted reading.',
      emotionalState: 'Tired',
    },
    generationMode: 'progressive',
    ...overrides,
  };
}

describe('store ritual session stamps', () => {
  beforeEach(() => {
    getMockMmkvStore()?.clear();
    useUnfoldStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reuses the same reading start clock across midnight', () => {
    jest.useFakeTimers().setSystemTime(MONDAY_NIGHT);
    useUnfoldStore.getState().beginRitualSession({
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
    });
    const first = useUnfoldStore.getState().ritualSessions.reading;
    expect(first?.startedAt).toBe(MONDAY_NIGHT.toISOString());

    jest.setSystemTime(TUESDAY_MORNING);
    useUnfoldStore.getState().beginRitualSession({
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
    });
    expect(useUnfoldStore.getState().ritualSessions.reading).toEqual(first);
  });

  it('starts a new reading clock when the same day is reopened days later', () => {
    jest.useFakeTimers().setSystemTime(MONDAY_NIGHT);
    useUnfoldStore.getState().beginRitualSession({
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
    });
    const abandoned = useUnfoldStore.getState().ritualSessions.reading;
    expect(abandoned?.startedAt).toBe(MONDAY_NIGHT.toISOString());

    jest.setSystemTime(THURSDAY_MORNING);
    useUnfoldStore.getState().beginRitualSession({
      kind: 'reading',
      devotionalId: 'dev-1',
      dayNumber: 5,
    });
    const reopened = useUnfoldStore.getState().ritualSessions.reading;
    expect(reopened).not.toEqual(abandoned);
    expect(reopened?.startedAt).toBe(THURSDAY_MORNING.toISOString());
  });

  it('credits tomorrow when a new series was previewed the evening before', () => {
    const previewedAt = new Date(2026, 8, 14, 20, 0, 0);
    const readAt = new Date(2026, 8, 15, 8, 0, 0);
    jest.useFakeTimers().setSystemTime(previewedAt);
    useUnfoldStore.setState({ streakCurrent: 7, streakLongest: 7, streakLastReadDate: previewedAt.toISOString() });
    useUnfoldStore.getState().addDevotional(series({ id: 'next-series', currentDay: 1, days: [day({ dayNumber: 1 })] }));
    const identity = { kind: 'reading' as const, devotionalId: 'next-series', dayNumber: 1 };
    useUnfoldStore.getState().beginRitualSession(identity);
    expect(useUnfoldStore.getState().streakCurrent).toBe(7);

    jest.setSystemTime(readAt);
    useUnfoldStore.getState().beginRitualSession(identity);
    const clock = resolveRitualCompletion({
      session: useUnfoldStore.getState().ritualSessions.reading,
      identity,
      completedAt: readAt,
    });
    useUnfoldStore.getState().markDayAsRead('next-series', 1, clock.iso);
    useUnfoldStore.getState().recordStreakRead(clock.at);

    expect(useUnfoldStore.getState().streakCurrent).toBe(8);
    expect(useUnfoldStore.getState().streakLastReadDate).toBe(readAt.toISOString());
    expect(useUnfoldStore.getState().devotionals[0].days[0].readAt).toBe(readAt.toISOString());
  });

  it('stamps readAt, streak, and check-in from the start calendar day', () => {
    useUnfoldStore.getState().addDevotional(series());
    useUnfoldStore.getState().markDayAsRead('dev-1', 5, MONDAY_NIGHT.toISOString());
    useUnfoldStore.getState().recordStreakRead(MONDAY_NIGHT);
    useUnfoldStore.getState().addCheckIn({
      devotionalId: 'dev-1',
      dayNumber: 5,
      mood: 3,
      moodLabel: 'completed',
      timeOfDay: 'evening',
      createdAt: MONDAY_NIGHT.toISOString(),
    });
    useUnfoldStore.getState().markEveningWindDownCompleted('2026-09-14');

    const state = useUnfoldStore.getState();
    expect(state.devotionals[0].days.find((row) => row.dayNumber === 5)?.readAt).toBe(
      MONDAY_NIGHT.toISOString(),
    );
    expect(state.streakLastReadDate).toBe(MONDAY_NIGHT.toISOString());
    expect(state.checkIns[0].createdAt).toBe(MONDAY_NIGHT.toISOString());
    expect(state.lastEveningCompletedDate).toBe('2026-09-14');
  });
});
