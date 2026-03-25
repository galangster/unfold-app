/**
 * AudioPlayerPill — Tier 1 minimal floating indicator.
 *
 * Small pill that hovers above the tab bar on all tabs.
 * Shows a pulsing accent dot + truncated title + play/pause toggle.
 * Tap to expand to minibar. Swipe left/right to dismiss.
 * Shows "Completed" text when playback finishes (no dot in that state).
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PlayIcon, PauseIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/lib/theme';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { Shadow } from '@/constants/shadows';
import { alpha } from '@/components/ui';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_BAR_CONTENT_HEIGHT = 56;
const SWIPE_DISMISS_THRESHOLD = 80;
const DOT_SIZE = 8;
const ICON_SIZE = 16;
const MAX_TITLE_WIDTH = 160;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioPlayerPill() {
  const { colors } = useTheme();
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

  // -- Swipe dismiss gesture --
  const translateX = useSharedValue(0);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopAudio();
  }, [stopAudio]);

  const handleExpand = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('minibar');
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

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleExpand)();
  });

  // Compose: pan takes priority, tap fires if no pan
  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const swipeAnimatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const opacity = absX > 0 ? Math.max(0, 1 - absX / (SWIPE_DISMISS_THRESHOLD * 1.5)) : 1;
    return {
      transform: [{ translateX: translateX.value }],
      opacity,
    };
  });

  // -- Bottom offset --
  const bottomOffset = TAB_BAR_CONTENT_HEIGHT + insets.bottom + Spacing['2'];

  // -- Accessibility actions --
  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      switch (event.nativeEvent.actionName) {
        case 'activate':
          handleExpand();
          break;
        case 'stop':
          handleDismiss();
          break;
      }
    },
    [handleExpand, handleDismiss],
  );

  const displayTitle = isCompleted ? 'Completed' : (title ?? 'Playing...');

  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.normal)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[styles.wrapper, { bottom: bottomOffset }]}
    >
      <GestureDetector gesture={composedGesture}>
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
          accessibilityLabel={`Audio playing: ${title ?? 'unknown'}. Tap to expand. Swipe to stop.`}
          accessibilityActions={[
            { name: 'activate', label: 'Expand player' },
            { name: 'stop', label: 'Stop playback' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
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

          {/* Play / Pause icon */}
          {!isCompleted && (
            <Animated.View
              // Separate touchable for play/pause so it can be tapped independently
              // But since the whole pill is a tap target, we use it as visual indicator
              // Tap on pill expands; the icon is decorative within the gesture area
            >
              {isPlaying ? (
                <PauseIcon size={ICON_SIZE} color={colors.accent} weight="fill" />
              ) : (
                <PlayIcon size={ICON_SIZE} color={colors.accent} weight="fill" />
              )}
            </Animated.View>
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
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing['2'],
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
});

export default AudioPlayerPill;
