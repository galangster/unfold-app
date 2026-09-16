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
  canStartAmbientPlayback,
  isAmbientVoiceActive,
  registerAmbientLifecycle,
  subscribeAmbientVoiceActivity,
} from '@/lib/ambient-audio-coordination';
import { isAmbientAudioEnabled } from '@/lib/ambient-audio-feature';
import { useAmbientAudioState } from '@/lib/ambient-audio-state';
import { useAmbientSoundChrome } from '@/lib/ambient-sound-chrome';
import {
  canAnnounceFeatures,
  listPendingAnnouncementPages,
  type FeatureAnnouncementPage,
} from '@/lib/feature-announcements';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useTheme } from '@/lib/theme';
import { AmbientMusicEntry, AmbientSoundSheet } from './AmbientSoundControls';
import { AmbientSoundPlayer } from './AmbientSoundPlayer';
import { AmbientText } from './AmbientText';
import { FeatureAnnouncement } from './FeatureAnnouncement';

function EndedTimerNotice({
  onDismiss,
  onHeight,
}: {
  onDismiss: () => void;
  onHeight: (height: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID="ambient-ended-timer-notice"
      accessibilityLiveRegion="polite"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={{
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
        onPress={onDismiss}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <XIcon size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

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
  const status = useAmbientAudioState((state) => state.status);
  const hasUsed = useAmbientAudioState((state) => state.hasUsed);
  const timerStatus = useAmbientAudioState((state) => state.timerStatus);
  const sheet = useAmbientSoundChrome((chrome) => chrome.sheet);
  const closeSheet = useAmbientSoundChrome((chrome) => chrome.closeSheet);
  const openSheet = useAmbientSoundChrome((chrome) => chrome.openSheet);
  const returnFocusRef = useAmbientSoundChrome((chrome) => chrome.returnFocusRef);
  const todayReadingAvailable = useAmbientSoundChrome((chrome) => chrome.todayReadingAvailable);
  const setPlayerDockHeight = useAmbientSoundChrome((chrome) => chrome.setPlayerDockHeight);
  const premiumPolicy = usePremiumAccessPolicy();
  const audioEnabled = isAmbientAudioEnabled();
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementPages, setAnnouncementPages] = useState<FeatureAnnouncementPage[]>([]);
  const announcedThisVisit = useRef(new Set<string>());
  const [voiceActive, setVoiceActive] = useState(isAmbientVoiceActive);
  const [playerDismissing, setPlayerDismissing] = useState(false);
  const previousTimerStatus = useRef(timerStatus);
  const noticeHeightRef = useRef(0);
  const playerHeightRef = useRef(0);

  const commitDockHeight = useCallback(() => {
    const notice = noticeHeightRef.current;
    const player = playerHeightRef.current;
    const gap = notice > 0 && player > 0 ? 8 : 0;
    setPlayerDockHeight(notice + player + gap);
  }, [setPlayerDockHeight]);

  const focusMusicEntry = useCallback(() => {
    const handle = findNodeHandle(returnFocusRef?.current ?? null);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [returnFocusRef]);

  useEffect(() => {
    if (!audioEnabled) return;
    setAmbientPlaybackGuard(canStartAmbientPlayback);
    const unregister = registerAmbientLifecycle({
      interrupt: interruptAmbientSound,
      stop: stopAmbientSound,
      finish: () => {},
    });
    const cleanup = initializeAmbientAudio();
    return () => {
      unregister();
      cleanup();
    };
  }, [audioEnabled]);

  useEffect(() => subscribeAmbientVoiceActivity(setVoiceActive), []);

  useEffect(() => {
    if (
      Platform.OS === 'ios'
      && timerStatus === 'ended'
      && previousTimerStatus.current !== 'ended'
    ) {
      AccessibilityInfo.announceForAccessibility('Your time is up. Stay as long as you like.');
    }
    previousTimerStatus.current = timerStatus;
  }, [timerStatus]);

  useEffect(() => {
    closeSheet();
  }, [closeSheet, pathname]);

  useEffect(() => {
    if (timerStatus === 'ended') return;
    if (noticeHeightRef.current === 0) return;
    noticeHeightRef.current = 0;
    commitDockHeight();
  }, [commitDockHeight, timerStatus]);

  useEffect(() => {
    if (playerVisible || playerDismissing) return;
    if (playerHeightRef.current === 0) return;
    playerHeightRef.current = 0;
    commitDockHeight();
  }, [commitDockHeight, playerDismissing, playerVisible]);

  useEffect(() => () => setPlayerDockHeight(0), [setPlayerDockHeight]);

  useEffect(() => {
    if (announcementOpen || sheet !== null) return;
    const pending = listPendingAnnouncementPages({
      bookshelf: true,
      companion: true,
      music: audioEnabled && !hasUsed,
      reflection: premiumPolicy === 'granted',
    }).filter((page) => !announcedThisVisit.current.has(page.id));
    if (
      canAnnounceFeatures({
        isTodayHome: todayHome,
        todayReadingAvailable,
        soundOff: !audioEnabled || status === 'off',
        timerIdle: timerStatus === 'idle',
        narrationActive,
        voiceActive,
        keyboardVisible,
        appActive,
        pendingCount: pending.length,
      })
    ) {
      pending.forEach((page) => announcedThisVisit.current.add(page.id));
      setAnnouncementPages(pending);
      setAnnouncementOpen(true);
    }
  }, [
    announcementOpen,
    appActive,
    audioEnabled,
    hasUsed,
    keyboardVisible,
    narrationActive,
    premiumPolicy,
    sheet,
    status,
    timerStatus,
    todayHome,
    todayReadingAvailable,
    voiceActive,
  ]);

  const showSoundQa = audioEnabled && isQaToolsEnabled() && pathname === '/' && !inTabs;
  const timerEnded = audioEnabled && timerStatus === 'ended';
  const showDock = audioEnabled && (timerEnded || playerVisible || playerDismissing);

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
      {audioEnabled && headerVisible ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 4, right: 12 }}
        >
          <AmbientMusicEntry />
        </View>
      ) : null}
      {showDock ? (
        <View
          testID="ambient-bottom-dock"
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: (width - dockWidth) / 2,
            bottom: insets.bottom + 64,
            width: dockWidth,
            gap: 8,
          }}
        >
          {timerEnded ? (
            <EndedTimerNotice
              onDismiss={() => setAmbientTimer(0)}
              onHeight={(height) => {
                noticeHeightRef.current = height;
                commitDockHeight();
              }}
            />
          ) : null}
          {playerVisible || playerDismissing ? (
            <View
              onLayout={(event) => {
                playerHeightRef.current = event.nativeEvent.layout.height;
                commitDockHeight();
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
        </View>
      ) : null}
      {audioEnabled ? (
        <AmbientSoundSheet
          visible={sheet != null}
          initialPanel={sheet ?? 'sounds'}
          onClose={closeSheet}
          returnFocusRef={returnFocusRef ?? undefined}
        />
      ) : null}
      <FeatureAnnouncement
        key={announcementPages.map((page) => page.id).join('|') || 'closed'}
        visible={announcementOpen}
        pages={announcementPages}
        actionLabel="Read with music"
        previewAllowed={appActive && !keyboardVisible && !narrationActive && !voiceActive}
        onClose={() => {
          setAnnouncementOpen(false);
          setAnnouncementPages([]);
        }}
        onTry={(songId) => {
          if (!audioEnabled || !todayHome || !todayReadingAvailable || !canStartAmbientPlayback()) return false;
          void playAmbientSound(songId);
          router.push('/(tabs)/(today)/reading');
          return true;
        }}
      />
    </>
  );
}

export function AmbientSoundOverlay() {
  return <EnabledAmbientSoundOverlay />;
}
