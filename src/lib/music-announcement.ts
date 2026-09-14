import type { AmbientTrackId } from './ambient-audio-catalog';

export const MUSIC_ANNOUNCEMENT = {
  id: 'background-music-v1',
  title: 'Music for your quiet time.',
  description: 'Now you can add gentle piano while you read, pray, or write.',
  songId: 'river-thread' as AmbientTrackId,
  songName: 'Still Waters',
  previewSource: require('../../assets/audio/previews/still-waters.m4a') as number,
  previewSeconds: 12,
  waveform: [
    6, 6, 6, 6, 7, 7, 7, 8, 9, 8, 9, 9, 9, 9, 25, 19, 18, 16, 27, 40, 36, 39,
    32, 34, 30, 31, 29, 26, 23, 21, 22, 21, 19, 21, 18, 17, 18, 18, 16, 15, 16,
    15, 14, 14, 14, 12, 9, 7,
  ],
} as const;
