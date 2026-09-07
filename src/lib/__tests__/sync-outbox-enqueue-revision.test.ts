import { getAuthHeaders } from '@/lib/api-config';
import {
  drainSyncOutbox,
  enqueueSyncChanges,
  MIN_DRAIN_INTERVAL_MS,
  peekSyncOutbox,
  replaceSyncOutbox,
  resetDrainStateForTesting,
} from '../sync-outbox';
import {
  beginLocalResetSession,
  endLocalResetSession,
  resetSyncSessionFenceForTesting,
} from '../sync-session-fence';
import type { SyncPushChange } from '../sync-types';

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

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({
    'Content-Type': 'application/json',
    'X-Device-ID': 'test-device-id',
  })),
}));

jest.mock('../full-sync-pull', () => {
  const hooks = { onApply() {} };
  return {
    applyServerConflictRecords: jest.fn(() => {
      hooks.onApply();
    }),
    __conflictHooks: hooks,
  };
});

function conflictHooks() {
  return (jest.requireMock('../full-sync-pull') as { __conflictHooks: { onApply: () => void } }).__conflictHooks;
}

const T0 = new Date('2026-09-06T00:00:00.000Z');

function change(id: string, at = T0.toISOString(), extras: Partial<SyncPushChange> = {}): SyncPushChange {
  return {
    table: 'notes',
    id,
    clientUpdatedAt: at,
    deleted: false,
    data: { schemaVersion: 1, title: id },
    ...extras,
  };
}

function accepted(row: SyncPushChange) {
  return {
    table: row.table,
    id: row.id,
    status: 'accepted' as const,
    serverUpdatedAt: row.clientUpdatedAt,
  };
}

function rejected(row: SyncPushChange) {
  return {
    table: row.table,
    id: row.id,
    status: 'rejected' as const,
    reason: 'internal error',
    serverUpdatedAt: row.clientUpdatedAt,
  };
}

function hold() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function postedChanges(call = 0): SyncPushChange[] {
  const init = (global.fetch as jest.Mock).mock.calls[call][1] as { body: string };
  return (JSON.parse(init.body) as { changes: SyncPushChange[] }).changes;
}

function acceptPosted(init: { body?: string }, overrides: (row: SyncPushChange) => unknown = accepted) {
  const batch = (JSON.parse(String(init.body)) as { changes: SyncPushChange[] }).changes;
  return {
    ok: true,
    json: async () => ({ results: batch.map(overrides) }),
  };
}

function installPush(firstHold?: ReturnType<typeof hold>, firstResult?: (row: SyncPushChange) => unknown) {
  const started = hold();
  let remainingHolds = firstHold ? 1 : 0;
  global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
    started.resolve();
    if (remainingHolds > 0 && firstHold) {
      remainingHolds -= 1;
      await firstHold.promise;
      return acceptPosted(init, firstResult ?? accepted);
    }
    return acceptPosted(init, accepted);
  }) as unknown as typeof fetch;
  return { started: started.promise };
}

let nowMs = T0.getTime();

