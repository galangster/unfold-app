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

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { useUnfoldStore, type Devotional, type DevotionalDay } from '../store';

const now = '2026-05-18T10:00:00.000Z';

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: `day-${overrides.dayNumber ?? 2}`,
    devotionalId: 'devotional-1',
    dayNumber: 2,
    title: 'A Revealed Day',
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'The Lord is my shepherd.',
    bodyText: 'A short devotional body.',
    quotableLine: 'Grace meets you here.',
    isRead: false,
    isRevealed: false,
    generatedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devotional-1',
    title: 'QA Series',
    totalDays: 3,
    currentDay: 2,
    days: [day({ dayNumber: 1, isRead: true, isRevealed: true }), day()],
    createdAt: now,
    userContext: {
      name: 'Nick',
      aboutMe: 'QA',
      currentSituation: 'Testing reveal state.',
      emotionalState: 'Focused',
    },
    generationMode: 'batch',
    ...overrides,
  };
}

describe('store reveal state', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    useUnfoldStore.getState().reset();
  });

  it('preserves revealed-but-unread days when generated content refreshes', () => {
    useUnfoldStore.getState().addDevotional(devotional());
    useUnfoldStore.getState().markDayAsRevealed('devotional-1', 2);

    useUnfoldStore.getState().updateDevotionalDays('devotional-1', [
      day({
        dayNumber: 2,
        title: 'Refreshed Day 2',
        isRead: false,
        isRevealed: false,
      }),
    ]);

    const refreshedDay = useUnfoldStore
      .getState()
      .devotionals.find((item) => item.id === 'devotional-1')
      ?.days.find((item) => item.dayNumber === 2);

    expect(refreshedDay).toMatchObject({
      title: 'Refreshed Day 2',
      isRead: false,
      isRevealed: true,
    });
  });

  it('marks completed days as revealed too', () => {
    useUnfoldStore.getState().addDevotional(devotional());

    useUnfoldStore.getState().markDayAsRead('devotional-1', 2);

    const completedDay = useUnfoldStore
      .getState()
      .devotionals.find((item) => item.id === 'devotional-1')
      ?.days.find((item) => item.dayNumber === 2);

    expect(completedDay).toMatchObject({
      isRead: true,
      isRevealed: true,
    });
  });

  it('does not stretch a progressive series or store over-boundary days past the server-owned arc length', () => {
    useUnfoldStore.getState().addDevotional(devotional({
      generationMode: 'progressive',
      totalDays: 14,
      currentDay: 14,
      days: Array.from({ length: 14 }, (_unused, index) => day({
        id: `day-devotional-1-${index + 1}`,
        devotionalId: 'devotional-1',
        dayNumber: index + 1,
        isRead: true,
        isRevealed: true,
      })),
      seriesArc: {
        totalDaysPlanned: 14,
        dayHints: Array.from({ length: 14 }, (_unused, index) => ({
          dayNumber: index + 1,
          themeHint: `Theme ${index + 1}`,
          scriptureRegion: 'Psalms',
          narrativeRole: 'deepening' as const,
        })),
        overarchingTheme: 'Boundary',
        narrativeShape: 'Arc',
        isOpenEnded: false,
        createdAt: now,
      },
    }));

    useUnfoldStore.getState().updateDevotionalDays('devotional-1', [
      day({
        id: 'day-devotional-1-15',
        devotionalId: 'devotional-1',
        dayNumber: 15,
        title: 'Over Boundary Day',
      }),
    ]);

    const updated = useUnfoldStore
      .getState()
      .devotionals.find((item) => item.id === 'devotional-1');

    expect(updated?.totalDays).toBe(14);
    expect(updated?.days.some((item) => item.dayNumber === 15)).toBe(false);
  });

  it('allows server-pulled days to extend non-arc devotionals beyond stale local totalDays', () => {
    useUnfoldStore.getState().addDevotional(devotional({
      generationMode: 'batch',
      totalDays: 1,
      currentDay: 1,
      days: [day({ dayNumber: 1, isRead: true, isRevealed: true })],
      seriesArc: undefined,
    }));

    useUnfoldStore.getState().updateDevotionalDays('devotional-1', [
      day({
        id: 'day-devotional-1-2',
        devotionalId: 'devotional-1',
        dayNumber: 2,
        title: 'Server Pulled Day 2',
      }),
    ]);

    const updated = useUnfoldStore
      .getState()
      .devotionals.find((item) => item.id === 'devotional-1');

    expect(updated?.totalDays).toBe(2);
    expect(updated?.days.some((item) => item.dayNumber === 2)).toBe(true);
  });
});
