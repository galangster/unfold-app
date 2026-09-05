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

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Getters so a test can change the "installed" app version after the module
// under test has already imported the mock.
const mockApplication = { nativeApplicationVersion: '1.2.3', nativeBuildVersion: '45' };
jest.mock('expo-application', () => ({
  get nativeApplicationVersion() { return mockApplication.nativeApplicationVersion; },
  get nativeBuildVersion() { return mockApplication.nativeBuildVersion; },
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

import {
  DEVOTIONAL_FULL_PULL_INTERVAL_MS,
  DEVOTIONAL_PULL_CURSOR_KEY,
  DEVOTIONAL_PULL_CURSOR_OVERLAP_MS,
  DEVOTIONAL_PULL_CURSOR_SCHEMA,
  parseDevotionalPullCursor,
  serializeDevotionalPullCursor,
} from '../devotional-pull-cursor';
import type { DevotionalPullCursor } from '../devotional-pull-cursor';
import { applyPulledDevotionalContent } from '../devotional-pulled-content';
import {
  commitDevotionalPullCursor,
  extractPulledDevotionalContent,
  getDevotionalPullVersionMarker,
  pullDevotionalContent,
} from '../devotional-sync-pull';
import type { PulledDevotionalContent } from '../devotional-sync-pull';
import { logger } from '../logger';
import * as mmkvStorageModule from '../mmkv-storage';
import { getDeviceId, mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore } from '../store';
import type { Devotional, DevotionalDay } from '../store';
import type { SyncPullResponse, SyncPulledRecord } from '../sync-types';

const mockFetch = jest.fn();
const mockGetDeviceId = getDeviceId as jest.Mock;
const mockLog = logger.log as jest.Mock;
const mockWarn = logger.warn as jest.Mock;

const DEVOTIONAL_ID = 'devotional-1';
const HOUR_MS = 60 * 60 * 1000;

function dayRecord(dayNumber: number, overrides: Partial<SyncPulledRecord> & { title?: string } = {}): SyncPulledRecord {
  const { title, ...record } = overrides;
  return {
    id: `day-${DEVOTIONAL_ID}-${dayNumber}`,
    updatedAt: '2026-04-25T11:58:00.000Z',
    deleted: false,
    data: {
      devotionalId: DEVOTIONAL_ID,
      dayNumber,
      title: title ?? `Server Day ${dayNumber}`,
      scriptureReference: 'Exodus 3:13-15',
      scriptureText: 'God said to Moses, I AM WHO I AM.',
      bodyText: `Server body for day ${dayNumber}.`,
      quotableLine: 'God meets you by name in the fire.',
      isRead: false,
    },
    ...record,
  };
}

function localDay(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    id: `day-${DEVOTIONAL_ID}-${dayNumber}`,
    devotionalId: DEVOTIONAL_ID,
    dayNumber,
    title: `Local Day ${dayNumber}`,
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'The Lord is my shepherd.',
    bodyText: `Local body for day ${dayNumber}.`,
    quotableLine: 'Local line.',
    isRead: false,
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
}

function seedLocalDevotional(days: DevotionalDay[] = [localDay(1)]): Devotional {
  const devotional: Devotional = {
    id: DEVOTIONAL_ID,
    title: 'The Names That Hold You',
    totalDays: 14,
    currentDay: 1,
    days,
    createdAt: '2026-04-24T00:00:00.000Z',
    seriesStartDate: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    userContext: { name: 'Nick', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
  };
  useUnfoldStore.setState({ devotionals: [devotional], currentDevotionalId: DEVOTIONAL_ID });
  return devotional;
}

function respondWith(payload: Partial<SyncPullResponse> & Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ changes: {}, ...payload }),
  });
}

