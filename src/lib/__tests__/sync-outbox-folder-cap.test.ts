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

import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore } from '../store';
import { OUTBOX_KEY, peekSyncOutbox, resetDrainStateForTesting } from '../sync-outbox';

describe('folder deletion outbox volume', () => {
  beforeEach(() => {
    useUnfoldStore.getState().reset();
    mmkvStorage.removeItem(OUTBOX_KEY);
    resetDrainStateForTesting();
  });

  it('keeps 201 tombstones when a 200-note folder is deleted', () => {
    const folderId = useUnfoldStore.getState().addFolder('Inbox', '#C8A55C');
    for (let i = 0; i < 200; i++) {
      useUnfoldStore.getState().addNote({
        title: `Note ${i}`,
        content: `<p>${i}</p>`,
        category: 'general',
        tags: [],
        isFavorite: false,
        scriptureRefs: [],
        folderId,
      });
    }

    useUnfoldStore.getState().deleteFolder(folderId, true);

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(201);
    expect(outbox.filter((change) => change.table === 'notes' && change.deleted)).toHaveLength(200);
    expect(outbox.filter((change) => change.table === 'note_folders' && change.deleted)).toHaveLength(1);
  });
});
