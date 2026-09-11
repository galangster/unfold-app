/**
 * Greptile A9 regression: startAudio defers its native work; an older start
 * body must not destroy or replace the player a newer start already owns.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockCreateAudioPlayer = jest.fn();
const mockSetAudioModeAsync = jest.fn(async (..._args: unknown[]) => undefined);

function makePlayer(uri: string) {
  return {
    uri,
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    release: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    shouldCorrectPitch: false,
  };
}

jest.mock('expo-audio', () => ({
  createAudioPlayer: (source: { uri: string }) => mockCreateAudioPlayer(source),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/widget-bridge', () => ({ endReadingSession: jest.fn() }));
jest.mock('@/constants/animations', () => ({ Duration: { fast: 120, normal: 250 } }));

import { useGlobalAudioPlayer } from '../useGlobalAudioPlayer';

const metadata = { title: 'Day 1', seriesTitle: 'Series', devotionalId: 'd1', dayNumber: 1 };

describe('useGlobalAudioPlayer start generation (Greptile A9)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCreateAudioPlayer.mockReset();
    mockCreateAudioPlayer.mockImplementation((source: { uri: string }) => makePlayer(source.uri));
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 16);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates only the player for the latest start when two starts overlap', async () => {
    let actions!: ReturnType<typeof useGlobalAudioPlayer>;
    function Probe() {
      actions = useGlobalAudioPlayer();
      return null;
    }
    await act(async () => {
      renderer.create(<Probe />);
    });

    await act(async () => {
      actions.startAudio('file:///first.mp3', metadata);
      actions.startAudio('file:///second.mp3', metadata);
      await jest.advanceTimersByTimeAsync(200);
    });

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith({ uri: 'file:///second.mp3' });

    // The newer player survives the older start's deferred body.
    const player = mockCreateAudioPlayer.mock.results[0].value;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(player.remove).not.toHaveBeenCalled();
    expect(player.release).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalled();
  });

  it('does not create a player when stopAudio runs before the deferred start body', async () => {
    let actions!: ReturnType<typeof useGlobalAudioPlayer>;
    function Probe() {
      actions = useGlobalAudioPlayer();
      return null;
    }
    await act(async () => {
      renderer.create(<Probe />);
    });
    await act(async () => {
      actions.startAudio('file:///first.mp3', metadata);
      actions.stopAudio();
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });
});
