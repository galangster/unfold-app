jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
  };
});

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

import { drainSyncOutbox, enqueueSyncChanges, resetDrainStateForTesting } from '../sync-outbox';

describe('sync outbox drain', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetDrainStateForTesting();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends the device timezone with queued changes', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ results: [{ table: 'devotional_days', id: 'day-1', status: 'accepted', serverUpdatedAt: '2026-09-03T12:00:00.000Z' }] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    enqueueSyncChanges([
      {
        table: 'devotional_days',
        id: 'day-1',
        clientUpdatedAt: '2026-09-03T11:00:00.000Z',
        data: { isRead: true },
        deleted: false,
      },
    ]);
    await drainSyncOutbox();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.changes).toHaveLength(1);
    expect(body.deviceTimezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
