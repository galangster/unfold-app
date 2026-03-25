/**
 * useGlobalAudioPlayer — singleton imperative audio player hook
 *
 * Wraps expo-audio's createAudioPlayer (NOT useAudioPlayer) with a module-level
 * singleton. Syncs all playback state to the Zustand store via event listener.
 * Manages lock screen controls, completion cascade, and speed cycling.
 *
 * Usage:
 *   - Call from root layout to initialize audio session
 *   - Call from any component to access actions (startAudio, stopAudio, etc.)
 */

import { useEffect, useCallback, useRef } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import type { AudioStatus } from 'expo-audio/build/Audio.types';
import type { EventSubscription } from 'expo-modules-core';

import {
  useAudioPlayerState,
  type DevotionalAudioMetadata,
  type PlayerTier,
} from '@/lib/audio-player-state';
import { Duration } from '@/constants/animations';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75] as const;

/**
 * Completion cascade tier order.
 * After didJustFinish fires we walk backwards through the display tiers
 * with Duration.normal (250ms) between each step before final dismiss.
 */
const COMPLETION_CASCADE: PlayerTier[] = ['halfsheet', 'minibar', 'pill'];

/** How long to show "Completed" state before auto-dismiss (ms). */
const COMPLETED_DISPLAY_MS = 3_000;

// ---------------------------------------------------------------------------
// Singleton player
// ---------------------------------------------------------------------------

let globalPlayer: AudioPlayer | null = null;
let statusSubscription: EventSubscription | null = null;

function getOrCreatePlayer(): AudioPlayer {
  if (!globalPlayer) {
    globalPlayer = createAudioPlayer(null, { updateInterval: 250 });
    logger.log('[AudioPlayer] Created new singleton player');
  }
  return globalPlayer;
}

/**
 * Tear down the singleton: remove listener, release native resources, null out.
 */
function destroyPlayer(): void {
  if (statusSubscription) {
    statusSubscription.remove();
    statusSubscription = null;
  }
  if (globalPlayer) {
    try {
      globalPlayer.clearLockScreenControls();
    } catch (e) {
      logger.warn('[AudioPlayer] clearLockScreenControls error during destroy', e);
    }
    try {
      globalPlayer.remove();
    } catch (e) {
      logger.warn('[AudioPlayer] remove() error during destroy', e);
    }
    globalPlayer = null;
    logger.log('[AudioPlayer] Destroyed singleton player');
  }
}

// ---------------------------------------------------------------------------
// Completion cascade runner
// ---------------------------------------------------------------------------

let cascadeTimers: ReturnType<typeof setTimeout>[] = [];

function clearCascadeTimers(): void {
  for (const t of cascadeTimers) clearTimeout(t);
  cascadeTimers = [];
}

/**
 * Walks the player tier down through halfsheet -> minibar -> pill -> completed -> hidden.
 * Each transition uses Duration.normal (250ms) between tiers.
 */
function runCompletionCascade(): void {
  clearCascadeTimers();

  const store = useAudioPlayerState.getState();
  const currentTierIndex = COMPLETION_CASCADE.indexOf(store.playerTier);

  // Start from whichever tier we're on (or the top if not in cascade list)
  const startIndex = currentTierIndex >= 0 ? currentTierIndex : 0;

  let delay = 0;

  // Walk down from current tier to pill
  for (let i = startIndex + 1; i < COMPLETION_CASCADE.length; i++) {
    delay += Duration.normal;
    const tier = COMPLETION_CASCADE[i];
    cascadeTimers.push(
      setTimeout(() => {
        useAudioPlayerState.getState().setTier(tier);
      }, delay),
    );
  }

  // After reaching pill, mark completed
  delay += Duration.normal;
  cascadeTimers.push(
    setTimeout(() => {
      useAudioPlayerState.getState().setCompleted(true);
    }, delay),
  );

  // Show "Completed" for 3 seconds, then dismiss and clean up
  delay += COMPLETED_DISPLAY_MS;
  cascadeTimers.push(
    setTimeout(() => {
      useAudioPlayerState.getState().stopAudio();
      destroyPlayer();
    }, delay),
  );
}

// ---------------------------------------------------------------------------
// Status listener (wired to singleton player)
// ---------------------------------------------------------------------------

