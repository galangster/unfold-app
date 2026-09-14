/** @jsxImportSource react */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
} from '@/components/icons';
import { AmbientText } from './AmbientText';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import {
  AMBIENT_TRACKS,
  formatTrackDuration,
  type AmbientTrackId,
} from '@/lib/ambient-audio-catalog';
import {
  formatAmbientRemaining,
  useAmbientAudioState,
} from '@/lib/ambient-audio-state';
import {
  pauseAmbientSound,
  playAmbientSound,
  setAmbientTimer,
  setAmbientVolume,
  stopAmbientSound,
} from '@/lib/ambient-audio';
import { canStartAmbientPlayback } from '@/lib/ambient-audio-coordination';
import {
  invalidateNarrationAudioSession,
  useGlobalAudioPlayer,
} from '@/hooks/useGlobalAudioPlayer';
import { AmbientMusicEntry } from './AmbientMusicEntry';

export { AmbientMusicEntry };

const TIMER_CHOICES = [5, 15, 30] as const;

export function useAmbientSoundActions() {
  const { stopAudio } = useGlobalAudioPlayer();
  return useCallback(
    (id?: AmbientTrackId) => {
      if (!canStartAmbientPlayback()) {
        Alert.alert(
          'Recording in progress',
          'Finish your recording before playing a sound.',
        );
        return;
      }
      const state = useAmbientAudioState.getState();
      if (state.status === 'playing' && (!id || state.selectedTrackId === id)) {
        pauseAmbientSound();
      } else if (state.status === 'loading' && (!id || state.selectedTrackId === id)) {
        pauseAmbientSound();
      } else {
        stopAudio();
        invalidateNarrationAudioSession();
        void playAmbientSound(id);
      }
      void Haptics.selectionAsync();
    },
    [stopAudio],
  );
}

export function ambientStatusText(
  state: ReturnType<typeof useAmbientAudioState.getState>,
): string {
  if (state.status === 'loading') return 'Starting…';
  if (state.status === 'error') return 'Could not play · tap to retry';
  if (state.status === 'paused') return state.pauseReason || 'Paused';
  if (state.status !== 'playing') return 'Sound is off';
  if (state.volume === 0) return 'Muted';
  return 'Playing softly';
}

function SheetMotionLayer({
  value,
  height,
  backdrop = false,
  style,
  children,
  onEscape,
}: {
  value: Animated.Value;
  height: number;
  backdrop?: boolean;
  style: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onEscape?: () => void;
}) {
  // Scalar styles avoid stale Animated host bindings in this native runtime.
  const [position, setPosition] = useState(height);
  useLayoutEffect(() => {
    const subscription = value.addListener(({ value: next }) => setPosition(next));
    return () => value.removeListener(subscription);
  }, [value]);

  return (
    <View
      pointerEvents={backdrop ? 'none' : 'auto'}
      accessibilityViewIsModal={!backdrop}
      onAccessibilityEscape={onEscape}
      style={[
        style,
        backdrop
          ? { opacity: Math.max(0, Math.min(1, 1 - position / height)) }
          : { transform: [{ translateY: position }] },
      ]}
    >
      {children}
    </View>
  );
}

