/**
 * AudioPlayerPill — Tier 1 minimal floating indicator.
 *
 * Small pill that hovers above the tab bar on all screens.
 * Two touch zones:
 *   Body (dot + title) → tap to expand to sheet
 *   Play/pause icon    → tap to toggle playback
 * Swipe left/right to dismiss and stop audio.
 *
 * Position adapts:
 *   Tab bar visible   → pill sits above tab bar
 *   Tab bar hidden    → pill drops to safe area (animated)
 *
 * Visibility controlled by AudioPlayerOverlay (hides on companion, keyboard).
 */

import React, { useCallback } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PlayIcon, PauseIcon } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/lib/theme';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { useUIState } from '@/lib/ui-state';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { Shadow } from '@/constants/shadows';
import { alpha } from '@/components/ui';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_BAR_CONTENT_HEIGHT = 56;
const SWIPE_DISMISS_THRESHOLD = 80;
const DOT_SIZE = 8;
const ICON_SIZE = 16;
const ICON_HIT_SIZE = 36;
const MAX_TITLE_WIDTH = 160;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioPlayerPill() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { togglePlayPause, stopAudio } = useGlobalAudioPlayer();

  // Zustand selectors — subscribe to only what we need
  const title = useAudioPlayerState((s) => s.title);
  const isPlaying = useAudioPlayerState((s) => s.isPlaying);
  const isCompleted = useAudioPlayerState((s) => s.isCompleted);
  const setTier = useAudioPlayerState((s) => s.setTier);

  // -- Pulsing dot animation (worklet) --
  const dotOpacity = useSharedValue(1);

  // Start/stop pulse based on playing state
  React.useEffect(() => {
    if (isPlaying) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1, // infinite
        false,
      );
    } else {
      // Snap to solid when paused
      dotOpacity.value = withTiming(1, { duration: Duration.fast });
    }
  }, [isPlaying, dotOpacity]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  // -- Swipe dismiss gesture (horizontal pan on entire pill) --
  const translateX = useSharedValue(0);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopAudio();
  }, [stopAudio]);

  const handleExpand = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('sheet');
  }, [setTier]);

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  }, [togglePlayPause]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_DISMISS_THRESHOLD) {
        runOnJS(handleDismiss)();
      } else {
        translateX.value = withTiming(0, { duration: Duration.fast });
      }
    });

  const swipeAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const opacity = absX > 0 ? Math.max(0, 1 - absX / (SWIPE_DISMISS_THRESHOLD * 1.5)) : 1;
    return {
      transform: [{ translateX: translateX.value }],
      opacity,
    };
  });

  // -- Bottom offset — tracks tab bar visibility --
  const tabBarHidden = useUIState((s) => s.tabBarHidden);
  const bottomWithTabBar = TAB_BAR_CONTENT_HEIGHT + insets.bottom + Spacing['2'];
  const bottomWithoutTabBar = insets.bottom + Spacing['2'];

  const animatedBottom = useSharedValue(bottomWithTabBar);
  React.useEffect(() => {
    animatedBottom.value = withTiming(
      tabBarHidden ? bottomWithoutTabBar : bottomWithTabBar,
      { duration: Duration.normal },
    );
  }, [tabBarHidden, bottomWithTabBar, bottomWithoutTabBar, animatedBottom]);

  const bottomStyle = useAnimatedStyle(() => ({
    bottom: animatedBottom.value,
  }));

  // -- Accessibility actions --
  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      switch (event.nativeEvent.actionName) {
        case 'activate':
          handleExpand();
          break;
        case 'togglePlayback':
          handleToggle();
          break;
        case 'stop':
          handleDismiss();
          break;
      }
    },
    [handleExpand, handleToggle, handleDismiss],
  );

  const displayTitle = isCompleted ? 'Completed' : (title ?? 'Playing...');

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)}
      exiting={reducedMotion ? undefined : FadeOutDown.duration(Duration.fast).easing(Ease.out)}
      style={[styles.wrapper, bottomStyle]}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.pill,
            Shadow.lg,
            {
              backgroundColor: alpha(colors.backgroundElevated, 0.95),
              borderColor: alpha(colors.border, 0.2),
            },
            swipeAnimatedStyle,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Audio: ${title ?? 'unknown'}. ${isPlaying ? 'Playing' : 'Paused'}. Tap title to expand. Swipe to stop.`}
          accessibilityActions={[
            { name: 'activate', label: 'Expand player' },
            { name: 'togglePlayback', label: isPlaying ? 'Pause' : 'Play' },
            { name: 'stop', label: 'Stop playback' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
        >
          {/* Body — tap to expand to sheet */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleExpand}
            style={styles.bodyTouchable}
          >
            {/* Pulsing dot — hidden when completed */}
            {!isCompleted && (
              <Animated.View
                style={[
                  styles.dot,
                  { backgroundColor: colors.accent },
                  dotAnimatedStyle,
                ]}
              />
            )}

            {/* Title */}
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                {
                  color: isCompleted ? colors.textMuted : colors.text,
                  maxWidth: MAX_TITLE_WIDTH,
                },
              ]}
            >
              {displayTitle}
            </Text>
          </TouchableOpacity>

          {/* Play / Pause — separate tap target */}
          {!isCompleted && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleToggle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.iconTouchable}
            >
              {isPlaying ? (
                <PauseIcon size={ICON_SIZE} color={colors.accent} weight="fill" />
              ) : (
                <PlayIcon size={ICON_SIZE} color={colors.accent} weight="fill" />
              )}
            </TouchableOpacity>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing['4'],
    paddingRight: Spacing['2'],
    paddingVertical: Spacing['2'],
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bodyTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    flexShrink: 1,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Radius.full,
  },
  title: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
    flexShrink: 1,
  },
  iconTouchable: {
    width: ICON_HIT_SIZE,
    height: ICON_HIT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AudioPlayerPill;
