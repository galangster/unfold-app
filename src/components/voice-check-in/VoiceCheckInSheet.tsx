import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
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
  PencilSimpleIcon,
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
  VOICE_CHECK_IN_MAX_DURATION_MS,
  VoiceCheckInApiError,
  createVoiceCheckInDraft,
  deleteVoiceCheckIn,
  discardVoiceCheckInDraft,
  editVoiceCheckIn,
  listVoiceCheckIns,
  readVoiceCheckInDraft,
  retryPendingVoiceAudioCleanup,
  sendVoiceCheckInDraft,
  type SavedVoiceCheckIn,
  type VoiceCheckInDraft,
} from '@/lib/voice-check-ins';
import {
  VOICE_RECORDING_OPTIONS,
  VOICE_WAVEFORM_BARS,
  buildWaveform,
  formatRecordingTime,
  meterToLevel,
} from '@/lib/voice-recording';

export type VoiceCheckInPhase = 'idle' | 'recording' | 'review' | 'saved' | 'error';
type VoiceCheckInErrorKind = 'microphone' | 'recording' | 'send';

interface VoiceCheckInSheetProps {
  visible: boolean;
  onClose: () => void;
  autoStart?: boolean;
  demoMode?: boolean;
  initialDemoPhase?: VoiceCheckInPhase;
  previewColors?: ColorTheme;
  previewIsDark?: boolean;
  draftRefreshKey?: number;
}

const DEMO_DURATION_MS = 28_000;
const DEMO_TRANSCRIPT = 'Work was a lot today. I finally got outside for a walk, and I felt a little more like myself.';
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

