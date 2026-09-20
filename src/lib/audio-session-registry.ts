import { setAudioModeAsync } from "expo-audio";
import { logger } from "./logger";

export type AudioSessionOwner =
  | "success-cue"
  | "ambient"
  | "narration"
  | "voice-review"
  | "speech-recognition"
  | "voice-recording"
  | "system-interruption";

export type AudioSessionMode = Parameters<typeof setAudioModeAsync>[0];

export interface AudioSessionLease {
  readonly owner: AudioSessionOwner;
  readonly revision: number;
  configure(): Promise<boolean>;
  isActive(): boolean;
  release(): void;
}

export interface AudioSessionRegistry<Mode = AudioSessionMode> {
  acquire(options: {
    owner: AudioSessionOwner;
    mode?: Mode;
    onInvalidated?: () => void;
  }): AudioSessionLease | null;
  getSnapshot(): { owner: AudioSessionOwner | null; revision: number };
}

const PRIORITY: Record<AudioSessionOwner, number> = {
  "success-cue": 10,
  ambient: 20,
  narration: 50,
  "voice-review": 60,
  "speech-recognition": 70,
  "voice-recording": 80,
  "system-interruption": 100,
};

export function createAudioSessionRegistry<Mode>(
  setMode: (mode: Mode) => Promise<void>,
): AudioSessionRegistry<Mode> {
  let revision = 0;
  let current: Lease | null = null;
  let modeWriteTail: Promise<void> = Promise.resolve();

  class Lease implements AudioSessionLease {
    private active = true;
    private configuration: Promise<boolean> | null = null;

    constructor(
      readonly owner: AudioSessionOwner,
      readonly revision: number,
      private readonly mode: Mode | undefined,
      private readonly onInvalidated: (() => void) | undefined,
    ) {}

    configure(): Promise<boolean> {
      if (this.configuration) return this.configuration;
      if (!this.active) return Promise.resolve(false);

      const operation = modeWriteTail.then(async () => {
        if (!this.active) return false;
        if (this.mode !== undefined) {
          await setMode(this.mode);
        }
        return this.active;
      });
      modeWriteTail = operation.then(
        () => undefined,
        () => undefined,
      );
      this.configuration = operation;
      return operation;
    }

    isActive(): boolean {
      return this.active && current === this;
    }

    release(): void {
      if (!this.active) return;
      this.active = false;
      if (current === this) {
        current = null;
        revision += 1;
      }
    }

    invalidate(): void {
      if (!this.active) return;
      this.active = false;
      try {
        this.onInvalidated?.();
      } catch (error) {
        logger.warn("[AudioSession] invalidation callback failed", error);
      }
    }
  }

  return {
    acquire({ owner, mode, onInvalidated }) {
      if (current) {
        const currentPriority = PRIORITY[current.owner];
        const nextPriority = PRIORITY[owner];
        if (nextPriority < currentPriority) return null;
        if (owner === "success-cue" && current.owner === "success-cue")
          return null;
      }

      revision += 1;
      const lease = new Lease(owner, revision, mode, onInvalidated);
      const previous = current;
      current = lease;
      previous?.invalidate();
      return lease;
    },
    getSnapshot: () => ({ owner: current?.owner ?? null, revision }),
  };
}

export const audioSessionRegistry =
  createAudioSessionRegistry(setAudioModeAsync);

export function acquireAudioSession(
  options: Parameters<AudioSessionRegistry["acquire"]>[0],
): AudioSessionLease | null {
  return audioSessionRegistry.acquire(options);
}

export function getAudioSessionSnapshot(): {
  owner: AudioSessionOwner | null;
  revision: number;
} {
  return audioSessionRegistry.getSnapshot();
}


export type AudioInterruption = { interrupted: boolean; canRetry?: boolean };

export function createAudioInterruptionCoordinator(registry: AudioSessionRegistry) {
  let interruption: AudioSessionLease | null = null;
  return {
    handle(event: AudioInterruption): void {
      if (event.interrupted) {
        if (!interruption?.isActive()) {
          interruption = registry.acquire({ owner: 'system-interruption' });
        }
      } else {
        interruption?.release();
        interruption = null;
      }
    },
    retryExplicitPlayback(): void {
      interruption?.release();
      interruption = null;
    },
  };
}

const interruptions = createAudioInterruptionCoordinator(audioSessionRegistry);
export const handleAudioInterruption = interruptions.handle;
/** Interruption end events are not guaranteed. An explicit user action may retry native activation. */
export const retryAudioAfterInterruption = interruptions.retryExplicitPlayback;
