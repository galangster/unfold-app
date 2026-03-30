/**
 * AudioPlayerSheet — Compact bottom sheet audio player.
 *
 * Uses @gorhom/bottom-sheet v5 at 35% snap height.
 * Reads all state from the global Zustand store (no props).
 *
 * Layout (top → bottom):
 *   Title + speed pill (same row)
 *   Series subtitle
 *   Scrubber + time labels
 *   Skip back / Play-Pause / Skip forward (centered)
 *
 * Swipe down to close → collapses to pill tier (audio continues).
 *
 * Performance: The scrubber and time labels are isolated into a
 * separate component so that currentTime updates (1x/sec) only
 * re-render the scrubber — not the entire sheet + controls.
 */

import React, { useRef, useCallback, useState, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PlayIcon, PauseIcon, ArrowCounterClockwiseIcon, ArrowClockwiseIcon } from 'phosphor-react-native';

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

const SNAP_POINTS = ['28%'];
const PLAY_BUTTON_SIZE = 56;
const SCRUBBER_THUMB_SIZE = 14;
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
// ScrubberSection — isolated to avoid re-rendering the whole sheet on tick
// ---------------------------------------------------------------------------

const ScrubberSection = memo(function ScrubberSection() {
  const { colors } = useTheme();
  const { seekTo } = useGlobalAudioPlayer();

  const currentTime = useAudioPlayerState((s) => s.currentTime);
  const duration = useAudioPlayerState((s) => s.duration);

  const [trackWidth, setTrackWidth] = useState(0);
  const isScrubbing = useSharedValue(false);
  const scrubPosition = useSharedValue(0);

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayTime = isScrubbing.value
    ? scrubPosition.value * duration
    : currentTime;

  const handleTrackLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      setTrackWidth(e.nativeEvent.layout.width);
    },
    [],
  );

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

  const scrubGesture = Gesture.Pan()
    .onStart((e) => {
      isScrubbing.value = true;
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
    <View style={styles.scrubberSection}>
      <GestureDetector gesture={scrubGesture}>
        <View
          style={styles.scrubberTouchArea}
          onLayout={handleTrackLayout}
          accessibilityRole="adjustable"
          accessibilityLabel={`Playback position. ${formatTime(displayTime)} of ${formatTime(duration)}`}
          accessibilityHint="Drag to seek"
        >
          <View
            style={[
              styles.scrubberTrack,
              { backgroundColor: alpha(colors.text, 0.1) },
            ]}
          >
            <Animated.View
              style={[
                styles.scrubberFill,
                { backgroundColor: colors.accent },
                scrubberFillStyle,
              ]}
            />
          </View>
          <Animated.View
            style={[
              styles.scrubberThumb,
              { backgroundColor: colors.accent },
              scrubberThumbStyle,
            ]}
          />
        </View>
      </GestureDetector>

      <View style={styles.timeRow}>
        <Text style={[styles.timeText, { color: colors.textMuted }]}>
          {formatTime(displayTime)}
        </Text>
        <Text style={[styles.timeText, { color: colors.textMuted }]}>
          {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AudioPlayerSheet() {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const { togglePlayPause, cycleSpeed, skip } = useGlobalAudioPlayer();

  // Only subscribe to state that affects header/controls — NOT currentTime
  const isPlaying = useAudioPlayerState((s) => s.isPlaying);
  const isLoading = useAudioPlayerState((s) => s.isLoading);
  const duration = useAudioPlayerState((s) => s.duration);
  const playbackSpeed = useAudioPlayerState((s) => s.playbackSpeed);
  const title = useAudioPlayerState((s) => s.title);
  const seriesTitle = useAudioPlayerState((s) => s.seriesTitle);
  const setTier = useAudioPlayerState((s) => s.setTier);

  const isPreparing = isLoading && duration === 0;

  // -- Sheet callbacks --
  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        setTier('pill');
      }
    },
    [setTier],
  );

  // -- Button handlers --
  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlayPause();
  }, [togglePlayPause]);

  const handleCycleSpeed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cycleSpeed();
  }, [cycleSpeed]);

  const handleSkipBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skip(-10);
  }, [skip]);

  const handleSkipForward = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skip(10);
  }, [skip]);

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      enableOverDrag={false}
      onChange={handleSheetChange}
      handleIndicatorStyle={{
        backgroundColor: colors.borderStrong,
        width: 36,
        height: 4,
        borderRadius: 2,
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
        {/* Header row: Title + Speed pill */}
        <View style={styles.headerRow}>
          <View style={styles.titleGroup}>
            <Text
              numberOfLines={1}
              style={[styles.titleText, { color: colors.text }]}
              accessibilityRole="header"
            >
              {title ?? 'Listening...'}
            </Text>
            {isPreparing ? (
              <View style={styles.preparingRow}>
                <ActivityIndicator size={12} color={colors.accent} />
                <Text style={[styles.seriesText, { color: colors.textMuted }]}>
                  Preparing audio — this may take a minute or two...
                </Text>
              </View>
            ) : seriesTitle ? (
              <Text
                numberOfLines={1}
                style={[styles.seriesText, { color: colors.textMuted }]}
              >
                {seriesTitle}
              </Text>
            ) : null}
          </View>

          {/* Speed Pill — top right, aligned with title */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleCycleSpeed}
            style={[
              styles.speedPill,
              { backgroundColor: alpha(colors.text, 0.08) },
            ]}
            accessibilityLabel={`Playback speed ${playbackSpeed}x. Double tap to change.`}
            accessibilityRole="button"
          >
            <Text style={[styles.speedText, { color: colors.text }]}>
              {playbackSpeed}x
            </Text>
          </TouchableOpacity>
        </View>

        {/* Scrubber — isolated component, only re-renders on currentTime */}
        <ScrubberSection />

        {/* Controls — perfectly centered */}
        <View style={styles.controlsRow}>
          {/* Skip Back 10s */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleSkipBack}
            style={styles.skipButton}
            accessibilityLabel="Skip back 10 seconds"
            accessibilityRole="button"
          >
            <ArrowCounterClockwiseIcon size={28} color={colors.text} weight="regular" />
            <Text style={[styles.skipLabel, { color: colors.text }]}>10</Text>
          </TouchableOpacity>

          {/* Play / Pause */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handlePlayPause}
            disabled={isPreparing}
            style={[styles.playButton, { backgroundColor: colors.accent }]}
            accessibilityLabel={isPreparing ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
            accessibilityRole="button"
          >
            {isPreparing ? (
              <ActivityIndicator size={26} color={colors.backgroundElevated} />
            ) : isPlaying ? (
              <PauseIcon
                size={26}
                color={colors.backgroundElevated}
                weight="fill"
              />
            ) : (
              <PlayIcon
                size={26}
                color={colors.backgroundElevated}
                weight="fill"
              />
            )}
          </TouchableOpacity>

          {/* Skip Forward 10s */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleSkipForward}
            style={styles.skipButton}
            accessibilityLabel="Skip forward 10 seconds"
            accessibilityRole="button"
          >
            <ArrowClockwiseIcon size={28} color={colors.text} weight="regular" />
            <Text style={[styles.skipLabel, { color: colors.text }]}>10</Text>
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
    paddingTop: Spacing['1'],
    paddingBottom: Spacing['6'],
  },
  // -- Header --
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['3'],
  },
  titleGroup: {
    flex: 1,
    marginRight: Spacing['3'],
    gap: 2,
  },
  titleText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  seriesText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // -- Speed --
  speedPill: {
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1.5'],
    borderRadius: Radius.full,
  },
  speedText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
  },
  // -- Scrubber --
  scrubberSection: {
    marginBottom: Spacing['4'],
  },
  scrubberTouchArea: {
    height: Spacing['8'],
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
    marginTop: Spacing['0.5'],
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
    gap: Spacing['5'],
  },
  skipButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    position: 'absolute',
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 9,
    lineHeight: 10,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AudioPlayerSheet;
