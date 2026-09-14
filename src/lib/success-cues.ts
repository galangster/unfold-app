import { createAudioPlayer } from "expo-audio";
import type { AudioStatus } from "expo-audio/build/Audio.types";
import type { AudioPlayer } from "expo-audio/build/AudioModule.types";
import { AccessibilityInfo, AppState } from "react-native";
import {
  audioSessionRegistry,
  type AudioSessionRegistry,
} from "./audio-session-registry";
import { getDeviceId, mmkvStorage } from "./mmkv-storage";
import { logger } from "./logger";
import {
  SUCCESS_CUE_SOURCES,
  type SuccessCueEventType,
} from "./success-cue-assets";
import {
  registerSuccessCueCancellation,
  SOUND_EFFECTS_ENABLED_KEY,
  SUCCESS_CUE_LEDGER_KEY,
} from "./success-cue-storage";

export {
  cancelSuccessCuePlayback,
  SOUND_EFFECTS_ENABLED_KEY,
  SUCCESS_CUE_LEDGER_KEY,
} from "./success-cue-storage";

export type SuccessCueEvent = {
  type: SuccessCueEventType;
  devotionalId: string;
  dayNumber: number;
  eligible?: boolean;
};

export const SUCCESS_CUE_LOAD_TIMEOUT_MS = 3_000;

type CueStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): unknown;
};

type CuePlayer = Pick<AudioPlayer, "play" | "pause" | "remove" | "addListener">;

type SuccessCueDependencies = {
  storage: CueStorage;
  getIdentity(): string;
  isForeground(): boolean;
  isScreenReaderEnabled(): Promise<boolean>;
  sessionRegistry: AudioSessionRegistry;
  createPlayer(source: number): CuePlayer;
  sources: Record<SuccessCueEventType, number>;
  loadTimeoutMs: number;
};

export type SuccessCueOwner = {
  emit(event: SuccessCueEvent): (() => void) | undefined;
  cancel(): void;
};

function readSync(storage: CueStorage, key: string): string | null {
  const value = storage.getItem(key);
  return value instanceof Promise ? null : value;
}

function preferenceEnabled(storage: CueStorage): boolean {
  return readSync(storage, SOUND_EFFECTS_ENABLED_KEY) !== "false";
}

export function getSoundEffectsEnabled(): boolean {
  return preferenceEnabled(mmkvStorage);
}

export function setSoundEffectsEnabled(enabled: boolean): void {
  mmkvStorage.setItem(SOUND_EFFECTS_ENABLED_KEY, enabled ? "true" : "false");
  if (!enabled) defaultOwner.cancel();
}

function validEvent(event: SuccessCueEvent): boolean {
  return (
    Object.prototype.hasOwnProperty.call(SUCCESS_CUE_SOURCES, event.type) &&
    typeof event.devotionalId === "string" &&
    event.devotionalId.trim().length > 0 &&
    event.devotionalId.length <= 256 &&
    Number.isInteger(event.dayNumber) &&
    event.dayNumber >= 1
  );
}

function claimsFor(event: SuccessCueEvent, identity: string): string[] {
  const id = encodeURIComponent(event.devotionalId);
  const prefix = encodeURIComponent(identity);
  const dayReveal = `${prefix}:day-reveal:${id}:${event.dayNumber}`;
  switch (event.type) {
    case "first-devotional-revealed":
      return [
        `${prefix}:first-devotional`,
        `${prefix}:series:${id}`,
        dayReveal,
      ];
    case "new-series-revealed":
      return [`${prefix}:series:${id}`, dayReveal];
    case "new-day-revealed":
      return [dayReveal];
    case "day-completed":
      return [`${prefix}:day-complete:${id}:${event.dayNumber}`];
  }
}

function claim(
  storage: CueStorage,
  event: SuccessCueEvent,
  identity: string,
  sessionClaims: Set<string>,
): boolean {
  let ledger: Record<string, true> = {};
  let raw: string | null = null;
  try {
    raw = readSync(storage, SUCCESS_CUE_LEDGER_KEY);
  } catch {
    // The session claim below still consumes this attempt.
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        ledger = parsed as Record<string, true>;
      }
    } catch {
      ledger = {};
    }
  }

  const keys = claimsFor(event, identity);
  if (keys.some((key) => ledger[key] === true || sessionClaims.has(key)))
    return false;
  for (const key of keys) {
    ledger[key] = true;
    sessionClaims.add(key);
  }
  try {
    storage.setItem(SUCCESS_CUE_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    return false;
  }
  return true;
}

