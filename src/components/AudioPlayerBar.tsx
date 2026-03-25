/**
 * AudioPlayerBar — Floating mini-player.
 * 2-row layout: progress bar + [title/time | play | speed + close]
 * Glass blur effect with shadow elevation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { PlayIcon, PauseIcon, XIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { Shadow } from '@/constants/shadows';
import { alpha } from '@/components/ui';
import { logger } from '@/lib/logger';

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75] as const;
// Retained for future expanded player state
const SKIP_SECONDS = 10;

interface AudioPlayerBarProps {
  audioUri: string | null;
  onClose?: () => void;
  /** Auto-play when audioUri becomes available */
  autoPlay?: boolean;
  title?: string;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Loading state — shown while audio downloads. No useAudioPlayer call. */
function AudioPlayerLoading({ onClose, colors, bottomOffset, title, isDark }: {
  onClose?: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  bottomOffset: number;
  title?: string;
  isDark: boolean;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.slow)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[styles.container, Shadow.lg, { bottom: bottomOffset, borderColor: alpha(colors.border, 0.3) }]}
    >
      <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={styles.controls}>
        <View style={styles.titleSection}>
          <Text numberOfLines={1} style={[styles.titleText, { color: colors.text }]}>
            {title || 'Loading audio...'}
          </Text>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>Preparing...</Text>
        </View>
        <ActivityIndicator size="small" color={colors.accent} />
        <TouchableOpacity onPress={() => onClose?.()} accessibilityLabel="Close audio player" style={styles.closeButton}>
          <XIcon size={18} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

/** Active player — only mounted when audioUri is a real string. */
function AudioPlayerActive({ audioUri, onClose, autoPlay, colors, bottomOffset, title, isDark }: {
  audioUri: string;
  onClose?: () => void;
  autoPlay: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  bottomOffset: number;
  title?: string;
  isDark: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // useAudioPlayer is ONLY called with a real URI — never null
  const player = useAudioPlayer(audioUri);

  // Configure audio mode for silent switch
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Auto-play when player is ready
  useEffect(() => {
    if (!player) return;

    if (autoPlay && !hasStarted) {
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
  }, [player, autoPlay, hasStarted]);

  // Poll time at 1s interval
  useEffect(() => {
    if (!player) return;

    timerRef.current = setInterval(() => {
      try {
        setCurrentTime(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);

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

  // Kept for future use
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

  const progress = duration > 0 ? currentTime / duration : 0;
  const speed = SPEED_OPTIONS[speedIndex];

  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.slow)}
      exiting={FadeOutDown.duration(Duration.normal)}
      style={[styles.container, Shadow.lg, { bottom: bottomOffset, borderColor: alpha(colors.border, 0.3) }]}
    >
      <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />

      <View style={[styles.progressTrack, { backgroundColor: alpha(colors.text, 0.1) }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any /* RN doesn't type percentage strings */, backgroundColor: colors.accent }]} />
      </View>

      <View style={styles.controls}>
        <View style={styles.titleSection}>
          <Text numberOfLines={1} style={[styles.titleText, { color: colors.text }]}>
            {title || 'Listening...'}
          </Text>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handlePlayPause}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={[styles.playButton, { backgroundColor: colors.accent }]}
        >
          {isPlaying
            ? <PauseIcon size={22} color={colors.background} weight="fill" />
            : <PlayIcon size={22} color={colors.background} weight="fill" />
          }
        </TouchableOpacity>

        <View style={styles.secondaryControls}>
          <TouchableOpacity
            onPress={handleSpeedCycle}
            accessibilityLabel={`Playback speed ${speed}x`}
            style={[styles.speedPill, { backgroundColor: alpha(colors.text, 0.08) }]}
          >
            <Text style={[styles.speedText, { color: colors.textMuted }]}>{speed}x</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClose}
            accessibilityLabel="Close audio player"
            style={styles.closeButton}
          >
            <XIcon size={18} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const TAB_BAR_CONTENT_HEIGHT = 56;

/** Public wrapper — routes to loading or active player. useAudioPlayer is never called with null. */
export function AudioPlayerBar({ audioUri, onClose, autoPlay = true, title }: AudioPlayerBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomOffset = TAB_BAR_CONTENT_HEIGHT + insets.bottom + Spacing['2'];

  if (!audioUri) {
    return <AudioPlayerLoading onClose={onClose} colors={colors} bottomOffset={bottomOffset} title={title} isDark={isDark} />;
  }

  return (
    <AudioPlayerActive
      audioUri={audioUri}
      onClose={onClose}
      autoPlay={autoPlay}
      colors={colors}
      bottomOffset={bottomOffset}
      title={title}
      isDark={isDark}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing['3'],
    right: Spacing['3'],
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progressTrack: { height: 4, width: '100%' },
  progressFill: { height: '100%', borderRadius: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    gap: Spacing['3'],
  },
  titleSection: { flex: 1, gap: Spacing['0.5'] },
  titleText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
  timeText: { fontFamily: FontFamily.ui, fontSize: FontSize.xs },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing['1'] },
  speedPill: {
    paddingHorizontal: Spacing['2.5'],
    paddingVertical: Spacing['1.5'],
    borderRadius: Radius.sm,
  },
  speedText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs },
  closeButton: { padding: Spacing['2'] },
});

export default AudioPlayerBar;
