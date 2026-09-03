/* eslint-disable import/first */
const mockStore = new Map<string, string>();
let mockDeviceId = 'old-device-id';
/** Top-level entries of the cache directory as readDirectoryAsync reports them. */
const mockCacheEntries: string[] = [];

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => [...mockCacheEntries]),
}));

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => mockStore.set(key, value)),
    removeItem: jest.fn((key: string) => mockStore.delete(key)),
  },
  getMmkvKeys: jest.fn(() => Array.from(mockStore.keys())),
  getDeviceId: jest.fn(() => mockDeviceId),
  rotateDeviceId: jest.fn(() => 'new-id'),
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
  purgeRealStoreForRecoveryReset: jest.fn(),
}));

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

jest.mock('../store', () => ({
  useUnfoldStore: {
    getState: jest.fn(() => ({
      reset: jest.fn(),
    })),
  },
}));

jest.mock('../bridge-service', () => ({
  clearBridgeCache: jest.fn(),
}));

jest.mock('../examen-service', () => ({
  clearExamenCache: jest.fn(),
}));

jest.mock('../scripture-explain-api', () => ({
  clearScriptureExplainCache: jest.fn(),
}));

jest.mock('../bible-api', () => ({
  clearVerseCache: jest.fn(),
}));

jest.mock('../trial-notification', () => ({
  clearTrialNotificationMirror: jest.fn(),
}));

jest.mock('../bug-logger', () => ({
  clearBugLogEntries: jest.fn(() => Promise.resolve()),
}));

jest.mock('../review-prompt', () => ({
  clearReviewPromptState: jest.fn(() => Promise.resolve()),
}));

jest.mock('../paywall-diagnostics', () => ({
  clearPaywallDiagnosticsFile: jest.fn(() => Promise.resolve()),
}));

jest.mock('../tts-service', () => ({
  clearAudioCache: jest.fn(() => Promise.resolve()),
}));

jest.mock('../widget-bridge', () => ({
  clearWidgets: jest.fn(),
}));

jest.mock('../revenuecatClient', () => ({
  logoutUser: jest.fn(() => Promise.resolve({ ok: true, data: undefined })),
}));

