const mockStore = new Map<string, string>();
let mockDeviceId = 'buyer-device';
const mockFetch = jest.fn();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'X-Device-ID': mockDeviceId })),
}));
jest.mock('@/lib/device-credential', () => ({ authenticatedFetch: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('@/lib/mmkv-storage', () => ({ getDeviceId: () => mockDeviceId }));

import { rememberGiftIntent, rememberGiftPurchase, resumePendingGiftPurchase } from '../gift-api';

beforeEach(() => {
  mockStore.clear();
  mockDeviceId = 'buyer-device';
  mockFetch.mockReset();
  mockStore.set('unfold-gift-session', JSON.stringify({ uid: mockDeviceId, token: 'a'.repeat(43) }));
});

it('keeps an unconfirmed purchase through refresh and clears it after confirmation', async () => {
  await rememberGiftPurchase('d58f65f8-6e5f-4f39-8f53-e9400625c251', '2000000012345678');
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ state: 'pending' }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ state: 'ready' }) });

  await expect(resumePendingGiftPurchase()).resolves.toBe('pending');
  expect(mockStore.has('unfold-gift-pending-purchase')).toBe(true);
  await expect(resumePendingGiftPurchase()).resolves.toBe('ready');
  expect(mockStore.has('unfold-gift-pending-purchase')).toBe(false);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

it('recovers a purchase without a StoreKit transaction ID from its intent', async () => {
  await rememberGiftIntent('d58f65f8-6e5f-4f39-8f53-e9400625c251');
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ state: 'pending' }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ state: 'ready' }) });

  await expect(resumePendingGiftPurchase()).resolves.toBe('pending');
  expect(mockStore.has('unfold-gift-pending-purchase')).toBe(true);
  await expect(resumePendingGiftPurchase()).resolves.toBe('ready');
  expect(mockStore.has('unfold-gift-pending-purchase')).toBe(false);
  expect(mockFetch.mock.calls[0][0]).toContain('/purchases/intent/d58f65f8-6e5f-4f39-8f53-e9400625c251');
});

it('clears the pending marker after a confirmed refund', async () => {
  await rememberGiftIntent('d58f65f8-6e5f-4f39-8f53-e9400625c251');
  mockFetch.mockResolvedValueOnce({
    ok: true, status: 200, json: async () => ({ state: 'refunded' }),
  });

  await expect(resumePendingGiftPurchase()).resolves.toBe('refunded');
  expect(mockStore.has('unfold-gift-pending-purchase')).toBe(false);
});

it('does not attach a pending purchase after the device identity changes', async () => {
  await rememberGiftPurchase('d58f65f8-6e5f-4f39-8f53-e9400625c251', '2000000012345678');
  mockDeviceId = 'other-device';

  await expect(resumePendingGiftPurchase()).resolves.toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});

it('ignores an invalid pending purchase record', async () => {
  mockStore.set('unfold-gift-pending-purchase', 'null');

  await expect(resumePendingGiftPurchase()).resolves.toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});