function requestBodies(): { lastPulledAt: string | null }[] {
  return mockFetch.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

function storedCursor(): DevotionalPullCursor | null {
  return parseDevotionalPullCursor(mmkvStorage.getItem(DEVOTIONAL_PULL_CURSOR_KEY) as string | null);
}

function seedCursor(overrides: Partial<DevotionalPullCursor> = {}): DevotionalPullCursor {
  const cursor: DevotionalPullCursor = {
    v: DEVOTIONAL_PULL_CURSOR_SCHEMA,
    deviceId: 'test-device-id',
    devotionalId: DEVOTIONAL_ID,
    versionMarker: getDevotionalPullVersionMarker(),
    lastPulledAt: '2026-04-25T12:00:00.000Z',
    lastFullPullAt: Date.now() - HOUR_MS,
    ...overrides,
  };
  mmkvStorage.setItem(DEVOTIONAL_PULL_CURSOR_KEY, serializeDevotionalPullCursor(cursor));
  return cursor;
}

function applyToStore(pulled: PulledDevotionalContent) {
  applyPulledDevotionalContent({
    devotionalId: DEVOTIONAL_ID,
    pulled,
    updateDevotionalDays: useUnfoldStore.getState().updateDevotionalDays,
    updateDevotionals: (updater) => {
      useUnfoldStore.setState((state) => ({ devotionals: updater(state.devotionals) }));
    },
  });
}

function localDays(): DevotionalDay[] {
  return useUnfoldStore.getState().devotionals.find((d) => d.id === DEVOTIONAL_ID)?.days ?? [];
}

/** Full pull → apply → commit; returns the server timestamp now stored. */
async function completeFullPull(timestamp = '2026-04-25T12:00:00.000Z'): Promise<string> {
  respondWith({ timestamp, changes: { devotional_days: [dayRecord(1)] } });
  const pulled = await pullDevotionalContent(DEVOTIONAL_ID);
  applyToStore(pulled);
  expect(commitDevotionalPullCursor(pulled)).toBe(true);
  return timestamp;
}

function overlapped(timestamp: string): string {
  return new Date(Date.parse(timestamp) - DEVOTIONAL_PULL_CURSOR_OVERLAP_MS).toISOString();
}

beforeEach(() => {
  jest.clearAllMocks();
  (mmkvStorageModule as unknown as { __clearMockStorage: () => void }).__clearMockStorage();
  mockApplication.nativeApplicationVersion = '1.2.3';
  mockApplication.nativeBuildVersion = '45';
  mockGetDeviceId.mockReturnValue('test-device-id');
  useUnfoldStore.getState().reset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('devotional sync pull recovery', () => {
  it('maps persisted devotional day rows by merging full content with flat sync columns', () => {
    const payload: SyncPullResponse = {
      timestamp: '2026-04-25T12:00:00.000Z',
      changes: {
        devotionals: [
          {
            id: 'devotional-1',
            updatedAt: '2026-04-25T11:59:00.000Z',
            deleted: false,
            data: {
              title: 'The Names That Hold You',
              totalDays: 14,
              currentDay: 2,
            },
          },
        ],
        devotional_days: [
          {
            id: 'day-devotional-1-2',
            updatedAt: '2026-04-25T11:58:00.000Z',
            deleted: false,
            data: {
              devotionalId: 'devotional-1',
              dayNumber: 2,
              title: 'The Fire That Speaks Your Name',
              scriptureReference: 'Exodus 3:13–15',
              scriptureText: 'God said to Moses, I AM WHO I AM.',
              bodyText: 'A devotional body from the server.',
              quotableLine: 'God meets you by name in the fire.',
              isRead: false,
              clientUpdatedAt: '2026-04-25T11:57:00.000Z',
              content: {
                dayNumber: 2,
                title: 'Older content title',
                devotionalId: 'devotional-1',
                reflectionQuestions: ['Where is God naming you today?'],
                closingPrayer: 'Lord, meet me here.',
                wordStudy: 'The Hebrew name points to God meeting people personally.',
              },
            },
          },
          {
            id: 'day-other-2',
            updatedAt: '2026-04-25T11:58:00.000Z',
            deleted: false,
            data: {
              devotionalId: 'other-devotional',
              dayNumber: 2,
              title: 'Other',
              scriptureReference: 'John 1:1',
              scriptureText: 'In the beginning',
              bodyText: 'Other body',
              quotableLine: 'Other line',
            },
          },
        ],
      },
    };

    const result = extractPulledDevotionalContent(payload, 'devotional-1');

    expect(result.devotional).toMatchObject({
      id: 'devotional-1',
      title: 'The Names That Hold You',
      totalDays: 14,
      currentDay: 2,
    });
    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      id: 'day-devotional-1-2',
      devotionalId: 'devotional-1',
      dayNumber: 2,
      title: 'The Fire That Speaks Your Name',
      scriptureReference: 'Exodus 3:13–15',
      reflectionQuestions: ['Where is God naming you today?'],
      closingPrayer: 'Lord, meet me here.',
      wordStudy: 'The Hebrew name points to God meeting people personally.',
      isRead: false,
      updatedAt: '2026-04-25T11:58:00.000Z', // WR-25: mapped rows store clientUpdatedAt as local updatedAt (same-clock LWW basis),
    });
  });

  it('posts an authenticated full pull and extracts the requested devotional', async () => {
    seedLocalDevotional();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        timestamp: '2026-04-25T12:00:00.000Z',
        changes: { devotional_days: [] },
      }),
    });

    await expect(pullDevotionalContent('devotional-1')).resolves.toMatchObject({
      days: [],
      timestamp: '2026-04-25T12:00:00.000Z',
    });

    expect(mockFetch).toHaveBeenCalledWith('https://example.test/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastPulledAt: null }),
    });
  });
});

