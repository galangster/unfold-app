/**
 * AudioPlayerSheet -- Tier 3 half-sheet audio player.
 *
 * Uses @gorhom/bottom-sheet v5 at 48% snap height.
 * Reads all state from the global Zustand store (no props).
 * Draggable scrubber via Gesture.Pan(), skip +/-10s, play/pause, speed cycling.
 *
 * Swipe down to close -> collapses back to minibar tier.
 */

import React, { useRef, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  PlayIcon,
  PauseIcon,
  ClockCounterClockwiseIcon,
  ClockClockwiseIcon,
} from 'phosphor-react-native';

import { useTheme } from '@/lib/theme';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Spring } from '@/constants/animations';
import { Shadow } from '@/constants/shadows';
import { alpha } from '@/components/ui';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAP_POINTS = ['48%'];
const PLAY_BUTTON_SIZE = 64;
const SKIP_ICON_SIZE = 28;
const SCRUBBER_THUMB_SIZE = 16;
const SCRUBBER_TRACK_HEIGHT = Spacing['1']; // 4px

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

export function AudioPlayerSheet() {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const { togglePlayPause, skip, cycleSpeed, seekTo } = useGlobalAudioPlayer();

  // Zustand selectors
  const isPlaying = useAudioPlayerState((s) => s.isPlaying);
  const currentTime = useAudioPlayerState((s) => s.currentTime);
  const duration = useAudioPlayerState((s) => s.duration);
  const playbackSpeed = useAudioPlayerState((s) => s.playbackSpeed);
  const title = useAudioPlayerState((s) => s.title);
  const seriesTitle = useAudioPlayerState((s) => s.seriesTitle);
  const setTier = useAudioPlayerState((s) => s.setTier);

  // Scrubber track width (measured via onLayout)
  const [trackWidth, setTrackWidth] = useState(0);

  // Scrubber gesture shared values
  const isScrubbing = useSharedValue(false);
  const scrubPosition = useSharedValue(0); // 0..1 normalized

  // -- Derived values --
  const progress = duration > 0 ? currentTime / duration : 0;

  // When not scrubbing, display the real playback position
  // When scrubbing, display the scrub position
  const displayProgress = isScrubbing.value ? scrubPosition.value : progress;
  const displayTime = isScrubbing.value
    ? scrubPosition.value * duration
    : currentTime;

  // -- Sheet callbacks --
  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        // Sheet closed via pan-down -> collapse to minibar
        setTier('minibar');
      }
    },
    [setTier],
  );

  // -- Button handlers --
  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  }, [togglePlayPause]);

  const handleSkipBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skip(-10);
  }, [skip]);

  const handleSkipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skip(10);
  }, [skip]);

  const handleCycleSpeed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cycleSpeed();
  }, [cycleSpeed]);

  const handleTrackLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      setTrackWidth(e.nativeEvent.layout.width);
    },
    [],
  );

  // -- JS callbacks for worklet bridge --
  const handleSeek = useCallback(
    (normalizedPosition: number) => {
      const seekTime = Math.max(0, Math.min(normalizedPosition, 1)) * duration;
      seekTo(seekTime);
    },
    [duration, seekTo],
  );

  const handleScrubStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // -- Scrubber gesture --
  const scrubGesture = Gesture.Pan()
    .onStart((e) => {
      isScrubbing.value = true;
      // Set initial position from touch location
      if (trackWidth > 0) {
        scrubPosition.value = Math.max(0, Math.min(e.x / trackWidth, 1));
      }
      runOnJS(handleScrubStart)();
    })
    .onUpdate((e) => {
      if (trackWidth > 0) {
        scrubPosition.value = Math.max(0, Math.min(e.x / trackWidth, 1));
      }
    })
    .onEnd(() => {
      isScrubbing.value = false;
      runOnJS(handleSeek)(scrubPosition.value);
    });

  // -- Animated styles for scrubber --
  const scrubberFillStyle = useAnimatedStyle(() => {
    const currentProgress = isScrubbing.value ? scrubPosition.value : progress;
    return {
      width: `${currentProgress * 100}%` as unknown as number,
    };
  });

  const scrubberThumbStyle = useAnimatedStyle(() => {
    const currentProgress = isScrubbing.value ? scrubPosition.value : progress;
    return {
      transform: [
        {
          translateX: currentProgress * trackWidth - SCRUBBER_THUMB_SIZE / 2,
        },
      ],
      opacity: withTiming(isScrubbing.value ? 1 : 0, {
        duration: Duration.fast,
      }),
    };
  });

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onChange={handleSheetChange}
      handleIndicatorStyle={{
        backgroundColor: alpha(colors.text, 0.2),
        width: 36,
      }}
      backgroundStyle={[
        styles.sheetBackground,
        {
          backgroundColor: colors.backgroundElevated,
          ...Shadow.sheet,
        },
      ]}
      animationConfigs={{
        damping: Spring.snappy.damping,
        stiffness: Spring.snappy.stiffness,
        mass: Spring.snappy.mass,
      }}
    >
      <BottomSheetView style={styles.content}>
        {/* Title + Series Name */}
        <View style={styles.header}>
          <Text
            numberOfLines={1}
            style={[styles.titleText, { color: colors.text }]}
            accessibilityRole="header"
          >
            {title ?? 'Listening...'}
          </Text>
          {seriesTitle ? (
            <Text
              numberOfLines={1}
              style={[styles.seriesText, { color: colors.textMuted }]}
            >
              {seriesTitle}
            </Text>
          ) : null}
        </View>

        {/* Scrubber */}
        <View style={styles.scrubberSection}>
          <GestureDetector gesture={scrubGesture}>
            <View
              style={styles.scrubberTouchArea}
              onLayout={handleTrackLayout}
              accessibilityRole="adjustable"
              accessibilityLabel={`Playback position. ${formatTime(displayTime)} of ${formatTime(duration)}`}
              accessibilityHint="Drag to seek"
            >
              {/* Track background */}
              <View
                style={[
                  styles.scrubberTrack,
                  { backgroundColor: alpha(colors.text, 0.1) },
                ]}
              >
                {/* Fill */}
                <Animated.View
                  style={[
                    styles.scrubberFill,
                    { backgroundColor: colors.accent },
                    scrubberFillStyle,
                  ]}
                />
              </View>

              {/* Thumb (visible only while scrubbing) */}
              <Animated.View
                style={[
                  styles.scrubberThumb,
                  { backgroundColor: colors.accent },
                  scrubberThumbStyle,
                ]}
              />
            </View>
          </GestureDetector>

          {/* Time labels */}
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>
              {formatTime(displayTime)}
            </Text>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>
              {formatTime(duration)}
            </Text>
          </View>
        </View>

        {/* Transport Controls */}
        <View style={styles.controlsRow}>
          {/* Skip Back 10s */}
          <TouchableOpacity
            onPress={handleSkipBack}
            style={styles.skipButton}
            accessibilityLabel="Skip back 10 seconds"
            accessibilityRole="button"
          >
            <ClockCounterClockwiseIcon
              size={SKIP_ICON_SIZE}
              color={colors.text}
              weight="light"
            />
            <Text style={[styles.skipLabel, { color: colors.text }]}>10</Text>
          </TouchableOpacity>

          {/* Play / Pause */}
          <TouchableOpacity
            onPress={handlePlayPause}
            style={[styles.playButton, { backgroundColor: colors.accent }]}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            accessibilityRole="button"
          >
            {isPlaying ? (
              <PauseIcon
                size={28}
                color={colors.backgroundElevated}
                weight="fill"
              />
            ) : (
              <PlayIcon
                size={28}
                color={colors.backgroundElevated}
                weight="fill"
              />
            )}
          </TouchableOpacity>

          {/* Skip Forward 10s */}
          <TouchableOpacity
            onPress={handleSkipForward}
            style={styles.skipButton}
            accessibilityLabel="Skip forward 10 seconds"
            accessibilityRole="button"
          >
            <ClockClockwiseIcon
              size={SKIP_ICON_SIZE}
              color={colors.text}
              weight="light"
            />
            <Text style={[styles.skipLabel, { color: colors.text }]}>10</Text>
          </TouchableOpacity>
        </View>

        {/* Speed Pill */}
        <View style={styles.speedRow}>
          <TouchableOpacity
            onPress={handleCycleSpeed}
            style={[
              styles.speedPill,
              { backgroundColor: alpha(colors.text, 0.08) },
            ]}
            accessibilityLabel={`Playback speed ${playbackSpeed}x. Double tap to change.`}
            accessibilityRole="button"
          >
            <Text style={[styles.speedText, { color: colors.textMuted }]}>
              {playbackSpeed}x
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheetBackground: {
    borderRadius: Radius.xl,
  },
  content: {
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
    paddingBottom: Spacing['8'],
  },
  // -- Header --
  header: {
    alignItems: 'center',
    gap: Spacing['1'],
    marginBottom: Spacing['6'],
  },
  titleText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
    textAlign: 'center',
  },
  seriesText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  // -- Scrubber --
  scrubberSection: {
    marginBottom: Spacing['6'],
  },
  scrubberTouchArea: {
    height: Spacing['8'], // 32px touch target (oversized for accessibility)
    justifyContent: 'center',
  },
  scrubberTrack: {
    height: SCRUBBER_TRACK_HEIGHT,
    borderRadius: SCRUBBER_TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  scrubberFill: {
    height: '100%',
    borderRadius: SCRUBBER_TRACK_HEIGHT / 2,
  },
  scrubberThumb: {
    position: 'absolute',
    width: SCRUBBER_THUMB_SIZE,
    height: SCRUBBER_THUMB_SIZE,
    borderRadius: SCRUBBER_THUMB_SIZE / 2,
    top: (Spacing['8'] - SCRUBBER_THUMB_SIZE) / 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing['1'],
  },
  timeText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  // -- Controls --
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['8'],
    marginBottom: Spacing['6'],
  },
  skipButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    position: 'absolute',
    // Centered on the icon
    textAlign: 'center',
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // -- Speed --
  speedRow: {
    alignItems: 'center',
  },
  speedPill: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: Radius.full,
  },
  speedText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});

export default AudioPlayerSheet;
