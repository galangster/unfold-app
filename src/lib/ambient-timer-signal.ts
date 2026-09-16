import { createAudioPlayer } from 'expo-audio';
import type { AudioStatus } from 'expo-audio/build/Audio.types';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { acquireAudioSession } from './audio-session-registry';
import { logger } from './logger';
import { mmkvStorage } from './mmkv-storage';
import { SUCCESS_CUE_SOURCES } from './success-cue-assets';
import { SOUND_EFFECTS_ENABLED_KEY } from './success-cue-storage';

export const AMBIENT_TIMER_NOTIFICATION_ID = 'unfold-ambient-timer';
export const AMBIENT_TIMER_CHANNEL_ID = 'ambient-timer';
export const AMBIENT_TIMER_ENDED_TITLE = 'Your time is up';
export const AMBIENT_TIMER_ENDED_BODY = 'Stay as long as you like.';
export const AMBIENT_TIMER_CUE_VOLUME = 0.55;
export const AMBIENT_TIMER_NOTIFICATION_BACKUP_MS = 1_000;
export const AMBIENT_TIMER_CUE_LOAD_MS = 3_000;
export const AMBIENT_TIMER_CUE_PLAY_MS = 7_000;

let notificationGeneration = 0;

function beginNotificationGeneration(): number {
  notificationGeneration += 1;
  return notificationGeneration;
}

function isCurrentNotification(generation: number): boolean {
  return generation === notificationGeneration;
}

function soundEffectsEnabled(): boolean {
  const value = mmkvStorage.getItem(SOUND_EFFECTS_ENABLED_KEY);
  return (typeof value === 'string' ? value : null) !== 'false';
}

function notificationContent(sound: boolean, channelId?: string) {
  return {
    title: AMBIENT_TIMER_ENDED_TITLE,
    body: AMBIENT_TIMER_ENDED_BODY,
    sound,
    data: { type: 'ambient_timer' as const },
    interruptionLevel: 'active' as const,
    ...(channelId ? { channelId } : {}),
  };
}

async function notificationsGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

async function androidChannel(): Promise<{ channelId?: string }> {
  if (Platform.OS !== 'android') return {};
  try {
    await Notifications.setNotificationChannelAsync(AMBIENT_TIMER_CHANNEL_ID, {
      name: 'Music timer',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: false,
      vibrationPattern: [0],
    });
  } catch (error) {
    logger.warn('[AmbientTimer] channel failed', error);
  }
  return { channelId: AMBIENT_TIMER_CHANNEL_ID };
}

async function cancelScheduledBackup(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(AMBIENT_TIMER_NOTIFICATION_ID);
  } catch (error) {
    logger.warn('[AmbientTimer] cancel notification failed', error);
  }
}

export async function cancelAmbientTimerNotification(): Promise<void> {
  beginNotificationGeneration();
  await cancelScheduledBackup();
}

export async function scheduleAmbientTimerNotification(deadline: number): Promise<void> {
  const generation = beginNotificationGeneration();
  if (Platform.OS === 'web' || !Number.isFinite(deadline)) return;
  await cancelScheduledBackup();
  if (!isCurrentNotification(generation)) return;
  if (!(await notificationsGranted())) return;
  if (!isCurrentNotification(generation)) return;
  const seconds = Math.max(1, Math.ceil((deadline + AMBIENT_TIMER_NOTIFICATION_BACKUP_MS - Date.now()) / 1000));
  const { channelId } = await androidChannel();
  if (!isCurrentNotification(generation)) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: AMBIENT_TIMER_NOTIFICATION_ID,
      content: notificationContent(soundEffectsEnabled(), channelId),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        ...(channelId ? { channelId } : {}),
      },
    });
  } catch (error) {
    logger.warn('[AmbientTimer] schedule notification failed', error);
  }
}

async function presentAmbientTimerNotification(sound: boolean, generation: number): Promise<void> {
  if (Platform.OS === 'web' || !isCurrentNotification(generation)) return;
  if (!(await notificationsGranted())) return;
  if (!isCurrentNotification(generation)) return;
  const { channelId } = await androidChannel();
  if (!isCurrentNotification(generation)) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: notificationContent(sound, channelId),
      trigger: null,
    });
  } catch (error) {
    logger.warn('[AmbientTimer] present notification failed', error);
  }
}

export async function playAmbientTimerCue(): Promise<void> {
  if (!soundEffectsEnabled()) return;

  const lease = acquireAudioSession({
    owner: 'success-cue',
    mode: {
      playsInSilentMode: false,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      allowsBackgroundRecording: false,
      shouldRouteThroughEarpiece: false,
    },
  });
  if (!lease) return;

  const configured = await lease.configure();
  if (!configured || !lease.isActive()) {
    lease.release();
    return;
  }

  let player: ReturnType<typeof createAudioPlayer> | null = null;
  let subscription: { remove: () => void } | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  let playTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let resolveLoad: ((loaded: boolean) => void) | null = null;

  const finish = () => {
    if (settled) return;
    settled = true;
    resolveLoad?.(false);
    resolveLoad = null;
    if (loadTimer) clearTimeout(loadTimer);
    if (playTimer) clearTimeout(playTimer);
    loadTimer = null;
    playTimer = null;
    try {
      subscription?.remove();
    } catch {
      // Listener may already be gone.
    }
    subscription = null;
    if (player) {
      try {
        player.pause();
      } catch {
        // Player may already be invalid.
      }
      try {
        player.remove();
      } catch (error) {
        logger.warn('[AmbientTimer] cue player remove failed', error);
      }
      player = null;
    }
    lease.release();
  };

  try {
    player = createAudioPlayer(SUCCESS_CUE_SOURCES['day-completed'], {
      downloadFirst: true,
      autoResumeOnInterruption: false,
      updateInterval: 100,
    });
    player.volume = AMBIENT_TIMER_CUE_VOLUME;

    const loaded = new Promise<boolean>((resolve) => {
      resolveLoad = resolve;
      subscription = player!.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (status.error) {
          resolveLoad?.(false);
          finish();
          return;
        }
        if (status.isLoaded) {
          resolveLoad?.(true);
          resolveLoad = null;
        }
        if (status.didJustFinish) finish();
      });
      loadTimer = setTimeout(() => {
        resolveLoad?.(false);
        resolveLoad = null;
      }, AMBIENT_TIMER_CUE_LOAD_MS);
    });

    if (!(await loaded) || !lease.isActive()) {
      finish();
      return;
    }

    player.play();
    playTimer = setTimeout(finish, AMBIENT_TIMER_CUE_PLAY_MS);
  } catch (error) {
    logger.warn('[AmbientTimer] cue failed', error);
    finish();
  }
}

export async function signalAmbientTimerFinished(): Promise<void> {
  const generation = beginNotificationGeneration();
  await cancelScheduledBackup();
  if (!isCurrentNotification(generation)) return;
  await playAmbientTimerCue();
  if (!isCurrentNotification(generation)) return;
  if (AppState.currentState !== 'active') {
    await presentAmbientTimerNotification(false, generation);
  }
}
