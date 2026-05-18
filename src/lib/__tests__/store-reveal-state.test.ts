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
});
