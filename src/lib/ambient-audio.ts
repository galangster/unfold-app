/** Foreground ambient music. Sound effects use a different owner. */
import { createAudioPlayer } from 'expo-audio';
import type { AudioStatus } from 'expo-audio/build/Audio.types';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getAmbientTrack,
  isAmbientTrackId,
  nextAmbientTrackId,
  type AmbientTrackId,
} from './ambient-audio-catalog';
import { isAmbientAudioEnabled } from './ambient-audio-feature';
import { logger } from './logger';
import { acquireAudioSession, retryAudioAfterPermanentInterruption, type AudioSessionLease } from './audio-session-registry';
import {
  AMBIENT_AUDIO_RUNTIME_DEFAULTS,
  useAmbientAudioState,
  type AmbientTimerMinutes,
} from './ambient-audio-state';

export const AMBIENT_FADE_MS = 500;
export const AMBIENT_STOP_FADE_MS = 220;
export const AMBIENT_LOAD_WATCHDOG_MS = 8_000;
export const AMBIENT_TIMER_MINUTES = [0, 5, 15, 30] as const;

const FADE_STEP_MS = 50;
const TICK_MS = 250;
const GENERIC_LOAD_ERROR = 'Unable to start ambient sound.';

type PlaybackGuard = () => boolean;
type FadeTarget = number | (() => number);
type FadeOperation = {
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (completed: boolean) => void;
};

let player: AudioPlayer | null = null;
let sessionLease: AudioSessionLease | null = null;
let playerTrackId: AmbientTrackId | null = null;
let statusSubscription: { remove: () => void } | null = null;
let startGeneration = 0;
let playbackGuard: PlaybackGuard | null = null;
let sawNativePlaying = false;
let fadeOperation: FadeOperation | null = null;
let watchdogTimer: { generation: number; timer: ReturnType<typeof setTimeout> } | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let initCount = 0;

function store() {
  return useAmbientAudioState.getState();
}

function isCurrent(generation: number): boolean {
  return generation === startGeneration;
}

function getAppState(): string {
  const raw = AppState.currentState as unknown;
  return typeof raw === 'string' ? raw : 'active';
}

function isInactiveState(status: string): boolean {
  return status === 'background' || status === 'inactive';
}

function canStartPlayback(): boolean {
  if (!playbackGuard) return true;
  try {
    return playbackGuard() === true;
  } catch {
    return false;
  }
}

function shouldAbortStart(generation: number): boolean {
  if (!isCurrent(generation) || !isAmbientAudioEnabled()) return true;
  if (isDeadlineExpired()) {
    expireTimer();
    return true;
  }
  if (isInactiveState(getAppState())) {
    pauseForAppState();
    return true;
  }
  if (canStartPlayback()) return false;
  if (store().status === 'loading') {
    pauseAmbientSound('guard');
  }
  return true;
}

function clearFade(): void {
  const operation = fadeOperation;
  if (!operation) return;
  fadeOperation = null;
  if (operation.timer) clearTimeout(operation.timer);
  operation.resolve(false);
}

function clearWatchdog(generation?: number): void {
  if (!watchdogTimer || (generation !== undefined && watchdogTimer.generation !== generation)) return;
  clearTimeout(watchdogTimer.timer);
  watchdogTimer = null;
}

