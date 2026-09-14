import { AppState } from 'react-native';
import type { AudioStatus } from 'expo-audio/build/Audio.types';
import {
  AMBIENT_FADE_MS,
  AMBIENT_LOAD_WATCHDOG_MS,
  disposeAmbientAudio,
  initializeAmbientAudio,
  interruptAmbientSound,
  pauseAmbientSound,
  playAmbientSound,
  previewAmbientVolume,
  setAmbientPlaybackGuard,
  setAmbientTimer,
  setAmbientVolume,
  stopAmbientSound,
  toggleAmbientSound,
} from '../ambient-audio';
import { AMBIENT_DEFAULT_VOLUME, useAmbientAudioState } from '../ambient-audio-state';

jest.mock('../mmkv-storage', () => {
  const values = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => {
        values.set(name, value);
      },
      removeItem: (name: string) => {
        values.delete(name);
      },
    },
    ambientAudioTestPersistValues: values,
  };
});

jest.mock('../ambient-audio-feature', () => ({
  isAmbientAudioEnabled: jest.fn(() => true),
  resolveAmbientAudioEnabled: jest.fn(),
}));

jest.mock('../ambient-audio-catalog', () => {
  const tracks = [
    { id: 'river-thread', title: 'Still Waters', duration: 60, source: 11 },
    { id: 'tideglass-drift', title: 'Deep Calls to Deep', duration: 60, source: 12 },
    { id: 'a-lifetime-spent-with-you', title: 'All My Days', duration: 60, source: 13 },
  ];
  return {
    AMBIENT_TRACKS: tracks,
    AMBIENT_TRACK_IDS: ['river-thread', 'tideglass-drift', 'a-lifetime-spent-with-you'],
    DEFAULT_AMBIENT_TRACK_ID: 'river-thread',
    isAmbientTrackId: (id: unknown) => id === 'river-thread' || id === 'tideglass-drift' || id === 'a-lifetime-spent-with-you',
    getAmbientTrack: (id: string) => tracks.find((track) => track.id === id) ?? tracks[0],
    nextAmbientTrackId: (id: string) => (id === 'river-thread' ? 'tideglass-drift' : 'a-lifetime-spent-with-you'),
  };
});

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPersistValues = jest.requireMock('../mmkv-storage')
  .ambientAudioTestPersistValues as Map<string, string>;
const mockIsAmbientAudioEnabled = jest.requireMock('../ambient-audio-feature')
  .isAmbientAudioEnabled as jest.Mock;
const {
  createAudioPlayer: mockCreateAudioPlayer,
  setAudioModeAsync: mockSetAudioModeAsync,
} = jest.requireMock('expo-audio') as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
};

type MockPlayer = {
  source: number;
  playing: boolean;
  isLoaded: boolean;
  loop: boolean;
  volume: number;
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  emit: (status?: Partial<AudioStatus>) => void;
};

function makePlayer(source: number): MockPlayer {
  let listener: ((status: AudioStatus) => void) | null = null;
  const player: MockPlayer = {
    source,
    playing: false,
    isLoaded: false,
    loop: true,
    volume: 1,
    play: jest.fn(function play(this: MockPlayer) {
      this.playing = true;
    }),
    pause: jest.fn(function pause(this: MockPlayer) {
      this.playing = false;
    }),
    remove: jest.fn(),
    addListener: jest.fn((_event: string, cb: (status: AudioStatus) => void) => {
      listener = cb;
      return { remove: jest.fn(() => { listener = null; }) };
    }),
    emit(status: Partial<AudioStatus> = {}) {
      listener?.({
        id: 'ambient',
        currentTime: 0,
        playbackState: '',
        timeControlStatus: '',
        reasonForWaitingToPlay: '',
        mute: false,
        duration: 60,
        playing: player.playing,
        loop: player.loop,
        didJustFinish: false,
        isBuffering: false,
        isLoaded: player.isLoaded,
        playbackRate: 1,
        shouldCorrectPitch: true,
        isLive: false,
        currentOffsetFromLive: null,
        error: null,
        ...status,
      });
    },
  };
  return player;
}

async function flush() {
  await jest.advanceTimersByTimeAsync(0);
}

function lastPlayer(): MockPlayer {
  return mockCreateAudioPlayer.mock.results.at(-1)?.value as MockPlayer;
}

function emitAppState(next: string) {
  const addEventListener = AppState.addEventListener as unknown as jest.Mock;
  for (const [, handler] of addEventListener.mock.calls) {
    handler(next);
  }
}

