import {
  AMBIENT_AUDIO_PERSIST_NAME,
  AMBIENT_DEFAULT_VOLUME,
  formatAmbientRemaining,
  sanitizeAmbientAudioPersisted,
  useAmbientAudioState,
} from '../ambient-audio-state';

jest.mock('../mmkv-storage', () => {
  const values = new Map<string, string>();
  const setItem = jest.fn((name: string, value: string) => {
    values.set(name, value);
  });
  return {
    mmkvStorage: {
      getItem: (name: string) => values.get(name) ?? null,
      setItem,
      removeItem: (name: string) => {
        values.delete(name);
      },
    },
    ambientAudioTestStorage: { values, setItem },
  };
});

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
  };
});

const { values: mockPersistValues, setItem: mockStorageSetItem } = jest.requireMock(
  '../mmkv-storage',
).ambientAudioTestStorage as {
  values: Map<string, string>;
  setItem: jest.Mock;
};

async function rehydrate() {
  await useAmbientAudioState.persist.rehydrate();
}

describe('ambient audio persisted state', () => {
  beforeEach(async () => {
    await useAmbientAudioState.persist.clearStorage();
    mockPersistValues.clear();
    mockStorageSetItem.mockClear();
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
    await rehydrate();
  });

  it('keeps a cold launch off with no timer', async () => {
    mockPersistValues.set(AMBIENT_AUDIO_PERSIST_NAME, JSON.stringify({
      state: {
        selectedTrackId: 'a-lifetime-spent-with-you',
        volume: 0.8,
        hasUsed: true,
        status: 'playing',
        timerMinutes: 30,
        timerStatus: 'running',
        deadline: Date.now() + 60_000,
        remainingSeconds: 59,
        pauseReason: 'user',
        error: 'private note text',
      },
      version: 0,
    }));

    await rehydrate();

    const state = useAmbientAudioState.getState();
    expect(state.selectedTrackId).toBe('a-lifetime-spent-with-you');
    expect(state.volume).toBe(0.8);
    expect(state.hasUsed).toBe(true);
    expect(state.status).toBe('off');
    expect(state.timerMinutes).toBe(0);
    expect(state.timerStatus).toBe('idle');
    expect(state.deadline).toBeNull();
    expect(state.remainingSeconds).toBe(0);
    expect(state.pauseReason).toBeNull();
    expect(state.error).toBeNull();
  });

  it('rejects invalid persisted values and never stores private text', async () => {
    expect(sanitizeAmbientAudioPersisted({
      selectedTrackId: 'secret-journal',
      volume: 'loud',
      hasUsed: 'yes',
      error: 'private diary',
      note: 'do not persist me',
    })).toEqual({});

    expect(sanitizeAmbientAudioPersisted({
      selectedTrackId: 'tideglass-drift',
      volume: 1.4,
      hasUsed: true,
    })).toEqual({
      selectedTrackId: 'tideglass-drift',
      volume: 1,
      hasUsed: true,
    });

    useAmbientAudioState.getState().patch({
      selectedTrackId: 'tideglass-drift',
      volume: 0.6,
      hasUsed: true,
      error: 'should not persist',
    });
    await Promise.resolve();

    const raw = mockPersistValues.get(AMBIENT_AUDIO_PERSIST_NAME);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('should not persist');
    expect(raw).not.toContain('secret');
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(Object.keys(parsed.state).sort()).toEqual(['hasUsed', 'selectedTrackId', 'volume']);
  });

  it('restores volume without autoplay', async () => {
    useAmbientAudioState.getState().patch({ volume: 0.7, hasUsed: true, selectedTrackId: 'a-lifetime-spent-with-you' });
    const persisted = mockPersistValues.get(AMBIENT_AUDIO_PERSIST_NAME);
    expect(persisted).toBeTruthy();
    useAmbientAudioState.setState({
      status: 'off',
      volume: AMBIENT_DEFAULT_VOLUME,
      hasUsed: false,
      selectedTrackId: 'river-thread',
    });
    mockPersistValues.set(AMBIENT_AUDIO_PERSIST_NAME, persisted!);

    await rehydrate();

    const state = useAmbientAudioState.getState();
    expect(state.volume).toBe(0.7);
    expect(state.selectedTrackId).toBe('a-lifetime-spent-with-you');
    expect(state.hasUsed).toBe(true);
    expect(state.status).toBe('off');
    expect(state.deadline).toBeNull();
  });

  it('does not rewrite unchanged preferences for runtime timer ticks', async () => {
    const writesBeforePreferenceChange = mockStorageSetItem.mock.calls.length;
    useAmbientAudioState.getState().patch({
      selectedTrackId: 'tideglass-drift',
      volume: 0.6,
      hasUsed: true,
    });
    await Promise.resolve();
    expect(mockStorageSetItem).toHaveBeenCalledTimes(writesBeforePreferenceChange + 1);

    useAmbientAudioState.getState().patch({ status: 'playing', remainingSeconds: 299 });
    useAmbientAudioState.getState().patch({ remainingSeconds: 298 });
    await Promise.resolve();
    expect(mockStorageSetItem).toHaveBeenCalledTimes(writesBeforePreferenceChange + 1);
  });

  it('formats remaining time', () => {
    expect(formatAmbientRemaining(125)).toBe('2:05');
  });
});