describe('devotional pull cursor', () => {
  it('fingerprints the app build and the persisted-store version', () => {
    expect(getDevotionalPullVersionMarker()).toBe(
      `app:1.2.3+45|store:v${useUnfoldStore.persist.getOptions().version}|cursor:v${DEVOTIONAL_PULL_CURSOR_SCHEMA}`,
    );
  });

  it('pulls full with no cursor stored and logs the reason (existing install upgrading)', async () => {
    seedLocalDevotional();
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (no-cursor)');
  });

  it('does not advance the cursor until the caller commits the applied content', async () => {
    seedLocalDevotional();
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });
    respondWith({ timestamp: '2026-04-25T12:05:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);
    expect(storedCursor()).toBeNull();

    // A pull whose content was never applied (e.g. focus cancelled) leaves
    // the next pull full as well.
    await pullDevotionalContent(DEVOTIONAL_ID);
    expect(requestBodies()).toEqual([{ lastPulledAt: null }, { lastPulledAt: null }]);
    expect(storedCursor()).toBeNull();
  });

  it('stores the SERVER timestamp on commit and sends it (minus the overlap) on the next pull', async () => {
    seedLocalDevotional();
    const serverTimestamp = await completeFullPull('2026-04-25T12:00:00.000Z');

    expect(mmkvStorage.setItem).toHaveBeenCalledWith(DEVOTIONAL_PULL_CURSOR_KEY, expect.any(String));
    expect(storedCursor()).toEqual({
      v: DEVOTIONAL_PULL_CURSOR_SCHEMA,
      deviceId: 'test-device-id',
      devotionalId: DEVOTIONAL_ID,
      versionMarker: getDevotionalPullVersionMarker(),
      lastPulledAt: serverTimestamp,
      lastFullPullAt: expect.any(Number),
    });

    respondWith({ timestamp: '2026-04-25T12:10:00.000Z' });
    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()[1]).toEqual({ lastPulledAt: overlapped(serverTimestamp) });
    expect(mockLog).toHaveBeenLastCalledWith(
      `[sync/devotional-pull] pull: incremental since ${overlapped(serverTimestamp)}`,
    );
  });

  it('advances the cursor across committed incremental pulls', async () => {
    seedLocalDevotional();
    await completeFullPull('2026-04-25T12:00:00.000Z');
    const fullPullAt = storedCursor()?.lastFullPullAt;

    respondWith({ timestamp: '2026-04-25T12:10:00.000Z', changes: { devotional_days: [dayRecord(2)] } });
    const delta = await pullDevotionalContent(DEVOTIONAL_ID);
    applyToStore(delta);
    expect(commitDevotionalPullCursor(delta)).toBe(true);

    expect(storedCursor()).toMatchObject({
      lastPulledAt: '2026-04-25T12:10:00.000Z',
      lastFullPullAt: fullPullAt, // the full-pull clock is untouched by deltas
    });

    respondWith({ timestamp: '2026-04-25T12:20:00.000Z' });
    await pullDevotionalContent(DEVOTIONAL_ID);
    expect(requestBodies()[2]).toEqual({ lastPulledAt: overlapped('2026-04-25T12:10:00.000Z') });
  });

  it('keeps the cursor untouched when the server responds with a 500', async () => {
    seedLocalDevotional();
    const before = seedCursor();
    (mmkvStorage.setItem as jest.Mock).mockClear();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '{"error":"Could not merge entry: I keep failing my brother Michael."}',
    });

    // Exact message: the status and NOTHING of the response body. An
    // exception's `value` is allowlisted through to Sentry by `scrubException`,
    // and a backend error body can quote the journal text it failed on.
    await expect(pullDevotionalContent(DEVOTIONAL_ID))
      .rejects.toThrow(new Error('Sync pull failed: 500'));

    expect(requestBodies()).toEqual([{ lastPulledAt: overlapped(before.lastPulledAt) }]);
    expect(storedCursor()).toEqual(before);
    expect(mmkvStorage.setItem).not.toHaveBeenCalledWith(DEVOTIONAL_PULL_CURSOR_KEY, expect.anything());

    // The next pull resumes from the same cursor — nothing was lost or skipped.
    respondWith({ timestamp: '2026-04-25T13:00:00.000Z' });
    await pullDevotionalContent(DEVOTIONAL_ID);
    expect(requestBodies()[1]).toEqual({ lastPulledAt: overlapped(before.lastPulledAt) });
  });

  it('keeps the cursor untouched when the network request itself fails', async () => {
    seedLocalDevotional();
    const before = seedCursor();
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(pullDevotionalContent(DEVOTIONAL_ID)).rejects.toThrow('Network request failed');
    expect(storedCursor()).toEqual(before);
  });

  it('keeps the cursor untouched when the response body is not valid JSON', async () => {
    seedLocalDevotional();
    const before = seedCursor();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });

    await expect(pullDevotionalContent(DEVOTIONAL_ID)).rejects.toThrow('Unexpected token <');
    expect(storedCursor()).toEqual(before);
  });

  it('refuses to advance the cursor when the response carries no server timestamp', async () => {
    seedLocalDevotional();
    const before = seedCursor();
    respondWith({ timestamp: undefined, changes: { devotional_days: [dayRecord(2)] } });

    const pulled = await pullDevotionalContent(DEVOTIONAL_ID);
    applyToStore(pulled);

    expect(commitDevotionalPullCursor(pulled)).toBe(false);
    expect(storedCursor()).toEqual(before);
    expect(mockWarn).toHaveBeenCalledWith(
      '[sync/devotional-pull] response has no server timestamp; cursor will not advance',
    );
  });

  it('ignores commits for content that did not come from a pull, and commits each pull once', async () => {
    seedLocalDevotional();
    const foreign: PulledDevotionalContent = { days: [], timestamp: '2026-04-25T12:00:00.000Z' };
    expect(commitDevotionalPullCursor(foreign)).toBe(false);
    expect(storedCursor()).toBeNull();

    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });
    const pulled = await pullDevotionalContent(DEVOTIONAL_ID);
    expect(commitDevotionalPullCursor(pulled)).toBe(true);
    expect(commitDevotionalPullCursor(pulled)).toBe(false);
  });

  it('never persists an incremental result when the baseline cursor vanished before commit (reset mid-flight)', async () => {
    seedLocalDevotional();
    seedCursor();
    respondWith({ timestamp: '2026-04-25T13:00:00.000Z' });

    const delta = await pullDevotionalContent(DEVOTIONAL_ID);
    expect(requestBodies()[0].lastPulledAt).not.toBeNull();

    mmkvStorage.removeItem(DEVOTIONAL_PULL_CURSOR_KEY);
    expect(commitDevotionalPullCursor(delta)).toBe(false);
    expect(storedCursor()).toBeNull();
  });

  it('forceFull ignores a fresh cursor and refreshes the full-pull clock on commit', async () => {
    seedLocalDevotional();
    const before = seedCursor({ lastFullPullAt: Date.now() - 2 * HOUR_MS });
    respondWith({ timestamp: '2026-04-25T14:00:00.000Z' });

    const pulled = await pullDevotionalContent(DEVOTIONAL_ID, { forceFull: true });

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (forced)');

    expect(commitDevotionalPullCursor(pulled)).toBe(true);
    const after = storedCursor();
    expect(after?.lastPulledAt).toBe('2026-04-25T14:00:00.000Z');
    expect(after?.lastFullPullAt).toBeGreaterThan(before.lastFullPullAt);
  });

  it('pulls full once the last full pull is older than the reconcile interval', async () => {
    seedLocalDevotional();
    seedCursor({ lastFullPullAt: Date.now() - DEVOTIONAL_FULL_PULL_INTERVAL_MS - 1 });
    respondWith({ timestamp: '2026-04-26T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (reconcile-interval)');
  });

  it('pulls full when the device clock is behind the last full pull', async () => {
    seedLocalDevotional();
    seedCursor({ lastFullPullAt: Date.now() + HOUR_MS });
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (clock-backwards)');
  });

  it('pulls full after the device identity rotates', async () => {
    seedLocalDevotional();
    seedCursor();
    mockGetDeviceId.mockReturnValue('rotated-device-id');
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    const pulled = await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (device-changed)');

    // Committing the full pull re-keys the record to the new identity.
    expect(commitDevotionalPullCursor(pulled)).toBe(true);
    expect(storedCursor()?.deviceId).toBe('rotated-device-id');
  });

  it('pulls full when a different devotional is requested', async () => {
    seedLocalDevotional();
    useUnfoldStore.setState((state) => ({
      devotionals: [...state.devotionals, { ...state.devotionals[0], id: 'devotional-2' }],
    }));
    seedCursor();
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent('devotional-2');

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (devotional-changed)');
  });

  it('pulls full after an app update changes the version marker', async () => {
    seedLocalDevotional();
    seedCursor();
    mockApplication.nativeApplicationVersion = '1.2.4';
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (version-changed)');
  });

  it('pulls full when the stored record is corrupt', async () => {
    seedLocalDevotional();
    mmkvStorage.setItem(DEVOTIONAL_PULL_CURSOR_KEY, '{"v":1,"lastPulledAt":');
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (no-cursor)');
  });

  it('pulls full when the devotional has no local content (missing-devotional hydration)', async () => {
    seedCursor();
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (no-local-content)');
  });

  it('pulls full when the devotional exists locally but has no days yet', async () => {
    seedLocalDevotional([]);
    seedCursor();
    respondWith({ timestamp: '2026-04-25T12:00:00.000Z' });

    await pullDevotionalContent(DEVOTIONAL_ID);

    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    expect(mockLog).toHaveBeenCalledWith('[sync/devotional-pull] pull: full (no-local-content)');
  });
});

