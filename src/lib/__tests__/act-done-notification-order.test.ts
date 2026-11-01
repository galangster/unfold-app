/**
 * The act reminder's "I did it" button marks the act on this device. Like
 * the reader, it first keeps an order for a day finished on another device:
 * its place in the history, or the next order when another day holds that
 * place, so the note under that act differs from its neighbours'.
 */
import { actOutcomeNote, completionVariation } from '@/constants/daily-copy';
import { actNoteOrdinal, takeCompletionOrdinal } from '../copy-variation';
import { countReadsBefore } from '../devotional-day-access';
import { setupNotificationListeners } from '../push-notifications';

type ShelfDay = { dayNumber: number; isRead: boolean; readAt: string; actOutcome?: string };
const mockListeners: ((response: unknown) => void)[] = [];
const mockMemory = new Map<string, string>();
const mockShelf: { devotionals: { id: string; days: ShelfDay[] }[] } = { devotionals: [] };
// Like the store, marking the act writes it on the day, so a hold that ran
// after the mark would find the act marked and keep no order.
const mockSetActOutcome = jest.fn((devotionalId: string, dayNumber: number, outcome: string) => {
  const day = mockShelf.devotionals.find((item) => item.id === devotionalId)?.days.find((item) => item.dayNumber === dayNumber);
  if (day) day.actOutcome = outcome;
});

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

  it('keeps the history place for a day read elsewhere whose place no other day holds', () => {
    // Days 1 to 3 and Day 5 are finished here; Day 4 is finished on another device.
    const at = (day: number) => new Date(2026, 9, 10 + day, 9);
    mockShelf.devotionals = [{ id: 'series', days: [1, 2, 3, 4, 5].map((day) => read(day, at(day))) }];
    for (const day of [1, 2, 3, 5]) takeCompletionOrdinal(day - 1, { devotionalId: 'series', dayNumber: day });

    tapActDone('series', 4);

    const ordinalOf = (dayNumber: number) =>
      actNoteOrdinal(mockShelf.devotionals, { devotionalId: 'series', dayNumber, readAt: at(dayNumber).toISOString() });
    expect([3, 4, 5].map(ordinalOf)).toEqual([2, 3, 4]);
    // The next overlay still steps past the last one this device opened.
    expect(takeCompletionOrdinal(0)).toBe(5);
  });
});
