function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string) => {
        mockMmkvStore.set(key, value);
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
}));

const mockFlushCheckInToServer = jest.fn(async (..._args: unknown[]) => 'sent');
jest.mock('../check-in-flush', () => ({
  flushCheckInToServer: (...args: unknown[]) => mockFlushCheckInToServer(...args),
}));

const mockEnqueuePersonalDataSyncChange = jest.fn();
jest.mock('../personal-data-sync-records', () => {
  const actual = jest.requireActual('../personal-data-sync-records') as typeof import('../personal-data-sync-records');
  return {
    ...actual,
    enqueuePersonalDataSyncChange: (...args: unknown[]) => mockEnqueuePersonalDataSyncChange(...args),
  };
});

// eslint-disable-next-line import/first
import { useUnfoldStore } from '../store';

describe('J5 addCheckIn flush', () => {
  beforeEach(() => {
    getMockMmkvStore()?.clear();
    useUnfoldStore.getState().reset();
    mockFlushCheckInToServer.mockClear();
    mockEnqueuePersonalDataSyncChange.mockClear();
  });

  it('enqueues freeText then flushes once for the shared addCheckIn path', () => {
    useUnfoldStore.getState().addCheckIn({
      devotionalId: 'devotional-1',
      dayNumber: 1,
      mood: 4,
      moodLabel: 'steady',
      freeText: 'held close',
      timeOfDay: 'midday',
    });

    const stored = useUnfoldStore.getState().checkIns[0];
    expect(stored.freeText).toBe('held close');
    expect(mockEnqueuePersonalDataSyncChange).toHaveBeenCalledTimes(1);
    expect(mockEnqueuePersonalDataSyncChange).toHaveBeenCalledWith(
      'check_ins',
      stored.id,
      expect.objectContaining({ freeText: 'held close' }),
      expect.any(String),
    );
    expect(mockFlushCheckInToServer).toHaveBeenCalledTimes(1);
    expect(mockFlushCheckInToServer).toHaveBeenCalledWith(stored.id);
    expect(mockEnqueuePersonalDataSyncChange.mock.invocationCallOrder[0])
      .toBeLessThan(mockFlushCheckInToServer.mock.invocationCallOrder[0]);
  });
});
