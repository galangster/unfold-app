/**
 * The act reminder's "I did it" button marks the act on this device. Like
 * the reader, it first takes an order for a day finished on another device,
 * so the note under that act steps past this device's last one.
 */
import { actOutcomeNote, completionVariation } from '@/constants/daily-copy';
import { actNoteOrdinal, takeCompletionOrdinal } from '../copy-variation';
import { countReadsBefore } from '../devotional-day-access';
import { setupNotificationListeners } from '../push-notifications';

type ShelfDay = { dayNumber: number; isRead: boolean; readAt: string };
const mockListeners: ((response: unknown) => void)[] = [];
const mockMemory = new Map<string, string>();
const mockShelf: { devotionals: { id: string; days: ShelfDay[] }[] } = { devotionals: [] };
const mockSetActOutcome = jest.fn();

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockListeners.push(listener);
    return { remove: jest.fn() };
  }),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: {} } }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
}));
jest.mock('@/lib/trial-notification', () => ({ readTrialCheckInSkipDate: jest.fn(() => null) }));
jest.mock('../paywall-diagnostics', () => ({ clearPaywallDiagnosticsFile: jest.fn(async () => undefined) }));
jest.mock('../mmkv-storage', () => ({
  getDeviceId: () => 'install-a',
  mmkvStorage: {
    getItem: (key: string) => mockMemory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mockMemory.set(key, value);
    },
    removeItem: (key: string) => {
      mockMemory.delete(key);
    },
  },
}));
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.invalid',
  getAuthHeaders: jest.fn(async () => ({})),
}));
jest.mock('../store', () => ({
  useUnfoldStore: {
    getState: () => ({ devotionals: mockShelf.devotionals, setActOutcome: mockSetActOutcome }),
  },
}));
jest.mock('../logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../analytics', () => ({ logEvent: jest.fn() }));

const read = (dayNumber: number, at: Date): ShelfDay => ({ dayNumber, isRead: true, readAt: at.toISOString() });

/** Taps "I did it" on the act reminder for one day. */
function tapActDone(devotionalId: string, dayNumber: number) {
  const cleanup = setupNotificationListeners();
  const respond = mockListeners[mockListeners.length - 1];
  respond({
    actionIdentifier: 'act_done',
    notification: {
      date: Date.now(),
      request: {
        identifier: 'unfold-act-reminder',
        content: { data: { type: 'act_reminder', devotionalId, dayNumber } },
      },
    },
  });
  cleanup();
}

describe('the act reminder’s “I did it” button', () => {
  beforeEach(() => {
    mockMemory.clear();
    mockSetActOutcome.mockClear();
  });

  it('takes an order for a day finished on another device before it marks the act', () => {
    // 1. Day 1 is finished here, with a one-reading series before it.
    const firstAt = new Date(2026, 9, 15, 9);
    const first = takeCompletionOrdinal(1, { devotionalId: 'series', dayNumber: 1 });
    // 2. That series is deleted. 3. Day 2 is finished on another device, and its read syncs here.
    const secondAt = new Date(2026, 9, 16, 9);
    mockShelf.devotionals = [{ id: 'series', days: [read(1, firstAt), read(2, secondAt)] }];
    // By the history alone, Day 2 would take Day 1's order.
    expect(countReadsBefore(mockShelf.devotionals, secondAt)).toBe(first);

    // 4. The reminder's button marks Day 2's act here.
    tapActDone('series', 2);

    expect(mockSetActOutcome).toHaveBeenCalledWith('series', 2, 'done');
    const second = actNoteOrdinal(mockShelf.devotionals, { devotionalId: 'series', dayNumber: 2, readAt: secondAt.toISOString() });
    expect(second).toBe(first + 1);
    expect(actOutcomeNote('done', completionVariation('install-a', second)))
      .not.toBe(actOutcomeNote('done', completionVariation('install-a', first)));
  });
});
