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
  resetDrainStateForTesting,
  OUTBOX_KEY,
} from '../sync-outbox';
import type { SyncPushChange } from '../sync-outbox';
import { mmkvStorage, getDeviceId } from '../mmkv-storage';

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
  // Explicitly clear the outbox key so the cap test's 200 entries
  // don't leak into subsequent tests (the mock store is a shared Map).
  mmkvStorage.removeItem(OUTBOX_KEY);
  // Reset module-level drain state (inflight, interval timestamps) so
  // the interval guard from RS10-4 doesn't bleed between tests.
  resetDrainStateForTesting();
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

  it('outbox is capped at 200, evicting the OLDEST by clientUpdatedAt', () => {
    const changes: SyncPushChange[] = [];
    // Formula: 250 entries, one minute apart starting 2026-06-01T00:00:00Z —
    // index i ↔ timestamp base + i minutes. Newest 200 = indices 50..249.
    const base = Date.parse('2026-06-01T00:00:00Z');
    for (let i = 0; i < 250; i++) {
      changes.push(makeChange(`id-${i}`, 'devotionals', new Date(base + i * 60_000).toISOString()));
    }
    enqueueSyncChanges(changes);

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(200);
    const ids = new Set(outbox.map((c) => c.id));
    expect(ids.has('id-49')).toBe(false);  // oldest 50 (0..49) evicted
    expect(ids.has('id-0')).toBe(false);
    expect(ids.has('id-50')).toBe(true);   // survivor boundary
    expect(ids.has('id-249')).toBe(true);  // newest retained
  });

  it('changes enqueued while the drain POST is in flight survive the success clear (REVM-1)', async () => {
    const mockFetch = jest.fn().mockImplementation(async () => {
      // Lands between the drain's snapshot and its success write — the race.
      enqueueSyncChanges([makeChange('d-late', 'devotionals', '2026-06-03T00:00:00Z')]);
      return {
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      };
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);
    await drainSyncOutbox();

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].id).toBe('d-late');
  });

  it('a same-key update enqueued mid-drain with a newer clientUpdatedAt is kept', async () => {
    const mockFetch = jest.fn().mockImplementation(async () => {
      enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-02T00:00:00Z')]);
      return {
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      };
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);
    await drainSyncOutbox();

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].id).toBe('d1');
    expect(outbox[0].clientUpdatedAt).toBe('2026-06-02T00:00:00Z');
  });

  describe('ephemeral recovery identity refusal (FAP-LIB-1)', () => {
    afterEach(() => {
      // jest.clearAllMocks() does NOT undo mockImplementation — restore the
      // real-identity default explicitly so it cannot leak between tests.
      (getDeviceId as jest.Mock).mockImplementation(() => 'test-device-id');
    });

    it('refuses to ENQUEUE under an ephemeral identity — entry ids derive from the device id and would orphan server rows', () => {
      (getDeviceId as jest.Mock).mockImplementation(() => 'ephemeral-recovery-uuid');

      enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);

      expect(peekSyncOutbox()).toHaveLength(0);
    });

    it('refuses to DRAIN under an ephemeral identity — outbox kept intact for the post-recovery real identity', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch as any;

      // Queued under the REAL identity (e.g. carried across a recovery boot).
      enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);
      (getDeviceId as jest.Mock).mockImplementation(() => 'ephemeral-recovery-uuid');

      await expect(drainSyncOutbox()).resolves.toBeUndefined();

      // No POST under the one-session X-Device-ID; entries survive for the
      // normal-boot merge + drain under the real identity (RS5-4/RS2-1).
      expect(mockFetch).not.toHaveBeenCalled();
      expect(peekSyncOutbox()).toHaveLength(1);
    });
  });

  it('partial answers drop only the answered snapshot entries, never mid-flight arrivals', async () => {
    const mockFetch = jest.fn().mockImplementation(async () => {
      enqueueSyncChanges([makeChange('d3', 'devotionals', '2026-06-03T00:00:00Z')]);
      return {
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      };
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([
      makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'),
      makeChange('d2', 'devotionals', '2026-06-02T00:00:00Z'),
    ]);
    await drainSyncOutbox();

    const outbox = peekSyncOutbox();
    const ids = outbox.map((c) => c.id).sort();
    expect(ids).toEqual(['d2', 'd3']);
  });
});
