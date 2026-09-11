import type { SyncPushChange } from '../sync-types';

const mockDrainSyncOutbox = jest.fn();
const mockPeekSyncOutbox = jest.fn();

jest.mock('../sync-outbox', () => ({
  drainSyncOutbox: (...args: unknown[]) => mockDrainSyncOutbox(...args),
  peekSyncOutbox: (...args: unknown[]) => mockPeekSyncOutbox(...args),
}));

import { flushCheckInToServer } from '../check-in-flush';

const CHECK_IN_ID = 'check-in-1';

function checkInChange(id = CHECK_IN_ID): SyncPushChange {
  return {
    table: 'check_ins',
    id,
    clientUpdatedAt: '2026-09-10T12:00:00.000Z',
    deleted: false,
    data: { freeText: 'held close' },
  };
}

beforeEach(() => {
  mockDrainSyncOutbox.mockReset();
  mockPeekSyncOutbox.mockReset();
});

describe('J4 flushCheckInToServer', () => {
  it('drains twice when the first drain predates the enqueue, and the second POST carries the id', async () => {
    const posts: SyncPushChange[][] = [];
    let queued: SyncPushChange[] = [];

    mockPeekSyncOutbox.mockImplementation(() => queued);
    mockDrainSyncOutbox.mockImplementation(async () => {
      if (posts.length === 0) {
        posts.push([]);
        return;
      }
      posts.push([...queued]);
      queued = [];
    });

    queued = [checkInChange()];
    await expect(flushCheckInToServer(CHECK_IN_ID)).resolves.toBe('sent');

    expect(mockDrainSyncOutbox).toHaveBeenCalledTimes(2);
    expect(posts[1].map((row) => row.id)).toEqual([CHECK_IN_ID]);
  });

  it('drains once when the entry is gone after the first drain', async () => {
    mockPeekSyncOutbox.mockReturnValue([]);
    mockDrainSyncOutbox.mockResolvedValue(undefined);

    await expect(flushCheckInToServer(CHECK_IN_ID)).resolves.toBe('sent');
    expect(mockDrainSyncOutbox).toHaveBeenCalledTimes(1);
  });

  it('returns queued and keeps the entry when the drain cannot send', async () => {
    const queued = [checkInChange()];
    mockPeekSyncOutbox.mockImplementation(() => queued);
    mockDrainSyncOutbox.mockResolvedValue(undefined);

    await expect(flushCheckInToServer(CHECK_IN_ID)).resolves.toBe('queued');
    expect(queued).toEqual([checkInChange()]);
  });

  it('schedules no timers', async () => {
    mockPeekSyncOutbox.mockReturnValue([]);
    mockDrainSyncOutbox.mockResolvedValue(undefined);
    const timeout = jest.spyOn(global, 'setTimeout');
    const before = timeout.mock.calls.length;

    await flushCheckInToServer(CHECK_IN_ID);

    expect(timeout.mock.calls.length).toBe(before);
    timeout.mockRestore();
  });
});
