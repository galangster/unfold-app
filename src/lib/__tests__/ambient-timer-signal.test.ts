import { AppState, Platform } from 'react-native';
import {
  AMBIENT_TIMER_CHANNEL_ID,
  AMBIENT_TIMER_CUE_VOLUME,
  AMBIENT_TIMER_ENDED_BODY,
  AMBIENT_TIMER_ENDED_TITLE,
  AMBIENT_TIMER_NOTIFICATION_BACKUP_MS,
  AMBIENT_TIMER_NOTIFICATION_ID,
  cancelAmbientTimerNotification,
  playAmbientTimerCue,
  scheduleAmbientTimerNotification,
  signalAmbientTimerFinished,
} from '../ambient-timer-signal';

const mockCancel = jest.fn();
const mockSchedule = jest.fn();
const mockGetPermissions = jest.fn();
const mockSetChannel = jest.fn();
const mockCreateAudioPlayer = jest.fn();
const mockAcquire = jest.fn();
const mockGetItem = jest.fn();

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancel(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetChannel(...args),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { DEFAULT: 5 },
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

jest.mock('../audio-session-registry', () => ({
  acquireAudioSession: (...args: unknown[]) => mockAcquire(...args),
}));

jest.mock('../mmkv-storage', () => ({
  mmkvStorage: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
  },
}));

jest.mock('../success-cue-assets', () => ({
  SUCCESS_CUE_SOURCES: { 'day-completed': 44 },
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('ambient timer signal', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockCancel.mockReset().mockResolvedValue(undefined);
    mockSchedule.mockReset().mockResolvedValue('id');
    mockGetPermissions.mockReset().mockResolvedValue({ status: 'granted' });
    mockSetChannel.mockReset().mockResolvedValue(undefined);
    mockCreateAudioPlayer.mockReset();
    mockAcquire.mockReset();
    mockGetItem.mockReset().mockReturnValue(null);
    (AppState as { currentState: string }).currentState = 'active';
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('schedules a lock-screen backup after the deadline and cancels the previous one', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_700_000_000_000);
    await scheduleAmbientTimerNotification(1_700_000_000_000 + 5 * 60_000);
    expect(mockCancel).toHaveBeenCalledWith(AMBIENT_TIMER_NOTIFICATION_ID);
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({
      identifier: AMBIENT_TIMER_NOTIFICATION_ID,
      content: expect.objectContaining({
        title: AMBIENT_TIMER_ENDED_TITLE,
        body: AMBIENT_TIMER_ENDED_BODY,
        sound: true,
        data: { type: 'ambient_timer' },
      }),
      trigger: expect.objectContaining({
        type: 'timeInterval',
        seconds: Math.ceil((5 * 60_000 + AMBIENT_TIMER_NOTIFICATION_BACKUP_MS) / 1000),
        repeats: false,
      }),
    }));
    expect(mockSetChannel).not.toHaveBeenCalled();
  });

  it('schedules a silent backup when sound effects are off', async () => {
    mockGetItem.mockReturnValue('false');
    jest.useFakeTimers();
    jest.setSystemTime(1_700_000_000_000);
    await scheduleAmbientTimerNotification(1_700_000_000_000 + 60_000);
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ sound: false }),
    }));
  });

  it('uses its own Android channel instead of check-ins', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    jest.useFakeTimers();
    jest.setSystemTime(1_700_000_000_000);
    await scheduleAmbientTimerNotification(1_700_000_000_000 + 60_000);
    expect(mockSetChannel).toHaveBeenCalledWith(AMBIENT_TIMER_CHANNEL_ID, expect.objectContaining({
      importance: 5,
      enableVibrate: false,
    }));
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ channelId: AMBIENT_TIMER_CHANNEL_ID }),
      trigger: expect.objectContaining({ channelId: AMBIENT_TIMER_CHANNEL_ID }),
    }));
  });

  it('does not schedule when notification permission is missing', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    await scheduleAmbientTimerNotification(Date.now() + 60_000);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('plays the existing day-complete cue softly after sound effects stay on', async () => {
    jest.useFakeTimers();
    const play = jest.fn();
    const remove = jest.fn();
    const addListener = jest.fn((_event: string, cb: (status: { isLoaded?: boolean }) => void) => {
      cb({ isLoaded: true });
      return { remove: jest.fn() };
    });
    mockCreateAudioPlayer.mockReturnValue({ play, pause: jest.fn(), remove, addListener, volume: 1 });
    mockAcquire.mockReturnValue({
      configure: async () => true,
      isActive: () => true,
      release: jest.fn(),
    });

    const playing = playAmbientTimerCue();
    await jest.advanceTimersByTimeAsync(0);
    await playing;
    await jest.advanceTimersByTimeAsync(7_000);

    expect(mockCreateAudioPlayer).toHaveBeenCalledWith(44, expect.objectContaining({
      downloadFirst: true,
      autoResumeOnInterruption: false,
    }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer.mock.results[0]?.value.volume).toBe(AMBIENT_TIMER_CUE_VOLUME);
  });

  it('skips the cue when sound effects are off', async () => {
    mockGetItem.mockReturnValue('false');
    await playAmbientTimerCue();
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });

  it('cancels the backup, plays the cue, and only banners when the app is away', async () => {
    mockGetItem.mockReturnValue('false');
    (AppState as { currentState: string }).currentState = 'background';
    await signalAmbientTimerFinished();
    expect(mockCancel).toHaveBeenCalledWith(AMBIENT_TIMER_NOTIFICATION_ID);
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ sound: false }),
      trigger: null,
    }));
  });

  it('does not present a lock-screen banner while the app is active', async () => {
    mockGetItem.mockReturnValue('false');
    await signalAmbientTimerFinished();
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
