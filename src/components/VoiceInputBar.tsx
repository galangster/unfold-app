/**
 * VoiceInputBar
 *
 * Claude-style microphone → animated waveform → X / ✓ flow.
 * Drop this anywhere near a TextInput — idle shows a mic icon,
 * tap starts recording, ✓ appends transcript to existing value.
 *
 * Uses expo-speech-recognition (pre-installed) for native iOS STT.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { MicrophoneIcon, XIcon, CheckIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *   Idle       mic icon button — tap to start
 *   0ms        recording bar fades in (200ms)
 *   +80ms ea.  5 bars stagger into their breathing loops
 *   loop       each bar cycles min→max→min height every 600-900ms
 *   on stop    bars freeze, transcript merged into field value
 * ───────────────────────────────────────────────────────── */

const BAR_COUNT = 5;
const BAR_MIN_H = 4;
const BAR_MAX_H = 26;

const BAR_DURATIONS = [700, 550, 800, 600, 720] as const;
const BAR_DELAYS    = [0,   80,  160, 40,  240] as const;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Single animated bar ──────────────────────────────────
function WaveBar({ barIndex, accent }: { barIndex: number; accent: string }) {
  const height = useSharedValue(BAR_MIN_H);

  useEffect(() => {
    height.value = withDelay(
      BAR_DELAYS[barIndex],
      withRepeat(
        withSequence(
          withTiming(BAR_MAX_H, {
            duration: BAR_DURATIONS[barIndex],
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(BAR_MIN_H, {
            duration: BAR_DURATIONS[barIndex],
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );
    return () => { height.value = BAR_MIN_H; };
  }, [barIndex]);

  const barStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[styles.bar, barStyle, { backgroundColor: accent }]} />
  );
}

// ── Props ────────────────────────────────────────────────
interface VoiceInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  accentColor?: string;
  /** Place mic icon inside the input card (absolute bottom-right) instead of below it */
  inline?: boolean;
}

// ── Component ────────────────────────────────────────────
export function VoiceInputBar({ value, onChangeText, accentColor, inline }: VoiceInputBarProps) {
  const { colors } = useTheme();
  const accent = accentColor ?? colors.accent;

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const MAX_DURATION_SECONDS = 60;

  // Use refs to avoid stale closures in event callbacks
  const isRecordingRef = useRef(false);
  const userStoppedRef = useRef(false); // distinguishes user-stop vs silence-stop
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChangeText);

  // Keep refs in sync
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChangeText; }, [onChangeText]);

  // ── STT events ───────────────────────────────────────────
  useSpeechRecognitionEvent('result', (e) => {
    if (!isRecordingRef.current) return; // Only the active recording instance processes results
    const transcript = e.results?.[0]?.transcript ?? '';
    interimTranscriptRef.current = transcript;
    if (e.isFinal) {
      finalTranscriptRef.current = transcript;
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!isRecordingRef.current) return; // Only the active recording instance handles errors
    if (e.error !== 'no-speech') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    resetRecordingState();
  });

  useSpeechRecognitionEvent('end', () => {
    if (isRecordingRef.current && !userStoppedRef.current) {
      // STT ended on its own (silence) — restart so pauses don't kill the session
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
      });
    }
  });

  // ── Helpers ──────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetRecordingState = useCallback(() => {
    isRecordingRef.current = false;
    userStoppedRef.current = false;
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    clearTimer();
    setIsRecording(false);
    setElapsedSeconds(0);
  }, [clearTimer]);

  const doCommit = useCallback(() => {
    const transcript = (finalTranscriptRef.current || interimTranscriptRef.current).trim();
    if (transcript) {
      const base = valueRef.current;
      const separator = base.trim() ? ' ' : '';
      onChangeRef.current(base + separator + transcript);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    resetRecordingState();
  }, [resetRecordingState]);

  // ── Lifecycle ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimer();
      if (isRecordingRef.current) ExpoSpeechRecognitionModule.stop();
    };
  }, [clearTimer]);

  // ── Start ────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    isRecordingRef.current = true;
    setIsRecording(true);
    setElapsedSeconds(0);

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      maxAlternatives: 1,
      continuous: true,
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_DURATION_SECONDS) {
          // Safety net — auto-commit after max duration
          userStoppedRef.current = true;
          ExpoSpeechRecognitionModule.stop();
          // Slight delay to let final result arrive before committing
          setTimeout(() => doCommit(), 200);
        }
        return next;
      });
    }, 1000);
  }, [doCommit]);

  // ── Cancel ───────────────────────────────────────────────
  const cancelRecording = useCallback(() => {
    userStoppedRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetRecordingState();
  }, [resetRecordingState]);

  // ── Accept ───────────────────────────────────────────────
  const acceptRecording = useCallback(() => {
    userStoppedRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    doCommit();
  }, [doCommit]);

  // ── Idle state ───────────────────────────────────────────
  if (!isRecording) {
    return (
      <TouchableOpacity
        onPress={startRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Tap to speak"
        style={inline ? styles.micButtonInline : styles.micButton}
      >
        <View style={[styles.micInner, { backgroundColor: alpha(accent, 0.09), borderColor: alpha(accent, 0.19) }]}>
          <MicrophoneIcon size={18} color={accent} weight="light" />
        </View>
      </TouchableOpacity>
    );
  }

  // ── Recording state ──────────────────────────────────────
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={[styles.recordingBar, { backgroundColor: colors.inputBackground, borderColor: alpha(accent, 0.25) }]}
    >
      {/* Cancel ✕ */}
      <TouchableOpacity
        onPress={cancelRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Cancel voice input"
        style={styles.actionButton}
      >
        <View style={[styles.actionInner, { backgroundColor: colors.buttonBackground }]}>
          <XIcon size={16} color={colors.textMuted} weight="light" />
        </View>
      </TouchableOpacity>

      {/* Waveform + timer */}
      <View style={styles.waveformArea}>
        <View style={styles.barsContainer}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <WaveBar key={i} barIndex={i} accent={accent} />
          ))}
        </View>
        <Text style={[styles.timer, { color: colors.textSubtle }]}>
          {formatTimer(elapsedSeconds)}
        </Text>
      </View>

      {/* Accept ✓ */}
      <TouchableOpacity
        onPress={acceptRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Accept voice input"
        style={styles.actionButton}
      >
        <View style={[styles.actionInner, { backgroundColor: accent }]}>
          <CheckIcon size={16} color={colors.background} weight="bold" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  micButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  micButtonInline: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  micInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBar: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  waveformArea: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 32,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  timer: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  actionButton: {
    flexShrink: 0,
  },
  actionInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
