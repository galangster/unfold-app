/**
 * What the act reminder sync last did, kept in MMKV so a process that starts
 * without React (the background check-in top-up) reads the same answer.
 */
import { mmkvStorage } from '@/lib/mmkv-storage';
import { useUIState } from '@/lib/ui-state';
import type { ActReminderWrite } from '@/lib/act-reminder';

const LAST_WRITE_KEY = '@unfold_act_reminder_last_write';
const WRITE_FAILED_KEY = '@unfold_act_reminder_write_failed';

export function readActReminderLastWrite(): ActReminderWrite | null {
  try {
    // MMKV reads are synchronous; the StateStorage type also allows a promise.
    return JSON.parse((mmkvStorage.getItem(LAST_WRITE_KEY) as string | null) ?? 'null') as ActReminderWrite | null;
  } catch {
    return null;
  }
}

export function storeActReminderLastWrite(write: ActReminderWrite | null): void {
  if (write) mmkvStorage.setItem(LAST_WRITE_KEY, JSON.stringify(write));
  else mmkvStorage.removeItem(LAST_WRITE_KEY);
}

/** True while the last act reminder write failed. Today's check-in keeps its midday slot until then. */
export function readActReminderWriteFailed(): boolean {
  try {
    return useUIState.getState().actReminderWriteFailed || mmkvStorage.getItem(WRITE_FAILED_KEY) === '1';
  } catch {
    return useUIState.getState().actReminderWriteFailed;
  }
}

export function markActReminderWriteFailed(failed: boolean): void {
  if (failed) mmkvStorage.setItem(WRITE_FAILED_KEY, '1');
  else mmkvStorage.removeItem(WRITE_FAILED_KEY);
  useUIState.getState().setActReminderWriteFailed(failed);
}
