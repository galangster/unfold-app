jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({
    'Content-Type': 'application/json',
    'X-Device-ID': 'test-device-id',
  })),
}));

import {
  enqueueSyncChanges,
  peekSyncOutbox,
  drainSyncOutbox,
  OUTBOX_KEY,
} from '../sync-outbox';
import type { SyncPushChange } from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';

function makeChange(id: string, table: string, ts: string): SyncPushChange {
  return {
    table: table as 'devotionals' | 'devotional_days',
    id,
    clientUpdatedAt: ts,
    data: { schemaVersion: 1, value: id },
    deleted: false,
  };
}

// Reset the outbox and fetch mock between tests
beforeEach(() => {
  jest.clearAllMocks();
  (mmkvStorage as any).__clearMockStorage?.();
  // Clear the module-level inflight guard by re-requiring the module
  jest.resetModules();
});

// Because resetModules clears require cache, re-import per test in some cases.
// For most tests we can just use the already-imported functions since
// jest.resetModules() won't affect already-bound references. The important
// thing is the mmkvStorage mock's underlying Map is cleared via __clearMockStorage.

describe('sync-outbox', () => {
  it('enqueue persists and dedupes by table+id keeping newest clientUpdatedAt', () => {
    const changeA = makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const changeA2 = makeChange('d1', 'devotionals', '2026-06-02T00:00:00Z');

    enqueueSyncChanges([changeA]);
    enqueueSyncChanges([changeA2]);

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].clientUpdatedAt).toBe('2026-06-02T00:00:00Z');
  });

  it('drain posts all changes and clears on accepted', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ status: 'accepted' }, { status: 'accepted' }] }),
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([
      makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'),
      makeChange('d2', 'devotionals', '2026-06-01T00:00:00Z'),
    ]);

    await drainSyncOutbox();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('network failure keeps the outbox', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch as any;

    enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);

    await expect(drainSyncOutbox()).resolves.toBeUndefined();
    expect(peekSyncOutbox()).toHaveLength(1);
  });

  it('rejected results are dropped, not retried forever', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ status: 'rejected' }, { status: 'accepted' }] }),
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([
      makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'),
      makeChange('d2', 'devotionals', '2026-06-01T00:00:00Z'),
    ]);

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('concurrent drains are single-flight', async () => {
    let resolvePost!: () => void;
    const hangingPost = new Promise<void>((res) => {
      resolvePost = res;
    });

    const mockFetch = jest.fn().mockReturnValue(
      hangingPost.then(() => ({
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      })),
    );
    global.fetch = mockFetch as any;

    enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);

    const p1 = drainSyncOutbox();
    const p2 = drainSyncOutbox();
    resolvePost();

    await Promise.all([p1, p2]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('outbox is capped at 200', () => {
    const changes: SyncPushChange[] = [];
    for (let i = 0; i < 250; i++) {
      changes.push(makeChange(`id-${i}`, 'devotionals', `2026-06-01T${String(i).padStart(6, '0')}Z`));
    }
    enqueueSyncChanges(changes);

    const outbox = peekSyncOutbox();
    expect(outbox.length).toBeLessThanOrEqual(200);
  });
});
