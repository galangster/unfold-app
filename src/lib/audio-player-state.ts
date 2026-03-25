import { create } from 'zustand';

export type PlayerTier = 'hidden' | 'pill' | 'minibar' | 'halfsheet';

export interface DevotionalAudioMetadata {
  title: string;
  seriesTitle: string;
  devotionalId: string;
  dayNumber: number;
}

interface AudioPlayerState {
  // Playback
  audioUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;

  // Metadata
  title: string | null;
  seriesTitle: string | null;
  devotionalId: string | null;
  dayNumber: number | null;

  // UI
  playerTier: PlayerTier;
  isCompleted: boolean;

  // Actions (state-only — player control lives in useGlobalAudioPlayer hook)
  startAudio: (uri: string, metadata: DevotionalAudioMetadata) => void;
  stopAudio: () => void;
  setTier: (tier: PlayerTier) => void;
  seekTo: (time: number) => void;
  setSpeed: (speed: number) => void;
  setCompleted: (completed: boolean) => void;
  updatePlaybackState: (update: Partial<Pick<AudioPlayerState, 'isPlaying' | 'isLoading' | 'isBuffering' | 'currentTime' | 'duration'>>) => void;
  // NOTE: No togglePlayPause here — play/pause MUST go through the hook to coordinate with native player
}

const INITIAL_STATE = {
  audioUri: null,
  isPlaying: false,
  isLoading: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  playbackSpeed: 1,
  title: null,
  seriesTitle: null,
  devotionalId: null,
  dayNumber: null,
  isCompleted: false,
  playerTier: 'hidden' as PlayerTier,
};

export const useAudioPlayerState = create<AudioPlayerState>((set, get) => ({
  ...INITIAL_STATE,

  startAudio: (uri, metadata) => set({
    audioUri: uri,
    title: metadata.title,
    seriesTitle: metadata.seriesTitle,
    devotionalId: metadata.devotionalId,
    dayNumber: metadata.dayNumber,
    playerTier: 'minibar',
    isLoading: true,
    isPlaying: false,
    isCompleted: false,
    currentTime: 0,
    duration: 0,
  }),

  stopAudio: () => set(INITIAL_STATE),

  setTier: (tier) => set({ playerTier: tier }),

  seekTo: (time) => set({ currentTime: time }),

  setSpeed: (speed) => set({ playbackSpeed: speed }),

  setCompleted: (completed) => set({ isCompleted: completed }),

  updatePlaybackState: (update) => set(update),
}));