function attachStatusListener(player: AudioPlayer): void {
  if (statusSubscription) {
    statusSubscription.remove();
    statusSubscription = null;
  }

  statusSubscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    const store = useAudioPlayerState.getState();

    // Sync native → Zustand
    store.updatePlaybackState({
      isPlaying: status.playing,
      isBuffering: status.isBuffering,
      isLoading: !status.isLoaded,
      currentTime: status.currentTime,
      duration: status.duration,
    });

    // Completion: didJustFinish fires once when audio ends
    if (status.didJustFinish && !store.isCompleted) {
      logger.log('[AudioPlayer] Playback finished — starting completion cascade');
      runCompletionCascade();
    }
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGlobalAudioPlayer() {
  const mountedRef = useRef(true);

  // Configure audio session once on first mount
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
        logger.log('[AudioPlayer] Audio session configured');
      } catch (e) {
        logger.error('[AudioPlayer] Failed to configure audio session', e);
      }
    })();

    return () => {
      mountedRef.current = false;
      // Do NOT destroy on unmount — the player is a singleton that persists
      // across component trees. It only dies on explicit stopAudio() or cascade end.
    };
  }, []);

  // ------ Actions ------

  const startAudio = useCallback(
    (uri: string, metadata: DevotionalAudioMetadata) => {
      clearCascadeTimers();

      // Update store first (sets tier to minibar, isLoading, etc.)
      useAudioPlayerState.getState().startAudio(uri, metadata);

      try {
        // Get or create the singleton player
        const player = getOrCreatePlayer();

        // Attach status listener (idempotent — removes old first)
        attachStatusListener(player);

        // Replace source and play
        player.replace({ uri });
        player.shouldCorrectPitch = true;

        // Restore speed from store
        const speed = useAudioPlayerState.getState().playbackSpeed;
        if (speed !== 1) {
          player.setPlaybackRate(speed, 'medium');
        }

        player.play();

        // Lock screen controls
        try {
          player.setActiveForLockScreen(true, {
            title: metadata.title,
            artist: metadata.seriesTitle,
          }, {
            showSeekForward: true,
            showSeekBackward: true,
          });
        } catch (e) {
          logger.warn('[AudioPlayer] Lock screen setup failed', e);
        }

        logger.log('[AudioPlayer] startAudio:', metadata.title);
      } catch (e) {
        logger.error('[AudioPlayer] startAudio FAILED — stopping to prevent freeze:', e);
        // Reset state so the UI doesn't get stuck in loading
        useAudioPlayerState.getState().stopAudio();
        destroyPlayer();
      }
    },
    [],
  );

  const stopAudio = useCallback(() => {
    clearCascadeTimers();

    if (globalPlayer) {
      try {
        globalPlayer.pause();
      } catch (e) {
        logger.warn('[AudioPlayer] pause error during stop', e);
      }
    }

    destroyPlayer();
    useAudioPlayerState.getState().stopAudio();

    logger.log('[AudioPlayer] stopAudio — player destroyed');
  }, []);

  const togglePlayPause = useCallback(() => {
    const player = globalPlayer;
    if (!player) return;

    try {
      const { isPlaying } = useAudioPlayerState.getState();
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
      // State syncs via the playbackStatusUpdate listener
    } catch (e) {
      logger.error('[AudioPlayer] togglePlayPause failed:', e);
    }
  }, []);

  const seekTo = useCallback(async (time: number) => {
    const player = globalPlayer;
    if (!player) return;

    const clamped = Math.max(0, Math.min(time, player.duration || 0));
    useAudioPlayerState.getState().seekTo(clamped);

    try {
      await player.seekTo(clamped);
    } catch (e) {
      logger.warn('[AudioPlayer] seekTo error', e);
    }
  }, []);

  const skip = useCallback(async (seconds: number) => {
    const player = globalPlayer;
    if (!player) return;

    const target = player.currentTime + seconds;
    const clamped = Math.max(0, Math.min(target, player.duration || 0));
    useAudioPlayerState.getState().seekTo(clamped);

    try {
      await player.seekTo(clamped);
    } catch (e) {
      logger.warn('[AudioPlayer] skip error', e);
    }
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const player = globalPlayer;
    if (player) {
      player.setPlaybackRate(speed, 'medium');
    }
    useAudioPlayerState.getState().setSpeed(speed);
  }, []);

  const cycleSpeed = useCallback(() => {
    const current = useAudioPlayerState.getState().playbackSpeed;
    const idx = SPEED_OPTIONS.indexOf(current as typeof SPEED_OPTIONS[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
  }, [setSpeed]);

  return {
    startAudio,
    stopAudio,
    togglePlayPause,
    seekTo,
    skip,
    setSpeed,
    cycleSpeed,
    /** Exposed for debugging — prefer actions above */
    _getPlayer: () => globalPlayer,
  };
}

/**
 * Speed options for UI display
 */
export { SPEED_OPTIONS };
