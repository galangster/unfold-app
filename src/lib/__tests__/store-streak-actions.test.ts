import type { PremiumAccessPolicy } from '../premium-access-policy';

function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

type PolicyHolder = typeof globalThis & { __unfoldMockPremiumPolicy?: PremiumAccessPolicy };

function setMockPremiumPolicy(policy: PremiumAccessPolicy): void {
  (globalThis as PolicyHolder).__unfoldMockPremiumPolicy = policy;
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

// The store must consult the premium policy getter, not the persisted mirror.
jest.mock('../premium-state', () => ({
  getEffectivePremiumAccessPolicy: () =>
    (globalThis as PolicyHolder).__unfoldMockPremiumPolicy ?? 'unknown',
}));

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { useUnfoldStore, type UserProfile } from '../store';
// eslint-disable-next-line import/first
import { getWeekStart } from '../streak-helpers';

const NOW = new Date('2026-05-20T10:00:00.000Z'); // Wednesday
const YESTERDAY = new Date('2026-05-19T10:00:00.000Z');
const LAST_SUNDAY = new Date('2026-05-17T10:00:00.000Z');

function seedStreak(overrides: Partial<{
  streakCurrent: number;
  streakLastReadDate: string | null;
  streakGraceDaysUsedThisWeek: number;
  streakFreezes: number;
  streakLongest: number;
  user: UserProfile | null;
}> = {}) {
  useUnfoldStore.setState({
    streakCurrent: 6,
    streakLastReadDate: YESTERDAY.toISOString(),
    streakGraceDaysUsedThisWeek: 0,
    streakWeekStart: getWeekStart(NOW).toISOString(),
    streakWeekendAmnesty: true,
    streakFreezes: 0,
    streakLongest: 6,
    streakJustReset: false,
    ...overrides,
  });
}

function streakSnapshot() {
  const s = useUnfoldStore.getState();
  return {
    streakCurrent: s.streakCurrent,
    streakLastReadDate: s.streakLastReadDate,
    streakGraceDaysUsedThisWeek: s.streakGraceDaysUsedThisWeek,
    streakFreezes: s.streakFreezes,
    streakLongest: s.streakLongest,
    streakJustReset: s.streakJustReset,
  };
}

describe('store streak actions', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    useUnfoldStore.getState().reset();
    jest.useFakeTimers().setSystemTime(NOW);
    setMockPremiumPolicy('denied');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('recordStreakRead is a no-op when the user already read today', () => {
    seedStreak({ streakCurrent: 3, streakLastReadDate: NOW.toISOString(), streakLongest: 3 });
    setMockPremiumPolicy('granted');
    const before = streakSnapshot();

    useUnfoldStore.getState().recordStreakRead();

    expect(streakSnapshot()).toEqual(before);
  });

  it('recordStreakRead earns a freeze at the 7-day milestone when the policy is granted', () => {
    seedStreak();
    setMockPremiumPolicy('granted');

    useUnfoldStore.getState().recordStreakRead();

    expect(streakSnapshot()).toMatchObject({
      streakCurrent: 7,
      streakLongest: 7,
      streakFreezes: 1,
      streakLastReadDate: NOW.toISOString(),
    });
  });

  it('recordStreakRead earns nothing when the policy is denied, even if the persisted mirror says premium', () => {
    // A lapsed subscriber keeps user.isPremium=true in MMKV until RevenueCat
    // reports in; the engine must follow the policy the settings screen shows.
    seedStreak({ user: { isPremium: true } as unknown as UserProfile });
    setMockPremiumPolicy('denied');

    useUnfoldStore.getState().recordStreakRead();

    expect(streakSnapshot()).toMatchObject({ streakCurrent: 7, streakFreezes: 0 });
  });

  it("recordStreakRead treats an 'unknown' policy as not premium", () => {
    seedStreak({ user: { isPremium: true } as unknown as UserProfile });
    setMockPremiumPolicy('unknown');

    useUnfoldStore.getState().recordStreakRead();

    expect(streakSnapshot()).toMatchObject({ streakCurrent: 7, streakFreezes: 0 });
  });

  it('reconcileStreakState never consumes freezes or grace; the next read does', () => {
    // Last read Sunday, now Wednesday: Monday and Tuesday are missed weekdays.
    // The weekly grace covers one, a banked freeze covers the other.
    seedStreak({
      streakCurrent: 10,
      streakLongest: 10,
      streakLastReadDate: LAST_SUNDAY.toISOString(),
      streakFreezes: 2,
    });
    setMockPremiumPolicy('granted');

    useUnfoldStore.getState().reconcileStreakState();

    expect(streakSnapshot()).toMatchObject({
      streakCurrent: 10,
      streakFreezes: 2,
      streakGraceDaysUsedThisWeek: 0,
      streakJustReset: false,
    });

    useUnfoldStore.getState().recordStreakRead();

    expect(streakSnapshot()).toMatchObject({
      streakCurrent: 11,
      streakFreezes: 1,
      streakGraceDaysUsedThisWeek: 1,
    });
  });

  it('reconcileStreakState resets a streak the coverage cannot save and flags it', () => {
    seedStreak({
      streakCurrent: 10,
      streakLastReadDate: LAST_SUNDAY.toISOString(),
      streakFreezes: 0,
    });

    useUnfoldStore.getState().reconcileStreakState();

    expect(streakSnapshot()).toMatchObject({ streakCurrent: 0, streakJustReset: true, streakFreezes: 0 });
  });
});