beforeEach(() => {
  const mocked = jest.requireMock('../mmkv-storage') as { __clearMockStorage: () => void };
  mocked.__clearMockStorage();
  resetDrainStateForTesting();
  resetSyncSessionFenceForTesting();
  conflictHooks().onApply = () => undefined;
  nowMs = T0.getTime();
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  (getAuthHeaders as jest.Mock).mockResolvedValue({
    'Content-Type': 'application/json',
    'X-Device-ID': 'test-device-id',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sync outbox enqueue revision', () => {
  it('sends a same-millisecond enqueue after a completed cycle', async () => {
    const first = change('first');
    const second = change('second');
    installPush();

    enqueueSyncChanges([first]);
    await drainSyncOutbox();
    expect(peekSyncOutbox()).toHaveLength(0);

    enqueueSyncChanges([second]);
    await drainSyncOutbox();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(1).map((row) => row.id)).toEqual(['second']);
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('keeps a distinct row enqueued during a pending request for the next cycle', async () => {
    const first = change('first');
    const second = change('second');
    const held = hold();
    const { started } = installPush(held, accepted);

    enqueueSyncChanges([first]);
    const pending = drainSyncOutbox();
    const concurrent = drainSyncOutbox();
    expect(concurrent).toBe(pending);
    await started;

    enqueueSyncChanges([second]);
    held.resolve();
    await pending;

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(postedChanges(0).map((row) => row.id)).toEqual(['first']);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'second' })]);

    await drainSyncOutbox();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(1).map((row) => row.id)).toEqual(['second']);
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it.each([
    {
      label: 'equal-timestamp',
      replacementAt: T0.toISOString(),
      title: 'equal',
    },
    {
      label: 'newer-timestamp',
      replacementAt: '2026-09-06T00:00:01.000Z',
      title: 'newer',
    },
  ] as const)('keeps a $label replacement enqueued during a pending request', async ({ replacementAt, title }) => {
    const original = change('row', T0.toISOString(), { data: { schemaVersion: 1, title: 'original' } });
    const replacement = change('row', replacementAt, { data: { schemaVersion: 1, title } });
    const held = hold();
    const { started } = installPush(held, accepted);

    enqueueSyncChanges([original]);
    const pending = drainSyncOutbox();
    await started;
    enqueueSyncChanges([replacement]);

    held.resolve();
    await pending;

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(postedChanges(0)[0]).toEqual(expect.objectContaining({ data: expect.objectContaining({ title: 'original' }) }));
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ data: expect.objectContaining({ title }) })]);

    await drainSyncOutbox();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(1)[0]).toEqual(expect.objectContaining({ data: expect.objectContaining({ title }) }));
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('still throttles unchanged rejected work until the interval expires', async () => {
    const row = change('rejected');
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ results: [rejected(row)] }),
    })) as unknown as typeof fetch;

    enqueueSyncChanges([row]);
    await drainSyncOutbox();
    await drainSyncOutbox();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'rejected' })]);

    nowMs = T0.getTime() + MIN_DRAIN_INTERVAL_MS;
    await drainSyncOutbox();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'rejected' })]);
  });

  it('does not let a reset during pending work acknowledge a later session row', async () => {
    const oldRow = change('old');
    const newRow = change('new');
    const held = hold();
    const { started } = installPush(held, accepted);

    enqueueSyncChanges([oldRow]);
    const pending = drainSyncOutbox();
    await started;
    const token = beginLocalResetSession();
    replaceSyncOutbox([]);
    enqueueSyncChanges([newRow]);
    held.resolve();
    await pending;

    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'new' })]);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    endLocalResetSession(token);
    await drainSyncOutbox();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(1).map((row) => row.id)).toEqual(['new']);
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  it('does not record completion when reset happens during conflict application', async () => {
    const oldRow = change('old');
    const fresh = change('fresh-after-conflict-reset');
    let token: number | undefined;
    conflictHooks().onApply = () => {
      token = beginLocalResetSession();
      // Retained queue restored across the session fence. replaceSyncOutbox
      // does not increment the enqueue revision, so a later drain proceeds
      // only if this cycle skipped completion bookkeeping.
      replaceSyncOutbox([fresh]);
    };
    let remainingConflicts = 1;
    global.fetch = jest.fn(async (_url: string, init: { body?: string }) => {
      if (remainingConflicts > 0) {
        remainingConflicts -= 1;
        return acceptPosted(init, (row) => ({
          table: row.table,
          id: row.id,
          status: 'conflict' as const,
          serverUpdatedAt: row.clientUpdatedAt,
          serverData: { id: row.id, ...row.data },
        }));
      }
      return acceptPosted(init);
    }) as unknown as typeof fetch;

    enqueueSyncChanges([oldRow]);
    await drainSyncOutbox();
    expect(token).toBeDefined();
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ id: 'fresh-after-conflict-reset' })]);

    endLocalResetSession(token!);
    await drainSyncOutbox();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(postedChanges(1).map((row) => row.id)).toEqual(['fresh-after-conflict-reset']);
    expect(peekSyncOutbox()).toHaveLength(0);
  });
});
