/**
 * MD-1: a deferred sync response must not restore wiped data after reset.
 * Fetch stubs ignore AbortSignal so these cases do not depend on native abort.
 */
/* eslint-disable import/first */
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  let deviceId = 'synthetic-old';
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getMmkvKeys: jest.fn(() => Array.from(store.keys())),
    getDeviceId: jest.fn(() => deviceId),
    rotateDeviceId: jest.fn(() => {
      deviceId = 'synthetic-new';
      return deviceId;
    }),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    purgeRealStoreForRecoveryReset: jest.fn(),
    __clearMockStorage: () => store.clear(),
    __resetDeviceId: () => {
      deviceId = 'synthetic-old';
    },
  };
});

jest.mock('../notifications', () => ({
  cancelAllScheduledNotifications: jest.fn(() => Promise.resolve()),
}));

jest.mock('../companion-chat-store', () => ({
  useCompanionChatStore: {
    getState: jest.fn(() => ({
      clearAllConversations: jest.fn(),
    })),
  },
}));

jest.mock('../bridge-service', () => ({ clearBridgeCache: jest.fn() }));
jest.mock('../examen-service', () => ({ clearExamenCache: jest.fn() }));
jest.mock('../scripture-explain-api', () => ({ clearScriptureExplainCache: jest.fn() }));
jest.mock('../bible-api', () => ({ clearVerseCache: jest.fn() }));
jest.mock('../trial-notification', () => ({ clearTrialNotificationMirror: jest.fn() }));
jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  clearBugLogEntries: jest.fn(() => Promise.resolve()),
}));
jest.mock('../review-prompt', () => ({ clearReviewPromptState: jest.fn(() => Promise.resolve()) }));
jest.mock('../paywall-diagnostics', () => ({ clearPaywallDiagnosticsFile: jest.fn(() => Promise.resolve()) }));
jest.mock('../tts-service', () => ({ clearAudioCache: jest.fn(() => Promise.resolve()) }));
jest.mock('../widget-bridge', () => ({ clearWidgets: jest.fn() }));
jest.mock('../revenuecatClient', () => ({
  logoutUser: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../sync-ids', () => ({
  newId: jest.fn(() => `test-id-${Math.random().toString(36).slice(2, 8)}`),
  compositeId: jest.fn((...parts: unknown[]) => parts.join(':')),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: 'synthetic',
  nativeBuildVersion: '1',
}));

import { useUnfoldStore } from '../store';
import { performFullLocalReset } from '../full-reset';
import {
  LAST_PULLED_AT_KEY,
  pullAllUserData,
  resetUserDataPullForTesting,
  triggerUserDataPull,
} from '../full-sync-pull';
import { applyPulledDevotionalContent } from '../devotional-pulled-content';
import { DEVOTIONAL_PULL_CURSOR_KEY } from '../devotional-pull-cursor';
import { syncDevotionalDayRead } from '../devotional-read-sync';
import {
  commitDevotionalPullCursor,
  pullDevotionalContent,
} from '../devotional-sync-pull';
import {
  drainSyncOutbox,
  enqueueSyncChanges,
  peekSyncOutbox,
  resetDrainStateForTesting,
} from '../sync-outbox';
import {
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  isLocalResetInProgress,
  isSyncSessionCurrent,
  resetSyncSessionFenceForTesting,
  SyncSessionInvalidatedError,
} from '../sync-session-fence';
import { getDeviceId, mmkvStorage, rotateDeviceId } from '../mmkv-storage';
import { logoutUser } from '../revenuecatClient';
import { syncUserProfileToBackend } from '../user-profile-sync';
import type { Devotional, DevotionalDay, UserProfile } from '../store';

