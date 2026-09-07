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
  replaceSyncOutbox,
  resetDrainStateForTesting,
  OUTBOX_KEY,
} from '../sync-outbox';
const {
  beginLocalResetSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
} = jest.requireActual('../sync-session-fence') as typeof import('../sync-session-fence');
import type { SyncPushChange } from '../sync-outbox';
import { mmkvStorage, getDeviceId } from '../mmkv-storage';

function makeChange(id: string, table: string, ts: string): SyncPushChange {
  return {
    table: table as 'devotionals' | 'devotional_days' | 'bible_reading_positions' | 'notes',
    id,
    clientUpdatedAt: ts,
    data: { schemaVersion: 1, value: id },
    deleted: false,
  };
}

function acceptedResult(change: SyncPushChange, overrides: Record<string, unknown> = {}) {
  return {
    table: change.table,
    id: change.id,
    status: 'accepted' as const,
    serverUpdatedAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

function rejectedResult(change: SyncPushChange, reason = 'internal error') {
  return {
    table: change.table,
    id: change.id,
    status: 'rejected' as const,
    reason,
    serverUpdatedAt: '2026-06-01T12:00:00.000Z',
  };
}

// Reset the outbox and fetch mock between tests
beforeEach(() => {
  jest.clearAllMocks();
  (mmkvStorage as any).__clearMockStorage?.();
  // Explicitly clear the outbox key so large-queue tests do not leak.
  mmkvStorage.removeItem(OUTBOX_KEY);
  // Reset module-level drain state (inflight, interval timestamps) so
  // the interval guard from RS10-4 doesn't bleed between tests.
  resetDrainStateForTesting();
  resetSyncSessionFenceForTesting();
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
    const first = makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const second = makeChange('d2', 'devotionals', '2026-06-01T00:00:00Z');
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [acceptedResult(first), acceptedResult(second)] }),
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([first, second]);

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

  it('retains a rejected internal-error snapshot while an accepted sibling clears', async () => {
    const rejected = makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z');
    const accepted = makeChange('d2', 'devotionals', '2026-06-01T00:00:00Z');
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [rejectedResult(rejected), acceptedResult(accepted)] }),
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([rejected, accepted]);

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'd1', data: rejected.data })]);
  });

  it('concurrent drains are single-flight', async () => {
    let resolvePost!: () => void;
    const hangingPost = new Promise<void>((res) => {
      resolvePost = res;
    });

    const mockFetch = jest.fn().mockReturnValue(
      hangingPost.then(() => ({
        ok: true,
        json: async () => ({ results: [acceptedResult(makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'))] }),
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

  it('keeps every durable snapshot, including the oldest of 250', () => {
    const changes: SyncPushChange[] = [];
    const base = Date.parse('2026-06-01T00:00:00Z');
    for (let i = 0; i < 250; i++) {
      changes.push(makeChange(`id-${i}`, 'devotionals', new Date(base + i * 60_000).toISOString()));
    }
    enqueueSyncChanges(changes);

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(250);
    const ids = new Set(outbox.map((c) => c.id));
    expect(ids.has('id-0')).toBe(true);
    expect(ids.has('id-249')).toBe(true);
  });

  it('replaceSyncOutbox keeps every supplied snapshot', () => {
    const changes = Array.from({ length: 201 }, (_, i) => (
      makeChange(`rep-${i}`, 'notes', `2026-06-01T00:${String(i % 60).padStart(2, '0')}:00.000Z`)
    ));
    replaceSyncOutbox(changes);
    expect(peekSyncOutbox()).toHaveLength(201);
  });

  it('changes enqueued while the drain POST is in flight survive the success clear (REVM-1)', async () => {
    const mockFetch = jest.fn().mockImplementation(async () => {
      // Lands between the drain's snapshot and its success write — the race.
      enqueueSyncChanges([makeChange('d-late', 'devotionals', '2026-06-03T00:00:00Z')]);
      return {
        ok: true,
        json: async () => ({ results: [acceptedResult(makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'))] }),
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
        json: async () => ({ results: [acceptedResult(makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'))] }),
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
        json: async () => ({
          results: [acceptedResult(makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z'))],
        }),
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

describe('MD-2 sync acknowledgements', () => {
  async function drainWith(results: unknown[]) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results }),
    }) as unknown as typeof fetch;
    await drainSyncOutbox();
  }

  it('clears a legacy matching-id success and a composite remap', async () => {
    const note = makeChange('note-1', 'notes', '2026-06-01T00:00:00.000Z');
    const day = makeChange('client-day-1', 'devotional_days', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([note, day]);

    await drainWith([
      acceptedResult(note),
      acceptedResult(day, { id: 'day-devotional-1-1' }),
    ]);

    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('maps explicit requested IDs when results arrive out of order', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    const second = makeChange('note-b', 'notes', '2026-06-01T00:01:00.000Z');
    enqueueSyncChanges([first, second]);

    await drainWith([
      acceptedResult(second, { requestedId: second.id }),
      acceptedResult(first, { requestedId: first.id }),
    ]);

    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('rejects a longer response and retains every submitted change', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([first]);

    await drainWith([acceptedResult(first), acceptedResult(first, { id: 'ghost' })]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-a' })]);
  });

  it('retains a change named by both a legacy result and an explicit result', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    const second = makeChange('note-b', 'notes', '2026-06-01T00:01:00.000Z');
    enqueueSyncChanges([first, second]);

    await drainWith([
      acceptedResult(first),
      { ...rejectedResult(first), requestedId: first.id },
    ]);

    expect(peekSyncOutbox().map((entry) => entry.id).sort()).toEqual(['note-a', 'note-b']);
  });

  it('retains a status-only result in a same-length response', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([first]);

    await drainWith([{ status: 'accepted' }]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-a' })]);
  });

  it('retains an unknown requested ID in a same-length response', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([first]);

    await drainWith([{
      table: 'notes',
      requestedId: 'missing-note',
      id: 'note-x',
      status: 'accepted',
      serverUpdatedAt: '2026-06-01T12:00:00.000Z',
    }]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-a' })]);
  });

  it('retains an empty requested ID in a same-length response', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([first]);

    await drainWith([{
      table: 'notes',
      requestedId: '',
      id: first.id,
      status: 'accepted',
      serverUpdatedAt: '2026-06-01T12:00:00.000Z',
    }]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-a' })]);
  });

  it('retains a when a valid explicit claim is followed by a malformed explicit duplicate', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    const second = makeChange('note-b', 'notes', '2026-06-01T00:01:00.000Z');
    enqueueSyncChanges([first, second]);

    await drainWith([
      acceptedResult(first, { requestedId: first.id }),
      { table: 'notes', requestedId: first.id, id: first.id, status: 'rejected', reason: 'internal error' },
    ]);

    expect(peekSyncOutbox().map((entry) => entry.id).sort()).toEqual(['note-a', 'note-b']);
  });

  it('retains a when a malformed explicit claim is followed by a valid explicit duplicate', async () => {
    const first = makeChange('note-a', 'notes', '2026-06-01T00:00:00.000Z');
    const second = makeChange('note-b', 'notes', '2026-06-01T00:01:00.000Z');
    enqueueSyncChanges([first, second]);

    await drainWith([
      { table: 'notes', requestedId: first.id, id: first.id, status: 'rejected', reason: 'internal error' },
      acceptedResult(first, { requestedId: first.id }),
    ]);

    expect(peekSyncOutbox().map((entry) => entry.id).sort()).toEqual(['note-a', 'note-b']);
  });

  it('clears an explicit composite remap that names another submitted row', async () => {
    const first = makeChange('client-day-1', 'devotional_days', '2026-06-01T00:00:00.000Z');
    const second = makeChange('day-devotional-1-2', 'devotional_days', '2026-06-01T00:01:00.000Z');
    enqueueSyncChanges([first, second]);

    await drainWith([
      acceptedResult(first, { requestedId: first.id, id: second.id }),
      acceptedResult(second, { requestedId: second.id }),
    ]);

    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('does not treat a remapped id that names another submitted row as an acknowledgement', async () => {
    const first = makeChange('client-day-1', 'devotional_days', '2026-06-01T00:00:00.000Z');
    const second = makeChange('day-devotional-1-2', 'devotional_days', '2026-06-01T00:01:00.000Z');
    enqueueSyncChanges([first, second]);

    await drainWith([
      acceptedResult(first, { id: second.id }),
      acceptedResult(second),
    ]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'client-day-1' })]);
  });

  it('does not remap a non-composite table to a different id', async () => {
    const note = makeChange('note-1', 'notes', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([note]);

    await drainWith([acceptedResult(note, { id: 'server-note-1' })]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-1' })]);
  });

  it('does not remap an explicit non-composite result to a different canonical id', async () => {
    const note = makeChange('note-1', 'notes', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([note]);

    await drainWith([acceptedResult(note, { requestedId: note.id, id: 'server-note-1' })]);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-1' })]);
  });

  it('clears a bible reading position through a canonical remap', async () => {
    const position = makeChange('client-position-b', 'bible_reading_positions', '2026-06-01T00:00:00.000Z');
    enqueueSyncChanges([position]);

    await drainWith([acceptedResult(position, { id: 'server-position-a' })]);

    expect(peekSyncOutbox()).toHaveLength(0);
  });
});

describe('MD-4 exact snapshot acknowledgements', () => {
  const ts = '2026-06-01T00:00:00.000Z';

  async function drainAccepting(submitted: SyncPushChange, midFlight?: SyncPushChange) {
    global.fetch = jest.fn().mockImplementation(async () => {
      if (midFlight) enqueueSyncChanges([midFlight]);
      return {
        ok: true,
        json: async () => ({ results: [acceptedResult(submitted)] }),
      };
    }) as unknown as typeof fetch;
    await drainSyncOutbox();
  }

  it('retains equal-timestamp content that changed while the push was in flight', async () => {
    const submitted = makeChange('note-1', 'notes', ts);
    const replacement = { ...submitted, data: { schemaVersion: 1, value: 'edited-same-ms' } };
    enqueueSyncChanges([submitted]);

    await drainAccepting(submitted, replacement);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-1', data: replacement.data })]);
  });

  it('retains an equal-timestamp deletion-flag change that arrived during flight', async () => {
    const submitted = makeChange('note-1', 'notes', ts);
    const replacement = { ...submitted, deleted: true };
    enqueueSyncChanges([submitted]);

    await drainAccepting(submitted, replacement);

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'note-1', deleted: true })]);
  });

  it('retains an equal-timestamp replacement after a valid canonical remap', async () => {
    const submitted = makeChange('client-position-b', 'bible_reading_positions', ts);
    const replacement = { ...submitted, data: { schemaVersion: 1, value: 'replaced-same-ms' } };
    enqueueSyncChanges([submitted]);

    global.fetch = jest.fn().mockImplementation(async () => {
      enqueueSyncChanges([replacement]);
      return {
        ok: true,
        json: async () => ({ results: [acceptedResult(submitted, { id: 'server-position-a' })] }),
      };
    }) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ id: 'client-position-b', data: replacement.data }),
    ]);
  });

  it('clears an unchanged submitted snapshot', async () => {
    const submitted = makeChange('note-1', 'notes', ts);
    enqueueSyncChanges([submitted]);

    await drainAccepting(submitted);

    expect(peekSyncOutbox()).toHaveLength(0);
  });
});

describe('MD-3 bounded drain batches', () => {
  const ts = '2026-06-01T00:00:00.000Z';

  function manyChanges(count: number): SyncPushChange[] {
    const base = Date.parse(ts);
    return Array.from({ length: count }, (_, i) => (
      makeChange(`n-${i}`, 'notes', new Date(base + i * 1000).toISOString())
    ));
  }

  function postedChanges(call: number): SyncPushChange[] {
    const init = (global.fetch as jest.Mock).mock.calls[call][1] as { body?: string };
    return (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
  }

  it('drains more than 500 mixed results without letting rejects block later siblings', async () => {
    const changes = manyChanges(501);
    enqueueSyncChanges(changes);

    global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
      const batch = (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
      return {
        ok: true,
        json: async () => ({
          results: batch.map((change) => (
            change.id === 'n-0' ? rejectedResult(change) : acceptedResult(change)
          )),
        }),
      };
    }) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(0)).toHaveLength(500);
    expect(postedChanges(1)).toHaveLength(1);
    expect(postedChanges(1)[0].id).toBe('n-500');
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'n-0' })]);
  });

  it('splits multibyte payloads that exceed the 5 MiB body bound', async () => {
    const pad = '你'.repeat(900_000);
    const first = { ...makeChange('mb-a', 'notes', ts), data: { pad } };
    const second = { ...makeChange('mb-b', 'notes', '2026-06-01T00:00:01.000Z'), data: { pad } };
    enqueueSyncChanges([first, second]);

    global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
      const batch = (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
      return {
        ok: true,
        json: async () => ({ results: batch.map((change) => acceptedResult(change)) }),
      };
    }) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(0)).toHaveLength(1);
    expect(postedChanges(1)).toHaveLength(1);
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('retains a single oversized entry and still drains smaller siblings', async () => {
    const oversized = {
      ...makeChange('huge', 'notes', ts),
      data: { pad: 'x'.repeat(5_300_000) },
    };
    const sibling = makeChange('small', 'notes', '2026-06-01T00:00:01.000Z');
    enqueueSyncChanges([oversized, sibling]);

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ results: [acceptedResult(sibling)] }),
    })) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(postedChanges(0).map((change) => change.id)).toEqual(['small']);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'huge' })]);
  });

  it('stops later batches after reset and keeps unsent initial snapshots', async () => {
    enqueueSyncChanges(manyChanges(501));
    let resetToken: number | undefined;

    global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
      const batch = (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
      if ((global.fetch as jest.Mock).mock.calls.length === 2) {
        resetToken = beginLocalResetSession();
      }
      return {
        ok: true,
        json: async () => ({ results: batch.map((change) => acceptedResult(change)) }),
      };
    }) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'n-500' })]);
    if (resetToken !== undefined) endLocalResetSession(resetToken);
  });

  it('keeps writes enqueued during a multi-batch drain for a later cycle', async () => {
    enqueueSyncChanges(manyChanges(501));
    const late = makeChange('late', 'notes', '2026-06-02T00:00:00.000Z');

    global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
      if ((global.fetch as jest.Mock).mock.calls.length === 1) enqueueSyncChanges([late]);
      const batch = (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
      return {
        ok: true,
        json: async () => ({ results: batch.map((change) => acceptedResult(change)) }),
      };
    }) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(0).some((change) => change.id === 'late')).toBe(false);
    expect(postedChanges(1).some((change) => change.id === 'late')).toBe(false);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'late' })]);
  });

  it('stops the cycle on a later-batch transport failure', async () => {
    enqueueSyncChanges(manyChanges(501));

    global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
      if ((global.fetch as jest.Mock).mock.calls.length === 2) throw new Error('network');
      const batch = (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
      return {
        ok: true,
        json: async () => ({ results: batch.map((change) => acceptedResult(change)) }),
      };
    }) as unknown as typeof fetch;

    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'n-500' })]);
  });
});
