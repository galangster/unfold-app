import type { RevealGradientVariant } from '@/lib/reveal-gradient-palette';

const DAILY_ROTATION: readonly RevealGradientVariant[] = [
  'flow', 'mesh', 'aurora', 'glow', 'bars', 'sky', 'prism',
];

function seriesSeed(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Stable on reopen and accent changes. Each seven-day cycle includes every family. */
export function getDailyRevealVariant(
  devotionalId: string,
  dayNumber: number,
): RevealGradientVariant {
  const entry = 'prism';
  if (dayNumber <= 1) return entry;
  let offset = seriesSeed(devotionalId) % DAILY_ROTATION.length;
  if (DAILY_ROTATION[offset] === entry) offset = (offset + 1) % DAILY_ROTATION.length;
  return DAILY_ROTATION[(offset + Math.floor(dayNumber) - 2) % DAILY_ROTATION.length];
}
