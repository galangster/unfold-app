import type { JournalEntry } from '../store';
import type { SyncPushChange } from '../sync-types';

// A cold module boot retains only synthetic disk, never the previous store or timers.
const mockDisk = new Map<string, string>();
let mockFailStoreWrite = false;
let mockIdentity = 'synthetic-durability-identity';
let mockResults: ((changes: SyncPushChange[]) => unknown[]) | undefined;
let mockResponseGate: Promise<void> | undefined;
let mockPostStarted: (() => void) | undefined;

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockDisk.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      if (key === 'unfold-storage' && mockFailStoreWrite) throw new Error('Synthetic store write failure');
      mockDisk.set(key, value);
    }),
    removeItem: jest.fn((key: string) => { mockDisk.delete(key); }),
  },
  getDeviceId: jest.fn(() => mockIdentity),
  getSharedEncryptionKey: jest.fn(() => 'synthetic-unused-encryption-fixture'),
  isRecoverySession: jest.fn(() => false),
}));
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://synthetic.invalid',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../device-credential', () => ({
  authenticatedFetch: jest.fn(async (_url: string, options: { body: string }) => {
    const { changes } = JSON.parse(options.body) as { changes: SyncPushChange[] };
    mockPostStarted?.();
    await mockResponseGate;
    return { ok: true, json: async () => ({ results: mockResults?.(changes) ?? changes.map((change) => ({
      table: change.table, id: change.id, requestedId: change.id, status: 'accepted',
      serverUpdatedAt: '2099-01-01T00:00:00.000Z',
    })) }) };
  }),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../bug-logger', () => ({ logBugError: jest.fn(), logBugEvent: jest.fn() }));
