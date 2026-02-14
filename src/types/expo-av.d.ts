declare module 'expo-av' {
  export interface AVPlaybackStatus {
    isLoaded: boolean;
    isPlaying?: boolean;
    positionMillis?: number;
    durationMillis?: number;
    didJustFinish?: boolean;
  }

  export interface AVPlaybackStatusToSet {
    shouldPlay?: boolean;
    positionMillis?: number;
  }

  export class Sound {
    static createAsync(
      source: { uri: string } | number,
      initialStatus?: AVPlaybackStatusToSet,
      onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void
    ): Promise<{ sound: Sound }>;

    playAsync(): Promise<AVPlaybackStatus>;
    pauseAsync(): Promise<AVPlaybackStatus>;
    stopAsync(): Promise<AVPlaybackStatus>;
    unloadAsync(): Promise<AVPlaybackStatus>;
    setPositionAsync(positionMillis: number): Promise<AVPlaybackStatus>;
    getStatusAsync(): Promise<AVPlaybackStatus>;
    setOnPlaybackStatusUpdate(callback: (status: AVPlaybackStatus) => void): void;
  }

  export namespace Audio {
    export const Sound: typeof Sound;
  }
}
