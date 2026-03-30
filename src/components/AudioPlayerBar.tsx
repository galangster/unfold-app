/**
 * AudioPlayerBar — Tier 2 floating mini-player (minibar).
 *
 * Reads all state from the global Zustand store (no props).
 * 2-row layout: progress bar + [title/time | play/pause | speed pill]
 * Glass blur effect with shadow elevation.
 *
 * Gestures:
 *   Swipe UP   -> expand to halfsheet
 *   Swipe DOWN -> collapse to pill (audio continues)
 */

import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PlayIcon, PauseIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
const SWIPE_THRESHOLD = 50;
const GESTURE_ACTIVE_OFFSET = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioPlayerBar() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { togglePlayPause, cycleSpeed } = useGlobalAudioPlayer();

  // Zustand selectors — subscribe to only what we need
  const isPlaying = useAudioPlayerState((s) => s.isPlaying);
  const isLoading = useAudioPlayerState((s) => s.isLoading);
  const currentTime = useAudioPlayerState((s) => s.currentTime);
  const duration = useAudioPlayerState((s) => s.duration);
  const playbackSpeed = useAudioPlayerState((s) => s.playbackSpeed);
  const title = useAudioPlayerState((s) => s.title);
  const setTier = useAudioPlayerState((s) => s.setTier);

  // -- Derived values --
  const progress = duration > 0 ? currentTime / duration : 0;
  const bottomOffset = TAB_BAR_CONTENT_HEIGHT + insets.bottom + Spacing['2'];

  // -- Callbacks --
  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  }, [togglePlayPause]);

  const handleCycleSpeed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cycleSpeed();
  }, [cycleSpeed]);

  const handleSwipeUp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('sheet');
  }, [setTier]);

  const handleSwipeDown = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('pill');
  }, [setTier]);

  // -- Vertical pan gesture for tier navigation --
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-GESTURE_ACTIVE_OFFSET, GESTURE_ACTIVE_OFFSET])
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD) {
        // Swipe up -> expand to halfsheet
        runOnJS(handleSwipeUp)();
      } else if (e.translationY > SWIPE_THRESHOLD) {
        // Swipe down -> collapse to pill
        runOnJS(handleSwipeDown)();
      }
      translateY.value = withTiming(0, { duration: Duration.fast });
    });

  const gestureAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value * 0.3 }],
  }));

  // -- Accessibility --
  const onAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      switch (event.nativeEvent.actionName) {
        case 'expand':
          handleSwipeUp();
          break;
        case 'collapse':
          handleSwipeDown();
          break;
        case 'togglePlayback':
          handlePlayPause();
          break;
      }
    },
    [handleSwipeUp, handleSwipeDown, handlePlayPause],
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.normal)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[styles.wrapper, { bottom: bottomOffset }]}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.container,
            Shadow.lg,
            { borderColor: alpha(colors.border, 0.3) },
            gestureAnimatedStyle,
          ]}
          accessibilityRole="adjustable"
          accessibilityLabel={`Audio player: ${title ?? 'unknown'}. ${isPlaying ? 'Playing' : 'Paused'}. Swipe up to expand, swipe down to collapse.`}
          accessibilityActions={[
            { name: 'expand', label: 'Expand to full player' },
            { name: 'collapse', label: 'Collapse to pill' },
            { name: 'togglePlayback', label: isPlaying ? 'Pause' : 'Play' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
        >
          <BlurView
            intensity={80}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />

          {/* Drag handle */}
          <View style={styles.dragHandleRow}>
            <View style={[styles.dragHandle, { backgroundColor: alpha(colors.text, 0.2) }]} />
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: alpha(colors.text, 0.1) }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%` as unknown as number,
                  backgroundColor: colors.accent,
                },
              ]}
            />
          </View>

          {/* Controls row */}
          <View style={styles.controls}>
            {/* Title + time */}
            <View style={styles.titleSection}>
              <Text numberOfLines={1} style={[styles.titleText, { color: colors.text }]}>
                {title ?? 'Listening...'}
              </Text>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
            </View>

            {/* Play / Pause or Loading indicator */}
            {isLoading ? (
              <View style={[styles.playButton, { backgroundColor: colors.accent }]}>
                <ActivityIndicator size="small" color={colors.background} />
              </View>
            ) : (
              <TouchableOpacity
                onPress={handlePlayPause}
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                accessibilityRole="button"
                style={[styles.playButton, { backgroundColor: colors.accent }]}
              >
                {isPlaying ? (
                  <PauseIcon size={22} color={colors.background} weight="fill" />
                ) : (
                  <PlayIcon size={22} color={colors.background} weight="fill" />
                )}
              </TouchableOpacity>
            )}

            {/* Speed pill */}
            <TouchableOpacity
              onPress={handleCycleSpeed}
              accessibilityLabel={`Playback speed ${playbackSpeed}x`}
              accessibilityRole="button"
              style={[styles.speedPill, { backgroundColor: alpha(colors.text, 0.08) }]}
            >
              <Text style={[styles.speedText, { color: colors.textMuted }]}>
                {playbackSpeed}x
              </Text>
            </TouchableOpacity>
          </View>
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
    left: Spacing['3'],
    right: Spacing['3'],
    zIndex: 100,
  },
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 4,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    gap: Spacing['3'],
  },
  titleSection: {
    flex: 1,
    gap: Spacing['0.5'],
  },
  titleText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
  timeText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedPill: {
    paddingHorizontal: Spacing['2.5'],
    paddingVertical: Spacing['1.5'],
    borderRadius: Radius.sm,
  },
  speedText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});

export default AudioPlayerBar;
