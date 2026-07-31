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
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { MicrophoneIcon, XIcon, CheckIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { Duration, Ease } from '@/constants/animations';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { pauseForVoiceInput, resumeAfterVoiceInput } from '@/hooks/useGlobalAudioPlayer';

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
const FINAL_RESULT_FLUSH_MS = 200;

const BAR_DURATIONS = [700, 550, 800, 600, 720] as const;
const BAR_DELAYS    = [0,   80,  160, 40,  240] as const;

let activeRecorder: symbol | null = null;
let activeRecorderHandoff: (() => void) | null = null;
/** Narration paused because dictation took the audio session; resume when the last owner ends. */
let narrationPausedForDictation = false;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function joinTranscriptParts(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
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
  /** Start recording immediately on mount (skip idle mic button state) */
  autoStart?: boolean;
  /** Called when recording is cancelled — lets parent exit voice mode */
  onCancel?: () => void;
  /** Called when the mic permission is denied — lets parent exit voice mode
   * and explain, instead of silently doing nothing */
  onPermissionDenied?: () => void;
}

// ── Component ────────────────────────────────────────────
export function VoiceInputBar({ value, onChangeText, accentColor, inline, autoStart, onCancel, onPermissionDenied }: VoiceInputBarProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const accent = accentColor ?? colors.accent;

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const MAX_DURATION_SECONDS = 60;

  // Use refs to avoid stale closures in event callbacks
  const instanceId = useRef<symbol>(Symbol('voiceInput'));
  const isRecordingRef = useRef(false);
  const userStoppedRef = useRef(false); // distinguishes user-stop vs silence-stop
  const committedSegmentsRef = useRef('');
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChangeText);

  // Keep refs in sync
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChangeText; }, [onChangeText]);

  const commitCurrentSegment = useCallback(() => {
    const transcript = (finalTranscriptRef.current || interimTranscriptRef.current).trim();
    if (!transcript) return;

    committedSegmentsRef.current = joinTranscriptParts(committedSegmentsRef.current, transcript);
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
  }, []);

  // ── STT events ───────────────────────────────────────────
  useSpeechRecognitionEvent('result', (e) => {
    if (!isRecordingRef.current || activeRecorder !== instanceId.current) return; // Only the owning recording instance processes results
    const transcript = e.results?.[0]?.transcript ?? '';
    interimTranscriptRef.current = transcript;
    if (e.isFinal) {
      finalTranscriptRef.current = transcript;
      commitCurrentSegment();
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!isRecordingRef.current || activeRecorder !== instanceId.current) return; // Only the owning recording instance handles errors
    if (e.error !== 'no-speech') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    resetRecordingState();
  });

  useSpeechRecognitionEvent('end', () => {
    if (isRecordingRef.current && activeRecorder === instanceId.current && !userStoppedRef.current) {
      // STT ended on its own (silence) — restart so pauses don't kill the session
      commitCurrentSegment();
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
    if (activeRecorder === instanceId.current) {
      activeRecorder = null;
      activeRecorderHandoff = null;
    }
    if (activeRecorder === null) {
      // Last owner ended: STT flipped the shared AVAudioSession into record
      // mode — re-arm playback mode, and resume narration if dictation paused it.
      const shouldResume = narrationPausedForDictation;
      narrationPausedForDictation = false;
      void resumeAfterVoiceInput(shouldResume);
    }
    isRecordingRef.current = false;
    userStoppedRef.current = false;
    committedSegmentsRef.current = '';
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    clearTimer();
    setIsRecording(false);
    setElapsedSeconds(0);
  }, [clearTimer]);

  const doCommit = useCallback(() => {
    const transcript = joinTranscriptParts(
      committedSegmentsRef.current,
      finalTranscriptRef.current || interimTranscriptRef.current,
    );
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
      if (activeRecorder === instanceId.current) {
        activeRecorder = null;
        activeRecorderHandoff = null;
        if (isRecordingRef.current) ExpoSpeechRecognitionModule.stop();
        const shouldResume = narrationPausedForDictation;
        narrationPausedForDictation = false;
        void resumeAfterVoiceInput(shouldResume);
      }
    };
  }, [clearTimer]);

  // ── Start ────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onPermissionDenied?.();
      return;
    }

    if (activeRecorder && activeRecorder !== instanceId.current) {
      // Hand off: commit the current owner's dictation to its own field
      // (spoken words must never silently vanish), then take the recognizer.
      // Claim ownership BEFORE the handoff so the outgoing owner's reset sees
      // a live owner and does not resume narration mid-handoff.
      const handoff = activeRecorderHandoff;
      activeRecorder = instanceId.current;
      activeRecorderHandoff = null;
      handoff?.();
      ExpoSpeechRecognitionModule.stop();
    }

    committedSegmentsRef.current = '';
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    activeRecorder = instanceId.current;
    activeRecorderHandoff = doCommit;
    isRecordingRef.current = true;
    setIsRecording(true);
    setElapsedSeconds(0);

    if (pauseForVoiceInput()) {
      narrationPausedForDictation = true;
    }

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
          setTimeout(() => doCommit(), FINAL_RESULT_FLUSH_MS);
        }
        return next;
      });
    }, 1000);
  }, [doCommit, resetRecordingState, onPermissionDenied]);

  // ── Auto-start on mount (when rendered from CompanionInput voice mode) ──
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStartedRef.current && !isRecordingRef.current) {
      autoStartedRef.current = true;
      startRecording();
    }
  }, [autoStart, startRecording]);

  // ── Cancel ───────────────────────────────────────────────
  const cancelRecording = useCallback(() => {
    userStoppedRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetRecordingState();
    onCancel?.();
  }, [resetRecordingState, onCancel]);

  // ── Accept ───────────────────────────────────────────────
  const acceptRecording = useCallback(() => {
    userStoppedRef.current = true;
    ExpoSpeechRecognitionModule.stop();
    setTimeout(() => doCommit(), FINAL_RESULT_FLUSH_MS);
  }, [doCommit]);

  // ── Idle state ───────────────────────────────────────────
  if (!isRecording) {
    // When auto-started from parent (CompanionInput), don't show idle mic — parent handles that
    if (autoStart) return null;

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
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
      exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
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
    marginTop: Spacing['2'],
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
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing['3'],
    paddingVertical: 10,
    gap: Spacing['3'],
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