const ERASED_AT = '2026-09-05T00:00:00.000Z';
const ERASED_PROFILE = {
  name: 'Synthetic erased profile',
  aboutMe: 'synthetic private context',
} as UserProfile;
const ERASED_DAY: DevotionalDay = {
  id: 'day-synthetic-devotional-1',
  devotionalId: 'synthetic-devotional',
  dayNumber: 1,
  title: 'Synthetic erased day',
  scriptureReference: 'Psalm 23:1',
  scriptureText: 'The Lord is my shepherd.',
  bodyText: 'Synthetic erased body',
  quotableLine: 'Synthetic erased line',
  isRead: false,
};
const ERASED_DEVOTIONAL: Devotional = {
  id: 'synthetic-devotional',
  title: 'Synthetic erased devotional',
  totalDays: 7,
  currentDay: 1,
  days: [ERASED_DAY],
  createdAt: ERASED_AT,
  seriesStartDate: ERASED_AT,
  generationMode: 'progressive',
  userContext: {
    name: 'Synthetic',
    aboutMe: 'synthetic private context',
    currentSituation: '',
    emotionalState: '',
  },
};
const ERASED_NOTE = {
  id: 'synthetic-note',
  updatedAt: ERASED_AT,
  deleted: false,
  data: {
    title: 'Synthetic note',
    content: 'synthetic erased content',
    createdAt: ERASED_AT,
    clientUpdatedAt: ERASED_AT,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

function notePullResponse(note = ERASED_NOTE, timestamp = ERASED_AT) {
  return {
    ok: true,
    json: async () => ({ timestamp, changes: { notes: [note] } }),
  };
}

function erasedDevotionalPullResponse(timestamp = ERASED_AT) {
  return {
    ok: true,
    json: async () => ({
      timestamp,
      changes: {
        devotionals: [{
          id: 'synthetic-devotional',
          deleted: false,
          updatedAt: timestamp,
          data: {
            title: 'Synthetic erased devotional',
            totalDays: 7,
            currentDay: 1,
            seriesStartDate: timestamp,
          },
        }],
      },
    }),
  };
}

function conflictPushResponse(id: string) {
  return {
    ok: true,
    json: async () => ({
      results: [{
        table: 'notes',
        id,
        status: 'conflict',
        serverUpdatedAt: ERASED_AT,
        serverData: {
          id,
          title: 'Conflict restored note',
          content: 'synthetic conflict content',
          createdAt: ERASED_AT,
          updatedAt: ERASED_AT,
          clientUpdatedAt: ERASED_AT,
          deletedAt: null,
        },
      }],
    }),
  };
}

const mockFetch = jest.fn();

beforeEach(() => {
  const mmkvModule = jest.requireMock('../mmkv-storage') as {
    __clearMockStorage: () => void;
    __resetDeviceId: () => void;
  };
  mmkvModule.__clearMockStorage();
  mmkvModule.__resetDeviceId();
  resetSyncSessionFenceForTesting();
  resetDrainStateForTesting();
  resetUserDataPullForTesting();
  useUnfoldStore.getState().reset();
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) });
  global.fetch = mockFetch as unknown as typeof fetch;
  (logoutUser as jest.Mock).mockResolvedValue({ ok: true });
});

