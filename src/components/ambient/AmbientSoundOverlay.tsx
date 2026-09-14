import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useAmbientSoundVisibility } from '@/hooks/useAmbientSoundVisibility';
import {
  initializeAmbientAudio,
  interruptAmbientSound,
  playAmbientSound,
  setAmbientPlaybackGuard,
  setAmbientTimer,
  stopAmbientSound,
} from '@/lib/ambient-audio';
import {
  canAnnounceMusic,
  canStartAmbientPlayback,
  isAmbientVoiceActive,
  registerAmbientLifecycle,
  subscribeAmbientVoiceActivity,
} from '@/lib/ambient-audio-coordination';
import { isAmbientAudioEnabled } from '@/lib/ambient-audio-feature';
import { useAmbientAudioState } from '@/lib/ambient-audio-state';
import { useAmbientSoundChrome } from '@/lib/ambient-sound-chrome';
import { hasSeenAnnouncement } from '@/lib/feature-announcements';
import { MUSIC_ANNOUNCEMENT } from '@/lib/music-announcement';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useTheme } from '@/lib/theme';
import { AmbientMusicEntry, AmbientSoundSheet } from './AmbientSoundControls';
import { AmbientSoundPlayer } from './AmbientSoundPlayer';
import { AmbientText } from './AmbientText';
import { MusicAnnouncement } from './MusicAnnouncement';

function EnabledAmbientSoundOverlay() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const dockWidth = Math.min(width - 32, 528);
  const pathname = usePathname();
  const router = useRouter();
  const { colors } = useTheme();
  const {
    headerVisible,
    playerVisible,
    todayHome,
    inTabs,
    keyboardVisible,
    appActive,
    narrationActive,
  } = useAmbientSoundVisibility();
  const state = useAmbientAudioState();
  const sheet = useAmbientSoundChrome((chrome) => chrome.sheet);
  const closeSheet = useAmbientSoundChrome((chrome) => chrome.closeSheet);
  const openSheet = useAmbientSoundChrome((chrome) => chrome.openSheet);
  const returnFocusRef = useAmbientSoundChrome((chrome) => chrome.returnFocusRef);
  const todayReadingAvailable = useAmbientSoundChrome((chrome) => chrome.todayReadingAvailable);
  const setPlayerDockHeight = useAmbientSoundChrome((chrome) => chrome.setPlayerDockHeight);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(isAmbientVoiceActive);
  const [playerDismissing, setPlayerDismissing] = useState(false);
  const previousTimerStatus = useRef(state.timerStatus);

  const focusMusicEntry = useCallback(() => {
    const handle = findNodeHandle(returnFocusRef?.current ?? null);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [returnFocusRef]);

  useEffect(() => {
    setAmbientPlaybackGuard(canStartAmbientPlayback);
    const unregister = registerAmbientLifecycle({
      interrupt: interruptAmbientSound,
      stop: stopAmbientSound,
      finish: () => {
        const ending = stopAmbientSound();
        setAmbientTimer(0);
        return ending;
      },
    });
    const cleanup = initializeAmbientAudio();
    return () => {
      unregister();
      cleanup();
    };
  }, []);

  useEffect(() => subscribeAmbientVoiceActivity(setVoiceActive), []);

  useEffect(() => {
    if (
      Platform.OS === 'ios'
      && state.timerStatus === 'ended'
      && previousTimerStatus.current !== 'ended'
    ) {
      AccessibilityInfo.announceForAccessibility('Your time is up. Stay as long as you like.');
    }
    previousTimerStatus.current = state.timerStatus;
  }, [state.timerStatus]);

  useEffect(() => {
    closeSheet();
  }, [closeSheet, pathname]);

  useEffect(() => {
    if (playerVisible || playerDismissing) return;
    setPlayerDockHeight(0);
  }, [playerDismissing, playerVisible, setPlayerDockHeight]);

  useEffect(() => () => setPlayerDockHeight(0), [setPlayerDockHeight]);

  useEffect(() => {
    if (
      todayReadingAvailable
      && canAnnounceMusic({
        isTodayHome: todayHome,
        hasUsed: state.hasUsed,
        soundOff: state.status === 'off',
        timerIdle: state.timerStatus === 'idle',
        alreadySeen: hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id),
        narrationActive,
        voiceActive,
        keyboardVisible,
        appActive,
      })
    ) {
      setAnnouncementOpen(true);
    }
  }, [
    appActive,
    keyboardVisible,
    narrationActive,
    state.hasUsed,
    state.status,
    state.timerStatus,
    todayHome,
    todayReadingAvailable,
    voiceActive,
  ]);

  const showSoundQa = isQaToolsEnabled() && pathname === '/' && !inTabs;

  return (
    <>
      {showSoundQa ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open sound QA"
          onPress={() => router.push('/qa-ambient-sound')}
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            padding: 14,
            backgroundColor: colors.backgroundElevated,
            borderRadius: 14,
          }}
        >
          <AmbientText style={{ fontFamily: FontFamily.ui, color: colors.accent }}>
            Sound QA
          </AmbientText>
        </Pressable>
      ) : null}
      {headerVisible ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 4, right: 12 }}
        >
          <AmbientMusicEntry />
        </View>
      ) : null}
      {state.timerStatus === 'ended' ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: insets.top + 52,
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: colors.backgroundElevated,
          }}
        >
          <AmbientText style={{ fontFamily: FontFamily.body, color: colors.text, flex: 1 }}>
            Your time is up. Stay as long as you like.
          </AmbientText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss timer notice"
            onPress={() => setAmbientTimer(0)}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <XIcon size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {playerVisible || playerDismissing ? (
        <View
          onLayout={(event) => setPlayerDockHeight(event.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left: (width - dockWidth) / 2,
            bottom: insets.bottom + 64,
            width: dockWidth,
          }}
        >
          <AmbientSoundPlayer
            onOpen={() => openSheet('sounds')}
            onDismissStart={() => {
              setPlayerDismissing(true);
              stopAmbientSound();
            }}
            onDismissEnd={() => setPlayerDismissing(false)}
            onFocusReturn={focusMusicEntry}
          />
        </View>
      ) : null}
      <AmbientSoundSheet
        visible={sheet != null}
        initialPanel={sheet ?? 'sounds'}
        onClose={closeSheet}
        returnFocusRef={returnFocusRef ?? undefined}
      />
      <MusicAnnouncement
        visible={announcementOpen}
        actionLabel="Read with music"
        previewAllowed={appActive && !keyboardVisible && !narrationActive && !voiceActive}
        onClose={() => setAnnouncementOpen(false)}
        onTry={(songId) => {
          if (!todayHome || !todayReadingAvailable || !canStartAmbientPlayback()) return false;
          void playAmbientSound(songId);
          router.push('/(tabs)/(today)/reading');
          return true;
        }}
      />
    </>
  );
}

export function AmbientSoundOverlay() {
  return isAmbientAudioEnabled() ? <EnabledAmbientSoundOverlay /> : null;
}
