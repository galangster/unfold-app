import type { AppStateStatus } from 'react-native';

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_MAX_WAIT_MS = 2000;

export type AutosaveSave = () => void | Promise<void>;

export type AutosaveController = {
  schedule: () => void;
  flush: () => boolean;
  cancel: () => void;
  hasPending: () => boolean;
};

export function shouldFlushAutosaveOnAppState(status: AppStateStatus): boolean {
  return status === 'inactive' || status === 'background';
}

export function createAutosaveController({
  save,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
  maxWaitMs = AUTOSAVE_MAX_WAIT_MS,
}: {
  save: AutosaveSave;
  debounceMs?: number;
  maxWaitMs?: number;
}): AutosaveController {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  };

  const run = (): boolean => {
    if (!pending) return false;

    pending = false;
    clearTimers();
    void save();
    return true;
  };

  return {
    schedule: () => {
      if (!pending) {
        pending = true;
        maxWaitTimer = setTimeout(run, maxWaitMs);
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(run, debounceMs);
    },
    flush: run,
    cancel: () => {
      pending = false;
      clearTimers();
    },
    hasPending: () => pending,
  };
}
