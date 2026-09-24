import { createAudioPlaylist } from 'expo-audio';
import { ambientPlaybackOrder, createAmbientPlayer } from '../ambient-player';
import { AMBIENT_TRACK_IDS, getAmbientTrack } from '../ambient-audio-catalog';

jest.mock('expo-audio', () => ({ createAudioPlaylist: jest.fn(), createAudioPlayer: jest.fn() }));

jest.mock('../../../assets/audio/piano/a-lifetime-spent-with-you.m4a', () => 11, { virtual: true });
jest.mock('../../../assets/audio/piano/river-thread.m4a', () => 12, { virtual: true });
jest.mock('../../../assets/audio/piano/tideglass-drift.m4a', () => 13, { virtual: true });
jest.mock('../../../assets/audio/piano/alpine-serenity.m4a', () => 14, { virtual: true });
jest.mock('../../../assets/audio/piano/daylight-sequence.m4a', () => 15, { virtual: true });
jest.mock('../../../assets/audio/piano/morning-light-blooms.m4a', () => 16, { virtual: true });
jest.mock('../../../assets/audio/piano/galactic-drift.m4a', () => 17, { virtual: true });
jest.mock('../../../assets/audio/piano/static-harmony.m4a', () => 18, { virtual: true });
jest.mock('../../../assets/audio/piano/silent-warmth.m4a', () => 19, { virtual: true });


function makePlaylist() {
  return {
    currentIndex: 0, isLoaded: true, playing: true, volume: 0.25,
    autoResumeOnInterruption: true,
    play: jest.fn(), pause: jest.fn(), clear: jest.fn(), release: jest.fn(),
    next: jest.fn(), previous: jest.fn(), seekTo: jest.fn().mockResolvedValue(undefined),
    setStopDeadline: jest.fn(),
    setTrackMetadata: jest.fn(), setPlaybackOrder: jest.fn(),
    setActiveForLockScreen: jest.fn(), clearLockScreenControls: jest.fn(), addListener: jest.fn(),
  };
}

describe('native ambient playlist', () => {
  let playlist: ReturnType<typeof makePlaylist>;
  beforeEach(() => {
    playlist = makePlaylist();
    jest.mocked(createAudioPlaylist).mockReset().mockReturnValue(playlist as unknown as ReturnType<typeof createAudioPlaylist>);
  });

  it('queues the entire catalog with native repeat and interruption auto-resume disabled', () => {
    createAmbientPlayer('river-thread', false);
    const order = ambientPlaybackOrder('river-thread', false);
    expect(createAudioPlaylist).toHaveBeenCalledWith({ sources: order.map((id) => getAmbientTrack(id).source), loop: 'all', updateInterval: 500 });
    expect(playlist.autoResumeOnInterruption).toBe(false);
    expect(playlist.setTrackMetadata.mock.calls[0][0].map((item: { title: string }) => item.title)).toEqual(order.map((id) => getAmbientTrack(id).title));
    expect(playlist.play).not.toHaveBeenCalled();
  });

  it('shuffles once without omitting or repeating a song', () => {
    const order = ambientPlaybackOrder('river-thread', true);
    expect(order[0]).toBe('river-thread');
    expect(new Set(order)).toEqual(new Set(AMBIENT_TRACK_IDS));
    expect(order).toHaveLength(AMBIENT_TRACK_IDS.length);
  });

  it('changes the remaining queue without replacing, seeking, pausing, or replaying the active item', () => {
    const player = createAmbientPlayer('river-thread', false);
    playlist.currentIndex = 2;
    player.setShuffle?.(true);
    const indices = playlist.setPlaybackOrder.mock.calls[0][0];
    expect(indices[0]).toBe(2);
    expect(new Set(indices).size).toBe(9);
    expect(createAudioPlaylist).toHaveBeenCalledTimes(1);
    expect(playlist.play).not.toHaveBeenCalled();
    expect(playlist.pause).not.toHaveBeenCalled();
    expect(playlist.seekTo).not.toHaveBeenCalled();
  });

  it('passes the timer deadline to native playback', () => {
    const player = createAmbientPlayer('river-thread', false);
    player.setStopDeadline?.(123456);
    expect(playlist.setStopDeadline).toHaveBeenCalledWith(123456);
    player.setStopDeadline?.(null);
    expect(playlist.setStopDeadline).toHaveBeenLastCalledWith(null);
  });

  it('uses native track commands and owns the lock screen until cleared', () => {
    const player = createAmbientPlayer('river-thread', false);
    player.setActiveForLockScreen(true, { title: 'Still Waters', artist: 'Unfold' });
    expect(playlist.setActiveForLockScreen).toHaveBeenCalledWith(true, { title: 'Still Waters', artist: 'Unfold' }, { showNextTrack: true, showPreviousTrack: true });
    player.next?.(); player.previous?.();
    expect(playlist.next).toHaveBeenCalledTimes(1);
    expect(playlist.previous).toHaveBeenCalledTimes(1);
    player.remove();
    expect(playlist.clearLockScreenControls).toHaveBeenCalledTimes(1);
    expect(playlist.clear).toHaveBeenCalledTimes(1);
    expect(playlist.release).toHaveBeenCalledTimes(1);
  });
});