function clearTicker(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function remainingFromDeadline(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function isDeadlineExpired(now = Date.now()): boolean {
  const deadline = store().deadline;
  return deadline != null && now >= deadline;
}

function syncRemaining(now = Date.now()): void {
  const { deadline, timerStatus } = store();
  if (deadline == null) {
    clearTicker();
    if (store().remainingSeconds !== 0 && timerStatus !== 'ended') {
      store().patch({ remainingSeconds: 0 });
    }
    return;
  }
  if (now >= deadline) {
    expireTimer();
    return;
  }
  const remainingSeconds = remainingFromDeadline(deadline, now);
  if (remainingSeconds !== store().remainingSeconds) {
    store().patch({ remainingSeconds });
  }
}

function ensureTicker(): void {
  if (tickTimer || store().deadline == null) return;
  tickTimer = setInterval(() => {
    syncRemaining();
  }, TICK_MS);
}

function armWatchdog(generation: number): void {
  clearWatchdog();
  const timer = setTimeout(() => {
    if (watchdogTimer?.generation !== generation) return;
    watchdogTimer = null;
    if (isCurrent(generation)) recoverError(GENERIC_LOAD_ERROR);
  }, AMBIENT_LOAD_WATCHDOG_MS);
  watchdogTimer = { generation, timer };
}

function releaseSession(): void {
  sessionLease?.release();
  sessionLease = null;
}

function destroyPlayer(releaseOwnership = true): void {
  if (releaseOwnership) releaseSession();
  clearWatchdog();
  clearFade();
  if (statusSubscription) {
    try {
      statusSubscription.remove();
    } catch (error) {
      logger.warn('[AmbientAudio] status listener remove failed', error);
    }
    statusSubscription = null;
  }
  if (player) {
    const current = player;
    player = null;
    try {
      current.pause();
    } catch {
      // Player may already be invalid.
    }
    try {
      current.remove();
    } catch (error) {
      logger.warn('[AmbientAudio] player remove failed', error);
    }
  }
  playerTrackId = null;
  sawNativePlaying = false;
}

function fadeTo(targetPlayer: AudioPlayer, targetVolume: FadeTarget, generation: number, duration = AMBIENT_FADE_MS): Promise<boolean> {
  clearFade();
  const startVolume = targetPlayer.volume;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const operation: FadeOperation = { timer: null, resolve };
    fadeOperation = operation;

    const finish = (completed: boolean) => {
      if (fadeOperation === operation) fadeOperation = null;
      operation.timer = null;
      resolve(completed);
    };

    const step = () => {
      if (fadeOperation !== operation) return;
      operation.timer = null;
      if (!isCurrent(generation) || player !== targetPlayer) {
        finish(false);
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      try {
        const latestTarget = typeof targetVolume === 'function' ? targetVolume() : targetVolume;
        targetPlayer.volume = startVolume + (latestTarget - startVolume) * progress;
      } catch (error) {
        logger.warn('[AmbientAudio] volume fade failed', error);
        finish(false);
        return;
      }
      if (progress >= 1) {
        finish(true);
        return;
      }
      operation.timer = setTimeout(step, FADE_STEP_MS);
    };
    operation.timer = setTimeout(step, FADE_STEP_MS);
  });
}

async function configureAudioSession(): Promise<boolean> {
  if (!sessionLease?.isActive()) {
    sessionLease = acquireAudioSession({
      owner: 'ambient',
      mode: {
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsRecording: false,
        allowsBackgroundRecording: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix',
      },
      onInvalidated: () => pauseAmbientSound('interruption'),
    });
  }
  const lease = sessionLease;
  if (!lease) {
    pauseAmbientSound('guard');
    return false;
  }
  return lease.configure();
}

function attachStatusListener(target: AudioPlayer, generation: number): void {
  if (statusSubscription) {
    statusSubscription.remove();
    statusSubscription = null;
  }

  statusSubscription = target.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (!isCurrent(generation) || player !== target) return;

    if (status.error) {
      recoverError(GENERIC_LOAD_ERROR);
      return;
    }

    if (status.mediaServicesDidReset) {
      pauseAmbientSound('interruption');
      return;
    }

    if (status.playing) {
      sawNativePlaying = true;
    }

    if (store().status === 'loading' && status.isLoaded) {
      if (isDeadlineExpired()) {
        expireTimer();
        return;
      }
      beginPlayback(target, generation);
      return;
    }

    if (status.didJustFinish && store().status === 'playing') {
      playAmbientSound(nextAmbientTrackId(store().selectedTrackId), false);
      return;
    }

    if (
      store().status === 'playing'
      && sawNativePlaying
      && status.isLoaded
      && !status.playing
      && !status.didJustFinish
    ) {
      sawNativePlaying = false;
      pauseAmbientSound('interruption');
    }
  });
}

function beginPlayback(target: AudioPlayer, generation: number): void {
  if (player !== target || shouldAbortStart(generation)) return;

  try {
    target.play();
    sawNativePlaying = true;
    clearWatchdog(generation);
    store().patch({ status: 'playing', pauseReason: null, error: null });
    void fadeTo(target, () => store().volume, generation);
  } catch (error) {
    logger.warn('[AmbientAudio] play() failed', error);
    recoverError(GENERIC_LOAD_ERROR);
  }
}

