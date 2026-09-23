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

import { deleteGiftAccount, rememberGiftIntent, rememberGiftPurchase, resumePendingGiftPurchase } from '../gift-api';

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

it('clears an expired Ask to Buy request so the buyer can try again', async () => {
  await rememberGiftIntent('d58f65f8-6e5f-4f39-8f53-e9400625c251');
  mockFetch.mockResolvedValueOnce({
    ok: true, status: 200, json: async () => ({ state: 'expired' }),
  });

  await expect(resumePendingGiftPurchase()).resolves.toBe('expired');
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

it('deletes the gift account with its session and pending purchase marker', async () => {
  await rememberGiftIntent('d58f65f8-6e5f-4f39-8f53-e9400625c251');
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ deleted: true }) });

  await deleteGiftAccount();

  expect(mockFetch.mock.calls[0][0]).toContain('/api/gifts/account');
  expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  expect(mockStore.has('unfold-gift-session')).toBe(false);
  expect(mockStore.has('unfold-gift-pending-purchase')).toBe(false);
});

it('keeps the gift session if account deletion fails', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false, status: 503,
    json: async () => ({ error: { code: 'GIFT_SERVICE_UNAVAILABLE', message: 'Try again.' } }),
  });

  await expect(deleteGiftAccount()).rejects.toMatchObject({ code: 'GIFT_SERVICE_UNAVAILABLE' });
  expect(mockStore.has('unfold-gift-session')).toBe(true);
});
