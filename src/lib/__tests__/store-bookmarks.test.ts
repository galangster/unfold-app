function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldBookmarkMmkv: Map<string, string> })
    .__unfoldBookmarkMmkv;
}

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  (globalThis as typeof globalThis & { __unfoldBookmarkMmkv: Map<string, string> })
    .__unfoldBookmarkMmkv = store;
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return true;
      }),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../bug-logger', () => ({ logBugError: jest.fn(), logBugEvent: jest.fn() }));
jest.mock('../sync-outbox', () => {
  const actual = jest.requireActual('../sync-outbox') as typeof import('../sync-outbox');
  return { ...actual, enqueueSyncChanges: jest.fn() };
});
jest.mock('../personal-data-sync-records', () => {
  const actual = jest.requireActual('../personal-data-sync-records') as typeof import('../personal-data-sync-records');
  return { ...actual, enqueuePersonalDataSyncChange: jest.fn() };
});

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { flushUnfoldStorePersist, useUnfoldStore, type Bookmark } from '../store';
import { bookmarkIdentity } from '../bookmark-identity';

const base = {
  devotionalId: 'devotional-1',
  devotionalTitle: 'A Quiet Path',
  dayNumber: 2,
  dayTitle: 'Held in Grace',
};

describe('store bookmark identity', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    useUnfoldStore.getState().reset();
  });

  it('stores Scripture and quote bookmarks independently and deduplicates an exact identity', () => {
    const store = useUnfoldStore.getState();
    store.addBookmark({
      ...base,
      kind: 'quote',
      key: 'Carry this line',
      scriptureReference: 'Quote',
      scriptureText: 'Carry this line',
    });
    store.addBookmark({
      ...base,
      kind: 'scripture',
      key: 'John 3:16',
      scriptureReference: 'John 3:16',
      scriptureText: 'For God so loved the world.',
      translation: 'BSB',
    });

    expect(useUnfoldStore.getState().isBookmarked({
      devotionalId: 'devotional-1', dayNumber: 2, kind: 'quote', key: 'Carry this line',
    })).toBe(true);
    expect(useUnfoldStore.getState().isBookmarked({
      devotionalId: 'devotional-1', dayNumber: 2, kind: 'scripture', key: 'John 3:16',
    })).toBe(true);

    store.addBookmark({
      ...base,
      kind: 'scripture',
      key: 'John 3:16',
      scriptureReference: 'John 3:16',
      scriptureText: 'For God so loved the world.',
      translation: 'BSB',
    });
    expect(useUnfoldStore.getState().bookmarks).toHaveLength(2);

    const scripture = useUnfoldStore.getState().bookmarks.find((bookmark) => bookmark.kind === 'scripture');
    useUnfoldStore.getState().removeBookmark(scripture!.id);
    expect(useUnfoldStore.getState().bookmarks).toHaveLength(1);
    expect(useUnfoldStore.getState().bookmarks[0]).toMatchObject({ kind: 'quote', key: 'Carry this line' });
  });

  it('matches and removes a legacy bookmark through its derived identity', () => {
    const legacy: Bookmark = {
      id: 'legacy-context',
      ...base,
      scriptureReference: 'Historical Context',
      scriptureText: 'Rome governed the region.',
      quotedText: 'Rome governed the region.',
      savedAt: '2026-09-20T00:00:00.000Z',
    };
    useUnfoldStore.setState({ bookmarks: [legacy] });

    expect(useUnfoldStore.getState().isBookmarked({
      devotionalId: 'devotional-1',
      dayNumber: 2,
      kind: 'context',
      key: 'Rome governed the region.',
    })).toBe(true);

    useUnfoldStore.getState().removeBookmark('legacy-context');
    expect(useUnfoldStore.getState().bookmarks).toEqual([]);
  });

  it('removes every bookmark with the same identity while preserving other items', () => {
    const first: Bookmark = {
      id: 'scripture-device-a',
      ...base,
      kind: 'scripture',
      key: 'John 3:16',
      scriptureReference: 'John 3:16',
      scriptureText: 'For God so loved the world.',
      translation: 'KJV',
      savedAt: '2026-09-28T10:00:00.000Z',
    };
    const duplicate: Bookmark = {
      ...first,
      id: 'scripture-device-b',
      scriptureText: 'For God so loved the world in another translation.',
      translation: 'BSB',
      savedAt: '2026-09-28T10:01:00.000Z',
    };
    const other: Bookmark = {
      id: 'quote-device-a',
      ...base,
      kind: 'quote',
      key: 'Carry this line.',
      scriptureReference: 'Quote',
      scriptureText: 'Carry this line.',
      quotedText: 'Carry this line.',
      savedAt: '2026-09-28T10:02:00.000Z',
    };
    useUnfoldStore.setState({ bookmarks: [first, duplicate, other] });

    useUnfoldStore.getState().removeBookmark('scripture-device-a');

    expect(useUnfoldStore.getState().bookmarks).toEqual([other]);
  });

  it('reconstructs every bookmark kind from the seven sync fields without duplicates', () => {
    const originals: Bookmark[] = [
      {
        id: 'scripture-id',
        ...base,
        kind: 'scripture',
        key: 'JOHN 3:16–17',
        scriptureReference: 'John 3:16–17',
        scriptureText: 'For God so loved the world.',
        translation: 'KJV',
        savedAt: '2026-09-28T10:00:00.000Z',
      },
      {
        id: 'quote-id',
        ...base,
        kind: 'quote',
        key: 'Carry this line.',
        scriptureReference: 'Quote',
        scriptureText: 'Carry this line.',
        quotedText: 'Carry this line.',
        savedAt: '2026-09-28T10:01:00.000Z',
      },
      {
        id: 'context-id',
        ...base,
        kind: 'context',
        key: 'Rome governed the region.',
        scriptureReference: 'Historical Context',
        scriptureText: 'Rome governed the region.',
        quotedText: 'Rome governed the region.',
        savedAt: '2026-09-28T10:02:00.000Z',
      },
      {
        id: 'word-study-id',
        ...base,
        kind: 'word-study',
        key: 'Agape means self-giving love.',
        scriptureReference: 'Word Study',
        scriptureText: 'Agape means self-giving love.',
        quotedText: 'Agape means self-giving love.',
        savedAt: '2026-09-28T10:03:00.000Z',
      },
    ];
    const storedRows = originals.map((bookmark) => ({
      devotional_id: bookmark.devotionalId,
      devotional_title: bookmark.devotionalTitle,
      day_number: bookmark.dayNumber,
      day_title: bookmark.dayTitle,
      scripture_reference: bookmark.scriptureReference,
      scripture_text: bookmark.scriptureText,
      saved_at: bookmark.savedAt,
    }));
    expect(storedRows).toEqual([
      { devotional_id: 'devotional-1', devotional_title: 'A Quiet Path', day_number: 2, day_title: 'Held in Grace', scripture_reference: 'John 3:16–17', scripture_text: 'For God so loved the world.', saved_at: '2026-09-28T10:00:00.000Z' },
      { devotional_id: 'devotional-1', devotional_title: 'A Quiet Path', day_number: 2, day_title: 'Held in Grace', scripture_reference: 'Quote', scripture_text: 'Carry this line.', saved_at: '2026-09-28T10:01:00.000Z' },
      { devotional_id: 'devotional-1', devotional_title: 'A Quiet Path', day_number: 2, day_title: 'Held in Grace', scripture_reference: 'Historical Context', scripture_text: 'Rome governed the region.', saved_at: '2026-09-28T10:02:00.000Z' },
      { devotional_id: 'devotional-1', devotional_title: 'A Quiet Path', day_number: 2, day_title: 'Held in Grace', scripture_reference: 'Word Study', scripture_text: 'Agape means self-giving love.', saved_at: '2026-09-28T10:03:00.000Z' },
    ]);

    const rebuilt: Bookmark[] = storedRows.map((row, index) => ({
      id: ['scripture-id', 'quote-id', 'context-id', 'word-study-id'][index],
      devotionalId: row.devotional_id,
      devotionalTitle: row.devotional_title,
      dayNumber: row.day_number,
      dayTitle: row.day_title,
      scriptureReference: row.scripture_reference,
      scriptureText: row.scripture_text,
      savedAt: row.saved_at,
    }));
    useUnfoldStore.setState({ bookmarks: rebuilt });

    expect(rebuilt.map(bookmarkIdentity)).toEqual([
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'scripture', key: 'john 3:16-17' },
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'quote', key: 'Carry this line.' },
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'context', key: 'Rome governed the region.' },
      { devotionalId: 'devotional-1', dayNumber: 2, kind: 'word-study', key: 'Agape means self-giving love.' },
    ]);

    for (const original of originals) {
      const { id: _id, savedAt: _savedAt, ...input } = original;
      useUnfoldStore.getState().addBookmark(input);
    }
    expect(useUnfoldStore.getState().bookmarks).toHaveLength(4);

    const identities = rebuilt.map(bookmarkIdentity);
    rebuilt.forEach((bookmark, index) => {
      useUnfoldStore.getState().removeBookmark(bookmark.id);
      expect(useUnfoldStore.getState().isBookmarked(identities[index])).toBe(false);
    });
    expect(useUnfoldStore.getState().bookmarks).toEqual([]);
  });

  it('rehydrates the dismissed Scripture highlight hint into a fresh state', async () => {
    expect(useUnfoldStore.getState().hasSeenScriptureHighlightHint).toBe(false);
    useUnfoldStore.getState().setHasSeenScriptureHighlightHint();
    flushUnfoldStorePersist();

    const persisted = getMockMmkvStore().get('unfold-storage')!;
    useUnfoldStore.setState({ hasSeenScriptureHighlightHint: false });
    flushUnfoldStorePersist();
    expect(useUnfoldStore.getState().hasSeenScriptureHighlightHint).toBe(false);
    getMockMmkvStore().set('unfold-storage', persisted);

    await useUnfoldStore.persist.rehydrate();
    expect(useUnfoldStore.getState().hasSeenScriptureHighlightHint).toBe(true);
  });
});