describe('MD-1 sync session fence', () => {
  it('applies an ordinary deferred pull when no reset runs', async () => {
    const pull = deferred<ReturnType<typeof notePullResponse>>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/pull')) return pull.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pending = pullAllUserData();
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/pull')), 'pull fetch');
    pull.resolve(notePullResponse());
    await pending;

    expect(useUnfoldStore.getState().notes.some((note) => note.id === 'synthetic-note')).toBe(true);
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBe(ERASED_AT);
  });

  it('rejects a deferred pull after wipe and before identity rotation', async () => {
    let releaseLogout!: () => void;
    (logoutUser as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseLogout = resolve;
      }),
    );

    const pull = deferred<ReturnType<typeof notePullResponse>>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/pull')) return pull.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pendingPull = pullAllUserData();
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/pull')), 'pull fetch');

    const pendingReset = performFullLocalReset();
    await waitUntil(() => Boolean(releaseLogout) && isLocalResetInProgress(), 'reset hung after wipe');

    expect(getDeviceId()).toBe('synthetic-old');
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBeNull();

    pull.resolve(notePullResponse());
    await expect(pendingPull).rejects.toBeInstanceOf(SyncSessionInvalidatedError);

    expect(getDeviceId()).toBe('synthetic-old');
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBeNull();

    releaseLogout();
    await pendingReset;

    expect(getDeviceId()).toBe('synthetic-new');
    expect(isLocalResetInProgress()).toBe(false);
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBeNull();
  });

  it('rejects a deferred pull after reset completes, then applies a fresh pull', async () => {
    const stale = deferred<ReturnType<typeof notePullResponse>>();
    const fresh = deferred<ReturnType<typeof notePullResponse>>();
    let pullCalls = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/pull')) {
        pullCalls += 1;
        return pullCalls === 1 ? stale.promise : fresh.promise;
      }
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pendingStale = pullAllUserData();
    await waitUntil(() => pullCalls === 1, 'stale pull fetch');

    await performFullLocalReset();
    expect(getDeviceId()).toBe('synthetic-new');
    expect(isLocalResetInProgress()).toBe(false);

    stale.resolve(notePullResponse());
    await expect(pendingStale).rejects.toBeInstanceOf(SyncSessionInvalidatedError);
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBeNull();

    const pendingFresh = pullAllUserData();
    await waitUntil(() => pullCalls === 2, 'fresh pull fetch');
    const freshAt = '2026-09-05T01:00:00.000Z';
    fresh.resolve(notePullResponse({
      id: 'post-reset-note',
      updatedAt: freshAt,
      deleted: false,
      data: {
        title: 'Post-reset note',
        content: 'fresh after reset',
        createdAt: freshAt,
        clientUpdatedAt: freshAt,
      },
    }, freshAt));
    await pendingFresh;

    expect(useUnfoldStore.getState().notes.some((note) => note.id === 'post-reset-note')).toBe(true);
    expect(useUnfoldStore.getState().notes.some((note) => note.id === 'synthetic-note')).toBe(false);
    expect(mmkvStorage.getItem(LAST_PULLED_AT_KEY)).toBe(freshAt);
  });

  it('does not start a pull while reset is in progress', async () => {
    let releaseLogout!: () => void;
    (logoutUser as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseLogout = resolve;
      }),
    );

    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/pull')) {
        throw new Error('pull must not start during reset');
      }
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pendingReset = performFullLocalReset();
    await waitUntil(() => Boolean(releaseLogout) && isLocalResetInProgress(), 'reset in progress');

    await expect(triggerUserDataPull('app-start')).resolves.toBeUndefined();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/pull'))).toBe(false);

    releaseLogout();
    await pendingReset;
  });

  it('preserves the outbox when a deferred drain is invalidated without a wipe', async () => {
    enqueueSyncChanges([{
      table: 'notes',
      id: 'queued-note',
      clientUpdatedAt: ERASED_AT,
      deleted: false,
      data: { title: 'Queued', content: 'keep me' },
    }]);
    expect(peekSyncOutbox()).toHaveLength(1);

    const push = deferred<ReturnType<typeof conflictPushResponse>>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/push')) return push.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pendingDrain = drainSyncOutbox();
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/push')), 'push fetch');

    const resetToken = beginLocalResetSession();
    push.resolve(conflictPushResponse('queued-note'));
    await pendingDrain;

    expect(peekSyncOutbox()).toHaveLength(1);
    expect(peekSyncOutbox()[0]).toMatchObject({ id: 'queued-note', data: { content: 'keep me' } });
    expect(useUnfoldStore.getState().notes.some((note) => note.content === 'synthetic conflict content')).toBe(false);

    endLocalResetSession(resetToken);
  });

  it('rejects a deferred outbox conflict after wipe and before identity rotation', async () => {
    const noteId = useUnfoldStore.getState().addNote({
      title: 'Local note',
      content: 'will be wiped',
      category: 'general',
      tags: [],
      isFavorite: false,
      scriptureRefs: [],
    });
    expect(peekSyncOutbox().some((change) => change.id === noteId)).toBe(true);

    let releaseLogout!: () => void;
    (logoutUser as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseLogout = resolve;
      }),
    );

    const push = deferred<ReturnType<typeof conflictPushResponse>>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/push')) return push.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pendingDrain = drainSyncOutbox();
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/push')), 'push fetch');

    const pendingReset = performFullLocalReset();
    await waitUntil(() => Boolean(releaseLogout) && isLocalResetInProgress(), 'reset hung after wipe');

    expect(getDeviceId()).toBe('synthetic-old');
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(peekSyncOutbox()).toHaveLength(0);

    push.resolve(conflictPushResponse(noteId));
    await pendingDrain;

    expect(useUnfoldStore.getState().notes).toHaveLength(0);
    expect(peekSyncOutbox()).toHaveLength(0);

    releaseLogout();
    await pendingReset;
    expect(getDeviceId()).toBe('synthetic-new');
    expect(useUnfoldStore.getState().notes).toHaveLength(0);
  });

  it('rejects a deferred devotional pull after reset when fetch ignores abort', async () => {
    const pull = deferred<ReturnType<typeof erasedDevotionalPullResponse>>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/pull')) return pull.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pending = pullDevotionalContent('synthetic-devotional', { forceFull: true });
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/pull')), 'devotional pull fetch');

    await performFullLocalReset();
    pull.resolve(erasedDevotionalPullResponse());
    await expect(pending).rejects.toBeInstanceOf(SyncSessionInvalidatedError);

    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(mmkvStorage.getItem(DEVOTIONAL_PULL_CURSOR_KEY)).toBeNull();
  });

  it('does not apply already-returned devotional content after reset', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/pull')) return erasedDevotionalPullResponse();
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pulled = await pullDevotionalContent('synthetic-devotional', { forceFull: true });
    await performFullLocalReset();
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);

    expect(() => applyPulledDevotionalContent({
      devotionalId: 'synthetic-devotional',
      pulled,
      updateDevotionalDays: useUnfoldStore.getState().updateDevotionalDays,
      updateDevotionals: (updater) => {
        useUnfoldStore.setState((state) => ({ devotionals: updater(state.devotionals) }));
      },
    })).toThrow(SyncSessionInvalidatedError);

    expect(commitDevotionalPullCursor(pulled)).toBe(false);
    expect(useUnfoldStore.getState().devotionals).toHaveLength(0);
    expect(mmkvStorage.getItem(DEVOTIONAL_PULL_CURSOR_KEY)).toBeNull();
  });

  it('does not enqueue a delayed profile push failure after reset', async () => {
    const push = deferred<never>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/push')) return push.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pending = syncUserProfileToBackend(ERASED_PROFILE).catch(() => undefined);
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/push')), 'profile push fetch');

    await performFullLocalReset();
    push.reject(new Error('synthetic offline'));
    await pending;

    expect(peekSyncOutbox().some((change) => change.data.aboutMe === ERASED_PROFILE.aboutMe)).toBe(false);
    expect(peekSyncOutbox().some((change) => change.id === 'user-profile-synthetic-old')).toBe(false);
  });

  it('does not enqueue a delayed devotional-read push failure after reset', async () => {
    const push = deferred<never>();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/sync/push')) return push.promise;
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    });

    const pending = syncDevotionalDayRead({
      devotional: ERASED_DEVOTIONAL,
      day: ERASED_DAY,
      readAt: ERASED_AT,
    }).catch(() => undefined);
    await waitUntil(() => mockFetch.mock.calls.some(([url]) => String(url).includes('/api/sync/push')), 'read push fetch');

    await performFullLocalReset();
    push.reject(new Error('synthetic offline'));
    await pending;

    expect(peekSyncOutbox().some((change) => change.id === 'synthetic-devotional')).toBe(false);
    expect(peekSyncOutbox().some((change) => change.table === 'devotional_days')).toBe(false);
  });

  it('keeps the fence closed after one of two overlapping begins ends, in either order', () => {
    const first = beginLocalResetSession();
    const second = beginLocalResetSession();
    endLocalResetSession(first);
    expect(isLocalResetInProgress()).toBe(true);
    expect(isSyncSessionCurrent(captureSyncSession())).toBe(false);
    endLocalResetSession(second);
    expect(isLocalResetInProgress()).toBe(false);

    const third = beginLocalResetSession();
    const fourth = beginLocalResetSession();
    endLocalResetSession(fourth);
    expect(isLocalResetInProgress()).toBe(true);
    expect(isSyncSessionCurrent(captureSyncSession())).toBe(false);
    endLocalResetSession(third);
    expect(isLocalResetInProgress()).toBe(false);
  });

  it('does not release an active reset for an unknown or already-ended token', () => {
    const first = beginLocalResetSession();
    const second = beginLocalResetSession();

    endLocalResetSession(first + second + 1);
    expect(isLocalResetInProgress()).toBe(true);
    expect(isSyncSessionCurrent(captureSyncSession())).toBe(false);

    endLocalResetSession(first);
    expect(isLocalResetInProgress()).toBe(true);
    expect(isSyncSessionCurrent(captureSyncSession())).toBe(false);

    endLocalResetSession(first);
    expect(isLocalResetInProgress()).toBe(true);
    expect(isSyncSessionCurrent(second)).toBe(false);

    endLocalResetSession(second);
    expect(isLocalResetInProgress()).toBe(false);
    expect(isSyncSessionCurrent(second)).toBe(true);
  });

  it('shares one in-flight reset so overlapping callers cannot wipe or rotate twice', async () => {
    let releaseLogout!: () => void;
    (logoutUser as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseLogout = resolve;
      }),
    );

    const first = performFullLocalReset();
    const second = performFullLocalReset();
    await waitUntil(() => Boolean(releaseLogout) && isLocalResetInProgress(), 'shared reset hung');

    expect(rotateDeviceId).toHaveBeenCalledTimes(0);
    expect(first).toBe(second);

    releaseLogout();
    await Promise.all([second, first]);

    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
    expect(getDeviceId()).toBe('synthetic-new');
    expect(isLocalResetInProgress()).toBe(false);
  });
});
