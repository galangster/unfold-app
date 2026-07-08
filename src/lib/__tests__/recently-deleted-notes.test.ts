/**
 * WR-15: Recently Deleted retention — delete keeps the note recoverable,
 * restore reuses the WR-04 un-tombstone path, migration seeds the slice.
 */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

import { useUnfoldStore } from '../store';
import { peekSyncOutbox, resetDrainStateForTesting } from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';
import { migrateUnfoldStore } from '../store-migrations';

beforeEach(() => {
  jest.clearAllMocks();
  (mmkvStorage as any).__clearMockStorage?.();
  resetDrainStateForTesting();
  useUnfoldStore.getState().reset();
});

describe('Recently Deleted notes (WR-15)', () => {
  it('delete keeps the note recoverable and restore un-tombstones it', async () => {
    const id = useUnfoldStore.getState().addNote({
      title: 'Keep me',
      content: '<p>Precious writing</p>',
      category: 'study',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });
    (mmkvStorage as any).__clearMockStorage?.();

    // Outbox dedup keeps the EXISTING entry on equal clientUpdatedAt, and a
    // warm test worker can run add+delete in the same millisecond — cross a
    // real ms boundary so the tombstone deterministically wins.
    await new Promise((resolve) => setTimeout(resolve, 3));

    useUnfoldStore.getState().deleteNote(id);
    let state = useUnfoldStore.getState();
    expect(state.notes).toHaveLength(0);
    expect(state.deletedNotes).toHaveLength(1);
    expect(state.deletedNotes[0].note.id).toBe(id);
    expect(peekSyncOutbox().some((c) => c.table === 'notes' && c.id === id && c.deleted)).toBe(true);

    useUnfoldStore.getState().restoreNote(id);
    state = useUnfoldStore.getState();
    expect(state.deletedNotes).toHaveLength(0);
    expect(state.notes.map((n) => n.id)).toContain(id);
    expect(state.notes.find((n) => n.id === id)?.content).toBe('<p>Precious writing</p>');
    const changes = peekSyncOutbox().filter((c) => c.table === 'notes' && c.id === id);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.deleted)).toBe(false);
  });

  it('restoreNote is a no-op for unknown ids', () => {
    useUnfoldStore.getState().restoreNote('nope');
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(useUnfoldStore.getState().deletedNotes).toHaveLength(0);
  });

  it('migration v38→39 seeds the deletedNotes slice', () => {
    const migrated = migrateUnfoldStore({ user: null }, 38) as { deletedNotes?: unknown[] };
    expect(Array.isArray(migrated.deletedNotes)).toBe(true);
  });
});