describe('applying pulled deltas to the store', () => {
  it('applies a delta as an upsert: existing days keep read state, changed days update, new days append', async () => {
    seedLocalDevotional([
      localDay(1, { isRead: true, readAt: '2026-04-24T08:00:00.000Z' }),
      localDay(2, { title: 'Stale Local Day 2' }),
    ]);
    seedCursor();
    respondWith({
      timestamp: '2026-04-25T12:30:00.000Z',
      changes: {
        devotional_days: [
          dayRecord(2, { title: 'Refreshed Day 2', updatedAt: '2026-04-25T12:29:00.000Z' }),
          dayRecord(3, { updatedAt: '2026-04-25T12:29:30.000Z' }),
        ],
      },
    });

    const delta = await pullDevotionalContent(DEVOTIONAL_ID);
    expect(requestBodies()[0].lastPulledAt).not.toBeNull();
    applyToStore(delta);
    expect(commitDevotionalPullCursor(delta)).toBe(true);

    const days = localDays();
    expect(days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    expect(days[0]).toMatchObject({ title: 'Local Day 1', isRead: true, readAt: '2026-04-24T08:00:00.000Z' });
    expect(days[1]).toMatchObject({ title: 'Refreshed Day 2', bodyText: 'Server body for day 2.' });
    expect(days[2]).toMatchObject({ title: 'Server Day 3' });
  });

  it('applies a full pull through the same merge: server rows upsert, local-only days survive', async () => {
    seedLocalDevotional([
      localDay(1, { isRead: true, readAt: '2026-04-24T08:00:00.000Z' }),
      localDay(4, { title: 'Local-only Day 4' }),
    ]);
    respondWith({
      timestamp: '2026-04-25T12:00:00.000Z',
      changes: {
        devotionals: [{
          id: DEVOTIONAL_ID,
          updatedAt: '2026-04-25T11:59:00.000Z',
          deleted: false,
          data: { title: 'The Names That Hold You', totalDays: 14, currentDay: 2 },
        }],
        devotional_days: [dayRecord(1, { title: 'Server Day 1' }), dayRecord(2)],
      },
    });

    const full = await pullDevotionalContent(DEVOTIONAL_ID);
    expect(requestBodies()).toEqual([{ lastPulledAt: null }]);
    applyToStore(full);
    expect(commitDevotionalPullCursor(full)).toBe(true);

    const days = localDays();
    expect(days.map((day) => day.dayNumber)).toEqual([1, 2, 4]);
    expect(days[0]).toMatchObject({ title: 'Server Day 1', isRead: true });
    expect(days[2]).toMatchObject({ title: 'Local-only Day 4' });
    expect(useUnfoldStore.getState().devotionals[0].currentDay).toBe(2);
  });

  it('drops tombstoned rows from a delta instead of applying them as content', async () => {
    seedLocalDevotional([localDay(1), localDay(2)]);
    seedCursor();
    respondWith({
      timestamp: '2026-04-25T12:30:00.000Z',
      changes: {
        devotional_days: [
          dayRecord(2, { deleted: true, updatedAt: '2026-04-25T12:29:00.000Z' }),
          dayRecord(3),
        ],
      },
    });

    const delta = await pullDevotionalContent(DEVOTIONAL_ID);
    expect(delta.days.map((day) => day.dayNumber)).toEqual([3]);
    applyToStore(delta);
    expect(commitDevotionalPullCursor(delta)).toBe(true);

    // Deletions are reconciled by the app-start pull (full-sync-pull.ts); this
    // path only ever adds or refreshes days, in both full and delta mode.
    expect(localDays().map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    expect(localDays()[1]).toMatchObject({ title: 'Local Day 2' });
  });

  it('commits an empty delta so an idle devotional keeps advancing its cursor', async () => {
    seedLocalDevotional();
    seedCursor({ lastPulledAt: '2026-04-25T12:00:00.000Z' });
    respondWith({ timestamp: '2026-04-25T18:00:00.000Z', changes: {} });

    const delta = await pullDevotionalContent(DEVOTIONAL_ID);
    expect(delta.days).toEqual([]);
    applyToStore(delta);
    expect(commitDevotionalPullCursor(delta)).toBe(true);
    expect(storedCursor()?.lastPulledAt).toBe('2026-04-25T18:00:00.000Z');
  });
});
