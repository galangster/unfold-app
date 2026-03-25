/**
 * AudioPlayerOverlay — Container that mounts the correct audio player tier.
 *
 * Reads `playerTier` from Zustand and renders:
 *   hidden    → null
 *   pill      → AudioPlayerPill
 *   minibar   → AudioPlayerBar
 *   halfsheet → AudioPlayerBar + AudioPlayerSheet (bar visible behind sheet)
 *
 * Mounted in root layout for cross-tab persistence.
 */

import React from 'react';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { AudioPlayerPill } from './AudioPlayerPill';
import { AudioPlayerBar } from './AudioPlayerBar';
import { AudioPlayerSheet } from './AudioPlayerSheet';

export function AudioPlayerOverlay() {
  const playerTier = useAudioPlayerState((s) => s.playerTier);

  if (playerTier === 'hidden') return null;
  if (playerTier === 'pill') return <AudioPlayerPill />;
  if (playerTier === 'minibar') return <AudioPlayerBar />;
  if (playerTier === 'halfsheet') {
    return (
      <>
        <AudioPlayerBar />
        <AudioPlayerSheet />
      </>
    );
  }
  return null;
}

export default AudioPlayerOverlay;