export function AmbientSoundSheet({
  visible,
  onClose,
  initialPanel = 'sounds',
  contained = false,
  returnFocusRef,
}: {
  visible: boolean;
  onClose: () => void;
  initialPanel?: 'sounds' | 'timer';
  contained?: boolean;
  returnFocusRef?: React.RefObject<View | null>;
}) {
  const { colors } = useTheme();
  const { height, fontScale, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const translation = useRef(new Animated.Value(height)).current;
  const animationGeneration = useRef(0);
  const title = useRef<View>(null);
  const [timerPanel, setTimerPanel] = useState(initialPanel === 'timer');
  const [selectedDuration, setSelectedDuration] = useState(15);
  const state = useAmbientAudioState();
  const choose = useAmbientSoundActions();

  useEffect(() => {
    if (visible) {
      setTimerPanel(initialPanel === 'timer');
      setSelectedDuration(state.timerMinutes || 15);
    }
  }, [visible, initialPanel, state.timerMinutes]);

  const focusTitle = useCallback(() => {
    const handle = findNodeHandle(title.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, []);
  const restoreFocus = useCallback(() => {
    const handle = findNodeHandle(returnFocusRef?.current ?? null);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [returnFocusRef]);
  const wasVisible = useRef(false);
  useEffect(() => {
    let frame: number | undefined;
    if (visible) frame = requestAnimationFrame(focusTitle);
    else if (wasVisible.current && (contained || Platform.OS === 'android')) {
      frame = requestAnimationFrame(restoreFocus);
    }
    wasVisible.current = visible;
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [visible, timerPanel, contained, focusTitle, restoreFocus]);

  const close = useCallback(() => {
    const generation = ++animationGeneration.current;
    translation.stopAnimation();
    if (reducedMotion) {
      onClose();
      return;
    }
    Animated.timing(translation, {
      toValue: height,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && generation === animationGeneration.current) onClose();
    });
  }, [height, onClose, reducedMotion, translation]);

  const openSheet = useCallback(() => {
    const generation = ++animationGeneration.current;
    translation.stopAnimation();
    translation.setValue(reducedMotion ? 0 : height);
    Animated.timing(translation, {
      toValue: 0,
      duration: reducedMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && generation === animationGeneration.current) focusTitle();
    });
  }, [height, reducedMotion, translation, focusTitle]);

  useEffect(() => {
    if (visible && contained) {
      const frame = requestAnimationFrame(openSheet);
      return () => {
        cancelAnimationFrame(frame);
        translation.stopAnimation();
      };
    }
    if (!visible) translation.setValue(height);
  }, [visible, contained, height, openSheet, translation]);

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => translation.stopAnimation(),
        onPanResponderMove: (_, gesture) =>
          translation.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if ((Math.abs(gesture.dx) < 4 && Math.abs(gesture.dy) < 4) || gesture.dy > 85 || (gesture.vy > 0.65 && gesture.dy > 28)) close();
          else if (reducedMotion) translation.setValue(0);
          else
            Animated.spring(translation, {
              toValue: 0,
              damping: 25,
              stiffness: 300,
              mass: 1,
              useNativeDriver: false,
            }).start();
        },
        onPanResponderTerminate: () => translation.setValue(0),
      }),
    [close, reducedMotion, translation],
  );

  const sheetHeight = Math.min(
    height - insets.top - 12,
    (timerPanel ? 420 : 640) * Math.min(fontScale, 1.5) + insets.bottom,
  );

  const contents = (
    <View collapsable={false} style={styles.modalRoot}>
      <SheetMotionLayer
        value={translation}
        height={height}
        backdrop
        style={[StyleSheet.absoluteFill, styles.backdrop]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close sound settings"
        onPress={close}
        style={StyleSheet.absoluteFill}
      />
      <SheetMotionLayer
        value={translation}
        height={height}
        onEscape={close}
        style={{
          position: 'absolute',
          bottom: 0,
          left: Math.max(0, (width - 560) / 2),
          right: Math.max(0, (width - 560) / 2),
          height: sheetHeight,
          backgroundColor: colors.backgroundElevated,
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
          overflow: 'hidden',
        }}
      >
        <View
          {...pan.panHandlers}
          collapsable={false}
          style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
          ref={title}
          accessible
          accessibilityRole="button"
          accessibilityLabel={timerPanel ? 'Close timer' : 'Close background sound'}
          onAccessibilityTap={close}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
            }}
          />
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <View style={styles.sheetHeader}>
            {timerPanel ? (
              <Pressable
                onPress={() => setTimerPanel(false)}
                accessibilityRole="button"
                accessibilityLabel="Back to sounds"
                style={styles.iconButton}
              >
                <CaretLeftIcon size={22} color={colors.text} />
              </Pressable>
            ) : null}
            <View style={styles.flex} />
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={styles.iconButton}
            >
              <AmbientText style={[styles.actionText, { color: colors.accent }]}>
                Done
              </AmbientText>
            </Pressable>
          </View>
          {state.timerStatus === 'ended' ? (
            <AmbientText
              accessibilityRole="text"
              style={[styles.note, { color: colors.text }]}
            >
              Your time is up. Stay as long as you like.
            </AmbientText>
          ) : null}
          {timerPanel ? (
            <>
              {state.timerStatus === 'running' ? (
                <View style={styles.timerReadout}>
                  <AmbientText
                    accessibilityRole="timer"
                    accessibilityLabel={`${formatAmbientRemaining(state.remainingSeconds)} remaining`}
                    style={[styles.timerHuge, { color: colors.text }]}
                  >
                    {formatAmbientRemaining(state.remainingSeconds)}
                  </AmbientText>
                  <AmbientText style={[styles.note, { color: colors.textMuted }]}>
                    remaining
                  </AmbientText>
                </View>
              ) : null}
              {TIMER_CHOICES.map((minutes) => (
                <Pressable
                  key={minutes}
                  onPress={() => setSelectedDuration(minutes)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedDuration === minutes }}
                  accessibilityLabel={`${minutes} minutes`}
                  style={[styles.timerOption, { borderColor: colors.border }]}
                >
                  <AmbientText
                    style={[
                      styles.optionTitle,
                      {
                        color:
                          selectedDuration === minutes ? colors.accent : colors.text,
                      },
                    ]}
                  >
                    {minutes} minutes
                  </AmbientText>
                  {selectedDuration === minutes ? (
                    <CheckIcon size={20} color={colors.accent} />
                  ) : null}
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  setAmbientTimer(selectedDuration);
                  close();
                }}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.accent }]}
              >
                <AmbientText style={[styles.actionText, { color: colors.background }]}>
                  {state.timerStatus === 'running' ? 'Restart timer' : 'Start timer'}
                </AmbientText>
              </Pressable>
              {state.timerStatus === 'running' ? (
                <Pressable
                  onPress={() => {
                    setAmbientTimer(0);
                    close();
                  }}
                  accessibilityRole="button"
                  style={styles.silence}
                >
                  <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
                    Cancel timer
                  </AmbientText>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              {AMBIENT_TRACKS.map((track, index) => {
                const current = state.selectedTrackId === track.id;
                const loading = current && state.status === 'loading';
                const playing = current && state.status === 'playing';
                const chosen = current && (state.hasUsed || loading);
                return (
                  <Pressable
                    key={track.id}
                    onPress={() => choose(track.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${playing ? 'Pause ' : loading ? 'Cancel ' : 'Play '}${track.title}`}
                    accessibilityState={{ busy: loading }}
                    style={({ pressed }) => [
                      styles.songRow,
                      chosen && { borderColor: colors.accent },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AmbientText style={[styles.songNumber, { color: colors.textMuted }]}>
                      {String(index + 1).padStart(2, '0')}
                    </AmbientText>
                    <AmbientText style={[styles.optionTitle, styles.flex, { color: colors.text }]}>
                      {track.title}
                    </AmbientText>
                    <AmbientText style={[styles.subtitle, { color: colors.textMuted }]}>
                      {loading ? 'Starting…' : formatTrackDuration(track.duration)}
                    </AmbientText>
                    {loading ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : playing ? (
                      <PauseIcon size={17} color={colors.accent} />
                    ) : (
                      <PlayIcon size={17} color={colors.accent} />
                    )}
                  </Pressable>
                );
              })}
              {state.status === 'error' ? (
                <AmbientText
                  accessibilityRole="alert"
                  style={[styles.note, { color: colors.accent }]}
                >
                  {state.error || 'This sound could not play. Try again or choose another.'}
                </AmbientText>
              ) : null}
              <AmbientText style={[styles.note, { color: colors.textMuted }]}>
                The next piece follows softly.
              </AmbientText>
              <View style={styles.volumeLabel}>
                <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
                  Volume
                </AmbientText>
                <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
                  {state.volume === 0 ? 'Muted' : `${Math.round(state.volume * 100)}%`}
                </AmbientText>
              </View>
              <View style={styles.volumeRow}>
                <SpeakerHighIcon size={17} color={colors.textMuted} />
                <Slider
                  accessibilityLabel="Background sound volume"
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: Math.round(state.volume * 100),
                    text: `${Math.round(state.volume * 100)} percent`,
                  }}
                  value={state.volume}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.01}
                  onValueChange={setAmbientVolume}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.borderStrong}
                  thumbTintColor={colors.accent}
                  style={styles.slider}
                />
              </View>
              <Pressable
                onPress={() => setTimerPanel(true)}
                accessibilityRole="button"
                accessibilityLabel={`Timer. ${
                  state.timerStatus === 'running'
                    ? `${formatAmbientRemaining(state.remainingSeconds)} left`
                    : state.timerStatus === 'ended'
                      ? 'Finished'
                      : 'Off'
                }`}
                style={[styles.timerRow, { borderColor: colors.borderFocused }]}
              >
                <ClockIcon size={18} color={colors.textMuted} />
                <AmbientText style={[styles.actionText, styles.flex, { color: colors.text }]}>
                  Timer
                </AmbientText>
                <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
                  {state.timerStatus === 'running'
                    ? `${formatAmbientRemaining(state.remainingSeconds)} left`
                    : state.timerStatus === 'ended'
                      ? 'Finished'
                      : 'Off'}
                </AmbientText>
                <CaretRightIcon size={16} color={colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => {
                  stopAmbientSound();
                  close();
                }}
                accessibilityRole="button"
                style={styles.silence}
              >
                <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
                  Turn sound off
                </AmbientText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SheetMotionLayer>
    </View>
  );

  return contained ? (
    visible ? <View style={StyleSheet.absoluteFill}>{contents}</View> : null
  ) : (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      onShow={openSheet}
      onDismiss={restoreFocus}
      statusBarTranslucent
    >
      {visible ? contents : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  modalRoot: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetContent: { paddingHorizontal: 23 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  sheetTitle: { fontFamily: FontFamily.uiMedium, fontSize: 17 },
  actionText: { fontFamily: FontFamily.ui, fontSize: 13 },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
  },
  songNumber: { fontFamily: FontFamily.ui, fontSize: 12, width: 22 },
  optionTitle: { fontFamily: FontFamily.uiMedium, fontSize: 14 },
  subtitle: { fontFamily: FontFamily.ui, fontSize: 12 },
  volumeLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 19,
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { height: 44, flex: 1, marginVertical: 3 },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 53,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: 8,
  },
  silence: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  timerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 55,
    borderBottomWidth: 1,
  },
  timerReadout: { alignItems: 'center', marginBottom: 12 },
  timerHuge: { fontFamily: FontFamily.display, fontSize: 44, fontVariant: ['tabular-nums'] },
  primary: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  note: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    lineHeight: 20,
    marginTop: 17,
  },
});
