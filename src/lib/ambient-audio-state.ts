import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { DEFAULT_AMBIENT_TRACK_ID, isAmbientTrackId, type AmbientTrackId } from './ambient-audio-catalog';
import { mmkvStorage } from './mmkv-storage';

export const AMBIENT_AUDIO_PERSIST_NAME = 'ambient-audio-state';
export const AMBIENT_DEFAULT_VOLUME = 0.25;

export type AmbientAudioStatus = 'off' | 'loading' | 'playing' | 'paused' | 'error';
export type AmbientTimerMinutes = 0 | 5 | 15 | 30;
export type AmbientTimerStatus = 'idle' | 'running' | 'ended';

export type AmbientAudioPersisted = {
  selectedTrackId: AmbientTrackId;
  volume: number;
  hasUsed: boolean;
};

export type AmbientAudioState = AmbientAudioPersisted & {
  status: AmbientAudioStatus;
  pauseReason: string | null;
  error: string | null;
  timerMinutes: AmbientTimerMinutes;
  timerStatus: AmbientTimerStatus;
  deadline: number | null;
  remainingSeconds: number;
  patch: (update: Partial<Omit<AmbientAudioState, 'patch'>>) => void;
};

export const AMBIENT_AUDIO_RUNTIME_DEFAULTS = {
  status: 'off' as const,
  pauseReason: null,
  error: null,
  timerMinutes: 0 as const,
  timerStatus: 'idle' as const,
  deadline: null,
  remainingSeconds: 0,
};

export const AMBIENT_AUDIO_INITIAL_STATE: AmbientAudioPersisted & typeof AMBIENT_AUDIO_RUNTIME_DEFAULTS = {
  selectedTrackId: DEFAULT_AMBIENT_TRACK_ID,
  volume: AMBIENT_DEFAULT_VOLUME,
  hasUsed: false,
  ...AMBIENT_AUDIO_RUNTIME_DEFAULTS,
};

let lastPersistedValue: string | null | undefined;

const ambientAudioStorage: StateStorage = {
  getItem: (name) => {
    const value = mmkvStorage.getItem(name);
    if (value instanceof Promise) {
      return value.then((resolved) => {
        lastPersistedValue = resolved;
        return resolved;
      });
    }
    lastPersistedValue = value;
    return value;
  },
  setItem: (name, value) => {
    if (value === lastPersistedValue) return;
    const result = mmkvStorage.setItem(name, value);
    if (result instanceof Promise) {
      return result.then(() => {
        lastPersistedValue = value;
      });
    }
    lastPersistedValue = value;
  },
  removeItem: (name) => {
    const result = mmkvStorage.removeItem(name);
    if (result instanceof Promise) {
      return result.then(() => {
        lastPersistedValue = undefined;
      });
    }
    lastPersistedValue = undefined;
  },
};

export function sanitizeAmbientAudioPersisted(raw: unknown): Partial<AmbientAudioPersisted> {
  if (!raw || typeof raw !== 'object') return {};

  const input = raw as Record<string, unknown>;
  const next: Partial<AmbientAudioPersisted> = {};

  if (isAmbientTrackId(input.selectedTrackId)) {
    next.selectedTrackId = input.selectedTrackId;
  }

  if (typeof input.volume === 'number' && Number.isFinite(input.volume)) {
    next.volume = Math.min(1, Math.max(0, input.volume));
  }

  if (typeof input.hasUsed === 'boolean') {
    next.hasUsed = input.hasUsed;
  }

  return next;
}

export function formatAmbientRemaining(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function isAmbientPlayerPresent(status: AmbientAudioStatus): boolean {
  return status === 'loading' || status === 'playing' || status === 'paused' || status === 'error';
}

export const useAmbientAudioState = create<AmbientAudioState>()(
  persist(
    (set) => ({
      ...AMBIENT_AUDIO_INITIAL_STATE,
      patch: (update) => set(update),
    }),
    {
      name: AMBIENT_AUDIO_PERSIST_NAME,
      storage: createJSONStorage(() => ambientAudioStorage),
      partialize: (state): AmbientAudioPersisted => ({
        selectedTrackId: state.selectedTrackId,
        volume: state.volume,
        hasUsed: state.hasUsed,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizeAmbientAudioPersisted(persistedState),
        ...AMBIENT_AUDIO_RUNTIME_DEFAULTS,
      }),
    },
  ),
);
