/**
 * "Move to no folder" and "delete folder (keep notes)" clear a note's
 * folderId locally, but the sync record dropped the key entirely (compact()
 * removes undefined). /api/sync/push applies an explicit null and ignores a
 * missing key, so every other device kept the old folder — including a
 * tombstoned one. The same held for a folder moved back to the root
 * (parentId). The records now carry an explicit null.
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
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
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
    isRecoverySession: jest.fn(() => false),
  };
});

import { noteFolderSyncData, noteSyncData } from '../personal-data-sync-records';
import { useUnfoldStore } from '../store';
import { peekSyncOutbox } from '../sync-outbox';

const noteChange = (id: string) => peekSyncOutbox().find((c) => c.table === 'notes' && c.id === id)!;
const folderChange = (id: string) => peekSyncOutbox().find((c) => c.table === 'note_folders' && c.id === id)!;

function addNote(folderId?: string): string {
  return useUnfoldStore.getState().addNote({
    title: 'n',
    content: '<p>x</p>',
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
    folderId,
  });
}

beforeEach(() => {
  useUnfoldStore.getState().reset();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

// Each store write gets its own millisecond so the outbox keeps the newest.
const nextMs = () => jest.advanceTimersByTime(1);

describe('clearing a note folder reaches the server', () => {
  it('moving a note to "no folder" enqueues folderId: null', () => {
    const store = useUnfoldStore.getState();
    const folderId = store.addFolder('Sermons', '#C9A45A');
    const id = addNote();
    nextMs();
    store.moveNoteToFolder(id, folderId);
    expect(noteChange(id).data.folderId).toBe(folderId);

    nextMs();
    store.moveNoteToFolder(id, null); // MoveFolderSheet "All notes" / root
    expect(useUnfoldStore.getState().notes[0].folderId).toBeUndefined();
    expect(noteChange(id).data).toHaveProperty('folderId', null);
  });

  it('deleting a folder (keep notes) enqueues the orphaned notes with folderId: null', () => {
    const store = useUnfoldStore.getState();
    const folderId = store.addFolder('Study', '#C9A45A');
    const id = addNote(folderId);
    nextMs();
    store.deleteFolder(folderId, false);
    expect(useUnfoldStore.getState().notes[0].folderId).toBeUndefined();
    expect(folderChange(folderId).deleted).toBe(true);
    expect(noteChange(id).data).toHaveProperty('folderId', null);
  });

  it('moving a folder back to the root enqueues parentId: null', () => {
    const store = useUnfoldStore.getState();
    const rootId = store.addFolder('Root', '#C9A45A');
    nextMs();
    const childId = store.addFolder('Child', '#C9A45A', rootId);
    expect(folderChange(childId).data.parentId).toBe(rootId);

    nextMs();
    store.updateFolder(childId, { parentId: undefined });
    expect(useUnfoldStore.getState().folders.find((f) => f.id === childId)?.parentId).toBeUndefined();
    expect(folderChange(childId).data).toHaveProperty('parentId', null);
  });
});

describe('sync record builders', () => {
  const base = {
    id: 'note-1',
    title: 't',
    content: '<p>x</p>',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    category: 'general' as const,
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
  };

  it('always carry folderId / parentId (null when unset) and still drop other undefined fields', () => {
    expect(noteSyncData({ ...base })).toMatchObject({ folderId: null });
    expect(noteSyncData({ ...base })).not.toHaveProperty('devotionalId');
    expect(noteSyncData({ ...base, folderId: 'f1' })).toMatchObject({ folderId: 'f1' });

    const folder = { id: 'f1', name: 'F', sortOrder: 0, createdAt: base.createdAt, updatedAt: base.updatedAt };
    expect(noteFolderSyncData(folder)).toMatchObject({ parentId: null });
    expect(noteFolderSyncData(folder)).not.toHaveProperty('color');
    expect(noteFolderSyncData({ ...folder, parentId: 'root' })).toMatchObject({ parentId: 'root' });
  });
});