function recoverError(message: string): void {
  startGeneration += 1;
  destroyPlayer();
  store().patch({
    status: 'error',
    error: message,
    pauseReason: null,
  });
}

async function haltPlayback(): Promise<void> {
  const generation = ++startGeneration;
  const current = player;
  store().patch({
    status: 'off',
    pauseReason: null,
    error: null,
  });

  if (!current) {
    destroyPlayer();
    return;
  }

  await fadeTo(current, 0, generation, AMBIENT_STOP_FADE_MS);
  if (isCurrent(generation) && player === current) {
    destroyPlayer();
  }
}

function expireTimer(): void {
  const { timerStatus, status } = store();
  if (timerStatus !== 'running' && store().deadline == null) {
    if (store().remainingSeconds !== 0) {
      store().patch({ remainingSeconds: 0, deadline: null });
    }
    clearTicker();
    return;
  }
  store().patch({
    timerStatus: 'ended',
    deadline: null,
    remainingSeconds: 0,
  });
  clearTicker();
  if (status !== 'off') {
    haltPlayback();
  }
}

function pauseForAppState(): void {
  pauseAmbientSound('background');
}

function onAppStateChange(next: AppStateStatus): void {
  if (isInactiveState(next)) {
    pauseForAppState();
    return;
  }
  if (next === 'active') {
    if (isDeadlineExpired()) {
      expireTimer();
      return;
    }
    syncRemaining();
  }
}

async function startNewPlayback(generation: number): Promise<void> {
  try {
    await Promise.resolve();
    if (shouldAbortStart(generation)) return;

    if (!(await configureAudioSession())) return;
    if (shouldAbortStart(generation)) return;

    const outgoing = player;
    if (outgoing) {
      await fadeTo(outgoing, 0, generation);
      if (!isCurrent(generation)) return;
      destroyPlayer(false);
      armWatchdog(generation);
    }

    const track = getAmbientTrack(store().selectedTrackId);
    const next = createAudioPlayer(track.source, {
      updateInterval: 500,
      downloadFirst: false,
      keepAudioSessionActive: true,
      autoResumeOnInterruption: false,
    });
    player = next;
    playerTrackId = track.id;
    next.loop = false;
    next.volume = 0;
    attachStatusListener(next, generation);

    if (!isCurrent(generation)) {
      if (player === next) destroyPlayer();
      return;
    }
    if (shouldAbortStart(generation)) return;

    if (next.isLoaded) {
      beginPlayback(next, generation);
    }
  } catch (error) {
    if (!isCurrent(generation)) return;
    logger.warn('[AmbientAudio] start failed', error);
    recoverError(GENERIC_LOAD_ERROR);
  }
}

async function resumeExisting(generation: number): Promise<void> {
  try {
    const current = player;
    if (!current || shouldAbortStart(generation)) return;

    attachStatusListener(current, generation);
    if (!(await configureAudioSession())) return;
    if (player !== current || shouldAbortStart(generation)) return;

    current.volume = 0;
    current.play();
    sawNativePlaying = true;
    clearWatchdog(generation);
    store().patch({ status: 'playing', pauseReason: null, error: null });
    await fadeTo(current, () => store().volume, generation);
  } catch (error) {
    if (!isCurrent(generation)) return;
    logger.warn('[AmbientAudio] resume failed', error);
    recoverError(GENERIC_LOAD_ERROR);
  }
}

async function refreshPlayingSession(target: AudioPlayer, generation: number): Promise<void> {
  try {
    attachStatusListener(target, generation);
    if (!(await configureAudioSession())) return;
    if (!isCurrent(generation) || player !== target) return;
    clearWatchdog(generation);
  } catch (error) {
    if (!isCurrent(generation)) return;
    logger.warn('[AmbientAudio] audio session refresh failed', error);
    recoverError(GENERIC_LOAD_ERROR);
  }
}

export function setAmbientPlaybackGuard(guard: PlaybackGuard | null): void {
  playbackGuard = guard;
}

