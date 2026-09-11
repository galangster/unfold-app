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
import { useUnfoldStore, type Devotional } from '../store';
// eslint-disable-next-line import/first
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

const DEVOTIONAL_ID = 'devotional-1';

function devotional(): Devotional {
  return {
    id: DEVOTIONAL_ID,
    title: 'Series to delete',
    days: [
      { id: 'day-1', dayNumber: 1, title: 'Day 1', scriptureReference: 'John 1:1', scriptureText: '', reflection: '', prayer: '', isRead: true },
      { id: 'day-2', dayNumber: 2, title: 'Day 2', scriptureReference: 'John 1:2', scriptureText: '', reflection: '', prayer: '', isRead: false },
    ],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as unknown as Devotional;
}

describe('store.removeDevotional (Greptile A2)', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    useUnfoldStore.getState().reset();
    replaceSyncOutbox([]);
  });

  it('enqueues tombstones for the series, its days, and every owned personal row', () => {
    useUnfoldStore.setState({
      devotionals: [devotional()],
      currentDevotionalId: DEVOTIONAL_ID,
      journalEntries: [
        { id: 'journal-1', devotionalId: DEVOTIONAL_ID, dayNumber: 1, content: 'private', createdAt: 'x', updatedAt: 'x' },
        { id: 'journal-other', devotionalId: 'devotional-2', dayNumber: 1, content: 'keep', createdAt: 'x', updatedAt: 'x' },
      ],
      checkIns: [{ id: 'checkin-1', devotionalId: DEVOTIONAL_ID, dayNumber: 1, mood: 3, moodLabel: 'Okay', timeOfDay: 'morning', createdAt: 'x' }],
      highlights: [{ id: 'highlight-1', devotionalId: DEVOTIONAL_ID } as never],
      bookmarks: [{ id: 'bookmark-1', devotionalId: DEVOTIONAL_ID } as never],
    });

    useUnfoldStore.getState().removeDevotional(DEVOTIONAL_ID);

    const state = useUnfoldStore.getState();
    expect(state.devotionals).toHaveLength(0);
    expect(state.currentDevotionalId).toBeNull();
    expect(state.journalEntries.map((row) => row.id)).toEqual(['journal-other']);

    const tombstones = peekSyncOutbox().filter((change) => change.deleted);
    const keys = tombstones.map((change) => `${change.table}:${change.id}`).sort();
    expect(keys).toEqual([
      'bookmarks:bookmark-1',
      'check_ins:checkin-1',
      'devotional_days:day-1',
      'devotional_days:day-2',
      'devotionals:devotional-1',
      'highlights:highlight-1',
      'journal_entries:journal-1',
    ]);
    for (const change of tombstones) {
      expect(change.data).toEqual({});
      expect(typeof change.clientUpdatedAt).toBe('string');
    }
    expect(peekSyncOutbox().some((change) => change.id === 'journal-other')).toBe(false);
  });

  it('enqueues nothing for an unknown series id', () => {
    useUnfoldStore.getState().removeDevotional('missing');
    expect(peekSyncOutbox()).toHaveLength(0);
  });
});
