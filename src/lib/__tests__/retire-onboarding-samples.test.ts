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

// eslint-disable-next-line import/first
import { useUnfoldStore, type Devotional, type DevotionalDay } from '../store';

const now = '2026-09-10T12:00:00.000Z';

function day(devotionalId: string, dayNumber: number): DevotionalDay {
  return {
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'The Lord is my shepherd.',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: false,
    devotionalId,
  };
}

function devotional(id: string, title: string): Devotional {
  return {
    id,
    title,
    totalDays: 3,
    currentDay: 1,
    days: [day(id, 1)],
    createdAt: now,
    userContext: {
      name: 'Nick',
      aboutMe: 'QA',
      currentSituation: 'Testing retirement.',
      emotionalState: 'Focused',
    },
    generationMode: 'batch',
  };
}

describe('J11 retireOnboardingSamples', () => {
  beforeEach(() => {
    getMockMmkvStore()?.clear();
    useUnfoldStore.getState().reset();
  });

  it('removes only sample devotionals and their days, keeps workbook rows, and repoints current', () => {
    const sample = devotional('onboarding-sample-user-1', 'Sample');
    const kept = devotional('auto-trial-1', 'Auto');
    useUnfoldStore.setState({
      devotionals: [sample, kept],
      currentDevotionalId: sample.id,
      journalEntries: [{
        id: 'journal-1',
        devotionalId: sample.id,
        dayNumber: 1,
        content: 'kept journal',
        createdAt: now,
        updatedAt: now,
      }],
      checkIns: [{
        id: 'check-1',
        devotionalId: sample.id,
        dayNumber: 1,
        mood: 4,
        moodLabel: 'steady',
        createdAt: now,
        timeOfDay: 'midday',
      }],
      highlights: [{
        id: 'highlight-1',
        devotionalId: sample.id,
        devotionalTitle: sample.title,
        dayNumber: 1,
        dayTitle: 'Day 1',
        highlightedText: 'kept highlight',
        createdAt: now,
      }],
      bookmarks: [{
        id: 'bookmark-1',
        devotionalId: sample.id,
        devotionalTitle: sample.title,
        dayNumber: 1,
        dayTitle: 'Day 1',
        scriptureReference: 'Psalm 23:1',
        scriptureText: 'The Lord is my shepherd.',
        savedAt: now,
      }],
    });

    useUnfoldStore.getState().retireOnboardingSamples({ keepId: kept.id });

    const state = useUnfoldStore.getState();
    expect(state.devotionals.map((d) => d.id)).toEqual([kept.id]);
    expect(state.devotionals[0].days).toHaveLength(1);
    expect(state.currentDevotionalId).toBe(kept.id);
    expect(state.journalEntries).toHaveLength(1);
    expect(state.checkIns).toHaveLength(1);
    expect(state.highlights).toHaveLength(1);
    expect(state.bookmarks).toHaveLength(1);
  });

  it('is a no-op without a sample', () => {
    const kept = devotional('real-series-1', 'Real');
    useUnfoldStore.setState({
      devotionals: [kept],
      currentDevotionalId: kept.id,
    });

    useUnfoldStore.getState().retireOnboardingSamples({ keepId: kept.id });

    expect(useUnfoldStore.getState().devotionals).toEqual([kept]);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(kept.id);
  });
});