export function initializeAmbientAudio(): () => void {
  if (!isAmbientAudioEnabled()) {
    return () => {};
  }

  initCount += 1;
  if (initCount === 1) {
    appStateSubscription?.remove();
    appStateSubscription = AppState.addEventListener('change', onAppStateChange);
  }

  if (isDeadlineExpired()) {
    expireTimer();
  } else {
    syncRemaining();
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    initCount = Math.max(0, initCount - 1);
    if (initCount === 0) {
      disposeAmbientAudio();
    }
  };
}

export function disposeAmbientAudio(): void {
  startGeneration += 1;
  initCount = 0;
  playbackGuard = null;
  clearTicker();
  destroyPlayer();
  appStateSubscription?.remove();
  appStateSubscription = null;
  store().patch({ ...AMBIENT_AUDIO_RUNTIME_DEFAULTS });
}

export function playAmbientSound(trackId?: AmbientTrackId, userInitiated = true): void {
  if (!isAmbientAudioEnabled()) return;
  if (!canStartPlayback()) return;
  if (userInitiated) retryAudioAfterPermanentInterruption();

  if (trackId !== undefined) {
    if (!isAmbientTrackId(trackId)) return;
    store().patch({ selectedTrackId: trackId });
  }

  const current = store();
  if (current.deadline != null && Date.now() >= current.deadline) {
    expireTimer();
  }

  const currentPlayer = player;
  const selectedId = current.selectedTrackId;
  if (currentPlayer && playerTrackId === selectedId && current.status === 'playing') {
    const generation = ++startGeneration;
    armWatchdog(generation);
    void refreshPlayingSession(currentPlayer, generation);
    return;
  }
  if (currentPlayer && playerTrackId === selectedId && current.status === 'paused') {
    const generation = ++startGeneration;
    armWatchdog(generation);
    void resumeExisting(generation);
    return;
  }

  const generation = ++startGeneration;
  store().patch({
    status: 'loading',
    pauseReason: null,
    error: null,
    hasUsed: true,
  });
  armWatchdog(generation);
  void startNewPlayback(generation);
}

function readablePauseReason(reason: string): string {
  if (reason.startsWith('Paused')) return reason;
  if (reason === 'user') return 'Paused';
  if (reason === 'background') return 'Paused while you were away';
  return 'Paused by another audio source';
}

export function pauseAmbientSound(reason = 'user'): void {
  if (!isAmbientAudioEnabled() && !player) return;
  startGeneration += 1;
  releaseSession();
  clearWatchdog();
  clearFade();
  if (player) {
    try {
      player.pause();
    } catch (error) {
      logger.warn('[AmbientAudio] pause failed', error);
    }
  }
  const { status } = store();
  if (status === 'off') {
    destroyPlayer();
    return;
  }
  store().patch({ status: 'paused', pauseReason: readablePauseReason(reason), error: null });
}

export function interruptAmbientSound(reason = 'interruption'): void {
  pauseAmbientSound(reason);
}

export function stopAmbientSound(): Promise<void> {
  return haltPlayback();
}

export function toggleAmbientSound(): void {
  if (!isAmbientAudioEnabled()) return;
  const { status } = store();
  if (status === 'playing' || status === 'loading') {
    pauseAmbientSound('user');
    return;
  }
  playAmbientSound();
}

export function setAmbientVolume(volume: number): void {
  if (!Number.isFinite(volume)) return;
  const next = Math.min(1, Math.max(0, volume));
  store().patch({ volume: next });
  if (player && store().status === 'playing' && fadeOperation == null) {
    try {
      player.volume = next;
    } catch (error) {
      logger.warn('[AmbientAudio] set volume failed', error);
    }
  }
}

export function setAmbientTimer(minutes: number): void {
  if (!(AMBIENT_TIMER_MINUTES as readonly number[]).includes(minutes)) return;
  const timerMinutes = minutes as AmbientTimerMinutes;
  if (timerMinutes === 0) {
    store().patch({
      timerMinutes,
      timerStatus: 'idle',
      deadline: null,
      remainingSeconds: 0,
    });
    clearTicker();
    return;
  }

  const deadline = Date.now() + timerMinutes * 60_000;
  store().patch({
    timerMinutes,
    timerStatus: 'running',
    deadline,
    remainingSeconds: timerMinutes * 60,
  });
  ensureTicker();
}