export function createSuccessCueOwner(
  dependencies: SuccessCueDependencies,
): SuccessCueOwner {
  let activeCancel: (() => void) | null = null;
  const sessionClaims = new Set<string>();

  const cancel = () => {
    const current = activeCancel;
    activeCancel = null;
    current?.();
  };

  const isEligible = (identity: string, leaseActive: () => boolean): boolean =>
    leaseActive() &&
    dependencies.getIdentity() === identity &&
    dependencies.isForeground() &&
    preferenceEnabled(dependencies.storage);

  const emit = (event: SuccessCueEvent): (() => void) | undefined => {
    try {
      if (!validEvent(event)) return;
      const identity = dependencies.getIdentity();
      if (
        !identity ||
        !claim(dependencies.storage, event, identity, sessionClaims)
      )
        return;
      if (
        event.eligible === false ||
        !dependencies.isForeground() ||
        !preferenceEnabled(dependencies.storage)
      )
        return;

      let dispose = () => {};
      const lease = dependencies.sessionRegistry.acquire({
        owner: "success-cue",
        mode: {
          playsInSilentMode: false,
          shouldPlayInBackground: false,
          interruptionMode: "doNotMix",
          allowsRecording: false,
          allowsBackgroundRecording: false,
          shouldRouteThroughEarpiece: false,
        },
        onInvalidated: () => dispose(),
      });
      if (!lease) return;

      const cancelEvent = () => {
        dispose();
        lease.release();
      };
      activeCancel = cancelEvent;

      void (async () => {
        let player: CuePlayer | null = null;
        let subscription: { remove(): void } | null = null;
        let loadTimer: ReturnType<typeof setTimeout> | null = null;
        let finishPendingLoad: ((loaded: boolean) => void) | null = null;
        let playbackTimer: ReturnType<typeof setTimeout> | null = null;
        let settled = false;
        let sawPlaying = false;

        const clean = () => {
          if (settled) return;
          settled = true;
          finishPendingLoad?.(false);
          finishPendingLoad = null;
          if (playbackTimer) clearTimeout(playbackTimer);
          if (loadTimer) clearTimeout(loadTimer);
          loadTimer = null;
          try {
            subscription?.remove();
          } catch {}
          subscription = null;
          if (player) {
            try {
              player.pause();
            } catch {}
            try {
              player.remove();
            } catch (error) {
              logger.warn("[SuccessCue] player remove failed", error);
            }
            player = null;
          }
          lease.release();
          if (activeCancel === cancelEvent) activeCancel = null;
        };
        dispose = clean;

        const checkAfterAwait = () =>
          isEligible(identity, () => lease.isActive());

        try {
          const screenReaderEnabled =
            await dependencies.isScreenReaderEnabled();
          if (screenReaderEnabled || !checkAfterAwait()) return clean();

          const configured = await lease.configure();
          if (!configured || !checkAfterAwait()) return clean();

          player = dependencies.createPlayer(dependencies.sources[event.type]);
          const loaded = new Promise<boolean>((resolve) => {
            const finishLoad = (value: boolean) => {
              if (loadTimer) clearTimeout(loadTimer);
              loadTimer = null;
              resolve(value);
            };
            finishPendingLoad = finishLoad;
            subscription = player!.addListener(
              "playbackStatusUpdate",
              (status: AudioStatus) => {
                if (status.error) {
                  finishLoad(false);
                  clean();
                  return;
                }
                if (status.isLoaded) finishLoad(true);
                if (status.playing) sawPlaying = true;
                if (status.didJustFinish || (sawPlaying && !status.playing))
                  clean();
              },
            );
            loadTimer = setTimeout(
              () => finishLoad(false),
              dependencies.loadTimeoutMs,
            );
          });

          const didLoad = await loaded;
          if (!didLoad || !checkAfterAwait()) return clean();

          const screenReaderStillEnabled =
            await dependencies.isScreenReaderEnabled();
          if (screenReaderStillEnabled || !checkAfterAwait()) return clean();

          player.play();
          playbackTimer = setTimeout(clean, 7_000);
        } catch (error) {
          logger.warn("[SuccessCue] playback skipped", error);
          clean();
        }
      })();
      return cancelEvent;
    } catch (error) {
      logger.warn("[SuccessCue] event skipped", error);
    }
  };

  return { emit, cancel };
}

const defaultOwner = createSuccessCueOwner({
  storage: mmkvStorage,
  getIdentity: getDeviceId,
  isForeground: () => AppState.currentState === "active",
  isScreenReaderEnabled: () => AccessibilityInfo.isScreenReaderEnabled(),
  sessionRegistry: audioSessionRegistry,
  createPlayer: (source) =>
    createAudioPlayer(source, {
      downloadFirst: true,
      autoResumeOnInterruption: false,
      updateInterval: 100,
    }),
  sources: SUCCESS_CUE_SOURCES,
  loadTimeoutMs: SUCCESS_CUE_LOAD_TIMEOUT_MS,
});

export function emitSuccessCue(event: SuccessCueEvent): (() => void) | undefined {
  return defaultOwner.emit(event);
}

registerSuccessCueCancellation(defaultOwner.cancel);

AppState.addEventListener("change", (status) => {
  if (status !== "active") defaultOwner.cancel();
});
AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
  if (enabled) defaultOwner.cancel();
});