function resetStore() {
  useAmbientAudioState.setState({
    selectedTrackId: 'river-thread',
    volume: AMBIENT_DEFAULT_VOLUME,
    hasUsed: false,
    status: 'off',
    pauseReason: null,
    error: null,
    timerMinutes: 0,
    timerStatus: 'idle',
    deadline: null,
    remainingSeconds: 0,
  });
}

describe('ambient audio controller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPersistValues.clear();
    mockIsAmbientAudioEnabled.mockReturnValue(true);
    mockCreateAudioPlayer.mockReset();
    mockCreateAudioPlayer.mockImplementation((source: number) => makePlayer(source));
    mockSetAudioModeAsync.mockReset();
    mockSetAudioModeAsync.mockImplementation(async () => undefined);
    (AppState.addEventListener as unknown as jest.Mock).mockClear();
    (AppState as { currentState: string }).currentState = 'active';
    disposeAmbientAudio();
    resetStore();
    setAmbientPlaybackGuard(null);
  });

  afterEach(() => {
    disposeAmbientAudio();
    jest.useRealTimers();
  });

  it('creates no player or AppState listener while disabled', async () => {
    mockIsAmbientAudioEnabled.mockReturnValue(false);
    const cleanup = initializeAmbientAudio();
    playAmbientSound('river-thread');
    await flush();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(useAmbientAudioState.getState().status).toBe('off');
    cleanup();
  });

  it('does not autoplay after a cold persisted launch', async () => {
    useAmbientAudioState.setState({
      selectedTrackId: 'a-lifetime-spent-with-you',
      volume: 0.4,
      hasUsed: true,
      status: 'off',
    });
    initializeAmbientAudio();
    await flush();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(useAmbientAudioState.getState().status).toBe('off');
  });

  it('keeps only the latest rapid selection and disables native auto-resume', async () => {
    playAmbientSound('river-thread');
    playAmbientSound('tideglass-drift');
    await flush();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith(12, expect.objectContaining({
      downloadFirst: false,
      autoResumeOnInterruption: false,
    }));
    const player = lastPlayer();
    expect(player.loop).toBe(false);
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(useAmbientAudioState.getState().selectedTrackId).toBe('tideglass-drift');
    expect(useAmbientAudioState.getState().status).toBe('playing');
  });

  it('starts a session timer without playback and keeps it across pause', async () => {
    setAmbientTimer(5);
    expect(useAmbientAudioState.getState().timerStatus).toBe('running');
    expect(useAmbientAudioState.getState().deadline).not.toBeNull();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();

    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    const deadline = useAmbientAudioState.getState().deadline;
    pauseAmbientSound('user');
    expect(useAmbientAudioState.getState().status).toBe('paused');
    expect(useAmbientAudioState.getState().deadline).toBe(deadline);

    stopAmbientSound();
    expect(useAmbientAudioState.getState().status).toBe('off');
    expect(useAmbientAudioState.getState().timerStatus).toBe('running');
  });

  it('replaces the active track without restarting the elapsed timer', async () => {
    setAmbientTimer(5);
    playAmbientSound('river-thread');
    await flush();
    const rain = lastPlayer();
    rain.isLoaded = true;
    rain.emit({ isLoaded: true, playing: false });
    const deadline = useAmbientAudioState.getState().deadline;
    await jest.advanceTimersByTimeAsync(60_000);
    playAmbientSound('tideglass-drift');
    expect(useAmbientAudioState.getState().deadline).toBe(deadline);
    await jest.advanceTimersByTimeAsync(AMBIENT_FADE_MS);
    await flush();
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
  });

  it('cancels a start when stop runs during loading', async () => {
    let release!: () => void;
    mockSetAudioModeAsync.mockImplementation(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    playAmbientSound('river-thread');
    await flush();
    expect(useAmbientAudioState.getState().status).toBe('loading');
    stopAmbientSound();
    release();
    await flush();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(useAmbientAudioState.getState().status).toBe('off');
  });

  it('cancels interrupted loading without creating a player', async () => {
    let release!: () => void;
    mockSetAudioModeAsync.mockImplementation(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    playAmbientSound('a-lifetime-spent-with-you');
    await flush();
    interruptAmbientSound('voice-input');
    release();
    await flush();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(useAmbientAudioState.getState().status).toBe('paused');
  });

  it('times out while the audio session setup is still pending without clearing the timer', async () => {
    let release!: () => void;
    mockSetAudioModeAsync.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    setAmbientTimer(5);
    playAmbientSound('river-thread');
    await flush();
    await jest.advanceTimersByTimeAsync(AMBIENT_LOAD_WATCHDOG_MS);
    const state = useAmbientAudioState.getState();
    expect(state.status).toBe('error');
    expect(state.timerStatus).toBe('running');
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    release();
    await flush();
  });

  it('ends sound when the independent timer expires and leaves reading alone', async () => {
    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    setAmbientTimer(5);
    pauseAmbientSound('user');
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    await jest.advanceTimersByTimeAsync(AMBIENT_FADE_MS);
    expect(useAmbientAudioState.getState().status).toBe('off');
    expect(useAmbientAudioState.getState().timerStatus).toBe('ended');
    expect(useAmbientAudioState.getState().selectedTrackId).toBe('river-thread');
  });

  it('records a native interruption and does not auto-resume', async () => {
    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    player.emit({ isLoaded: true, playing: true });
    player.playing = false;
    player.emit({ isLoaded: true, playing: false });
    expect(useAmbientAudioState.getState().status).toBe('paused');
    expect(useAmbientAudioState.getState().pauseReason).toBe('Paused by another audio source');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('pauses on background and does not resume on foreground', async () => {
    initializeAmbientAudio();
    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    emitAppState('background');
    expect(useAmbientAudioState.getState().pauseReason).toBe('Paused while you were away');
    emitAppState('active');
    await flush();
    expect(useAmbientAudioState.getState().status).toBe('paused');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('blocks startup when the playback guard refuses', async () => {
    setAmbientPlaybackGuard(() => false);
    playAmbientSound('river-thread');
    await flush();
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(useAmbientAudioState.getState().status).toBe('off');
  });

  it('toggles pause and manual resume without overlapping players', async () => {
    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    toggleAmbientSound();
    expect(useAmbientAudioState.getState().status).toBe('paused');
    toggleAmbientSound();
    await flush();
    expect(useAmbientAudioState.getState().status).toBe('playing');
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('advances to the next piece when a track finishes', async () => {
    playAmbientSound('river-thread');
    await flush();
    const first = lastPlayer();
    first.isLoaded = true;
    first.emit({ isLoaded: true, playing: false });
    first.emit({ isLoaded: true, playing: false, didJustFinish: true });
    await jest.advanceTimersByTimeAsync(AMBIENT_FADE_MS);
    await flush();
    expect(useAmbientAudioState.getState().selectedTrackId).toBe('tideglass-drift');
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
  });

  it('previews volume without persistence and commits only the settled value', async () => {
    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    await jest.advanceTimersByTimeAsync(AMBIENT_FADE_MS);
    const savedVolume = useAmbientAudioState.getState().volume;
    const persisted = mockPersistValues.get('ambient-audio-state');
    previewAmbientVolume(0.25);
    expect(player.volume).toBe(0.25);
    expect(useAmbientAudioState.getState().volume).toBe(savedVolume);
    expect(mockPersistValues.get('ambient-audio-state')).toBe(persisted);
    setAmbientVolume(0.25);
    expect(useAmbientAudioState.getState().volume).toBe(0.25);
  });

  it('never allocates or resumes playback for a volume preview', async () => {
    previewAmbientVolume(0.75);
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    playAmbientSound('river-thread');
    await flush();
    const player = lastPlayer();
    player.isLoaded = true;
    player.emit({ isLoaded: true, playing: false });
    await jest.advanceTimersByTimeAsync(AMBIENT_FADE_MS);
    pauseAmbientSound();
    const volume = player.volume;
    const playCalls = player.play.mock.calls.length;
    previewAmbientVolume(0.75);
    expect(player.volume).toBe(volume);
    expect(player.play).toHaveBeenCalledTimes(playCalls);
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(useAmbientAudioState.getState().status).toBe('paused');
  });

  it('persists volume and restores it without starting playback', async () => {
    setAmbientVolume(0.8);
    playAmbientSound('a-lifetime-spent-with-you');
    await flush();
    const persisted = mockPersistValues.get('ambient-audio-state');
    disposeAmbientAudio();
    resetStore();
    mockPersistValues.set('ambient-audio-state', persisted!);
    await useAmbientAudioState.persist.rehydrate();
    const state = useAmbientAudioState.getState();
    expect(state.volume).toBe(0.8);
    expect(state.selectedTrackId).toBe('a-lifetime-spent-with-you');
    expect(state.status).toBe('off');
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
  });
});
