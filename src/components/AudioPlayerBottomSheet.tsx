import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  PlayIcon,
  PauseIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { streamDevotionalAudio } from '@/lib/cartesia';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

const SKIP_SECONDS = 15;
const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;

interface AudioPlayerProps {
  title: string;
  subtitle: string;
  content: string;
  scriptureReference: string;
  scriptureText: string;
  voiceId: string;
  isPremium: boolean;
  onClose: () => void;
}

export const AudioPlayer = forwardRef<BottomSheet, AudioPlayerProps>(({
  title,
  subtitle,
  content,
  scriptureReference,
  scriptureText,
  voiceId,
  isPremium,
  onClose,
}, ref) => {
  const { colors, isDark } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [speedIndex, setSpeedIndex] = useState(0);

  const shouldAutoplayRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const progressBarWidthRef = useRef(0);

  // Animated progress bar using reanimated shared values for smooth updates
  const progressAnim = useSharedValue(0);

  const player = useAudioPlayer(
    audioUrl ? { uri: audioUrl } : undefined,
    { updateInterval: 50 }
  );
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = status.currentTime * 1000;
  const duration = status.duration * 1000;

  const snapPoints = useMemo(() => ['25%'], []);

  const fullText = useMemo(() => {
    return `${content}\n\n${scriptureReference}: ${scriptureText}`;
  }, [content, scriptureReference, scriptureText]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    if (!status.isLoaded || !audioUrl || !shouldAutoplayRef.current) return;
    player.play();
    shouldAutoplayRef.current = false;
  }, [status.isLoaded, audioUrl, player]);

  // Smooth progress bar animation driven by playback position
  useEffect(() => {
    if (duration > 0) {
      const percent = Math.min((currentTime / duration) * 100, 100);
      // Use spring for smooth interpolation between position updates
      progressAnim.value = withTiming(percent, {
        duration: 80,
        easing: Easing.linear,
      });
    } else {
      progressAnim.value = 0;
    }
  }, [currentTime, duration]);

  // Auto-collapse bottom sheet when audio finishes
  useEffect(() => {
    if (status.didJustFinish) {
      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_COMPLETED, {
        voice_id: voiceId,
      });

      // Snap to minimized state (index 0 = peek height)
      // The bottom sheet is already at index 0 (25%), so this is a no-op
      // if it's already minimized. If we had multiple snap points, we'd
      // snap to the lowest one. For now, ensure it stays at peek.
      if (ref && typeof ref !== 'function' && ref.current) {
        ref.current.snapToIndex(0);
      }
    }
  }, [status.didJustFinish, voiceId, ref]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
      audioUrlRef.current = null;
    };
  }, [player]);

  // Auto-load and play if premium
  useEffect(() => {
    if (isPremium && !audioUrl && !hasError) {
      loadAndPlayAudio();
    } else if (!isPremium) {
      setHasError(true);
      setErrorMessage('Audio playback is a premium feature. Upgrade to listen.');
    }
  }, []);

  const loadAndPlayAudio = useCallback(async () => {
    // Prevent concurrent loads (multiple taps)
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage('');

      if (audioUrlRef.current) {
        try {
          player.pause();
        } catch {}
        audioUrlRef.current = null;
      }

      const resolvedVoiceId = voiceId === 'default' ? '694f9389-aac1-45b6-b726-9d9369183238' : voiceId;

      Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_STARTED, {
        voice_id: resolvedVoiceId,
      });

      const result = await streamDevotionalAudio(fullText, resolvedVoiceId);

      shouldAutoplayRef.current = true;
      setAudioUrl(result.audioUrl);
    } catch (error) {
      logger.error('Error loading audio:', error);
      setHasError(true);

      // Provide user-friendly error messages based on error type
      if (error instanceof Error) {
        if (error.message.includes('Network') || error.message.includes('fetch')) {
          setErrorMessage('Unable to connect. Check your internet and try again.');
        } else if (error.message.includes('429') || error.message.includes('rate')) {
          setErrorMessage('Too many requests. Please wait a moment and try again.');
        } else if (error.message.includes('500') || error.message.includes('503')) {
          setErrorMessage('Audio service is temporarily unavailable. Try again shortly.');
        } else {
          setErrorMessage('Could not load audio. Tap to retry.');
        }
      } else {
        setErrorMessage('Could not load audio. Tap to retry.');
      }
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [isPremium, fullText, voiceId, player]);

  const handleRetry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasError(false);
    setErrorMessage('');
    loadAndPlayAudio();
  }, [loadAndPlayAudio]);

  const togglePlayback = useCallback(async () => {
    if (!audioUrl || !status.isLoaded) {
      await loadAndPlayAudio();
      return;
    }

    try {
      if (status.playing) {
        player.pause();
        Analytics.logEvent(AnalyticsEvents.AUDIO_PAUSED, {
          position_ms: currentTime,
        });
      } else {
        if (status.duration > 0 && Math.abs(status.currentTime - status.duration) < 0.05) {
          await player.seekTo(0);
        }
        player.play();
      }
    } catch (error) {
      logger.error('Error toggling playback:', error);
    }
  }, [audioUrl, status, loadAndPlayAudio, player, currentTime]);

  const skipBack = useCallback(async () => {
    if (!audioUrl || !status.isLoaded) return;
    try {
      const newPos = Math.max(0, status.currentTime - SKIP_SECONDS);
      await player.seekTo(newPos);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error('Error skipping back:', error);
    }
  }, [audioUrl, status.isLoaded, status.currentTime, player]);

  const skipForward = useCallback(async () => {
    if (!audioUrl || !status.isLoaded || status.duration <= 0) return;
    try {
      const newPos = Math.min(status.duration, status.currentTime + SKIP_SECONDS);
      await player.seekTo(newPos);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error('Error skipping forward:', error);
    }
  }, [audioUrl, status.isLoaded, status.currentTime, status.duration, player]);

  const cycleSpeed = useCallback(() => {
    const nextIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setSpeedIndex(nextIndex);
    try {
      player.setPlaybackRate(newSpeed);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error('Error setting playback rate:', error);
    }
  }, [speedIndex, player]);

  const handleProgressBarLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    progressBarWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  const handleProgressPress = useCallback(async (event: { nativeEvent: { locationX: number } }) => {
    if (!audioUrl || !status.isLoaded || duration <= 0) return;

    const { locationX } = event.nativeEvent;
    const progress = Math.max(0, Math.min(1, locationX / progressBarWidthRef.current));
    const newPositionSec = (progress * duration) / 1000;

    try {
      await player.seekTo(newPositionSec);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      logger.error('Error seeking:', error);
    }
  }, [audioUrl, status.isLoaded, duration, player]);

  const formatTime = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const currentSpeed = PLAYBACK_SPEEDS[speedIndex];
  const isBuffering = isLoading || (audioUrl != null && !status.isLoaded);

  // Animated progress bar fill driven by shared value
  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value}%` as `${number}%`,
  }));

  // Animated progress thumb position
  const progressThumbStyle = useAnimatedStyle(() => ({
    left: `${progressAnim.value}%` as `${number}%`,
    transform: [{ translateX: -6 }],
    // Only show thumb when there's progress
    opacity: progressAnim.value > 0 ? 1 : 0,
  }));

  // Indeterminate loading shimmer for progress bar
  const loadingShimmer = useSharedValue(0);

  useEffect(() => {
    if (isBuffering) {
      loadingShimmer.value = withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(loadingShimmer);
      loadingShimmer.value = 0;
    }
  }, [isBuffering]);

  const loadingBarStyle = useAnimatedStyle(() => ({
    width: '30%',
    left: `${loadingShimmer.value * 70}%`,
    opacity: 0.6,
  }));

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      enableOverDrag={false}
      onClose={onClose}
      backgroundStyle={{
        backgroundColor: 'transparent',
      }}
      handleStyle={{
        backgroundColor: 'transparent',
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.textMuted,
        width: 40,
        height: 4,
        borderRadius: 2,
      }}
    >
      <BottomSheetView style={styles.container}>
        {/* Blur background */}
        <BlurView
          intensity={80}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }]}
        />

        <View style={styles.content}>
          {/* Error state — replaces the full content area */}
          {hasError ? (
            <View style={styles.errorStateContainer}>
              <WarningCircleIcon
                size={28}
                color={colors.error}
                weight="light"
              />
              <Text
                style={[
                  styles.errorStateText,
                  { color: colors.text, fontFamily: FontFamily.body },
                ]}
                numberOfLines={2}
              >
                {errorMessage}
              </Text>
              {/* Only show retry for non-premium-related errors */}
              {isPremium && (
                <Pressable
                  onPress={handleRetry}
                  style={[styles.retryButton, { backgroundColor: colors.accent }]}
                >
                  <ArrowsClockwiseIcon size={14} color="#fff" weight="light" />
                  <Text style={[styles.retryButtonText, { fontFamily: FontFamily.uiSemiBold }]}>
                    Try again
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              {/* Track title row */}
              <View style={styles.titleRow}>
                <View style={styles.titleTextContainer}>
                  <Text
                    style={[styles.titleText, { color: colors.text, fontFamily: FontFamily.uiSemiBold }]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text
                    style={[
                      styles.subtitleText,
                      {
                        color: isBuffering ? colors.accent : colors.textMuted,
                        fontFamily: FontFamily.ui,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {isBuffering ? 'Loading audio...' : subtitle}
                  </Text>
                </View>
                {/* Speed control */}
                <Pressable
                  onPress={cycleSpeed}
                  style={[styles.speedButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
                >
                  <Text style={[styles.speedText, { color: colors.text, fontFamily: FontFamily.uiSemiBold }]}>
                    {currentSpeed === 1 ? '1x' : `${currentSpeed}x`}
                  </Text>
                </Pressable>
              </View>

              {/* Progress bar */}
              <Pressable
                onLayout={handleProgressBarLayout}
                onPress={handleProgressPress}
                style={[styles.progressBarContainer, { backgroundColor: colors.border }]}
              >
                {isBuffering ? (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      { backgroundColor: colors.accent, position: 'absolute' },
                      loadingBarStyle,
                    ]}
                  />
                ) : (
                  <>
                    <Animated.View
                      style={[
                        styles.progressFill,
                        { backgroundColor: colors.accent },
                        progressFillStyle,
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.progressThumb,
                        { backgroundColor: colors.accent },
                        progressThumbStyle,
                      ]}
                    />
                  </>
                )}
              </Pressable>

              {/* Time + controls row */}
              <View style={styles.controlsRow}>
                <Text style={[styles.timeText, { color: colors.textMuted, fontFamily: FontFamily.mono }]}>
                  {formatTime(currentTime)}
                </Text>

                <View style={styles.transportControls}>
                  {/* Skip back 15s */}
                  <Pressable
                    onPress={skipBack}
                    style={styles.skipButton}
                    disabled={isLoading || !status.isLoaded}
                  >
                    <ArrowCounterClockwiseIcon
                      size={18}
                      color={status.isLoaded ? colors.text : colors.textMuted}
                      weight="light"
                    />
                    <Text
                      style={[
                        styles.skipLabel,
                        {
                          color: status.isLoaded ? colors.text : colors.textMuted,
                          fontFamily: FontFamily.uiSemiBold,
                        },
                      ]}
                    >
                      15
                    </Text>
                  </Pressable>

                  {/* Play/pause */}
                  <Pressable
                    onPress={togglePlayback}
                    style={[styles.playButton, { backgroundColor: colors.accent }]}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : isPlaying ? (
                      <PauseIcon size={20} color="#fff" weight="fill" />
                    ) : (
                      <PlayIcon size={20} color="#fff" weight="fill" style={{ marginLeft: 2 }} />
                    )}
                  </Pressable>

                  {/* Skip forward 15s */}
                  <Pressable
                    onPress={skipForward}
                    style={styles.skipButton}
                    disabled={isLoading || !status.isLoaded}
                  >
                    <ArrowClockwiseIcon
                      size={18}
                      color={status.isLoaded ? colors.text : colors.textMuted}
                      weight="light"
                    />
                    <Text
                      style={[
                        styles.skipLabel,
                        {
                          color: status.isLoaded ? colors.text : colors.textMuted,
                          fontFamily: FontFamily.uiSemiBold,
                        },
                      ]}
                    >
                      15
                    </Text>
                  </Pressable>
                </View>

                <Text style={[styles.timeText, { color: colors.textMuted, fontFamily: FontFamily.mono, textAlign: 'right' }]}>
                  {formatTime(duration)}
                </Text>
              </View>
            </>
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

AudioPlayer.displayName = 'AudioPlayer';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  titleText: {
    fontSize: 14,
    letterSpacing: -0.2,
  },
  subtitleText: {
    fontSize: 12,
    marginTop: 1,
  },
  speedButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  speedText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 40,
  },
  transportControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },
  skipLabel: {
    fontSize: 9,
    marginTop: -3,
    fontVariant: ['tabular-nums'],
  },
  playButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  // Error state styles — inline within the content area, not an overlay
  errorStateContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorStateText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 0,
  },
  retryButtonText: {
    fontSize: 13,
    color: '#fff',
  },
});

export default AudioPlayer;
