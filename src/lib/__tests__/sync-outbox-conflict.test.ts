/**
 * A push `conflict` means the server kept its (newer) version and dropped
 * ours; the result carries that version as `serverData`. The outbox used to
 * clear the entry and ignore serverData, and because the conflicted row's
 * updated_at never moved, the incremental pull never brought it down either:
 * device A kept A's text, the server and device B kept B's, permanently.
 * Conflicts now go through the pull mappers with the same LWW guard.
 */
import { resetDeletedSeriesForTesting, wasSeriesDeleted } from '../deleted-series';
import type { SyncPushChange } from '../sync-types';

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
const fullSyncPull = jest.requireActual('../full-sync-pull') as typeof import('../full-sync-pull');
const { drainSyncChange, drainSyncOutbox, enqueueSyncChanges, OUTBOX_KEY, peekSyncOutbox, removeSyncChangesForRecords, resetDrainStateForTesting } = jest.requireActual('../sync-outbox') as typeof import('../sync-outbox');
import { beginLocalResetSession, captureSyncSession, endLocalResetSession } from '../sync-session-fence';

const T0 = new Date('2026-09-01T12:00:00.000Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString();

function addNote(content: string): string {
  return useUnfoldStore.getState().addNote({
    title: 'Shared note',
    content,
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
  });
}

/** The raw sync_notes row /api/sync/push returns as serverData on a conflict. */
function serverNoteRow(id: string, content: string, clientUpdatedAt: string, deletedAt: string | null = null) {
  return {
    id,
    clerkUserId: 'user-1',
    title: 'Shared note',
    content,
    category: 'general',
    tags: [],
    isFavorite: false,
    scriptureRefs: [],
    folderId: null,
    createdAt: at(0),
    updatedAt: clientUpdatedAt,
    clientUpdatedAt,
    deletedAt,
  };
}

function serverBiblePositionRow(id: string, clientUpdatedAt: string) {
  return {
    id,
    clerkUserId: 'user-1',
    bookId: 43,
    bookName: 'John',
    chapter: 3,
    translation: 'BSB',
    lastReadAt: clientUpdatedAt,
    createdAt: at(0),
    updatedAt: clientUpdatedAt,
    clientUpdatedAt,
    deletedAt: null,
  };
}

/** The raw sync_devotionals row the push returns after a server write (worker, cron) stamped it. */
function serverSeriesRow(id: string, stampedAt: string) {
  return {
    id,
    clerkUserId: 'user-1',
    title: 'Stillness',
    totalDays: 14,
    currentDay: 5,
    generationMode: 'progressive',
    createdAt: at(0),
    updatedAt: stampedAt,
    clientUpdatedAt: stampedAt,
    deletedAt: null,
  };
}

function mockPushResponse(build: () => unknown[]) {
  (globalThis as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ results: build() }),
  }));
}

