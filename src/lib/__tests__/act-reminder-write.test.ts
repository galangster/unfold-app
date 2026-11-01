import { useUIState } from '@/lib/ui-state';
import { markActReminderWriteFailed, readActReminderWriteFailed } from '@/lib/act-reminder-write';

const mockMmkv = new Map<string, string>();
jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: (key: string) => mockMmkv.get(key) ?? null,
    setItem: (key: string, value: string) => { mockMmkv.set(key, value); },
    removeItem: (key: string) => { mockMmkv.delete(key); },
  },
}));

beforeEach(() => {
  mockMmkv.clear();
  useUIState.setState({ actReminderWriteEpoch: 0 });
});

it('reads a failed write left by an earlier process, so a background sync keeps the midday check-in', () => {
  mockMmkv.set('@unfold_act_reminder_write_failed', '1');
  expect(readActReminderWriteFailed()).toBe(true);
});

it('clears the flag once a write lands', () => {
  markActReminderWriteFailed(true);
  markActReminderWriteFailed(false);
  expect(readActReminderWriteFailed()).toBe(false);
});

it('bumps the epoch on every result, so a hook that read the flag at launch re-reads it after the clear', () => {
  mockMmkv.set('@unfold_act_reminder_write_failed', '1');
  markActReminderWriteFailed(false);
  expect(useUIState.getState().actReminderWriteEpoch).toBe(1);
  markActReminderWriteFailed(false);
  expect(useUIState.getState().actReminderWriteEpoch).toBe(2);
});
