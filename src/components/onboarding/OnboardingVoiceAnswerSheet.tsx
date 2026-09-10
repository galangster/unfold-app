import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  StopCircleIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from '@/components/icons';
import { alpha } from '@/components/ui';
import type { ColorTheme } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { pauseForVoiceInput, resumeAfterVoiceInput } from '@/hooks/useGlobalAudioPlayer';
import {
  composeOnboardingVoiceDraft,
  ONBOARDING_VOICE_ANSWER_MAX_LENGTH,
  voiceAnswerAcceptance,
  voiceAnswerCountLabel,
} from '@/lib/onboarding-voice-answer';
import {
  deleteLocalVoiceAudio,
  transcribeVoiceInput,
  VoiceInputApiError,
} from '@/lib/voice-input';
import {
  VOICE_RECORDING_MAX_DURATION_MS,
  VOICE_RECORDING_OPTIONS,
  VOICE_WAVEFORM_BARS,
  buildWaveform,
  formatRecordingTime,
  meterToLevel,
} from '@/lib/voice-recording';

export type OnboardingVoiceAnswerPhase =
  | 'idle'
  | 'recording'
  | 'review'
  | 'transcribing'
  | 'transcript'
  | 'error';

type OnboardingVoiceErrorKind = 'microphone' | 'recording' | 'transcribe';

export interface OnboardingVoiceAnswerSheetProps {
  visible: boolean;
  autoStart?: boolean;
  onClose: () => void;
  existingText: string;
  onAccept: (text: string) => void;
  demoMode?: boolean;
  initialDemoPhase?: OnboardingVoiceAnswerPhase;
  demoTranscript?: string;
  previewColors?: ColorTheme;
  previewIsDark?: boolean;
}

const DEMO_DURATION_MS = 24_000;
const DEMO_TRANSCRIPT = 'I am a parent figuring out how to stay present, and I want my mornings to start more quietly.';
const WAVEFORM_BARS = VOICE_WAVEFORM_BARS;

function RoundIconButton({
  label,
  hint,
  onPress,
  color,
  backgroundColor,
  children,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  color: string;
  backgroundColor: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.roundButton, { backgroundColor, borderColor: alpha(color, 0.18) }]}
    >
      {children}
    </TouchableOpacity>
  );
}

