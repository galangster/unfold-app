import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  withDelay,
  withSpring,
  Easing,
  cancelAnimation,
  runOnJS,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import {
  PlayIcon,
  PauseIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  WarningCircleIcon,
  CheckIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useBottomTabBarHeight as _useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

// Safe wrapper — returns 0 if not inside a tab navigator
function useBottomTabBarHeightSafe(): number {
  try {
    return _useBottomTabBarHeight();
  } catch {
    return 80; // reasonable default for iOS tab bar
  }
}
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { streamDevotionalAudio } from '@/lib/cartesia';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { KaraokeView } from './KaraokeView';

const SKIP_SECONDS = 10;

/** Convert hex color to r,g,b string for rgba() usage */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

interface AudioPlayerProps {
  title: string;
  subtitle: string;
  content: string;
  scriptureReference: string;
  scriptureText: string;
  voiceId: string;
  isPremium: boolean;
  onClose: () => void;
  onFollowAlong?: () => void;
}

/* ─── Speed Picker Popup ─── */
function SpeedPicker({
  visible,
  currentSpeed,
  onSelect,
  onClose,
  colors,
  isDark,
}: {
  visible: boolean;
  currentSpeed: PlaybackSpeed;
  onSelect: (speed: PlaybackSpeed) => void;
  onClose: () => void;
  colors: any;
  isDark: boolean;
}) {
  if (!visible) return null;

  return (
    <>
      {/* Backdrop to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        style={[
          styles.speedPickerContainer,
          {
            backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.5 : 0.15,
            shadowRadius: 16,
            elevation: 8,
          },
        ]}
      >
        {PLAYBACK_SPEEDS.map((speed) => {
          const isActive = speed === currentSpeed;
          return (
            <Pressable
              key={speed}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(speed);
              }}
              style={[
                styles.speedPickerItem,
                isActive && {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.04)',
                },
              ]}
            >
              <Text
                style={[
                  styles.speedPickerText,
                  {
                    color: isActive ? colors.accent : colors.text,
                    fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                  },
                ]}
              >
                {speed}x
              </Text>
              {isActive && (
                <CheckIcon size={14} color={colors.accent} weight="bold" />
              )}
            </Pressable>
          );
        })}
      </Animated.View>
    </>
  );
}

/* ─── Main Audio Player ─── */
export const AudioPlayer = forwardRef<BottomSheet, AudioPlayerProps>(
  (
    {
      title,
      subtitle,
      content,
      scriptureReference,
      scriptureText,
      voiceId,
      isPremium,
      onClose,
      onFollowAlong: _onFollowAlong,
    },
    ref
  ) => {
    const { colors, isDark } = useTheme();
    const tabBarHeight = useBottomTabBarHeightSafe();

    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [currentSpeed, setCurrentSpeed] = useState<PlaybackSpeed>(1);
    const [showSpeedPicker, setShowSpeedPicker] = useState(false);
    const [showKaraoke, setShowKaraoke] = useState(false);

    const audioUrlRef = useRef<string | null>(null);
    const isLoadingRef = useRef(false);
    const shouldAutoplayRef = useRef(false);
    const replaceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animated values
    const progressAnim = useSharedValue(0);
    const loadingProgress = useSharedValue(0);
    const scrubProgress = useSharedValue(0);
    const isScrubbing = useSharedValue(0); // 0 = false, 1 = true
    const barWidth = useSharedValue(300);

    // Button press micro-interactions — spring scale
    const playButtonScale = useSharedValue(1);
    const skipBackScale = useSharedValue(1);
    const skipForwardScale = useSharedValue(1);
    const playButtonAnimStyle = useAnimatedStyle(() => ({
      transform: [{ scale: playButtonScale.value }],
    }));
    const skipBackAnimStyle = useAnimatedStyle(() => ({
      transform: [{ scale: skipBackScale.value }],
    }));
    const skipForwardAnimStyle = useAnimatedStyle(() => ({
      transform: [{ scale: skipForwardScale.value }],
    }));

    // Sparkle icon subtle pulse animation
    const sparkleScale = useSharedValue(1);
    const sparkleOpacity = useSharedValue(0.85);

    useEffect(() => {
      sparkleScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      sparkleOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 1800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      return () => {
        cancelAnimation(sparkleScale);
        cancelAnimation(sparkleOpacity);
      };
    }, []);

    const sparkleAnimStyle = useAnimatedStyle(() => ({
      transform: [{ scale: sparkleScale.value }],
      opacity: sparkleOpacity.value,
    }));

    // Persistent player — source loaded via player.replace() after download
    const player = useAudioPlayer(null, { updateInterval: 50 });

    // Poll player.currentStatus directly — useAudioPlayerStatus event hook
    // doesn't reliably emit updates in this Expo SDK version
    const [status, setStatus] = useState(() => player.currentStatus);
    const isMountedRef = useRef(true);
    useEffect(() => {
      isMountedRef.current = true;
      setStatus(player.currentStatus);
      const interval = setInterval(() => {
        if (!isMountedRef.current) return;
        try {
          const s = player.currentStatus;
          setStatus((prev: any) => {
            if (
              prev.isLoaded !== s.isLoaded ||
              prev.playing !== s.playing ||
              prev.playbackState !== s.playbackState ||
              Math.abs(prev.currentTime - s.currentTime) > 0.02 ||
              Math.abs(prev.duration - s.duration) > 0.1 ||
              prev.didJustFinish !== s.didJustFinish
            ) {
              return s;
            }
            return prev;
          });
        } catch {
          // Player may be destroyed — ignore
        }
      }, 100);
      return () => {
        isMountedRef.current = false;
        clearInterval(interval);
      };
    }, [player]);

    const isPlaying = status.playing;
    const currentTime = status.currentTime * 1000;
    const duration = status.duration * 1000;

    const snapPoints = useMemo(() => ['52%'], []);

    // Scripture first in audio, matching the visual reading order
    const fullText = useMemo(() => {
      return `${scriptureReference}.\n${scriptureText}\n\n${content}`;
    }, [content, scriptureReference, scriptureText]);

    useEffect(() => {
      void setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        allowsRecording: false,
        interruptionMode: 'duckOthers',
        shouldRouteThroughEarpiece: false,
      });
    }, []);

    useEffect(() => {
      audioUrlRef.current = audioUrl;
    }, [audioUrl]);

    // Autoplay: when player loads after download, auto-play once
    useEffect(() => {
      if (!shouldAutoplayRef.current) return;
      const audioReady = status.isLoaded || status.playing || status.duration > 0;
      if (!audioReady) return;
      shouldAutoplayRef.current = false;
      if (replaceTimeoutRef.current) {
        clearTimeout(replaceTimeoutRef.current);
        replaceTimeoutRef.current = null;
      }
      console.log('[AudioPlayer] ▶️ auto-playing');
      try { player.play(); } catch {}
    }, [status.isLoaded, status.duration, player]);

    // Detect playback failure — expo-audio's AudioPlayer.swift never emits .failed
    // but currentStatus getter does include playbackState as a string
    useEffect(() => {
      if ((status as any).playbackState === 'failed' && audioUrl && !hasError) {
        console.log('[AudioPlayer] playbackState=failed detected');
        setHasError(true);
        setErrorMessage('Audio format error. Tap to retry.');
        if (replaceTimeoutRef.current) {
          clearTimeout(replaceTimeoutRef.current);
          replaceTimeoutRef.current = null;
        }
      }
    }, [(status as any).playbackState, audioUrl, hasError]);

    // Smooth progress bar driven by playback
    useEffect(() => {
      if (duration > 0 && isScrubbing.value === 0) {
        const percent = Math.min((currentTime / duration) * 100, 100);
        progressAnim.value = withTiming(percent, {
          duration: 80,
          easing: Easing.linear,
        });
      } else if (duration <= 0) {
        progressAnim.value = 0;
      }
    }, [currentTime, duration]);

    // Auto-collapse when audio finishes
    useEffect(() => {
      if (status.didJustFinish) {
        Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_COMPLETED, {
          voice_id: voiceId,
        });
      }
    }, [status.didJustFinish, voiceId]);

    useEffect(() => {
      return () => {
        try { player.pause(); } catch {}
        audioUrlRef.current = null;
        shouldAutoplayRef.current = false;
        if (replaceTimeoutRef.current) {
          clearTimeout(replaceTimeoutRef.current);
          replaceTimeoutRef.current = null;
        }
      };
    }, [player]);

    // Auto-load for premium
    useEffect(() => {
      if (isPremium && !audioUrl && !hasError) {
        loadAndPlayAudio();
      } else if (!isPremium) {
        setHasError(true);
        setErrorMessage('Audio playback is a premium feature. Upgrade to listen.');
      }
    }, []);

    // Progressive loading bar
    useEffect(() => {
      const audioReady = status.isLoaded || status.playing || status.duration > 0;
      if (isLoading || (audioUrl != null && !audioReady)) {
        loadingProgress.value = 0;
        loadingProgress.value = withSequence(
          withTiming(15, { duration: 3000, easing: Easing.out(Easing.quad) }),
          withTiming(40, { duration: 30000, easing: Easing.linear }),
          withTiming(65, { duration: 50000, easing: Easing.linear }),
          withTiming(85, { duration: 60000, easing: Easing.linear })
        );
      } else {
        cancelAnimation(loadingProgress);
        loadingProgress.value = 0;
      }
    }, [isLoading, audioUrl, status.isLoaded, status.playing, status.duration]);

    // status.isLoaded may not update when using player.replace() on a null-initialized player.
    // Use status.playing or status.duration > 0 as fallback indicators that audio is loaded.
    const isAudioReady = status.isLoaded || status.playing || status.duration > 0;
    const isBuffering = isLoading || (audioUrl != null && !isAudioReady);

    const loadAndPlayAudio = useCallback(async () => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      try {
        setIsLoading(true);
        setHasError(false);
        setErrorMessage('');
        progressAnim.value = 0;

        if (audioUrlRef.current) {
          try { player.pause(); } catch {}
          audioUrlRef.current = null;
        }

        const resolvedVoiceId =
          voiceId === 'default'
            ? '694f9389-aac1-45b6-b726-9d9369183238'
            : voiceId;

        Analytics.logEvent(AnalyticsEvents.AUDIO_PLAY_STARTED, {
          voice_id: resolvedVoiceId,
        });

        console.log(`[AudioPlayer] calling streamDevotionalAudio — textLen=${fullText.length}, voiceId=${resolvedVoiceId}`);
        const result = await streamDevotionalAudio(fullText, resolvedVoiceId);

        if (!isMountedRef.current) return;

        // Load the audio into the persistent player via replace()
        shouldAutoplayRef.current = true;
        setAudioUrl(result.audioUrl);
        audioUrlRef.current = result.audioUrl;
        try {
          player.replace({ uri: result.audioUrl });
        } catch (replaceErr) {
          logger.log(`[AudioPlayer] replace() error:`, replaceErr);
        }

        // 15s timeout safety net — if audio never loads, show error with retry
        if (replaceTimeoutRef.current) clearTimeout(replaceTimeoutRef.current);
        replaceTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          // Check if audio is still not ready
          try {
            const s = player.currentStatus;
            const ready = s.isLoaded || s.playing || s.duration > 0;
            if (!ready && !hasError) {
              console.log('[AudioPlayer] 15s timeout — audio never loaded');
              setHasError(true);
              setErrorMessage('Audio took too long to load. Tap to retry.');
            }
          } catch {}
          replaceTimeoutRef.current = null;
        }, 15000);
      } catch (error) {
        if (!isMountedRef.current) return;
        console.log('[AudioPlayer] ❌ loadAndPlayAudio error:', error);
        logger.error('Error loading audio:', error);
        setHasError(true);
        if (error instanceof Error) {
          if (error.message.includes('Network') || error.message.includes('fetch') || error.message.includes('abort')) {
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
        if (isMountedRef.current) {
          setIsLoading(false);
        }
        isLoadingRef.current = false;
      }
    }, [fullText, voiceId, player]);

    const handleRetry = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setHasError(false);
      setErrorMessage('');
      loadAndPlayAudio();
    }, [loadAndPlayAudio]);

    const togglePlayback = useCallback(async () => {
      const audioReady = status.isLoaded || status.playing || status.duration > 0;
      if (!audioUrl || !audioReady) {
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
          if (
            status.duration > 0 &&
            Math.abs(status.currentTime - status.duration) < 0.05
          ) {
            await player.seekTo(0);
          }
          player.play();
        }
      } catch (error) {
        logger.error('Error toggling playback:', error);
      }
    }, [audioUrl, status, loadAndPlayAudio, player, currentTime]);

    const skipBack = useCallback(async () => {
      if (!audioUrl || !(status.isLoaded || status.playing || status.duration > 0)) return;
      try {
        const newPos = Math.max(0, status.currentTime - SKIP_SECONDS);
        await player.seekTo(newPos);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        logger.error('Error skipping back:', error);
      }
    }, [audioUrl, status.isLoaded, status.currentTime, player]);

    const skipForward = useCallback(async () => {
      if (!audioUrl || !(status.isLoaded || status.playing || status.duration > 0) || status.duration <= 0) return;
      try {
        const newPos = Math.min(status.duration, status.currentTime + SKIP_SECONDS);
        await player.seekTo(newPos);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        logger.error('Error skipping forward:', error);
      }
    }, [audioUrl, status.isLoaded, status.currentTime, status.duration, player]);

    const selectSpeed = useCallback(
      (speed: PlaybackSpeed) => {
        setCurrentSpeed(speed);
        setShowSpeedPicker(false);
        try {
          player.setPlaybackRate(speed);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (error) {
          logger.error('Error setting playback rate:', error);
        }
      },
      [player]
    );

    // Seek to a percentage (called from gesture via runOnJS)
    const seekToPercent = useCallback(
      async (pct: number) => {
        if (!audioUrl || status.duration <= 0) return;
        const newPositionSec = Math.min((pct / 100) * status.duration, status.duration - 0.05);
        try {
          await player.seekTo(Math.max(0, newPositionSec));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (error) {
          logger.error('Error seeking:', error);
        }
      },
      [audioUrl, status.duration, player]
    );

    const handleClose = useCallback(() => {
      setShowKaraoke(false);
      onClose();
    }, [onClose]);

    const formatTime = useCallback((ms: number) => {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const remainingSeconds = totalSeconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }, []);

    /* ─── Scrubber gesture ─── */
    const scrubGesture = useMemo(
      () =>
        Gesture.Pan()
          .minDistance(0)
          .onBegin((e) => {
            'worklet';
            isScrubbing.value = 1;
            const pct = Math.max(0, Math.min(100, (e.x / barWidth.value) * 100));
            scrubProgress.value = pct;
          })
          .onUpdate((e) => {
            'worklet';
            const pct = Math.max(0, Math.min(100, (e.x / barWidth.value) * 100));
            scrubProgress.value = pct;
          })
          .onFinalize(() => {
            'worklet';
            const pct = scrubProgress.value;
            isScrubbing.value = 0;
            runOnJS(seekToPercent)(pct);
          }),
      [seekToPercent]
    );

    const handleBarLayout = useCallback(
      (e: { nativeEvent: { layout: { width: number } } }) => {
        barWidth.value = e.nativeEvent.layout.width;
      },
      []
    );

    /* ─── Animated styles ─── */
    const progressFillStyle = useAnimatedStyle(() => {
      const pct = isScrubbing.value === 1 ? scrubProgress.value : progressAnim.value;
      return { width: `${pct}%` as `${number}%` };
    });

    const progressThumbStyle = useAnimatedStyle(() => {
      const pct = isScrubbing.value === 1 ? scrubProgress.value : progressAnim.value;
      const scale = isScrubbing.value === 1 ? 1.6 : 1;
      return {
        left: `${pct}%` as `${number}%`,
        transform: [{ translateX: -7 }, { scale }],
        opacity: pct > 0 || isScrubbing.value === 1 ? 1 : 0,
      };
    });

    const loadingBarStyle = useAnimatedStyle(() => ({
      width: `${loadingProgress.value}%` as `${number}%`,
    }));

    return (
      <>
        <BottomSheet
          ref={ref}
          index={0}
          snapPoints={snapPoints}
          bottomInset={tabBarHeight}
          enablePanDownToClose={true}
          enableOverDrag={false}
          onClose={handleClose}
          backgroundStyle={{ backgroundColor: 'transparent' }}
          handleStyle={{ backgroundColor: 'transparent' }}
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
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? 'rgba(0,0,0,0.85)'
                    : 'rgba(255,255,255,0.92)',
                },
              ]}
            />

            <View style={styles.content}>
              {/* Error state */}
              {hasError ? (
                <View style={styles.errorContainer}>
                  <WarningCircleIcon size={28} color={colors.error} weight="light" />
                  <Text
                    style={[
                      styles.errorText,
                      { color: colors.text, fontFamily: FontFamily.body },
                    ]}
                    numberOfLines={2}
                  >
                    {errorMessage}
                  </Text>
                  {isPremium && (
                    <Pressable
                      onPress={handleRetry}
                      style={[styles.retryButton, { backgroundColor: colors.accent }]}
                    >
                      <ArrowsClockwiseIcon size={14} color="#fff" weight="light" />
                      <Text
                        style={[
                          styles.retryButtonText,
                          { fontFamily: FontFamily.uiSemiBold },
                        ]}
                      >
                        Try again
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <>
                  {/* Title, subtitle, speed + listen-along icon */}
                  <View style={styles.titleRow}>
                    <View style={styles.titleTextContainer}>
                      <Text
                        style={[
                          styles.titleText,
                          {
                            color: colors.text,
                            fontFamily: FontFamily.uiSemiBold,
                          },
                        ]}
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
                    {/* Listen Along sparkle — animated pulse */}
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowKaraoke(true);
                      }}
                      style={styles.listenAlongIcon}
                    >
                      <Animated.View style={sparkleAnimStyle}>
                        <SparkleIcon size={20} color={colors.accent} weight="fill" />
                      </Animated.View>
                    </Pressable>
                    {/* Speed button — opens picker */}
                    <Pressable
                      onPress={() => setShowSpeedPicker((v) => !v)}
                      style={[
                        styles.speedButton,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(0,0,0,0.06)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.speedText,
                          {
                            color: colors.text,
                            fontFamily: FontFamily.uiSemiBold,
                          },
                        ]}
                      >
                        {currentSpeed === 1 ? '1x' : `${currentSpeed}x`}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Progress bar — draggable */}
                  <View style={styles.progressSection}>
                    <GestureDetector gesture={scrubGesture}>
                      <Animated.View
                        onLayout={handleBarLayout}
                        style={[
                          styles.progressBarHitArea,
                          { backgroundColor: 'transparent' },
                        ]}
                      >
                        <View
                          style={[
                            styles.progressBarTrack,
                            { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                          ]}
                        >
                          {isBuffering ? (
                            <Animated.View
                              style={[
                                styles.progressFill,
                                { backgroundColor: colors.accent },
                                loadingBarStyle,
                              ]}
                            />
                          ) : (
                            <Animated.View
                              style={[
                                styles.progressFill,
                                { backgroundColor: colors.accent },
                                progressFillStyle,
                              ]}
                            />
                          )}
                        </View>
                        {/* Thumb */}
                        {!isBuffering && (
                          <Animated.View
                            style={[
                              styles.progressThumb,
                              { backgroundColor: colors.accent },
                              progressThumbStyle,
                            ]}
                          />
                        )}
                      </Animated.View>
                    </GestureDetector>

                    {/* Time labels */}
                    <View style={styles.timeRow}>
                      <Text
                        style={[
                          styles.timeText,
                          { color: colors.textMuted, fontFamily: FontFamily.mono },
                        ]}
                      >
                        {formatTime(currentTime)}
                      </Text>
                      <Text
                        style={[
                          styles.timeText,
                          {
                            color: colors.textMuted,
                            fontFamily: FontFamily.mono,
                            textAlign: 'right',
                          },
                        ]}
                      >
                        {formatTime(duration)}
                      </Text>
                    </View>
                  </View>

                  {/* Transport controls */}
                  <View style={styles.transportControls}>
                    <Animated.View style={skipBackAnimStyle}>
                      <Pressable
                        onPress={skipBack}
                        onPressIn={() => {
                          skipBackScale.value = withSpring(0.85, { damping: 15, stiffness: 400 });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        onPressOut={() => {
                          skipBackScale.value = withSpring(1, { damping: 15, stiffness: 400 });
                        }}
                        style={styles.skipButton}
                        disabled={isLoading || !isAudioReady}
                      >
                        <ArrowCounterClockwiseIcon
                          size={20}
                          color={
                            isAudioReady ? colors.text : colors.textMuted
                          }
                          weight="light"
                        />
                        <Text
                          style={[
                            styles.skipLabel,
                            {
                              color: isAudioReady
                                ? colors.text
                                : colors.textMuted,
                              fontFamily: FontFamily.uiSemiBold,
                            },
                          ]}
                        >
                          {SKIP_SECONDS}
                        </Text>
                      </Pressable>
                    </Animated.View>

                    <Animated.View style={playButtonAnimStyle}>
                      <Pressable
                        onPress={togglePlayback}
                        onPressIn={() => {
                          playButtonScale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }}
                        onPressOut={() => {
                          playButtonScale.value = withSpring(1, { damping: 15, stiffness: 400 });
                        }}
                        style={[
                          styles.playButton,
                          { backgroundColor: colors.accent },
                        ]}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : isPlaying ? (
                          <PauseIcon size={22} color="#fff" weight="fill" />
                        ) : (
                          <PlayIcon
                            size={22}
                            color="#fff"
                            weight="fill"
                            style={{ marginLeft: -2 }}
                          />
                        )}
                      </Pressable>
                    </Animated.View>

                    <Animated.View style={skipForwardAnimStyle}>
                      <Pressable
                        onPress={skipForward}
                        onPressIn={() => {
                          skipForwardScale.value = withSpring(0.85, { damping: 15, stiffness: 400 });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        onPressOut={() => {
                          skipForwardScale.value = withSpring(1, { damping: 15, stiffness: 400 });
                        }}
                        style={styles.skipButton}
                        disabled={isLoading || !isAudioReady}
                      >
                        <ArrowClockwiseIcon
                          size={20}
                          color={
                            isAudioReady ? colors.text : colors.textMuted
                          }
                          weight="light"
                        />
                        <Text
                          style={[
                            styles.skipLabel,
                            {
                              color: isAudioReady
                                ? colors.text
                                : colors.textMuted,
                              fontFamily: FontFamily.uiSemiBold,
                            },
                          ]}
                        >
                          {SKIP_SECONDS}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  </View>

                </>
              )}
            </View>

            {/* Speed Picker popup (renders above speed button) */}
            <SpeedPicker
              visible={showSpeedPicker}
              currentSpeed={currentSpeed}
              onSelect={selectSpeed}
              onClose={() => setShowSpeedPicker(false)}
              colors={colors}
              isDark={isDark}
            />
          </BottomSheetView>
        </BottomSheet>

        {/* Karaoke full-screen overlay */}
        <KaraokeView
          visible={showKaraoke}
          onClose={() => setShowKaraoke(false)}
          title={title}
          scriptureReference={scriptureReference}
          scriptureText={scriptureText}
          bodyText={content}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onTogglePlayback={togglePlayback}
        />
      </>
    );
  }
);

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
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  /* Title row */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  titleTextContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  subtitleText: {
    fontSize: 12,
    marginTop: 2,
  },
  speedButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    flexShrink: 0,
  },
  speedText: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  /* Progress section */
  progressSection: {
    marginBottom: 8,
  },
  progressBarHitArea: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: 7, // center in 28px hit area: (28 - 14) / 2 = 7
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    width: 40,
  },
  /* Transport controls */
  transportControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 16,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  skipLabel: {
    fontSize: 9,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  /* Listen Along icon */
  listenAlongIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Error state */
  errorContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
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
  /* Speed picker popup */
  speedPickerContainer: {
    position: 'absolute',
    right: 24,
    top: 80,
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 120,
    zIndex: 100,
  },
  speedPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  speedPickerText: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});

export default AudioPlayer;
