import { useEffect, useState } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';
import { usePathname, useSegments } from 'expo-router';
import { isAmbientAudioEnabled } from '@/lib/ambient-audio-feature';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import {
  isAmbientPlayerPresent,
  useAmbientAudioState,
} from '@/lib/ambient-audio-state';
import { isTodayHomeRoute } from '@/lib/ambient-audio-coordination';

export function useAmbientSoundVisibility() {
  const segments = useSegments();
  const pathname = usePathname();
  const narrationTier = useAudioPlayerState((state) => state.playerTier);
  const status = useAmbientAudioState((state) => state.status);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    const app = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => {
      show.remove();
      hide.remove();
      app.remove();
    };
  }, []);

  const enabled = isAmbientAudioEnabled();
  const inTabs = segments.includes('(tabs)');
  const onQa = pathname === '/qa-ambient-sound';
  const narrationActive = narrationTier !== 'hidden';
  const todayHome = isTodayHomeRoute(pathname, segments);

  return {
    enabled,
    inTabs,
    todayHome,
    keyboardVisible,
    appActive,
    narrationActive,
    headerVisible: enabled && onQa,
    playerVisible:
      enabled
      && isAmbientPlayerPresent(status)
      && (inTabs || onQa)
      && !narrationActive
      && !keyboardVisible,
  };
}