jest.mock('../logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const STORE_KEY = 'unfold-storage';
const SERIES = 'synthetic-durability-series';
const BASELINE = 'Synthetic older writing';
const RECOVERED = 'Synthetic recovered writing';
const CREATED = '2026-01-01T00:00:00.000Z';
const NEWER = '2099-01-01T00:00:00.000Z';

function coldBoot(hydrated = true) {
  jest.clearAllTimers();
  jest.resetModules();
  const store = jest.requireActual('../store') as typeof import('../store');
  const outbox = jest.requireActual('../sync-outbox') as typeof import('../sync-outbox');
  expect(store.useUnfoldStore.persist.hasHydrated()).toBe(hydrated);
  return { ...store, ...outbox };
}
type Boot = ReturnType<typeof coldBoot>;

function accepted(change: SyncPushChange) {
  return { table: change.table, id: change.id, requestedId: change.id, status: 'accepted', serverUpdatedAt: NEWER };
}

async function seed(hasBaseline = true) {
  const boot = coldBoot();
  const { canonicalJournalEntryId } = jest.requireActual('../journal-entry-merge') as typeof import('../journal-entry-merge');
  const { buildPersonalDataSyncChange, journalEntrySyncData } = jest.requireActual('../personal-data-sync-records') as typeof import('../personal-data-sync-records');
  const row: JournalEntry = { id: canonicalJournalEntryId(SERIES, 1), devotionalId: SERIES, dayNumber: 1,
    content: BASELINE, createdAt: CREATED, updatedAt: CREATED, journalMode: 'freewrite' };
  boot.useUnfoldStore.setState({
    devotionals: [{ id: SERIES, title: 'Synthetic series', totalDays: 1, currentDay: 1, days: [],
      createdAt: CREATED, updatedAt: CREATED }],
    journalEntries: hasBaseline ? [row] : [],
    nudgeShownThisSession: true,
    streakJustReset: true,
  } as never);
  await boot.flushUnfoldStorePersistAsync();
  const baselineDisk = mockDisk.get(STORE_KEY)!;
  const snapshot = buildPersonalDataSyncChange('journal_entries', row.id,
    journalEntrySyncData({ ...row, content: RECOVERED }), NEWER);
  boot.replaceSyncOutbox([snapshot]);
  return { boot, row, snapshot, baselineDisk };
}

function expectRecovered(boot: Boot, snapshot: SyncPushChange) {
  expect(boot.useUnfoldStore.getState().getJournalEntry(SERIES, 1)).toMatchObject({
    id: snapshot.id, content: RECOVERED, createdAt: CREATED, updatedAt: NEWER,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function holdResponse() {
  const started = deferred();
  const response = deferred();
  mockPostStarted = started.resolve;
  mockResponseGate = response.promise;
  return { started: started.promise, release: response.resolve };
}

const sibling: SyncPushChange = {
  table: 'notes', id: 'synthetic-note', clientUpdatedAt: CREATED,
  data: { title: 'Synthetic note', content: 'Synthetic note content' }, deleted: false,
};

beforeEach(() => {
  jest.useFakeTimers();
  mockDisk.clear();
  mockFailStoreWrite = false;
  mockIdentity = 'synthetic-durability-identity';
  mockResults = undefined;
  mockResponseGate = undefined;
  mockPostStarted = undefined;
  global.fetch = jest.fn(() => { throw new Error('DURABILITY_TEST_NETWORK_FORBIDDEN'); }) as never;
});

afterEach(() => {
  expect(global.fetch).not.toHaveBeenCalled();
  jest.clearAllTimers();
  jest.useRealTimers();
});

it.each([
  ['existing row, accepted', true, true],
  ['missing row, accepted', false, true],
  ['existing row, rejected', true, false],
  ['missing row, rejected', false, false],
] as const)('retains recovered writing across real drain and repeated cold boots: %s', async (_label, hasBaseline, accepts) => {
  const { snapshot } = await seed(hasBaseline);
  if (!accepts) mockResults = (changes) => changes.map((change) => ({ ...accepted(change), status: 'rejected' }));
  const first = coldBoot();
  expectRecovered(first, snapshot);
  expect(first.peekSyncOutbox()).toEqual([snapshot]);
  await first.drainSyncOutbox();
  expect(jest.requireMock('../device-credential').authenticatedFetch).toHaveBeenCalledTimes(1);
  expect(first.peekSyncOutbox()).toEqual(accepts ? [] : [snapshot]);
  for (let restart = 0; restart < 3; restart += 1) {
    const next = coldBoot();
    expectRecovered(next, snapshot);
    expect(next.peekSyncOutbox()).toEqual(accepts ? [] : [snapshot]);
  }
});

it.each(['rehydrate', 'cold boot'] as const)('retains the queue after a durable-write failure and recovers through %s', async (retry) => {
  const { snapshot } = await seed();
  mockFailStoreWrite = true;
  const failed = coldBoot(false);
  expectRecovered(failed, snapshot);
  await failed.drainSyncOutbox();
  failed.settleDirectSyncPush([snapshot], [accepted(snapshot)]);
  expect(failed.peekSyncOutbox()).toEqual([snapshot]);
  expect(jest.requireMock('../api-config').getAuthHeaders).not.toHaveBeenCalled();
  expect(jest.requireMock('../device-credential').authenticatedFetch).not.toHaveBeenCalled();
  mockFailStoreWrite = false;
  const healthy = retry === 'cold boot' ? coldBoot() : failed;
  if (retry === 'rehydrate') await healthy.useUnfoldStore.persist.rehydrate();
  expect(healthy.useUnfoldStore.persist.hasHydrated()).toBe(true);
  await healthy.drainSyncOutbox();
  expect(healthy.peekSyncOutbox()).toEqual([]);
  expectRecovered(coldBoot(), snapshot);
});

it.each(['absent blob with repaired memory', 'pending repaired value'] as const)(
  'does not mistake a no-delta retry for a durable recovery: %s', async (shape) => {
    const { snapshot } = await seed();
    mockFailStoreWrite = true;
    const boot = coldBoot(false);
    if (shape === 'absent blob with repaired memory') mockDisk.delete(STORE_KEY);
    else boot.useUnfoldStore.setState({ nudgeShownThisSession: true });
    await boot.useUnfoldStore.persist.rehydrate();
    expect(boot.useUnfoldStore.persist.hasHydrated()).toBe(false);
    boot.settleDirectSyncPush([snapshot], [accepted(snapshot)]);
    expect(boot.peekSyncOutbox()).toEqual([snapshot]);
    mockFailStoreWrite = false;
    await boot.useUnfoldStore.persist.rehydrate();
    expect(boot.useUnfoldStore.persist.hasHydrated()).toBe(true);
    await boot.drainSyncOutbox();
    expect(boot.peekSyncOutbox()).toEqual([]);
    expectRecovered(coldBoot(), snapshot);
  },
);

it('blocks a mixed queue before transport after a failed checkpoint', async () => {
  const { boot: seedBoot, snapshot } = await seed();
  seedBoot.replaceSyncOutbox([snapshot, sibling]);
  mockFailStoreWrite = true;
  const boot = coldBoot(false);
  await boot.drainSyncOutbox();
  expect(boot.peekSyncOutbox()).toEqual([snapshot, sibling]);
  expect(jest.requireMock('../api-config').getAuthHeaders).not.toHaveBeenCalled();
  expect(jest.requireMock('../device-credential').authenticatedFetch).not.toHaveBeenCalled();
});

it.each(['accepted', 'conflict', 'rejected', 'missing', 'malformed'] as const)(
  'retains journal recovery when checkpointing fails during an in-flight %s result', async (status) => {
    const { snapshot, baselineDisk } = await seed();
    const boot = coldBoot();
    boot.replaceSyncOutbox([snapshot, sibling]);
    mockResults = () => [accepted(sibling), ...(status === 'missing' ? [] : [{
      ...accepted(snapshot), status: status === 'malformed' ? 'unrecognized' : status,
      ...(status === 'conflict' ? { serverData: { id: snapshot.id, ...snapshot.data } } : {}),
    }])];
    const response = holdResponse();
    const draining = boot.drainSyncOutbox();
    await response.started;
    mockDisk.set(STORE_KEY, baselineDisk);
    mockFailStoreWrite = true;
    await boot.useUnfoldStore.persist.rehydrate();
    expect(boot.useUnfoldStore.persist.hasHydrated()).toBe(false);
    response.release();
    await draining;
    expect(boot.peekSyncOutbox()).toEqual(status === 'accepted' || status === 'conflict' ? [snapshot, sibling] : [snapshot]);
  },
);

it('keeps a newer queued edit when the earlier snapshot is accepted', async () => {
  const { snapshot } = await seed();
  const boot = coldBoot();
  const response = holdResponse();
  const draining = boot.drainSyncOutbox();
  await response.started;
  const newer = { ...snapshot, clientUpdatedAt: '2099-01-02T00:00:00.000Z',
    data: { ...snapshot.data, content: 'Synthetic concurrent edit' } };
  boot.enqueueSyncChanges([newer]);
  response.release();
  await draining;
  expect(boot.peekSyncOutbox()).toEqual([newer]);
  expect(coldBoot().useUnfoldStore.getState().getJournalEntry(SERIES, 1)).toMatchObject({
    content: 'Synthetic concurrent edit', updatedAt: newer.clientUpdatedAt, createdAt: CREATED,
  });
});

it('keeps the journal queue across a reset while an accepted response is in flight', async () => {
  const { snapshot } = await seed();
  const boot = coldBoot();
  const response = holdResponse();
  const draining = boot.drainSyncOutbox();
  await response.started;
  const fence = jest.requireActual('../sync-session-fence') as typeof import('../sync-session-fence');
  const reset = fence.beginLocalResetSession();
  fence.endLocalResetSession(reset);
  response.release();
  await draining;
  expect(boot.peekSyncOutbox()).toEqual([snapshot]);
});

it('ignores an older direct acknowledgement and durably retains the exact accepted recovery', async () => {
  const { snapshot } = await seed();
  const boot = coldBoot();
  const older = { ...snapshot, clientUpdatedAt: CREATED, data: { ...snapshot.data, content: BASELINE } };
  boot.settleDirectSyncPush([older], [accepted(older)]);
  expect(boot.peekSyncOutbox()).toEqual([snapshot]);
  boot.settleDirectSyncPush([snapshot], [accepted(snapshot)]);
  expect(boot.peekSyncOutbox()).toEqual([]);
  expectRecovered(coldBoot(), snapshot);
});

it('preserves ephemeral-identity refusal without identity resolution during local recovery', async () => {
  const { snapshot } = await seed();
  mockIdentity = 'ephemeral-synthetic-durability';
  const boot = coldBoot();
  const storage = jest.requireMock('../mmkv-storage') as typeof import('../mmkv-storage');
  expectRecovered(boot, snapshot);
  expect(storage.getDeviceId).not.toHaveBeenCalled();
  expect(storage.getSharedEncryptionKey).not.toHaveBeenCalled();
  boot.enqueueSyncChanges([sibling]);
  await boot.drainSyncOutbox();
  expect(boot.peekSyncOutbox()).toEqual([snapshot]);
  expect(jest.requireMock('../api-config').getAuthHeaders).not.toHaveBeenCalled();
  expect(jest.requireMock('../device-credential').authenticatedFetch).not.toHaveBeenCalled();
  expect([...mockDisk.keys()].sort()).toEqual([STORE_KEY, boot.OUTBOX_KEY].sort());
  const secureStore = jest.requireMock('expo-secure-store') as typeof import('expo-secure-store');
  expect(secureStore.getItem).not.toHaveBeenCalled();
  expect(secureStore.setItem).not.toHaveBeenCalled();
});

it('keeps the existing persistence envelope and excludes session-only fields', async () => {
  const { snapshot } = await seed();
  const boot = coldBoot();
  const persisted = JSON.parse(mockDisk.get(STORE_KEY)!);
  expect(persisted.version).toBe(44);
  expect(persisted.state).not.toHaveProperty('nudgeShownThisSession');
  expect(persisted.state).not.toHaveProperty('streakJustReset');
  expect(await boot.flushUnfoldStorePersistAsync()).toBe(false);
  expectRecovered(coldBoot(), snapshot);
});

it.each(['equal clock', 'newer local', 'missing series', 'occupied day', 'queued delete'] as const)(
  'does not checkpoint or replace a journal when recovery is inapplicable: %s', async (reason) => {
    const { snapshot, boot: seedBoot } = await seed();
    const persisted = JSON.parse(mockDisk.get(STORE_KEY)!);
    if (reason === 'equal clock') persisted.state.journalEntries[0].updatedAt = NEWER;
    if (reason === 'newer local') persisted.state.journalEntries[0].updatedAt = '2099-01-02T00:00:00.000Z';
    if (reason === 'missing series') persisted.state.devotionals = [];
    if (reason === 'occupied day') persisted.state.journalEntries[0].id = 'synthetic-other-entry';
    if (reason === 'queued delete') seedBoot.replaceSyncOutbox([{ ...snapshot, deleted: true }]);
    const before = JSON.stringify(persisted);
    mockDisk.set(STORE_KEY, before);
    const boot = coldBoot();
    expect(boot.useUnfoldStore.getState().journalEntries).toEqual(persisted.state.journalEntries);
    expect(mockDisk.get(STORE_KEY)).toBe(before);
    expect(await boot.flushUnfoldStorePersistAsync()).toBe(false);
    expect(jest.requireMock('../mmkv-storage').mmkvStorage.setItem).not.toHaveBeenCalled();
  },
);

it('keeps non-journal settlement independent of store hydration failure', async () => {
  const { boot: seedBoot } = await seed();
  seedBoot.replaceSyncOutbox([sibling]);
  mockDisk.set(STORE_KEY, '{');
  const boot = coldBoot(false);
  await boot.drainSyncOutbox();
  expect(boot.peekSyncOutbox()).toEqual([]);
  expect(jest.requireMock('../device-credential').authenticatedFetch).toHaveBeenCalledTimes(1);
});
