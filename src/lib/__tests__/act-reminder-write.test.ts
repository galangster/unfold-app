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
  useUIState.setState({ actReminderWriteFailed: false });
});

it('reads a failed write left by an earlier process, so a background sync keeps the midday check-in', () => {
  markActReminderWriteFailed(true);
  // A fresh process starts with the in-memory flag false.
  useUIState.setState({ actReminderWriteFailed: false });
  expect(readActReminderWriteFailed()).toBe(true);
});

it('clears both copies once a write lands', () => {
  markActReminderWriteFailed(true);
  markActReminderWriteFailed(false);
  expect(useUIState.getState().actReminderWriteFailed).toBe(false);
  expect(readActReminderWriteFailed()).toBe(false);
});