export function VoiceCheckInSheet({
  visible,
  onClose,
  autoStart = false,
  demoMode = false,
  initialDemoPhase = 'idle',
  previewColors,
  previewIsDark,
  draftRefreshKey = 0,
}: VoiceCheckInSheetProps) {
  const theme = useTheme();
  const colors = previewColors ?? theme.colors;
  const isDark = previewIsDark ?? theme.isDark;
  const reducedMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<VoiceCheckInPhase>(demoMode ? initialDemoPhase : 'idle');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [recordedDurationMs, setRecordedDurationMs] = useState(demoMode ? DEMO_DURATION_MS : 0);
  const [demoElapsedMs, setDemoElapsedMs] = useState(initialDemoPhase === 'recording' ? 13_000 : 0);
  const [demoPlaybackMs, setDemoPlaybackMs] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState(demoMode && initialDemoPhase !== 'idle' ? DEMO_TRANSCRIPT : '');
  const [errorMessage, setErrorMessage] = useState('Your recording is still here. Try sending it again.');
  const [errorKind, setErrorKind] = useState<VoiceCheckInErrorKind>('send');
  const [draft, setDraft] = useState<VoiceCheckInDraft | null>(null);
  const [savedCheckIns, setSavedCheckIns] = useState<SavedVoiceCheckIn[]>([]);
  const [selectedCheckIn, setSelectedCheckIn] = useState<SavedVoiceCheckIn | null>(null);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);
  const isClosingRef = useRef(false);
  const mountedRef = useRef(true);
  const visibleRef = useRef(visible);
  const wasVisibleRef = useRef(visible);
  const narrationWasPlayingRef = useRef(false);
  visibleRef.current = visible;

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null, { updateInterval: 100, keepAudioSessionActive: false });
  const playerStatus = useAudioPlayerStatus(player);

  const refreshHistory = useCallback(async () => {
    if (demoMode) return;
    try {
      setSavedCheckIns(await listVoiceCheckIns());
    } catch {
      // Recording and local draft recovery stay available when history cannot load.
    }
  }, [demoMode]);

  useEffect(() => {
    if (demoMode || !visible) return;
    narrationWasPlayingRef.current = pauseForVoiceInput();
    retryPendingVoiceAudioCleanup();
    const localDraft = readVoiceCheckInDraft();
    setDraft(localDraft);
    if (localDraft) {
      setAudioUri(localDraft.audioUri);
      setRecordedDurationMs(localDraft.durationMs);
      player.replace(localDraft.audioUri);
      setPhase(localDraft.status === 'failed' ? 'error' : 'review');
      if (localDraft.status === 'failed') {
        setErrorKind('send');
        setErrorMessage('Your recording is still on this device. Try sending it again.');
      }
    } else {
      setPhase('idle');
      setSelectedCheckIn(null);
    }
    void refreshHistory();
  }, [demoMode, draftRefreshKey, player, refreshHistory, visible]);

  useEffect(() => {
    if (visible || demoMode) return;
    const shouldResume = narrationWasPlayingRef.current;
    narrationWasPlayingRef.current = false;
    void resumeAfterVoiceInput(shouldResume);
  }, [demoMode, visible]);

  useEffect(() => () => {
    if (narrationWasPlayingRef.current) {
      void resumeAfterVoiceInput(true);
      narrationWasPlayingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    setPhase(initialDemoPhase);
    setDemoElapsedMs(initialDemoPhase === 'recording' ? 13_000 : 0);
    setRecordedDurationMs(initialDemoPhase === 'idle' ? 0 : DEMO_DURATION_MS);
    setTranscript(initialDemoPhase === 'idle' ? '' : DEMO_TRANSCRIPT);
    setShowTranscript(false);
    setDemoPlaybackMs(0);
    setDemoPlaying(false);
    setErrorMessage('Your recording is still here. Try sending it again.');
  }, [demoMode, initialDemoPhase]);

  useEffect(() => {
    mountedRef.current = true;
    const stopForLifecycle = async () => {
      if (!recorder.isRecording) return;
      const durationMs = recorder.getStatus().durationMillis;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (!mountedRef.current) return;
        const uri = recorder.uri;
        if (uri) {
          const localDraft = createVoiceCheckInDraft(uri, Math.max(1_000, durationMs));
          setDraft(localDraft);
          setAudioUri(uri);
          setRecordedDurationMs(Math.max(1_000, durationMs));
          player.replace(uri);
          setPhase('review');
        }
      } catch {
        if (!mountedRef.current) return;
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
      // useAudioRecorder releases its native recorder on unmount before this cleanup.
      // Accessing that released shared object throws, even for a microphone-off demo.
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
    [activeDurationMs, meterLevel, phase, playbackMs]
  );

  const startRecording = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setErrorMessage('');
    if (demoMode) {
      setDemoElapsedMs(0);
      setRecordedDurationMs(0);
      setTranscript('');
      setPhase('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      busyRef.current = false;
      setIsBusy(false);
      return;
    }

    let recordingModeArmed = false;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setErrorKind('microphone');
        setErrorMessage('Microphone access is off. Enable it in Settings, then try again.');
        setPhase('error');
        return;
      }
      if (!visibleRef.current) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      recordingModeArmed = true;
      await recorder.prepareToRecordAsync();
      if (!mountedRef.current || !visibleRef.current || AppState.currentState !== 'active') {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        return;
      }
      recorder.record();
      setAudioUri(null);
      setRecordedDurationMs(0);
      setTranscript('');
      setPhase('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // The shared audio session was switched to record mode above; a failed
      // prepare/record must hand it back or narration stays muted.
      if (recordingModeArmed) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      }
      setErrorKind('microphone');
      setErrorMessage('The microphone could not start. Your previous draft was not changed.');
      setPhase('error');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [demoMode, recorder]);

  useEffect(() => {
    const justOpened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!justOpened || !autoStart || phase !== 'idle' || recordedDurationMs > 0 || audioUri) return;
    if (!demoMode && readVoiceCheckInDraft()) return;
    void startRecording();
  }, [audioUri, autoStart, demoMode, phase, recordedDurationMs, startRecording, visible]);

  const stopRecording = useCallback(async () => {
    if (phase !== 'recording' || busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      if (demoMode) {
        setRecordedDurationMs(Math.max(1_000, demoElapsedMs));
      } else {
        const durationMs = recorderState.durationMillis;
        await recorder.stop();
        const uri = recorder.uri ?? recorderState.url;
        if (!uri) throw new Error('Recording URI unavailable');
        const localDraft = createVoiceCheckInDraft(uri, Math.max(1_000, durationMs));
        setDraft(localDraft);
        setAudioUri(uri);
        setRecordedDurationMs(Math.max(1_000, durationMs));
        player.replace(uri);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      }
      setPhase('review');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setErrorKind('recording');
      setErrorMessage('The recording stopped, but its local file could not be prepared. Try recording again.');
      setPhase('error');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [demoElapsedMs, demoMode, phase, player, recorder, recorderState.durationMillis, recorderState.url]);

  useEffect(() => {
    if (phase !== 'recording' || demoMode || recorderState.durationMillis < VOICE_CHECK_IN_MAX_DURATION_MS) return;
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
    try {
      if (!demoMode && recorderState.isRecording) await recorder.stop();
      player.pause();
    } catch {
      // The explicit reset still clears the prototype state if a stale file cannot be removed.
    } finally {
      if (!demoMode) discardVoiceCheckInDraft(true);
    }
    Keyboard.dismiss();
    setPhase('idle');
    setAudioUri(null);
    setRecordedDurationMs(0);
    setDemoElapsedMs(0);
    setDemoPlaybackMs(0);
    setDemoPlaying(false);
    setTranscript('');
    setDraft(null);
    setShowTranscript(false);
    setErrorMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [demoMode, player, recorder, recorderState.isRecording]);

  const sendCheckIn = useCallback(async () => {
    if (busyRef.current) return;
    Keyboard.dismiss();
    if (demoMode) {
      setPhase('saved');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    const localDraft = draft ?? readVoiceCheckInDraft();
    if (!audioUri || !localDraft) {
      setErrorKind('send');
      setErrorMessage('The local recording file is missing. Record another check-in to continue.');
      setPhase('error');
      return;
    }

    busyRef.current = true;
    setIsBusy(true);
    try {
      player.pause();
      const saved = await sendVoiceCheckInDraft(localDraft);
      setDraft(null);
      setAudioUri(null);
      setSelectedCheckIn(saved);
      setTranscript(saved.transcript);
      setSavedCheckIns((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setPhase('saved');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setDraft(readVoiceCheckInDraft());
      setErrorKind('send');
      setErrorMessage(error instanceof VoiceCheckInApiError
        ? error.message.toLowerCase().includes('still on this device')
          ? error.message
          : `${error.message} Your recording is still on this device.`
        : 'Your recording is still on this device. Check your connection and try again.');
      setPhase('error');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [audioUri, demoMode, draft, player]);

  const saveTranscriptEdit = useCallback(async () => {
    if (!selectedCheckIn || !transcript.trim() || busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      const updated = await editVoiceCheckIn(selectedCheckIn.id, transcript.trim());
      setSelectedCheckIn(updated);
      setSavedCheckIns((current) => current.map((item) => item.id === updated.id ? updated : item));
      setIsEditingTranscript(false);
      Keyboard.dismiss();
    } catch {
      setErrorKind('send');
      setErrorMessage('The transcript could not be updated. Your saved check-in is unchanged.');
      setPhase('error');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [selectedCheckIn, transcript]);

  const removeSavedCheckIn = useCallback(async () => {
    if (!selectedCheckIn || busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      await deleteVoiceCheckIn(selectedCheckIn.id);
      setSavedCheckIns((current) => current.filter((item) => item.id !== selectedCheckIn.id));
      setSelectedCheckIn(null);
      setTranscript('');
      setIsEditingTranscript(false);
      setPhase('idle');
    } catch {
      setErrorKind('send');
      setErrorMessage('The saved check-in could not be deleted. Try again.');
      setPhase('error');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, [selectedCheckIn]);

  const retryAfterError = useCallback(() => {
    if (selectedCheckIn) {
      setPhase('saved');
    } else if (recordedDurationMs > 0 || demoMode) {
      setPhase('review');
    } else {
      setPhase('idle');
    }
    setErrorMessage('');
  }, [demoMode, recordedDurationMs, selectedCheckIn]);

  const closeSheet = useCallback(async () => {
    if (isClosingRef.current || isBusy) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    if (phase === 'recording') await stopRecording();
    if (isPlaying) {
      if (demoMode) setDemoPlaying(false);
      else player.pause();
    }
    if (phase === 'saved') {
      setPhase('idle');
      setSelectedCheckIn(null);
      setIsEditingTranscript(false);
      setAudioUri(null);
      setRecordedDurationMs(0);
      setTranscript('');
      setShowTranscript(false);
      setDemoPlaybackMs(0);
    }
    onClose();
    isClosingRef.current = false;
  }, [demoMode, isBusy, isPlaying, onClose, phase, player, stopRecording]);

  const renderIdle = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <View style={[styles.micWell, { backgroundColor: alpha(colors.accent, 0.12), borderColor: alpha(colors.accent, 0.24) }]}>
        <MicrophoneIcon size={28} color={colors.accent} weight="regular" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>How’s your day going?</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>Share a little of your day. It doesn’t need to come out perfectly.</Text>
      <TouchableOpacity
        activeOpacity={0.76}
        disabled={isBusy}
        onPress={() => void startRecording()}
        accessibilityRole="button"
        accessibilityLabel={demoMode ? 'Start demo recording' : 'Start voice check-in recording'}
        accessibilityHint={demoMode ? 'Starts a microphone-free preview' : 'Requests microphone access and starts recording'}
        style={[styles.primaryButton, { backgroundColor: colors.accent, opacity: isBusy ? 0.55 : 1 }]}
      >
        <MicrophoneIcon size={18} color={colors.background} weight="fill" />
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>Start recording</Text>
      </TouchableOpacity>
      {!demoMode && savedCheckIns.length > 0 ? (
        <View style={styles.historyBlock}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>RECENT CHECK-INS</Text>
          {savedCheckIns.slice(0, historyExpanded ? 25 : 3).map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={`Open voice check-in from ${new Date(item.capturedAt).toLocaleDateString()}`}
              onPress={() => {
                setSelectedCheckIn(item);
                setTranscript(item.transcript);
                setIsEditingTranscript(false);
                setPhase('saved');
              }}
              style={[styles.historyRow, { borderColor: colors.border }]}
            >
              <Text numberOfLines={1} style={[styles.historyText, { color: colors.text }]}>{item.transcript}</Text>
              <Text style={[styles.historyDate, { color: colors.textMuted }]}>{new Date(item.capturedAt).toLocaleDateString()}</Text>
            </TouchableOpacity>
          ))}
          {savedCheckIns.length > 3 ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={historyExpanded ? 'Show fewer saved check-ins' : 'Show all saved check-ins'}
              onPress={() => setHistoryExpanded((value) => !value)}
              style={styles.textButton}
            >
              <Text style={[styles.textButtonLabel, { color: colors.accent }]}>{historyExpanded ? 'Show less' : `Show all ${savedCheckIns.length}`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
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

        {demoMode && showTranscript ? (
          <View style={styles.transcriptBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{demoMode ? 'TRANSCRIPT' : 'OPTIONAL NOTE'}</Text>
            <TextInput
              value={transcript}
              onChangeText={setTranscript}
              placeholder="Add a few words about what you said…"
              placeholderTextColor={colors.textHint}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              multiline
              autoFocus
              keyboardAppearance={isDark ? 'dark' : 'light'}
              style={[styles.transcriptInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.borderFocused }]}
            />
          </View>
        ) : demoMode ? (
          <TouchableOpacity
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={demoMode ? 'Edit transcript' : 'Add a note'}
            accessibilityHint="Opens the keyboard and a text field"
            onPress={() => setShowTranscript(true)}
            style={styles.transcriptLink}
          >
            <PencilSimpleIcon size={16} color={colors.textMuted} weight="regular" />
            <Text style={[styles.transcriptLinkText, { color: colors.textMuted }]}>{demoMode ? 'Edit transcript' : 'Add a note'}</Text>
          </TouchableOpacity>
        ) : null}

        {!demoMode ? (
          <Text style={[styles.disclosure, { color: colors.textMuted }]}>When you send, OpenAI turns your recording into text. The saved text can guide Companion and future readings.</Text>
        ) : null}

        <View style={styles.reviewActions}>
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
            accessibilityLabel="Send voice check-in"
            accessibilityHint={demoMode ? 'Simulates a saved check-in' : 'Uploads the recording for transcription'}
            onPress={() => void sendCheckIn()}
            style={[styles.sendButton, { backgroundColor: colors.accent, opacity: isBusy ? 0.55 : 1 }]}
          >
            {isBusy ? <ActivityIndicator size="small" color={colors.background} /> : <CheckIcon size={17} color={colors.background} weight="bold" />}
            <Text style={[styles.sendButtonText, { color: colors.background }]}>{isBusy ? 'Saving your check-in…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const renderSaved = () => (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} style={styles.stateContent}>
      <View style={[styles.resultIcon, { backgroundColor: alpha(colors.success, 0.12), borderColor: alpha(colors.success, 0.24) }]}>
        <CheckIcon size={28} color={colors.success} weight="bold" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{demoMode ? 'Simulated save complete' : 'Check-in saved'}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {demoMode
          ? 'Demo mode did not create a file or upload anything.'
          : 'Your transcript is saved. You can review, edit, or delete it below.'}
      </Text>
      {!demoMode && selectedCheckIn ? (
        <View style={styles.transcriptBlock}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>TRANSCRIPT · {new Date(selectedCheckIn.capturedAt).toLocaleDateString()}</Text>
          {isEditingTranscript ? (
            <TextInput
              value={transcript}
              onChangeText={setTranscript}
              multiline
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              style={[styles.transcriptInput, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.borderFocused }]}
            />
          ) : (
            <Text style={[styles.savedTranscript, { color: colors.text }]}>{selectedCheckIn.transcript}</Text>
          )}
          <View style={styles.savedActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isEditingTranscript ? 'Save transcript changes' : 'Edit saved transcript'}
              disabled={isBusy}
              onPress={() => isEditingTranscript ? void saveTranscriptEdit() : setIsEditingTranscript(true)}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              <PencilSimpleIcon size={16} color={colors.textMuted} weight="regular" />
              <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>{isEditingTranscript ? 'Save changes' : 'Edit'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Delete saved voice check-in"
              accessibilityHint="Deletes this transcript from future context"
              disabled={isBusy}
              onPress={() => void removeSavedCheckIn()}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              <TrashIcon size={16} color={colors.error} weight="regular" />
              <Text style={[styles.secondaryButtonText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.retentionNote, { color: colors.textHint }]}>Deleting removes this transcript from future Companion and reading context. It does not change text already generated.</Text>
        </View>
      ) : null}
      <TouchableOpacity
        activeOpacity={0.76}
        accessibilityRole="button"
        accessibilityLabel="Close saved check-in"
        onPress={() => void closeSheet()}
        style={[styles.primaryButton, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>Done</Text>
      </TouchableOpacity>
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
            : 'Couldn’t send check-in'}
      </Text>
      <Text accessibilityRole="alert" style={[styles.body, { color: colors.textMuted }]}>{errorMessage}</Text>
      <TouchableOpacity
        activeOpacity={0.76}
        accessibilityRole="button"
        accessibilityLabel={errorKind === 'send' ? 'Try sending again' : 'Return to voice check-in'}
        onPress={retryAfterError}
        style={[styles.primaryButton, { backgroundColor: colors.accent }]}
      >
        <ArrowCounterClockwiseIcon size={18} color={colors.background} weight="bold" />
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>
          {recordedDurationMs > 0 ? 'Review & retry' : 'Try again'}
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
          accessibilityLabel="Close voice check-in"
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
                <Text style={[styles.sheetEyebrow, { color: colors.textMuted }]}>VOICE CHECK-IN</Text>
                {demoMode ? (
                  <Text style={[styles.demoLabel, { color: colors.accent }]}>DEMO · MICROPHONE OFF</Text>
                ) : null}
              </View>
              <RoundIconButton
                label="Close voice check-in"
                hint="Keeps the current draft available while this screen stays open"
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
              {phase === 'saved' && renderSaved()}
              {phase === 'error' && renderError()}

              <Text style={[styles.privacyLine, { color: colors.textHint }]}>
                {demoMode ? 'Demo · microphone and network off' : 'Audio removed after saving · transcript stays until you delete it'}
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
  historyBlock: { width: '100%', gap: Spacing['2'], marginTop: Spacing['2'] },
  historyRow: { width: '100%', minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingVertical: Spacing['2'] },
  historyText: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm },
  historyDate: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs },
  disclosure: { fontFamily: FontFamily.body, fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center', maxWidth: 320 },
  savedTranscript: { fontFamily: FontFamily.body, fontSize: FontSize.sm, lineHeight: 21, padding: Spacing['3'] },
  savedActions: { flexDirection: 'row', gap: Spacing['2'] },
  retentionNote: { fontFamily: FontFamily.body, fontSize: 11, lineHeight: 16 },
  fieldLabel: { fontFamily: FontFamily.uiSemiBold, fontSize: 10, letterSpacing: 1 },
  transcriptInput: {
    width: '100%',
    minHeight: 92,
    maxHeight: 132,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['3'],
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  transcriptLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['2'] },
  transcriptLinkText: { fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm },
  reviewActions: { width: '100%', flexDirection: 'row', gap: Spacing['2'] },
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
