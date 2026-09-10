import { RecordingPresets } from 'expo-audio';

export const VOICE_RECORDING_MAX_DURATION_MS = 120_000;
export const VOICE_WAVEFORM_BARS = 25;

export const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  web: { ...RecordingPresets.HIGH_QUALITY.web, bitsPerSecond: 64_000 },
  directory: 'document' as const,
  isMeteringEnabled: true,
};

export function formatRecordingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function meterToLevel(metering?: number): number {
  if (metering == null || !Number.isFinite(metering)) return 0.18;
  return Math.max(0.12, Math.min(1, (metering + 52) / 52));
}

export function buildWaveform(level: number, step: number, bars = VOICE_WAVEFORM_BARS): number[] {
  return Array.from({ length: bars }, (_, index) => {
    const harmonic = Math.abs(Math.sin(index * 1.41 + step * 0.38));
    const secondary = Math.abs(Math.cos(index * 0.63 - step * 0.2));
    return Math.max(0.12, Math.min(1, 0.14 + level * (0.35 + harmonic * 0.48 + secondary * 0.13)));
  });
}
