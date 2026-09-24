import { createAudioPlayer, createAudioPlaylist } from 'expo-audio';
import type { AudioMetadata, AudioPlaylistStatus, AudioStatus } from 'expo-audio/build/Audio.types';
import type { AudioPlaylist } from 'expo-audio/build/AudioModule.types';
import { Platform } from 'react-native';
import { AMBIENT_TRACK_IDS, createAmbientShuffleOrder, getAmbientTrack, type AmbientTrackId } from './ambient-audio-catalog';

export type AmbientPlaybackStatus = Pick<AudioStatus,
  'playing' | 'isLoaded' | 'currentTime' | 'duration' | 'didJustFinish' | 'error' | 'mediaServicesDidReset' | 'timeControlStatus'
> & { trackId?: AmbientTrackId };

export interface AmbientPlayer {
  readonly isLoaded: boolean;
  readonly playing: boolean;
  volume: number;
  play(): void;
  pause(): void;
  remove(): void;
  seekTo(seconds: number): Promise<void>;
  setActiveForLockScreen(active: boolean, metadata?: AudioMetadata): void;
  clearLockScreenControls(): void;
  addListener(event: 'playbackStatusUpdate', callback: (status: AmbientPlaybackStatus) => void): { remove(): void };
  setStopDeadline?(deadline: number | null): void;
  setShuffle?(enabled: boolean): void;
  next?(): void;
  previous?(): void;
}

// iOS additions to the existing Expo patch. Other platforms keep the single-player path.
type NativeMusicPlaylist = AudioPlaylist & {
  autoResumeOnInterruption: boolean;
  setStopDeadline(deadline: number | null): void;
  setTrackMetadata(metadata: AudioMetadata[]): void;
  setPlaybackOrder(indices: number[]): void;
  setActiveForLockScreen(active: boolean, metadata?: AudioMetadata, options?: { showNextTrack: boolean; showPreviousTrack: boolean }): void;
  clearLockScreenControls(): void;
};

export function ambientPlaybackOrder(current: AmbientTrackId, shuffle: boolean): AmbientTrackId[] {
  if (shuffle) return [current, ...createAmbientShuffleOrder(current)];
  const index = AMBIENT_TRACK_IDS.indexOf(current);
  return [...AMBIENT_TRACK_IDS.slice(index), ...AMBIENT_TRACK_IDS.slice(0, index)];
}

export function createAmbientPlayer(trackId: AmbientTrackId, shuffle: boolean): AmbientPlayer {
  if (Platform.OS !== 'ios') {
    const player = createAudioPlayer(getAmbientTrack(trackId).source, {
      updateInterval: 500, downloadFirst: false, keepAudioSessionActive: true, autoResumeOnInterruption: false,
    });
    player.loop = false;
    return player;
  }

  let order = ambientPlaybackOrder(trackId, shuffle);
  const playlist = createAudioPlaylist({
    sources: order.map((id) => getAmbientTrack(id).source), loop: 'all', updateInterval: 500,
  }) as NativeMusicPlaylist;
  playlist.autoResumeOnInterruption = false;
  playlist.setTrackMetadata(order.map((id) => ({ title: getAmbientTrack(id).title, artist: 'Unfold', albumTitle: 'Music for quiet moments' })));

  return {
    get isLoaded() { return playlist.isLoaded; },
    get playing() { return playlist.playing; },
    get volume() { return playlist.volume; },
    set volume(value) { playlist.volume = value; },
    play: () => playlist.play(),
    pause: () => playlist.pause(),
    remove: () => { playlist.clearLockScreenControls(); playlist.clear(); playlist.release(); },
    seekTo: (seconds) => playlist.seekTo(seconds),
    setActiveForLockScreen: (active, metadata) => playlist.setActiveForLockScreen(active, metadata, { showNextTrack: true, showPreviousTrack: true }),
    clearLockScreenControls: () => playlist.clearLockScreenControls(),
    setStopDeadline: (deadline) => playlist.setStopDeadline(deadline),
    next: () => playlist.next(),
    previous: () => playlist.previous(),
    setShuffle: (enabled) => {
      const current = order[playlist.currentIndex] ?? trackId;
      const next = ambientPlaybackOrder(current, enabled);
      const indices = next.map((id) => order.indexOf(id));
      order = next;
      playlist.setPlaybackOrder(indices);
    },
    addListener: (_event, callback) => playlist.addListener('playlistStatusUpdate', (status: AudioPlaylistStatus) => {
      const native = status as AudioPlaylistStatus & { error?: string; timeControlStatus?: string };
      callback({ ...status, trackId: order[status.currentIndex], error: native.error ?? null, timeControlStatus: native.timeControlStatus ?? '' });
    }),
  };
}
