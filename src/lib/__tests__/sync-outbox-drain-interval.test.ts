/**
 * RS10-4: drainSyncOutbox() interval guard.
 *
 * Multiple drain triggers within MIN_DRAIN_INTERVAL_MS of a completed drain
 * must collapse into a single actual drain (one POST). The guard is bypassed
 * when new entries were enqueued AFTER the last completed drain.
 */

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
  drainSyncOutbox,
  resetDrainStateForTesting,
  MIN_DRAIN_INTERVAL_MS,
  OUTBOX_KEY,
} from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';

function makeChange(id: string, ts: string) {
  return {
    table: 'devotionals' as const,
    id,
    clientUpdatedAt: ts,
    data: { schemaVersion: 1 },
    deleted: false,
  };
}

function okFetch(): Promise<{ ok: boolean; json: () => Promise<{ results: { status: string }[] }> }> {
  return Promise.resolve({
    ok: true,
    json: async () => ({ results: [{ status: 'accepted' }] }),
  });
}

let mockFetch: jest.Mock;
let nowMs: number;

beforeEach(() => {
  jest.clearAllMocks();
  (mmkvStorage as unknown as { __clearMockStorage: () => void }).__clearMockStorage?.();
  mmkvStorage.removeItem(OUTBOX_KEY);
  resetDrainStateForTesting();

  // Control Date.now() so we can advance time without real timers
  nowMs = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);

  mockFetch = jest.fn().mockImplementation(okFetch);
  global.fetch = mockFetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('drainSyncOutbox interval guard (RS10-4)', () => {
  it('two triggers within MIN_DRAIN_INTERVAL_MS of a completed drain → only one POST', async () => {
    enqueueSyncChanges([makeChange('d1', '2026-06-10T00:00:00Z')]);
    await drainSyncOutbox(); // Drain 1: completes
    expect(mockFetch.mock.calls.length).toBe(1);

    // Time within interval — both subsequent drains with NO new enqueue → suppressed
    nowMs += MIN_DRAIN_INTERVAL_MS / 2;
    await drainSyncOutbox();
    await drainSyncOutbox();
    expect(mockFetch.mock.calls.length).toBe(1); // still 1
  });

  it('trigger within MIN_DRAIN_INTERVAL_MS + NO new entries → suppressed', async () => {
    enqueueSyncChanges([makeChange('d1', '2026-06-10T00:00:00Z')]);
    await drainSyncOutbox(); // Drain 1
    expect(mockFetch.mock.calls.length).toBe(1);

    // Advance time just inside the interval — should be suppressed
    nowMs += MIN_DRAIN_INTERVAL_MS - 1;
    await drainSyncOutbox();
    await drainSyncOutbox();
    expect(mockFetch.mock.calls.length).toBe(1);
  });

  it('new entry enqueued after completed drain → bypass interval guard, drains again', async () => {
    enqueueSyncChanges([makeChange('d1', '2026-06-10T00:00:00Z')]);
    await drainSyncOutbox(); // Drain 1
    expect(mockFetch.mock.calls.length).toBe(1);

    // Advance time by 1ms so enqueue's lastEnqueueAt > lastDrainCompletedAt
    nowMs += 1;
    // New entry enqueued after the completed drain → bypass interval
    enqueueSyncChanges([makeChange('d2', '2026-06-10T00:01:00Z')]);
    await drainSyncOutbox(); // Drain 2 — bypass because new enqueue
    expect(mockFetch.mock.calls.length).toBe(2);
  });

  it('after interval expires → drain runs again even without bypass', async () => {
    enqueueSyncChanges([makeChange('d1', '2026-06-10T00:00:00Z')]);
    await drainSyncOutbox(); // Drain 1
    expect(mockFetch.mock.calls.length).toBe(1);

    // Advance past the interval
    nowMs += MIN_DRAIN_INTERVAL_MS + 1;
    // Re-enqueue so there's something to drain
    enqueueSyncChanges([makeChange('d2', '2026-06-10T00:01:00Z')]);
    await drainSyncOutbox(); // Drain 2 — interval expired
    expect(mockFetch.mock.calls.length).toBe(2);
  });

  it('outbox empty within interval → no POST (not just suppressed by interval guard)', async () => {
    // Drain with empty outbox → no POST
    await drainSyncOutbox();
    expect(mockFetch.mock.calls.length).toBe(0);

    // Still no POST — outbox empty
    nowMs += MIN_DRAIN_INTERVAL_MS / 2;
    await drainSyncOutbox();
    expect(mockFetch.mock.calls.length).toBe(0);
  });

  it('existing single-flight guard still works: concurrent drains → one POST', async () => {
    let resolvePost!: () => void;
    const hangingPost = new Promise<void>((res) => {
      resolvePost = res;
    });

    mockFetch.mockReturnValue(
      hangingPost.then(() => ({
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      }))
    );

    enqueueSyncChanges([makeChange('d1', '2026-06-10T00:00:00Z')]);

    const p1 = drainSyncOutbox();
    const p2 = drainSyncOutbox();
    resolvePost();

    await Promise.all([p1, p2]);
    expect(mockFetch.mock.calls.length).toBe(1);
  });
});
