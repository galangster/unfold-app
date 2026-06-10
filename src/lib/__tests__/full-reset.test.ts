const mockStore = new Map<string, string>();

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => mockStore.set(key, value)),
    removeItem: jest.fn((key: string) => mockStore.delete(key)),
  },
  getDeviceId: jest.fn(() => 'old-device-id'),
  rotateDeviceId: jest.fn(() => 'new-id'),
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
}));

jest.mock('../notifications', () => ({
  cancelAllReminders: jest.fn(() => Promise.resolve()),
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

import { performFullLocalReset, FULL_RESET_MMKV_KEYS } from '../full-reset';
import { mmkvStorage, rotateDeviceId } from '../mmkv-storage';
import { cancelAllReminders } from '../notifications';
import { useUnfoldStore } from '../store';
import { clearBridgeCache } from '../bridge-service';
import { clearExamenCache } from '../examen-service';
import { clearScriptureExplainCache } from '../scripture-explain-api';
import { clearVerseCache } from '../bible-api';
import { clearTrialNotificationMirror } from '../trial-notification';
import { clearBugLogEntries } from '../bug-logger';

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
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
  });

  it('covers the QA reset key set', () => {
    const required = [
      'unfold-storage',
      'unfold-companion-chat',
      '@unfold_companion_daily',
      '@unfold_exclusive_offer_seen',
      '@unfold_onboarding_offer_seen',
      'inflight-generation-job',
      'unfold-sync-outbox-v1',
    ];
    for (const key of required) {
      expect(FULL_RESET_MMKV_KEYS).toContain(key);
    }
  });

  it('clears caches, bug log, trial mirror, and rotates identity', async () => {
    await performFullLocalReset();

    expect(clearBridgeCache).toHaveBeenCalledTimes(1);
    expect(clearExamenCache).toHaveBeenCalledTimes(1);
    expect(clearScriptureExplainCache).toHaveBeenCalledTimes(1);
    expect(clearVerseCache).toHaveBeenCalledTimes(1);
    expect(clearTrialNotificationMirror).toHaveBeenCalledTimes(1);
    expect(clearBugLogEntries).toHaveBeenCalledTimes(1);
    expect(rotateDeviceId).toHaveBeenCalledTimes(1);
  });

  it('cancels reminders before store reset', async () => {
    const cancelOrder: string[] = [];
    (cancelAllReminders as jest.Mock).mockImplementation(async () => {
      cancelOrder.push('cancelAllReminders');
    });
    (useUnfoldStore.getState as jest.Mock).mockImplementation(() => ({
      reset: jest.fn(() => {
        cancelOrder.push('reset');
      }),
    }));

    await performFullLocalReset();

    const cancelIdx = cancelOrder.indexOf('cancelAllReminders');
    const resetIdx = cancelOrder.indexOf('reset');
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(resetIdx).toBeGreaterThan(cancelIdx);
  });
});