beforeEach(() => {
  const resetToken = beginLocalResetSession();
  endLocalResetSession(resetToken);
  jest.requireMock('../api-config').getAuthHeaders.mockReset().mockResolvedValue({ 'Content-Type': 'application/json' });
  useUnfoldStore.getState().reset();
  // The outbox lives in the (module-scoped) mmkv mock, not in the store.
  mmkvStorage.removeItem(OUTBOX_KEY);
  resetDrainStateForTesting();
  jest.useFakeTimers();
  jest.setSystemTime(T0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('exact push acknowledgement waits', () => {
  it.each([false, true])('Greptile r4190002057: ordinary two-batch delivery retains its budget (explicit observer=%s)', async (explicitObserver) => {
    const notes = Array.from({ length: 501 }, (_, i) => ({
      table: 'notes' as const, id: `budget-note-${i}`, data: { title: `Note ${i}` },
      clientUpdatedAt: at(i), deleted: false,
    }));
    const resumed = { table: 'devotionals' as const, id: 'series-a',
      data: { archivedAt: null, archivedStateAt: at(1000) }, clientUpdatedAt: at(1000), deleted: false };
    enqueueSyncChanges(notes);
    let requestNumber = 0;
    globalThis.fetch = jest.fn(async (_url, init) => {
      const { changes } = JSON.parse(init!.body as string);
      requestNumber += 1;
      const delay = requestNumber === 1 ? 6_000 : requestNumber === 2 ? 12_000 : 0;
      const response = {
        ok: true, json: async () => ({ results: changes.map((change: { table: string; id: string }) => ({
          table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: at(20_000),
        })) }),
      } as Response;
      if (delay === 0) return response;
      return new Promise<Response>((resolve) => { setTimeout(() => resolve(response), delay); });
    });
    const ordinaryDrain = drainSyncOutbox();
    await jest.advanceTimersByTimeAsync(0);
    enqueueSyncChanges([resumed]);
    const acknowledgement = drainSyncChange(resumed, captureSyncSession(), explicitObserver
      ? { deadlineAt: Date.now() + 15_000 } : {});
    await jest.advanceTimersByTimeAsync(18_000);
    await ordinaryDrain;
    await acknowledgement;
    const remainingNotes = peekSyncOutbox().filter((change) => change.table === 'notes');
    // Both ordinary requests are individually within the existing 15s per-batch budget.
    expect(remainingNotes).toEqual([]);
  });

  it('drains fresh work queued during an older single-flight cycle', async () => {
    const older = { table: 'notes' as const, id: 'older', data: { title: 'Earlier' }, clientUpdatedAt: at(0), deleted: false };
    const resumed = { table: 'devotionals' as const, id: 'series-a', data: { archivedAt: null, archivedStateAt: at(1000) }, clientUpdatedAt: at(1000), deleted: false };
    enqueueSyncChanges([older]);
    let finishOlder!: (response: Response) => void;
    let olderStarted!: () => void;
    const started = new Promise<void>((resolve) => { olderStarted = resolve; });
    const requests: unknown[] = [];
    globalThis.fetch = jest.fn(async (_url, init) => {
      const { changes } = JSON.parse(init!.body as string);
      requests.push(changes);
      if (requests.length === 1) return new Promise<Response>((resolve) => { finishOlder = resolve; olderStarted(); });
      return { ok: true, json: async () => ({ results: changes.map((change: { table: string; id: string }) => ({
        table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: at(1000),
      })) }) } as Response;
    });
    const firstCycle = drainSyncOutbox();
    await started;
    enqueueSyncChanges([resumed]);
    const acknowledgement = drainSyncChange(resumed);
    finishOlder({ ok: true, json: async () => ({ results: [{ table: older.table, id: older.id, status: 'accepted', serverUpdatedAt: at(0) }] }) } as Response);
    await firstCycle;
    expect(await acknowledgement).toEqual(expect.objectContaining({ id: resumed.id, status: 'accepted' }));
    expect(requests).toEqual([[older], [resumed]]);
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('does not interpret removal or another snapshot acknowledgement as acceptance', async () => {
    const change = { table: 'devotionals' as const, id: 'series-a', data: { archivedAt: null }, clientUpdatedAt: at(1000), deleted: false };
    enqueueSyncChanges([change]);
    globalThis.fetch = jest.fn(async () => {
      removeSyncChangesForRecords([{ table: change.table, id: change.id }]);
      return { ok: true, json: async () => ({ results: [] }) } as Response;
    });
    expect(await drainSyncChange(change)).toBeUndefined();
    expect(peekSyncOutbox()).toEqual([]);
    const newer = { ...change, clientUpdatedAt: at(2000), data: { archivedAt: at(2000) } };
    enqueueSyncChanges([newer]);
    mockPushResponse(() => [{ table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: at(2000) }]);
    expect(await drainSyncChange(change)).toBeUndefined();
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('keeps the existing retry interval after a rejected snapshot', async () => {
    const change = { table: 'devotionals' as const, id: 'series-a', data: { archivedAt: null }, clientUpdatedAt: at(1000), deleted: false };
    enqueueSyncChanges([change]);
    mockPushResponse(() => [{ table: change.table, id: change.id, status: 'rejected', serverUpdatedAt: at(1000) }]);
    expect(await drainSyncChange(change)).toBeUndefined();
    expect(await drainSyncChange(change)).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(peekSyncOutbox()).toEqual([change]);
  });

  it.each(['auth', 'fetch', 'body'] as const)('settles a non-cooperative %s stall and retries without accepting its late result', async (stage) => {
    const old = { table: 'devotionals' as const, id: 'series-a', data: { archivedAt: null, archivedStateAt: at(1000) }, clientUpdatedAt: at(1000), deleted: false };
    const fresh = { ...old, data: { ...old.data, archivedStateAt: at(2000) }, clientUpdatedAt: at(2000) };
    const accepted = (change: typeof old) => ({ results: [{ table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: change.clientUpdatedAt }] });
    const response = (change: typeof old) => ({ ok: true, json: async () => accepted(change) }) as Response;
    let releaseOld!: () => void;
    let releaseFresh!: (result: Response) => void;
    const fetch = jest.fn(() => new Promise<Response>((resolve) => { releaseFresh = resolve; }));
    if (stage === 'auth') {
      jest.requireMock('../api-config').getAuthHeaders.mockImplementationOnce(() => new Promise((resolve) => {
        releaseOld = () => resolve({ 'Content-Type': 'application/json' });
      }));
    } else if (stage === 'fetch') {
      fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseOld = () => resolve(response(old)); }));
    } else {
      fetch.mockImplementationOnce(async () => ({ ok: true, json: () => new Promise((resolve) => {
        releaseOld = () => resolve(accepted(old));
      }) }) as Response);
    }
    globalThis.fetch = fetch;
    enqueueSyncChanges([old]);
    const first = drainSyncChange(old, captureSyncSession(), { deadlineAt: Date.now() + 15_000 });
    await jest.advanceTimersByTimeAsync(15_000);
    expect(await first).toBeUndefined();
    expect(peekSyncOutbox()).toEqual([old]);
    enqueueSyncChanges([fresh]);
    const retry = drainSyncChange(fresh, captureSyncSession(), { deadlineAt: Date.now() + 15_000 });
    await jest.advanceTimersByTimeAsync(0);
    releaseOld();
    await jest.advanceTimersByTimeAsync(0);
    expect(peekSyncOutbox()).toEqual([fresh]);
    expect(fetch).toHaveBeenCalledTimes(stage === 'auth' ? 1 : 2);
    releaseFresh(response(fresh));
    expect(await retry).toEqual(expect.objectContaining({ status: 'accepted', id: fresh.id }));
    expect(peekSyncOutbox()).toEqual([]);
  });

  it('detaches the explicit observer without shortening an ordinary stalled drain', async () => {
    const older = { table: 'notes' as const, id: 'older', data: { title: 'Earlier' }, clientUpdatedAt: at(0), deleted: false };
    const resumed = { table: 'devotionals' as const, id: 'series-a', data: { archivedAt: null }, clientUpdatedAt: at(1000), deleted: false };
    let releaseAuth!: () => void;
    jest.requireMock('../api-config').getAuthHeaders.mockImplementationOnce(() => new Promise((resolve) => {
      releaseAuth = () => resolve({ 'Content-Type': 'application/json' });
    }));
    globalThis.fetch = jest.fn(async (_url, init) => {
      const { changes } = JSON.parse(init!.body as string);
      return { ok: true, json: async () => ({ results: changes.map((change: { table: string; id: string }) => ({
        table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: at(1000),
      })) }) } as Response;
    });
    enqueueSyncChanges([older]);
    let ordinarySettled = false;
    const firstCycle = drainSyncOutbox().then(() => { ordinarySettled = true; });
    await jest.advanceTimersByTimeAsync(5_000);
    enqueueSyncChanges([resumed]);
    const acknowledgement = drainSyncChange(resumed, captureSyncSession(), { deadlineAt: Date.now() + 3_000 });
    await jest.advanceTimersByTimeAsync(3_000);
    expect(await acknowledgement).toBeUndefined();
    expect(ordinarySettled).toBe(false);
    await jest.advanceTimersByTimeAsync(7_000);
    await firstCycle;
    expect(peekSyncOutbox()).toEqual([older, resumed]);
    releaseAuth();
    await jest.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await drainSyncChange(resumed)).toEqual(expect.objectContaining({ id: resumed.id, status: 'accepted' }));
    expect(peekSyncOutbox()).toEqual([]);
  });

  it.each(['auth', 'body'] as const)('settles %s on reset and ignores late completion in a new session', async (stage) => {
    const change = { table: 'devotionals' as const, id: 'series-a', data: { archivedAt: null }, clientUpdatedAt: at(1000), deleted: false };
    let release!: () => void;
    if (stage === 'auth') {
      jest.requireMock('../api-config').getAuthHeaders.mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve({ 'Content-Type': 'application/json' });
      }));
      globalThis.fetch = jest.fn();
    } else {
      globalThis.fetch = jest.fn(async () => ({ ok: true, json: () => new Promise((resolve) => {
        release = () => resolve({ results: [{ table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: at(1000) }] });
      }) }) as Response);
    }
    enqueueSyncChanges([change]);
    const acknowledgement = drainSyncChange(change);
    await jest.advanceTimersByTimeAsync(0);
    const token = beginLocalResetSession();
    expect(await acknowledgement).toBeUndefined();
    endLocalResetSession(token);
    const fresh = { ...change, clientUpdatedAt: at(2000) };
    enqueueSyncChanges([fresh]);
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(peekSyncOutbox()).toEqual([fresh]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(stage === 'auth' ? 0 : 1);
  });
});

describe('push conflict → server version', () => {
  it('applies the server version returned with the conflict and clears the entry', async () => {
    const id = addNote('<p>DEVICE A VERSION</p>');
    const serverData = serverNoteRow(id, '<p>DEVICE B VERSION (newer)</p>', at(30_000));
    mockPushResponse(() => [
      { table: 'notes', id, status: 'conflict', serverUpdatedAt: serverData.updatedAt, serverData },
    ]);

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toHaveLength(0);
    const note = useUnfoldStore.getState().notes.find((n) => n.id === id)!;
    expect(note.content).toBe('<p>DEVICE B VERSION (newer)</p>');
    expect(note.updatedAt).toBe(at(30_000));
  });

  it('keeps a newer local change that was enqueued while the push was in flight', async () => {
    const id = addNote('<p>A1</p>');
    mockPushResponse(() => {
      // The user keeps typing while the POST is out: a newer change lands in the outbox.
      jest.setSystemTime(new Date(T0.getTime() + 60_000));
      useUnfoldStore.getState().updateNote(id, { content: '<p>A2 typed during the push</p>' });
      const serverData = serverNoteRow(id, '<p>B (older than A2)</p>', at(30_000));
      return [{ table: 'notes', id, status: 'conflict', serverUpdatedAt: serverData.updatedAt, serverData }];
    });

    await drainSyncOutbox();

    const note = useUnfoldStore.getState().notes.find((n) => n.id === id)!;
    expect(note.content).toBe('<p>A2 typed during the push</p>');
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ table: 'notes', id, clientUpdatedAt: at(60_000) }),
    ]);
  });

  it('removes the local record when the server version is a tombstone', async () => {
    const id = addNote('<p>deleted elsewhere</p>');
    const serverData = serverNoteRow(id, '<p>deleted elsewhere</p>', at(30_000), at(30_000));
    mockPushResponse(() => [
      { table: 'notes', id, status: 'conflict', serverUpdatedAt: serverData.updatedAt, serverData },
    ]);

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().notes.find((n) => n.id === id)).toBeUndefined();
    expect(peekSyncOutbox()).toHaveLength(0);
  });

  // 2026-10-09 release audit pass 2: the server stamped the series after the delete, the conflict applied its live row, and the deleted series came back.
  it('keeps a deleted series deleted when the server wrote to it before the delete arrived', async () => {
    resetDeletedSeriesForTesting();
    useUnfoldStore.setState({
      devotionals: [{
        id: 'series-1',
        title: 'Stillness',
        totalDays: 14,
        currentDay: 4,
        days: [{ id: 'day-4', dayNumber: 4, title: 'Day 4', scriptureReference: 'John 1:1', scriptureText: '', bodyText: '', quotableLine: '', isRead: true }],
        createdAt: at(0),
        updatedAt: at(0),
        generationMode: 'progressive',
      } as never],
      currentDevotionalId: 'series-1',
    });
    useUnfoldStore.getState().removeDevotional('series-1');
    // The push goes out the next morning. Overnight the server wrote the next
    // day and stamped the series with its own clock, a little ahead of this phone.
    jest.setSystemTime(new Date(T0.getTime() + 8 * 3_600_000));
    const serverAt = at(8 * 3_600_000 + 5_000);
    (globalThis as any).fetch = jest.fn(async (_url: string, init: RequestInit) => {
      const { changes } = JSON.parse(String(init.body)) as { changes: SyncPushChange[] };
      return {
        ok: true,
        json: async () => ({
          results: changes.map((change) => (change.table === 'devotionals'
            ? { table: change.table, id: change.id, status: 'conflict', serverUpdatedAt: serverAt, serverData: serverSeriesRow(change.id, serverAt) }
            : { table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: serverAt })),
        }),
      };
    });

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().devotionals.some((row) => row.id === 'series-1')).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ table: 'devotionals', id: 'series-1', deleted: true, clientUpdatedAt: at(8 * 3_600_000 + 5_001) }),
    ]);
    // Once the retry is through, a pull that left before it still cannot bring the series back.
    removeSyncChangesForRecords([{ table: 'devotionals', id: 'series-1' }]);
    expect(wasSeriesDeleted('series-1', serverAt)).toBe(true);
    resetDeletedSeriesForTesting();
  });

  // Round 2 review: the delete was remembered at the server's older clock, so
  // a server write that landed while the retry was out could restore it.
  it('remembers a requeued series delete at the retry\'s own clock', async () => {
    resetDeletedSeriesForTesting();
    try {
      useUnfoldStore.setState({
        devotionals: [{
          id: 'series-1', title: 'Stillness', totalDays: 14, currentDay: 4, days: [],
          createdAt: at(0), updatedAt: at(0), generationMode: 'progressive',
        } as never],
        currentDevotionalId: 'series-1',
      });
      useUnfoldStore.getState().removeDevotional('series-1');
      // This phone runs ahead of the server's clock on the series row.
      jest.setSystemTime(new Date(T0.getTime() + 120_000));
      const serverAt = at(60_000);
      (globalThis as any).fetch = jest.fn(async (_url: string, init: RequestInit) => {
        const { changes } = JSON.parse(String(init.body)) as { changes: SyncPushChange[] };
        return {
          ok: true,
          json: async () => ({
            results: changes.map((change) => (change.table === 'devotionals'
              ? { table: change.table, id: change.id, status: 'conflict', serverUpdatedAt: serverAt, serverData: serverSeriesRow(change.id, serverAt) }
              : { table: change.table, id: change.id, status: 'accepted', serverUpdatedAt: serverAt })),
          }),
        };
      });

      await drainSyncOutbox();
      removeSyncChangesForRecords([{ table: 'devotionals', id: 'series-1' }]);

      // A live row written while the retry was out, after the conflict.
      expect(wasSeriesDeleted('series-1', at(90_000))).toBe(true);
    } finally {
      resetDeletedSeriesForTesting();
    }
  });

  it('retains a conflict without serverData and does not apply it', async () => {
    const id = addNote('<p>mine</p>');
    mockPushResponse(() => [
      { table: 'notes', id, status: 'conflict', serverUpdatedAt: at(30_000) },
    ]);

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().notes.find((n) => n.id === id)?.content).toBe('<p>mine</p>');
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ table: 'notes', id })]);
  });

  it('does not apply an explicit non-composite remapped conflict', async () => {
    const id = addNote('<p>mine</p>');
    const serverData = serverNoteRow('server-note-a', '<p>B remapped</p>', at(30_000));
    mockPushResponse(() => [{
      table: 'notes',
      requestedId: id,
      id: 'server-note-a',
      status: 'conflict',
      serverUpdatedAt: serverData.updatedAt,
      serverData,
    }]);

    await drainSyncOutbox();

    expect(useUnfoldStore.getState().notes.find((n) => n.id === id)?.content).toBe('<p>mine</p>');
    expect(useUnfoldStore.getState().notes.some((item) => item.id === 'server-note-a')).toBe(false);
    expect(peekSyncOutbox()).toEqual([expect.objectContaining({ table: 'notes', id })]);
  });

  it('does not apply a remapped conflict while newer work remains under the requested id', async () => {
    const requestedId = 'client-position-b';
    enqueueSyncChanges([{
      table: 'bible_reading_positions',
      id: requestedId,
      clientUpdatedAt: at(0),
      deleted: false,
      data: { schemaVersion: 1, book: 'John' },
    }]);
    mockPushResponse(() => {
      jest.setSystemTime(new Date(T0.getTime() + 60_000));
      enqueueSyncChanges([{
        table: 'bible_reading_positions',
        id: requestedId,
        clientUpdatedAt: at(60_000),
        deleted: false,
        data: { schemaVersion: 1, book: 'John', verse: 3 },
      }]);
      const serverData = serverBiblePositionRow('server-position-a', at(30_000));
      return [{
        table: 'bible_reading_positions',
        requestedId,
        id: serverData.id,
        status: 'conflict',
        serverUpdatedAt: serverData.updatedAt,
        serverData,
      }];
    });

    const applyConflicts = jest.spyOn(fullSyncPull, 'applyServerConflictRecords');
    await drainSyncOutbox();

    expect(applyConflicts).not.toHaveBeenCalled();
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({
        table: 'bible_reading_positions',
        id: requestedId,
        clientUpdatedAt: at(60_000),
      }),
    ]);
    expect(useUnfoldStore.getState().bibleReadingHistory.some((item) => item.id === 'server-position-a')).toBe(false);
    applyConflicts.mockRestore();
  });

  it('applies a remapped composite conflict when no newer requested-id work remains', async () => {
    const requestedId = 'client-position-b';
    const serverData = serverBiblePositionRow('server-position-a', at(30_000));
    enqueueSyncChanges([{
      table: 'bible_reading_positions',
      id: requestedId,
      clientUpdatedAt: at(0),
      deleted: false,
      data: { schemaVersion: 1, bookId: 43, chapter: 1 },
    }]);
    mockPushResponse(() => [{
      table: 'bible_reading_positions',
      requestedId,
      id: serverData.id,
      status: 'conflict',
      serverUpdatedAt: serverData.updatedAt,
      serverData,
    }]);

    await drainSyncOutbox();

    expect(peekSyncOutbox()).toHaveLength(0);
    const applied = useUnfoldStore.getState().bibleReadingHistory.find((item) => item.id === 'server-position-a');
    expect(applied).toEqual(expect.objectContaining({
      id: 'server-position-a',
      bookId: 43,
      bookName: 'John',
      chapter: 3,
      translation: 'BSB',
    }));
  });

  it('does not apply a remapped conflict when equal-timestamp requested-id work remains', async () => {
    const requestedId = 'client-position-b';
    const submitted = {
      table: 'bible_reading_positions' as const,
      id: requestedId,
      clientUpdatedAt: at(0),
      deleted: false,
      data: { schemaVersion: 1, bookId: 43, chapter: 1 },
    };
    const replacement = {
      ...submitted,
      data: { schemaVersion: 1, bookId: 43, chapter: 5 },
    };
    enqueueSyncChanges([submitted]);
    mockPushResponse(() => {
      enqueueSyncChanges([replacement]);
      const serverData = serverBiblePositionRow('server-position-a', at(30_000));
      return [{
        table: 'bible_reading_positions',
        requestedId,
        id: serverData.id,
        status: 'conflict',
        serverUpdatedAt: serverData.updatedAt,
        serverData,
      }];
    });

    const applyConflicts = jest.spyOn(fullSyncPull, 'applyServerConflictRecords');
    await drainSyncOutbox();

    expect(applyConflicts).not.toHaveBeenCalled();
    expect(peekSyncOutbox()).toEqual([
      expect.objectContaining({ id: requestedId, data: replacement.data }),
    ]);
    expect(useUnfoldStore.getState().bibleReadingHistory.some((item) => item.id === 'server-position-a')).toBe(false);
    applyConflicts.mockRestore();
  });
});