export function OnboardingVoiceAnswerSheet({
  visible,
  autoStart = false,
  onClose,
  existingText,
  onAccept,
  demoMode = false,
  initialDemoPhase = 'idle',
  demoTranscript = DEMO_TRANSCRIPT,
  previewColors,
  previewIsDark,
}: OnboardingVoiceAnswerSheetProps) {
  const theme = useTheme();
  const colors = previewColors ?? theme.colors;
  const isDark = previewIsDark ?? theme.isDark;
  const reducedMotion = useReducedMotion();
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<OnboardingVoiceAnswerPhase>(demoMode ? initialDemoPhase : 'idle');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [recordedDurationMs, setRecordedDurationMs] = useState(demoMode && initialDemoPhase !== 'idle' ? DEMO_DURATION_MS : 0);
  const [demoElapsedMs, setDemoElapsedMs] = useState(initialDemoPhase === 'recording' ? 11_000 : 0);
  const [demoPlaybackMs, setDemoPlaybackMs] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [draft, setDraft] = useState(() => (
    demoMode && (initialDemoPhase === 'transcript' || initialDemoPhase === 'error')
      ? composeOnboardingVoiceDraft(existingText, demoTranscript)
      : ''
  ));
  const [errorMessage, setErrorMessage] = useState('Your recording is still on this device. Try again.');
  const [errorKind, setErrorKind] = useState<OnboardingVoiceErrorKind>('transcribe');
  const [isBusy, setIsBusy] = useState(false);

  const busyRef = useRef(false);
  const isClosingRef = useRef(false);
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);
  const visibleRef = useRef(visible);
  const generationRef = useRef(0);
  const transcribeControllerRef = useRef<AbortController | null>(null);
  const audioUriRef = useRef<string | null>(null);
  const narrationWasPlayingRef = useRef(false);
  const acceptedRef = useRef(false);
  const wasVisibleRef = useRef(false);
  visibleRef.current = visible;
  audioUriRef.current = audioUri;

  const recorder = useAudioRecorder({ ...VOICE_RECORDING_OPTIONS, directory: 'cache' });
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: false });
  const playerStatus = useAudioPlayerStatus(player);

  const invalidateAsync = useCallback(() => {
    generationRef.current += 1;
    transcribeControllerRef.current?.abort();
    transcribeControllerRef.current = null;
  }, []);

  const restoreNarration = useCallback(() => {
    const shouldResume = narrationWasPlayingRef.current;
    narrationWasPlayingRef.current = false;
    void resumeAfterVoiceInput(shouldResume);
  }, []);

  const resetSession = useCallback((nextPhase: OnboardingVoiceAnswerPhase = 'idle') => {
    setPhase(nextPhase);
    audioUriRef.current = null;
    setAudioUri(null);
    setRecordedDurationMs(0);
    setDemoElapsedMs(0);
    setDemoPlaybackMs(0);
    setDemoPlaying(false);
    setDraft('');
    setErrorMessage('');
    setIsBusy(false);
    busyRef.current = false;
  }, []);

  useEffect(() => {
    const justOpened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!justOpened) return;
    acceptedRef.current = false;
    narrationWasPlayingRef.current = pauseForVoiceInput();
    if (demoMode) {
      setPhase(initialDemoPhase);
      setDemoElapsedMs(initialDemoPhase === 'recording' ? 11_000 : 0);
      setRecordedDurationMs(initialDemoPhase === 'idle' ? 0 : DEMO_DURATION_MS);
      setDraft(
        initialDemoPhase === 'transcript' || initialDemoPhase === 'error'
          ? composeOnboardingVoiceDraft(existingText, demoTranscript)
          : '',
      );
      setDemoPlaybackMs(0);
      setDemoPlaying(false);
      setErrorKind('transcribe');
      setErrorMessage('Your recording is still on this device. Try again.');
      return;
    }
    setPhase('idle');
    setAudioUri(null);
    setRecordedDurationMs(0);
    setDraft('');
    setErrorMessage('');
  }, [demoMode, demoTranscript, existingText, initialDemoPhase, visible]);

  useEffect(() => {
    if (visible) return;
    autoStartedRef.current = false;
    restoreNarration();
  }, [restoreNarration, visible]);

  useEffect(() => () => {
    invalidateAsync();
    if (narrationWasPlayingRef.current) restoreNarration();
    if (!acceptedRef.current) deleteLocalVoiceAudio(audioUriRef.current);
  }, [invalidateAsync, restoreNarration]);

  useEffect(() => {
    mountedRef.current = true;
    const stopForLifecycle = async () => {
      if (!recorder.isRecording) return;
      const generation = generationRef.current;
      const durationMs = recorder.getStatus().durationMillis;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (!mountedRef.current || generation !== generationRef.current) return;
        const uri = recorder.uri;
        if (uri) {
          audioUriRef.current = uri;
          setAudioUri(uri);
          setRecordedDurationMs(Math.max(1_000, durationMs));
          player.replace(uri);
          setPhase('review');
        }
      } catch {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setErrorKind('recording');
        setErrorMessage('Recording stopped when the app became inactive, but its local file could not be prepared.');
        setPhase('error');
      }
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') void stopForLifecycle();
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
  }, [player, recorder]);

  useEffect(() => {
    if (!demoMode || phase !== 'recording' || !visible) return;
    const timer = setInterval(() => setDemoElapsedMs((value) => value + 100), 100);
    return () => clearInterval(timer);
  }, [demoMode, phase, visible]);

  useEffect(() => {
    if (!demoMode || !demoPlaying || phase !== 'review' || !visible) return;
    const timer = setInterval(() => {
      setDemoPlaybackMs((value) => {
        const next = value + 100;
        if (next >= recordedDurationMs) {
          setDemoPlaying(false);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [demoMode, demoPlaying, phase, recordedDurationMs, visible]);

  useEffect(() => {
    if (!playerStatus.didJustFinish) return;
    void player.seekTo(0);
  }, [player, playerStatus.didJustFinish]);

  const activeDurationMs = phase === 'recording'
    ? (demoMode ? demoElapsedMs : recorderState.durationMillis)
    : recordedDurationMs;
  const playbackMs = demoMode ? demoPlaybackMs : playerStatus.currentTime * 1000;
  const isPlaying = demoMode ? demoPlaying : playerStatus.playing;
  const meterLevel = demoMode
    ? 0.48 + Math.sin(demoElapsedMs / 480) * 0.22
    : meterToLevel(recorderState.metering);
  const waveform = useMemo(
    () => buildWaveform(phase === 'recording' ? meterLevel : 0.56, Math.floor((phase === 'recording' ? activeDurationMs : playbackMs) / 100)),
    [activeDurationMs, meterLevel, phase, playbackMs],
  );
  const acceptance = voiceAnswerAcceptance(draft);

  const startRecording = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setErrorMessage('');
    if (demoMode) {
      setDemoElapsedMs(0);
      setRecordedDurationMs(0);
      setDraft('');
      setPhase('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      busyRef.current = false;
      setIsBusy(false);
      return;
    }

    const generation = generationRef.current;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        if (!mountedRef.current || generation !== generationRef.current || !visibleRef.current) return;
        setErrorKind('microphone');
        setErrorMessage('Microphone access is off. You can still type your answer.');
        setPhase('error');
        return;
      }
      if (!visibleRef.current || generation !== generationRef.current) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      await recorder.prepareToRecordAsync();
      if (!mountedRef.current || !visibleRef.current || generation !== generationRef.current || AppState.currentState !== 'active') {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        return;
      }
      recorder.record();
      setAudioUri(null);
      setRecordedDurationMs(0);
      setDraft('');
      setPhase('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setErrorKind('microphone');
      setErrorMessage('The microphone could not start. You can still type your answer.');
      setPhase('error');
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        busyRef.current = false;
        setIsBusy(false);
      }
    }
  }, [demoMode, recorder]);

  useEffect(() => {
    if (!visible || !autoStart || demoMode || phase !== 'idle' || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startRecording();
  }, [autoStart, demoMode, phase, startRecording, visible]);

  const stopRecording = useCallback(async () => {
    if (phase !== 'recording' || busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    const generation = generationRef.current;
    try {
      if (demoMode) {
        setRecordedDurationMs(Math.max(1_000, demoElapsedMs));
      } else {
        const durationMs = recorderState.durationMillis;
        await recorder.stop();
        const uri = recorder.uri ?? recorderState.url;
        if (!uri) throw new Error('Recording URI unavailable');
        if (!mountedRef.current || generation !== generationRef.current || isClosingRef.current) {
          deleteLocalVoiceAudio(uri);
          return;
        }
        audioUriRef.current = uri;
        setAudioUri(uri);
        setRecordedDurationMs(Math.max(1_000, durationMs));
        player.replace(uri);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      }
      if (!mountedRef.current || generation !== generationRef.current) return;
      setPhase('review');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setErrorKind('recording');
      setErrorMessage('The recording stopped, but its local file could not be prepared. Try recording again.');
      setPhase('error');
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        busyRef.current = false;
        setIsBusy(false);
      }
    }
  }, [demoElapsedMs, demoMode, phase, player, recorder, recorderState.durationMillis, recorderState.url]);

  useEffect(() => {
    if (phase !== 'recording' || demoMode || recorderState.durationMillis < VOICE_RECORDING_MAX_DURATION_MS) return;
    void stopRecording();
  }, [demoMode, phase, recorderState.durationMillis, stopRecording]);

  const togglePlayback = useCallback(() => {
    if (demoMode) {
      setDemoPlaying((value) => !value);
    } else if (playerStatus.playing) {
      player.pause();
    } else {
      if (playerStatus.didJustFinish || playerStatus.currentTime >= playerStatus.duration) {
        void player.seekTo(0);
      }
      player.play();
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [demoMode, player, playerStatus.currentTime, playerStatus.didJustFinish, playerStatus.duration, playerStatus.playing]);

  const discard = useCallback(async () => {
    if (busyRef.current) return;
    invalidateAsync();
    try {
      if (!demoMode && recorderState.isRecording) await recorder.stop();
      player.pause();
    } catch {
      // Reset still clears local state if a stale file cannot be removed.
    } finally {
      if (!demoMode) deleteLocalVoiceAudio(audioUriRef.current);
    }
    Keyboard.dismiss();
    resetSession('idle');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [demoMode, invalidateAsync, player, recorder, recorderState.isRecording, resetSession]);

  const transcribe = useCallback(async () => {
    if (busyRef.current || phase === 'transcribing') return;
    Keyboard.dismiss();
    if (demoMode) {
      setDraft(composeOnboardingVoiceDraft(existingText, demoTranscript));
      setPhase('transcript');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    if (!audioUri) {
      setErrorKind('transcribe');
      setErrorMessage('The local recording file is missing. Record another answer to continue.');
      setPhase('error');
      return;
    }

    busyRef.current = true;
    setIsBusy(true);
    setPhase('transcribing');
    const generation = generationRef.current;
    const controller = new AbortController();
    transcribeControllerRef.current = controller;
    try {
      player.pause();
      const transcript = await transcribeVoiceInput(audioUri, recordedDurationMs, controller.signal);
      if (!mountedRef.current || generation !== generationRef.current || !visibleRef.current) return;
      setDraft(composeOnboardingVoiceDraft(existingText, transcript));
      setPhase('transcript');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current || !visibleRef.current) return;
      setErrorKind('transcribe');
      setErrorMessage(error instanceof VoiceInputApiError
        ? error.message
        : 'The recording could not be transcribed. Your recording is still on this device.');
      setPhase('error');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      if (transcribeControllerRef.current === controller) transcribeControllerRef.current = null;
      if (mountedRef.current && generation === generationRef.current) {
        busyRef.current = false;
        setIsBusy(false);
      }
    }
  }, [audioUri, demoMode, demoTranscript, existingText, phase, player, recordedDurationMs]);

  const acceptAnswer = useCallback(() => {
    if (busyRef.current || !voiceAnswerAcceptance(draft).canAccept) return;
    Keyboard.dismiss();
    acceptedRef.current = true;
    if (!demoMode) deleteLocalVoiceAudio(audioUriRef.current);
    const accepted = draft;
    invalidateAsync();
    resetSession('idle');
    onAccept(accepted);
    onClose();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [demoMode, draft, invalidateAsync, onAccept, onClose, resetSession]);

  const retryAfterError = useCallback(() => {
    if (recordedDurationMs > 0 || audioUri || demoMode) {
      setPhase('review');
    } else {
      setPhase('idle');
    }
    setErrorMessage('');
  }, [audioUri, demoMode, recordedDurationMs]);

  const closeSheet = useCallback(async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    invalidateAsync();
    Keyboard.dismiss();
    if (phase === 'recording') await stopRecording();
    else if (!demoMode && recorder.isRecording) {
      try { await recorder.stop(); } catch { /* closing still removes the local file below */ }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (!demoMode) {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (isPlaying) {
      if (demoMode) setDemoPlaying(false);
      else player.pause();
    }
    if (!demoMode && !acceptedRef.current) deleteLocalVoiceAudio(audioUriRef.current);
    resetSession('idle');
    onClose();
    isClosingRef.current = false;
  }, [demoMode, invalidateAsync, isPlaying, onClose, phase, player, recorder, resetSession, stopRecording]);

  const renderIdle = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <View style={[styles.micWell, { backgroundColor: alpha(colors.accent, 0.12), borderColor: alpha(colors.accent, 0.24) }]}>
        <MicrophoneIcon size={28} color={colors.accent} weight="regular" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Record your answer</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Speak a little about yourself. You can review the text before it is added.
      </Text>
      <TouchableOpacity
        activeOpacity={0.76}
        disabled={isBusy}
        onPress={() => void startRecording()}
        accessibilityRole="button"
        accessibilityLabel={demoMode ? 'Start demo recording' : 'Start recording your answer'}
        accessibilityHint={demoMode ? 'Starts a microphone-free preview' : 'Requests microphone access and starts recording'}
        style={[styles.primaryButton, { backgroundColor: colors.accent, opacity: isBusy ? 0.55 : 1 }]}
      >
        <MicrophoneIcon size={18} color={colors.background} weight="fill" />
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>Start recording</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderRecording = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <View style={styles.recordingStatusRow}>
        <View style={[styles.liveDot, { backgroundColor: colors.error }]} />
        <Text style={[styles.kicker, { color: colors.textMuted }]}>LISTENING</Text>
      </View>
      <Text accessibilityRole="timer" style={[styles.timer, { color: colors.text }]}>{formatRecordingTime(activeDurationMs)}</Text>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Recording ${formatRecordingTime(activeDurationMs)}`}
        style={[styles.waveform, { backgroundColor: alpha(colors.text, 0.035), borderColor: colors.border }]}
      >
        {waveform.map((bar, index) => (
          <View
            key={index}
            style={{
              width: 3,
              height: 8 + bar * 42,
              borderRadius: Radius.full,
              backgroundColor: index > WAVEFORM_BARS - 5 ? alpha(colors.accent, 0.42) : colors.accent,
            }}
          />
        ))}
      </View>
      <TouchableOpacity
        activeOpacity={0.76}
        disabled={isBusy}
        onPress={() => void stopRecording()}
        accessibilityRole="button"
        accessibilityLabel="Stop and review recording"
        accessibilityHint="Stops recording and opens playback review"
        style={[styles.stopButton, { backgroundColor: colors.text, opacity: isBusy ? 0.55 : 1 }]}
      >
        <StopCircleIcon size={20} color={colors.background} weight="fill" />
        <Text style={[styles.stopButtonText, { color: colors.background }]}>Stop & review</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  const renderReview = () => {
    const progress = recordedDurationMs > 0 ? Math.min(1, playbackMs / recordedDurationMs) : 0;
    return (
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
        <Text style={[styles.kicker, { color: colors.textMuted }]}>READY TO REVIEW</Text>
        <Text style={[styles.timer, { color: colors.text }]}>{formatRecordingTime(isPlaying ? playbackMs : recordedDurationMs)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause recording playback' : 'Play recording'}
          onPress={togglePlayback}
          style={[styles.playbackCard, { backgroundColor: alpha(colors.text, 0.035), borderColor: colors.border }]}
        >
          <View style={[styles.playButton, { backgroundColor: alpha(colors.accent, 0.14) }]}>
            {isPlaying
              ? <PauseIcon size={20} color={colors.accent} weight="fill" />
              : <PlayIcon size={20} color={colors.accent} weight="fill" />}
          </View>
          <View style={styles.reviewWaveform}>
            {waveform.slice(0, 19).map((bar, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 6 + bar * 24,
                  borderRadius: Radius.full,
                  backgroundColor: index / 19 <= progress ? colors.accent : alpha(colors.text, 0.16),
                }}
              />
            ))}
          </View>
          <Text style={[styles.playbackTime, { color: colors.textMuted }]}>{formatRecordingTime(recordedDurationMs)}</Text>
        </Pressable>

        <Text style={[styles.disclosure, { color: colors.textMuted }]}>
          Tap Transcribe to send this recording to OpenAI for transcription. You can edit the text before using it.
        </Text>

        <View style={[styles.reviewActions, fontScale > 1.3 && styles.stackedActions]}>
          <TouchableOpacity
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Discard recording"
            accessibilityHint="Deletes this recording from this device"
            onPress={() => void discard()}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <TrashIcon size={17} color={colors.textMuted} weight="regular" />
            <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.76}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Transcribe recording"
            accessibilityHint={demoMode ? 'Shows a preview transcript' : 'Sends the recording to turn it into text'}
            onPress={() => void transcribe()}
            style={[styles.sendButton, { backgroundColor: colors.accent, opacity: isBusy ? 0.55 : 1 }]}
          >
            {isBusy ? <ActivityIndicator size="small" color={colors.background} /> : <CheckIcon size={17} color={colors.background} weight="bold" />}
            <Text style={[styles.sendButtonText, { color: colors.background }]}>Transcribe</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const renderTranscribing = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.title, { color: colors.text }]}>Transcribing</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Turning your recording into text. This usually takes a few seconds.
      </Text>
    </Animated.View>
  );

  const renderTranscript = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <Text style={[styles.kicker, { color: colors.textMuted }]}>REVIEW THE TEXT</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Edit anything that needs a correction. This is not added until you use it.
      </Text>
      <View style={styles.transcriptBlock}>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>ANSWER</Text>
        <TextInput
          value={draft}
          accessibilityLabel="Your answer"
          onChangeText={setDraft}
          multiline
          scrollEnabled
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[styles.transcriptInput, {
            color: colors.text,
            backgroundColor: colors.inputBackground,
            borderColor: acceptance.overLimit ? colors.error : colors.borderFocused,
          }]}
        />
        <Text
          accessibilityRole="text"
          style={[styles.countLabel, { color: acceptance.overLimit ? colors.error : colors.textMuted }]}
        >
          {voiceAnswerCountLabel(acceptance.count, ONBOARDING_VOICE_ANSWER_MAX_LENGTH)}
        </Text>
        {acceptance.empty ? (
          <Text accessibilityRole="alert" style={[styles.limitNote, { color: colors.textMuted }]}>
            Add at least one word before using this answer.
          </Text>
        ) : null}
        {acceptance.overLimit ? (
          <Text accessibilityRole="alert" style={[styles.limitNote, { color: colors.error }]}>
            This answer is over the {ONBOARDING_VOICE_ANSWER_MAX_LENGTH}-character limit. Shorten it to use it.
          </Text>
        ) : null}
      </View>
      <View style={[styles.reviewActions, fontScale > 1.3 && styles.stackedActions]}>
        <TouchableOpacity
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
          onPress={() => void discard()}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <TrashIcon size={17} color={colors.textMuted} weight="regular" />
          <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.76}
          disabled={!acceptance.canAccept}
          accessibilityRole="button"
          accessibilityLabel="Use this answer"
          accessibilityState={{ disabled: !acceptance.canAccept }}
          accessibilityHint="Adds the reviewed text to Tell us about yourself"
          onPress={acceptAnswer}
          style={[styles.sendButton, {
            backgroundColor: colors.accent,
            opacity: acceptance.canAccept ? 1 : 0.45,
          }]}
        >
          <CheckIcon size={17} color={colors.background} weight="bold" />
          <Text style={[styles.sendButtonText, { color: colors.background }]}>Use this answer</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderError = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <View style={[styles.resultIcon, { backgroundColor: alpha(colors.error, 0.1), borderColor: alpha(colors.error, 0.22) }]}>
        <WarningCircleIcon size={28} color={colors.error} weight="regular" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        {errorKind === 'microphone'
          ? 'Microphone unavailable'
          : errorKind === 'recording'
            ? 'Recording interrupted'
            : 'Couldn’t transcribe'}
      </Text>
      <Text accessibilityRole="alert" style={[styles.body, { color: colors.textMuted }]}>{errorMessage}</Text>
      <TouchableOpacity
        activeOpacity={0.76}
        accessibilityRole="button"
        accessibilityLabel={recordedDurationMs > 0 || audioUri ? 'Review recording and retry' : 'Return to voice answer'}
        onPress={retryAfterError}
        style={[styles.primaryButton, { backgroundColor: colors.accent }]}
      >
        <ArrowCounterClockwiseIcon size={18} color={colors.background} weight="bold" />
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>
          {recordedDurationMs > 0 || audioUri ? 'Review & retry' : 'Try again'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel="Discard failed recording"
        onPress={() => void discard()}
        style={styles.textButton}
      >
        <Text style={[styles.textButtonLabel, { color: colors.textMuted }]}>Discard recording</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void closeSheet()} onShow={() => StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content')} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close voice answer"
          onPress={() => void closeSheet()}
          style={[styles.backdrop, { backgroundColor: alpha('#000000', isDark ? 0.46 : 0.28) }]}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
          <Animated.View
            entering={reducedMotion ? undefined : FadeInDown.duration(280)}
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                maxHeight: windowHeight * 0.84,
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.borderStrong,
                paddingBottom: Math.max(insets.bottom, Spacing['3']),
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: colors.textMuted }]}>ABOUT YOU</Text>
                {demoMode ? (
                  <Text style={[styles.demoLabel, { color: colors.accent }]}>DEMO · MICROPHONE OFF</Text>
                ) : null}
              </View>
              <RoundIconButton
                label="Close voice answer"
                hint="Leaves the typed answer unchanged"
                onPress={() => void closeSheet()}
                color={colors.text}
                backgroundColor={alpha(colors.text, 0.06)}
              >
                <XIcon size={18} color={colors.textMuted} weight="regular" />
              </RoundIconButton>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {phase === 'idle' && renderIdle()}
              {phase === 'recording' && renderRecording()}
              {phase === 'review' && renderReview()}
              {phase === 'transcribing' && renderTranscribing()}
              {phase === 'transcript' && renderTranscript()}
              {phase === 'error' && renderError()}

              <Text style={[styles.privacyLine, { color: colors.textHint }]}>
                {demoMode
                  ? 'Demo · microphone and network off'
                  : 'Audio is removed after you use or discard this answer'}
              </Text>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    overflow: 'hidden',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetScroll: { flexShrink: 1 },
  sheetScrollContent: { paddingBottom: Spacing['1'] },
  sheetEyebrow: { fontFamily: FontFamily.uiSemiBold, fontSize: 11, letterSpacing: 1.35 },
  demoLabel: { fontFamily: FontFamily.uiMedium, fontSize: 10, letterSpacing: 0.65, marginTop: 3 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContent: { alignItems: 'center', paddingTop: Spacing['3'], gap: Spacing['3'] },
  micWell: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing['1'],
  },
  resultIcon: {
    width: 58,
    height: 58,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing['1'],
  },
  title: { fontFamily: FontFamily.display, fontSize: FontSize['2xl'], lineHeight: 30, textAlign: 'center' },
  body: { fontFamily: FontFamily.body, fontSize: FontSize.sm, lineHeight: 21, textAlign: 'center', maxWidth: 310 },
  kicker: { fontFamily: FontFamily.uiSemiBold, fontSize: 11, letterSpacing: 1.4 },
  recordingStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginTop: Spacing['1'] },
  liveDot: { width: 7, height: 7, borderRadius: Radius.full },
  timer: { fontFamily: FontFamily.monoMedium, fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'], letterSpacing: -0.7 },
  waveform: {
    width: '100%',
    height: 72,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    marginTop: Spacing['1'],
  },
  primaryButtonText: { fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.sm },
  stopButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  stopButtonText: { fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.sm },
  playbackCard: {
    width: '100%',
    minHeight: 68,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['3'],
    gap: Spacing['3'],
  },
  playButton: { width: 44, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  reviewWaveform: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', gap: 2 },
  playbackTime: { fontFamily: FontFamily.mono, fontSize: FontSize.xs, fontVariant: ['tabular-nums'] },
  transcriptBlock: { width: '100%', gap: Spacing['2'] },
  disclosure: { fontFamily: FontFamily.body, fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  fieldLabel: { fontFamily: FontFamily.uiSemiBold, fontSize: 10, letterSpacing: 1 },
  transcriptInput: {
    width: '100%',
    minHeight: 120,
    maxHeight: 220,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['3'],
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  countLabel: { fontFamily: FontFamily.mono, fontSize: FontSize.xs, textAlign: 'right', fontVariant: ['tabular-nums'] },
  limitNote: { fontFamily: FontFamily.body, fontSize: FontSize.xs, lineHeight: 18 },
  reviewActions: { width: '100%', flexDirection: 'row', gap: Spacing['2'] },
  stackedActions: { flexDirection: 'column' },
  secondaryButton: {
    minHeight: 50,
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  secondaryButtonText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
  sendButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
  },
  sendButtonText: { fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.sm },
  textButton: { minHeight: 44, paddingHorizontal: Spacing['4'], alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
  privacyLine: { fontFamily: FontFamily.ui, fontSize: 10, textAlign: 'center', marginTop: Spacing['3'], letterSpacing: 0.2 },
});
