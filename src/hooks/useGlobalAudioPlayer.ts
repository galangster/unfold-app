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

import { useCallback } from 'react';
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
const COMPLETION_CASCADE: PlayerTier[] = ['sheet', 'pill'];

/** How long to show "Completed" state before auto-dismiss (ms). */
const COMPLETED_DISPLAY_MS = 3_000;

// ---------------------------------------------------------------------------
// Singleton player
// ---------------------------------------------------------------------------

let globalPlayer: AudioPlayer | null = null;
let statusSubscription: EventSubscription | null = null;
/** Watchdog timer — resets state if playback doesn't start within timeout */
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
/** Track whether the audio session has been configured (lazy init). */
let audioSessionConfigured = false;

/**
 * Tear down the singleton: remove listener, release native resources, null out.
 */
function destroyPlayer(): void {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
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
 * Walks the player tier down through sheet -> pill -> completed -> hidden.
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

    // Completion: run cascade to gracefully dismiss the player UI,
    // then destroy the native player to prevent CoreMedia spin loops.
    if (status.didJustFinish) {
      logger.log('[AudioPlayer] Playback finished — running completion cascade');
      store.updatePlaybackState({ currentTime: 0, isPlaying: false });
      runCompletionCascade();
    }
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Configure the AVAudioSession lazily — only when audio playback is actually
 * requested. This avoids a synchronous JSI call on the JS thread during screen
 * mount, which could block the thread for non-premium users who never play audio.
 */
async function ensureAudioSession(): Promise<void> {
  if (audioSessionConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    audioSessionConfigured = true;
    logger.log('[AudioPlayer] Audio session configured (lazy)');
  } catch (e) {
    logger.error('[AudioPlayer] Failed to configure audio session', e);
  }
}

export function useGlobalAudioPlayer() {

  // ------ Actions ------

  const startAudio = useCallback(
    (uri: string, metadata: DevotionalAudioMetadata) => {
      clearCascadeTimers();

      // Update store first (sets tier to sheet, isLoading, etc.)
      useAudioPlayerState.getState().startAudio(uri, metadata);

      logger.log('[AudioPlayer] startAudio: deferring native ops for', metadata.title);

      // CRITICAL: Use setTimeout(0) to fully yield the JS thread before heavy native ops.
      // InteractionManager.runAfterInteractions can still block because
      // createAudioPlayer() / play() are synchronous JSI calls.
      // setTimeout(0) ensures React has time to commit the loading state to screen first.
      setTimeout(async () => {
        try {
          // Lazily configure the audio session on first playback
          await ensureAudioSession();

          // Yield again before the heaviest call
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

          // Destroy any existing player
          destroyPlayer();

          // createAudioPlayer is a synchronous JSI call — but with the UI
          // already showing the loading state, the brief block is acceptable.
          globalPlayer = createAudioPlayer({ uri }, { updateInterval: 250 });
          logger.log('[AudioPlayer] Created player with source');

          // Attach status listener
          attachStatusListener(globalPlayer);

          // Configure playback
          globalPlayer.shouldCorrectPitch = true;
          const speed = useAudioPlayerState.getState().playbackSpeed;
          if (speed !== 1) {
            globalPlayer.setPlaybackRate(speed, 'medium');
          }

          // Defer play() to next frame — gives native player time to initialize
          requestAnimationFrame(() => {
            if (!globalPlayer) return;
            try {
              globalPlayer.play();
              logger.log('[AudioPlayer] play() called');
            } catch (e) {
              logger.error('[AudioPlayer] play() failed:', e);
              useAudioPlayerState.getState().stopAudio();
              destroyPlayer();
            }
          });

          // Lock screen controls — defer to avoid blocking
          setTimeout(() => {
            if (!globalPlayer) return;
            try {
              globalPlayer.setActiveForLockScreen(true, {
                title: metadata.title,
                artist: metadata.seriesTitle,
              }, {
                showSeekForward: true,
                showSeekBackward: true,
              });
            } catch (e) {
              logger.warn('[AudioPlayer] Lock screen setup failed', e);
            }
          }, 100);

          // Watchdog: if not playing within 10s, reset to prevent stuck state
          watchdogTimer = setTimeout(() => {
            const store = useAudioPlayerState.getState();
            if (store.isLoading && !store.isPlaying) {
              logger.warn('[AudioPlayer] Watchdog: still loading after 10s — resetting');
              useAudioPlayerState.getState().stopAudio();
              destroyPlayer();
            }
          }, 10_000);

        } catch (e) {
          logger.error('[AudioPlayer] startAudio FAILED:', e);
          useAudioPlayerState.getState().stopAudio();
          destroyPlayer();
        }
      }, 0);
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
