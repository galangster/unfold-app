/**
 * AudioPlayerOverlay — Container that mounts the correct audio player tier.
 *
 * Reads `playerTier` from Zustand and renders:
 *   hidden → null
 *   pill   → AudioPlayerPill (all screens, except companion & keyboard-up)
 *   sheet  → AudioPlayerSheet (compact bottom sheet)
 *
 * Pill hides when:
 *   - Keyboard is visible (any screen — user is focused on text input)
 *   - On the companion/ask screen (conflicts with chat input)
 *
 * Mounted in root layout for cross-tab persistence.
 */

import React, { useState, useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSegments } from 'expo-router';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { AudioPlayerPill } from './AudioPlayerPill';
import { AudioPlayerSheet } from './AudioPlayerSheet';

export function AudioPlayerOverlay() {
  const playerTier = useAudioPlayerState((s) => s.playerTier);
  const segments = useSegments();

  // Keyboard visibility — use willShow/willHide on iOS for smoother transition
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Companion screen — pill overlaps text input
  const isCompanionScreen = segments.includes('(ask)');

  if (playerTier === 'hidden') return null;
  if (playerTier === 'sheet') return <AudioPlayerSheet />;

  // Pill: hide on companion screen or when keyboard is up
  if (playerTier === 'pill') {
    if (isCompanionScreen || keyboardVisible) return null;
    return <AudioPlayerPill />;
  }

  return null;
}

export default AudioPlayerOverlay;