// full-sync-pull drags NetInfo + the sync graph in; only its key is needed here.
jest.mock('../full-sync-pull', () => ({
  LAST_PULLED_AT_KEY: 'unfold-last-pulled-at',
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  performFullLocalReset,
  FULL_RESET_MMKV_KEYS,
  FULL_RESET_MMKV_KEY_PREFIXES,
} from '../full-reset';
import {
  mmkvStorage,
  rotateDeviceId,
  purgeRealStoreForRecoveryReset,
} from '../mmkv-storage';
import { cancelAllScheduledNotifications } from '../notifications';
import { useUnfoldStore } from '../store';
import { clearBridgeCache } from '../bridge-service';
import { clearExamenCache } from '../examen-service';
import { clearScriptureExplainCache } from '../scripture-explain-api';
import { clearVerseCache } from '../bible-api';
import { clearTrialNotificationMirror } from '../trial-notification';
import { clearBugLogEntries } from '../bug-logger';
import { clearReviewPromptState } from '../review-prompt';
import { clearPaywallDiagnosticsFile } from '../paywall-diagnostics';
import { clearAudioCache } from '../tts-service';
import { clearWidgets } from '../widget-bridge';
import { logoutUser } from '../revenuecatClient';
import { PRIMARY_BACKEND_URL } from '../api-config';
import { deleteAsync, readDirectoryAsync } from 'expo-file-system/legacy';

const mockFetch = jest.fn();

function okResponse(body: unknown = { deleted: true }, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deletedPaths(): string[] {
  return (deleteAsync as jest.Mock).mock.calls.map(([path]: [string]) => path);
}

beforeEach(() => {
  mockStore.clear();
  mockCacheEntries.length = 0;
  mockDeviceId = 'old-device-id';
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(okResponse());
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('performFullLocalReset', () => {
  it('removes every enumerated MMKV key', async () => {
    // Seed all listed keys plus a survivor
    for (const key of FULL_RESET_MMKV_KEYS) {
      mockStore.set(key, 'some-value');
    }
    const survivorKey = 'unfold-bible-meta-not-in-list';
    mockStore.set(survivorKey, 'survivor');

    await performFullLocalReset();

    for (const key of FULL_RESET_MMKV_KEYS) {
      expect(mmkvStorage.removeItem).toHaveBeenCalledWith(key);
    }
    // Survivor key should NOT have been removed
    expect(mmkvStorage.removeItem).not.toHaveBeenCalledWith(survivorKey);
    expect(mockStore.has(survivorKey)).toBe(true);
  });

  it('covers the QA reset key set plus the sync/generation bookkeeping keys', () => {
    const required = [
      'unfold-storage',
      'unfold-companion-chat',
      '@unfold_companion_daily',
      '@unfold_exclusive_offer_seen',
      '@unfold_onboarding_offer_seen',
      'inflight-generation-job',
      'unfold-sync-outbox-v1',
      // A wiped store must never keep a delta cursor for the Today-tab pull.
      'unfold-devotional-pull-cursor',
      // P3-4 item 3: previously survived a reset.
      'unfold-last-pulled-at',
      'generation-migration-v1-complete',
      'onboarding-sample-job-v1',
      'active-dynamic-example',
    ];
    for (const key of required) {
      expect(FULL_RESET_MMKV_KEYS).toContain(key);
    }
    // MMKV INSTANCE ids are not mmkvStorage keys — they must not masquerade
    // in this list (REVM-8); the trial instance is cleared via
    // clearTrialNotificationMirror() in step 5.
    expect(FULL_RESET_MMKV_KEYS).not.toContain('unfold-trial-notification');
  });

  it('sweeps every rate-limit key by prefix through the live key list and leaves other keys', async () => {
    expect(FULL_RESET_MMKV_KEY_PREFIXES).toContain('@unfold_rate_limits_');
    mockStore.set('@unfold_rate_limits_companion', '{"count":3}');
    mockStore.set('@unfold_rate_limits_tts', '{"count":1}');
    mockStore.set('@unfold_rate_limits_some-future-endpoint', '{"count":9}');
    mockStore.set('unfold-bible-meta-not-in-list', 'survivor');

    await performFullLocalReset();

    expect(mockStore.has('@unfold_rate_limits_companion')).toBe(false);
    expect(mockStore.has('@unfold_rate_limits_tts')).toBe(false);
    expect(mockStore.has('@unfold_rate_limits_some-future-endpoint')).toBe(false);
    expect(mockStore.has('unfold-bible-meta-not-in-list')).toBe(true);
  });

  it('purges the real store files for recovery sessions (FAP-LIB-2/FAP-X-2)', async () => {
    // During a recovery session every mmkvStorage.removeItem above hits the
    // throwaway namespace, so the reset must ALSO delete the real (encrypted,
    // unopenable) store files on disk. The helper no-ops on normal sessions,
    // so it is safe to call unconditionally.
    await performFullLocalReset();

    expect(purgeRealStoreForRecoveryReset).toHaveBeenCalledTimes(1);
  });

  it('clears caches, bug log, trial mirror, review marker, diagnostics, TTS cache, widgets, RevenueCat, and rotates identity', async () => {
    await performFullLocalReset();

    expect(clearBridgeCache).toHaveBeenCalledTimes(1);
    expect(clearExamenCache).toHaveBeenCalledTimes(1);
    expect(clearScriptureExplainCache).toHaveBeenCalledTimes(1);
    expect(clearVerseCache).toHaveBeenCalledTimes(1);
    expect(clearTrialNotificationMirror).toHaveBeenCalledTimes(1);
    expect(clearBugLogEntries).toHaveBeenCalledTimes(1);
    expect(clearReviewPromptState).toHaveBeenCalledTimes(1);
    expect(clearPaywallDiagnosticsFile).toHaveBeenCalledTimes(1);
    expect(clearAudioCache).toHaveBeenCalledTimes(1);
    expect(clearWidgets).toHaveBeenCalledTimes(1);
    expect(logoutUser).toHaveBeenCalledTimes(1);
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('cancels every scheduled OS notification before the store reset', async () => {
    const order: string[] = [];
    (cancelAllScheduledNotifications as jest.Mock).mockImplementationOnce(async () => {
      order.push('cancelAll');
    });
    (useUnfoldStore.getState as jest.Mock).mockImplementationOnce(() => ({
      reset: jest.fn(() => order.push('reset')),
    }));

    await performFullLocalReset();

    expect(order.indexOf('cancelAll')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('reset')).toBeGreaterThan(order.indexOf('cancelAll'));
  });

  it('asks the server to erase this device under the OLD identity, before rotating it', async () => {
    const order: string[] = [];
    mockFetch.mockImplementationOnce(async () => {
      order.push('serverErase');
      return okResponse();
    });
    (rotateDeviceId as jest.Mock).mockImplementationOnce(() => {
      order.push('rotate');
      return 'new-id';
    });

    const result = await performFullLocalReset();

    expect(result.serverErase).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PRIMARY_BACKEND_URL}/api/users/me`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['X-Device-ID']).toBe('old-device-id');
    expect(init.signal).toBeDefined();
    expect(order).toEqual(['serverErase', 'rotate']);
  });

  it('a failing server erase never throws and never blocks the local reset', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    const result = await performFullLocalReset();

    expect(result.serverErase).toEqual({ ok: false, reason: 'network' });
    expect(useUnfoldStore.getState).toHaveBeenCalled();
    expect(mmkvStorage.removeItem).toHaveBeenCalledWith('unfold-storage');
    expect(clearBugLogEntries).toHaveBeenCalledTimes(1);
    expect(clearWidgets).toHaveBeenCalledTimes(1);
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('reports a non-200 or unexpected server reply as not confirmed', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ error: 'nope' }, 500));
    expect((await performFullLocalReset()).serverErase).toEqual({ ok: false, reason: 'http-error', status: 500 });

    mockFetch.mockResolvedValueOnce(okResponse({ deleted: false }));
    expect((await performFullLocalReset()).serverErase).toEqual({
      ok: false,
      reason: 'unexpected-response',
      status: 200,
    });
    expect(rotateDeviceId).toHaveBeenCalledTimes(2);
  });

  it('a slow server erase times out and the local reset still completes', async () => {
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    );

    const result = await performFullLocalReset({ serverEraseTimeoutMs: 20 });

    expect(result.serverErase).toEqual({ ok: false, reason: 'timeout' });
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('skips the server erase under an ephemeral recovery identity and reports it', async () => {
    mockDeviceId = 'ephemeral-3f2a';

    const result = await performFullLocalReset();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.serverErase).toEqual({ ok: false, reason: 'identity-unavailable' });
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('a hung RevenueCat logout cannot block the reset', async () => {
    // *Once: jest.clearAllMocks() resets calls, not implementations — a
    // persistent hang here would leak into the next test.
    (logoutUser as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

    await performFullLocalReset({ revenueCatLogoutTimeoutMs: 20 });

    expect(logoutUser).toHaveBeenCalledTimes(1);
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('deletes the profile photo, reading its file name before the store reset wipes it', async () => {
    // A mutable state object: reset() nulls the user the way the real reset
    // does, so a capture that ran after it would find nothing to delete.
    const state = {
      user: { profilePicture: 'profile-avatar-1700000000000.jpg' } as { profilePicture: string | null } | null,
      reset: jest.fn(() => {
        state.user = null;
      }),
    };
    (useUnfoldStore.getState as jest.Mock).mockImplementationOnce(() => state);

    await performFullLocalReset();

    expect(state.reset).toHaveBeenCalledTimes(1);
    expect(deleteAsync).toHaveBeenCalledWith('file:///documents/profile-avatar-1700000000000.jpg', {
      idempotent: true,
    });
  });

  it('resolves a legacy full-URI profile picture to the current document directory', async () => {
    (useUnfoldStore.getState as jest.Mock).mockImplementationOnce(() => ({
      user: { profilePicture: 'file:///var/mobile/old-container/Documents/profile-avatar-5.jpg' },
      reset: jest.fn(),
    }));

    await performFullLocalReset();

    expect(deleteAsync).toHaveBeenCalledWith('file:///documents/profile-avatar-5.jpg', { idempotent: true });
  });

  it('deletes nothing from the document directory when there is no profile photo', async () => {
    (useUnfoldStore.getState as jest.Mock).mockImplementationOnce(() => ({
      user: { profilePicture: null },
      reset: jest.fn(),
    }));

    await performFullLocalReset();

    expect(deletedPaths().some((path) => path.startsWith('file:///documents/'))).toBe(false);
  });

  it('sweeps share cards and exported workbook PDFs from the cache directory and leaves everything else', async () => {
    mockCacheEntries.push(
      'share-card-1700000000000.png',
      'My Devotional.pdf',
      'Devotional.PDF',
      // Survivors: TTS cache (owned by clearAudioCache), bug-report export,
      // expo-print's scratch directory, unrelated files.
      'tts_abc123.mp3',
      'unfold-bug-report-2026-09-02.json',
      'Print',
      'some-image.jpg',
      'SQLite',
    );

    await performFullLocalReset();

    expect(readDirectoryAsync).toHaveBeenCalledWith('file:///cache/');
    const deleted = deletedPaths();
    expect(deleted).toContain('file:///cache/share-card-1700000000000.png');
    expect(deleted).toContain('file:///cache/My Devotional.pdf');
    expect(deleted).toContain('file:///cache/Devotional.PDF');
    for (const survivor of ['tts_abc123.mp3', 'unfold-bug-report-2026-09-02.json', 'Print', 'some-image.jpg', 'SQLite']) {
      expect(deleted).not.toContain(`file:///cache/${survivor}`);
    }
    expect(deleteAsync).toHaveBeenCalledWith(expect.any(String), { idempotent: true });
  });

  it('never touches the Bible SQLite directory', async () => {
    (useUnfoldStore.getState as jest.Mock).mockImplementationOnce(() => ({
      user: { profilePicture: 'profile-avatar-1.jpg' },
      reset: jest.fn(),
    }));
    mockCacheEntries.push('share-card-1.png', 'Series.pdf');

    await performFullLocalReset();

    expect(deletedPaths().length).toBeGreaterThan(0);
    expect(deletedPaths().some((path) => path.includes('SQLite'))).toBe(false);
  });

  it('a failing profile-photo delete or cache listing never aborts the reset', async () => {
    (useUnfoldStore.getState as jest.Mock).mockImplementationOnce(() => ({
      user: { profilePicture: 'profile-avatar-1.jpg' },
      reset: jest.fn(),
    }));
    (deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));
    (readDirectoryAsync as jest.Mock).mockRejectedValueOnce(new Error('no cache dir'));

    await expect(performFullLocalReset()).resolves.toMatchObject({ serverErase: { ok: true } });
    expect(mmkvStorage.removeItem).toHaveBeenCalledWith('unfold-storage');
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('a throwing best-effort step (notifications, TTS, widgets) never aborts the reset', async () => {
    (cancelAllScheduledNotifications as jest.Mock).mockRejectedValueOnce(new Error('no notification module'));
    (clearAudioCache as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    (clearWidgets as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no widgets');
    });

    await expect(performFullLocalReset()).resolves.toMatchObject({ serverErase: { ok: true } });
    expect(mmkvStorage.removeItem).toHaveBeenCalledWith('unfold-storage');
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });
});
