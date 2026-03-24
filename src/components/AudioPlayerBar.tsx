/**
 * AudioPlayerBar — Floating bar audio player.
 * Glass-effect bar at bottom of reading screen.
 * Controls: skip -10s, play/pause, skip +10s, time, speed cycle.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, XIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { logger } from '@/lib/logger';

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75] as const;
const SKIP_SECONDS = 10;

interface AudioPlayerBarProps {
  audioUri: string | null;
  onClose?: () => void;
  /** Auto-play when audioUri becomes available */
  autoPlay?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayerBar({ audioUri, onClose, autoPlay = true }: AudioPlayerBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useAudioPlayer(audioUri);

  // Configure audio mode for silent switch
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Auto-play when player is ready
  useEffect(() => {
    if (!player || !audioUri) return;

    if (autoPlay && !hasStarted) {
      // Small delay to let player initialize
      const timeout = setTimeout(() => {
        try {
          player.play();
          setIsPlaying(true);
          setHasStarted(true);
        } catch (e) {
          logger.error('[AudioPlayerBar] Auto-play failed:', e);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [player, audioUri, autoPlay, hasStarted]);

  // Poll time at 1s interval (not 50ms)
  useEffect(() => {
    if (!player) return;

    timerRef.current = setInterval(() => {
      try {
        setCurrentTime(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);

        // Detect playback completion
        if (player.duration > 0 && player.currentTime >= player.duration - 0.5) {
          setIsPlaying(false);
        }
      } catch { /* player may be released */ }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [player]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { player?.pause(); } catch { /* ignore */ }
    };
  }, [player]);

  const handlePlayPause = useCallback(() => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
        setHasStarted(true);
      }
    } catch (e) {
      logger.error('[AudioPlayerBar] Play/pause error:', e);
    }
  }, [player, isPlaying]);

  const handleSkip = useCallback(async (seconds: number) => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const newTime = Math.max(0, Math.min((player.currentTime ?? 0) + seconds, player.duration ?? 0));
      await player.seekTo(newTime);
      setCurrentTime(newTime);
    } catch (e) {
      logger.error('[AudioPlayerBar] Skip error:', e);
    }
  }, [player]);

  const handleSpeedCycle = useCallback(() => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    setSpeedIndex(nextIndex);
    try {
      player.setPlaybackRate(SPEED_OPTIONS[nextIndex]);
    } catch (e) {
      logger.error('[AudioPlayerBar] Speed change error:', e);
    }
  }, [player, speedIndex]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { player?.pause(); } catch { /* ignore */ }
    onClose?.();
  }, [player, onClose]);

  // Loading state: bar is visible but audio hasn't downloaded yet
  if (!audioUri) {
    return (
      <Animated.View
        entering={FadeInDown.duration(Duration.slow)}
        exiting={FadeOutDown.duration(Duration.normal)}
        style={[
          styles.container,
          {
            bottom: insets.bottom + Spacing['2'],
            backgroundColor: alpha(colors.background, 0.95),
            borderColor: alpha(colors.border, 0.5),
          },
        ]}
      >
        <View style={styles.controls}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.timeText, { color: colors.textMuted, marginLeft: Spacing['2'] }]}>
            Loading audio...
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => onClose?.()} accessibilityLabel="Close audio player" style={styles.skipButton}>
            <XIcon size={16} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  const speed = SPEED_OPTIONS[speedIndex];

  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.slow)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[
        styles.container,
        {
          bottom: insets.bottom + Spacing['2'],
          backgroundColor: alpha(colors.background, 0.95),
          borderColor: alpha(colors.border, 0.5),
        },
      ]}
    >
      {/* Progress bar along top edge */}
      <View style={[styles.progressTrack, { backgroundColor: alpha(colors.text, 0.08) }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%` as any, backgroundColor: colors.accent },
          ]}
        />
      </View>

      {/* Controls row */}
      <View style={styles.controls}>
        {/* Skip back */}
        <TouchableOpacity
          onPress={() => handleSkip(-SKIP_SECONDS)}
          accessibilityLabel="Skip back 10 seconds"
          style={styles.skipButton}
        >
          <SkipBackIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>

        {/* Play/Pause */}
        <TouchableOpacity
          onPress={handlePlayPause}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={[styles.playButton, { backgroundColor: colors.accent }]}
        >
          {isPlaying ? (
            <PauseIcon size={18} color={colors.background} weight="fill" />
          ) : (
            <PlayIcon size={18} color={colors.background} weight="fill" />
          )}
        </TouchableOpacity>

        {/* Skip forward */}
        <TouchableOpacity
          onPress={() => handleSkip(SKIP_SECONDS)}
          accessibilityLabel="Skip forward 10 seconds"
          style={styles.skipButton}
        >
          <SkipForwardIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Time display */}
        <Text style={[styles.timeText, { color: colors.textMuted }]}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>

        {/* Speed pill */}
        <TouchableOpacity
          onPress={handleSpeedCycle}
          accessibilityLabel={`Playback speed ${speed}x`}
          style={[styles.speedPill, { backgroundColor: alpha(colors.text, 0.06) }]}
        >
          <Text style={[styles.speedText, { color: colors.textMuted }]}>{speed}x</Text>
        </TouchableOpacity>

        {/* Close button */}
        <TouchableOpacity
          onPress={handleClose}
          accessibilityLabel="Close audio player"
          style={styles.skipButton}
        >
          <XIcon size={16} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing['3'],
    right: Spacing['3'],
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2.5'],
  },
  skipButton: {
    padding: Spacing['1'],
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  speedPill: {
    paddingHorizontal: Spacing['2'],
    paddingVertical: Spacing['1'],
    borderRadius: Radius.sm,
  },
  speedText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
});

export default AudioPlayerBar;
