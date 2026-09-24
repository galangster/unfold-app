/** @jsxImportSource react */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
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
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  ShuffleIcon,
  SpeakerHighIcon,
} from '@/components/icons';
import { AmbientText } from './AmbientText';
import { FontFamily } from '@/constants/fonts';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { SheetHandle } from '@/components/ui/SheetHandle';
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
  previewAmbientVolume,
  setAmbientShuffle,
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
  state: Pick<
    ReturnType<typeof useAmbientAudioState.getState>,
    'status' | 'pauseReason' | 'volume'
  >,
): string {
  if (state.status === 'loading') return 'Starting…';
  if (state.status === 'error') return 'Could not play · tap to retry';
  if (state.status === 'paused') return state.pauseReason || 'Paused';
  if (state.status !== 'playing') return 'Sound is off';
  if (state.volume === 0) return 'Muted';
  return 'Playing softly';
}

function SheetMotionLayer({
  translateY,
  height,
  backdrop = false,
  style,
  children,
  onEscape,
}: {
  translateY: SharedValue<number>;
  height: number;
  backdrop?: boolean;
  style: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onEscape?: () => void;
}) {
  const motionStyle = useAnimatedStyle(() => {
    const offset = translateY.value;
    if (backdrop) {
      return { opacity: Math.max(0, Math.min(1, height === 0 ? 0 : 1 - offset / height)) };
    }
    return { transform: [{ translateY: offset }] };
  }, [height]);

  return (
    <Animated.View
      pointerEvents={backdrop ? 'none' : 'auto'}
      accessibilityViewIsModal={!backdrop}
      onAccessibilityEscape={onEscape}
      collapsable={false}
      style={[style, motionStyle]}
    >
      {children}
    </Animated.View>
  );
}

function AmbientVolumeControl() {
  const { colors } = useTheme();
  const persistedVolume = useAmbientAudioState((state) => state.volume);
  const [draft, setDraft] = useState(persistedVolume);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setDraft(persistedVolume);
  }, [persistedVolume]);

  useEffect(() => () => {
    if (dragging.current) previewAmbientVolume(useAmbientAudioState.getState().volume);
  }, []);

  const percent = Math.round(draft * 100);

  return (
    <>
      <View style={styles.volumeLabel}>
        <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
          Volume
        </AmbientText>
        <View style={styles.volumePercentSlot}>
          {draft === 0 ? (
            <AmbientText
              testID="ambient-volume-percent"
              style={[styles.actionText, { color: colors.textMuted }]}
            >
              Muted
            </AmbientText>
          ) : (
            <>
              <AmbientText
                style={[styles.actionText, styles.tabular, styles.volumePercentReserve]}
                importantForAccessibility="no"
                accessibilityElementsHidden
              >
                100%
              </AmbientText>
              <AmbientText
                testID="ambient-volume-percent"
                style={[styles.actionText, styles.tabular, styles.volumePercentValue, { color: colors.textMuted }]}
              >
                {`${percent}%`}
              </AmbientText>
            </>
          )}
        </View>
      </View>
      <View style={styles.volumeRow}>
        <SpeakerHighIcon size={17} color={colors.textMuted} />
        <Slider
          testID="ambient-volume-slider"
          accessibilityLabel="Background sound volume"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: percent,
            text: `${percent} percent`,
          }}
          value={draft}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          onValueChange={(next) => {
            dragging.current = true;
            setDraft(next);
            previewAmbientVolume(next);
          }}
          onSlidingComplete={(next) => {
            dragging.current = false;
            setDraft(next);
            setAmbientVolume(next);
          }}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.borderStrong}
          thumbTintColor={colors.accent}
          style={styles.slider}
        />
      </View>
    </>
  );
}

function SheetEndedNote() {
  const { colors } = useTheme();
  const ended = useAmbientAudioState((state) => state.timerStatus === 'ended');
  if (!ended) return null;
  return (
    <AmbientText accessibilityRole="text" style={[styles.note, { color: colors.text }]}>
      Your time is up. Stay as long as you like.
    </AmbientText>
  );
}

function SheetSoundsList({
  choose,
}: {
  choose: ReturnType<typeof useAmbientSoundActions>;
}) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const songNumberWidth = Math.ceil(22 * Math.min(fontScale, 2));
  const selectedTrackId = useAmbientAudioState((state) => state.selectedTrackId);
  const status = useAmbientAudioState((state) => state.status);
  const hasUsed = useAmbientAudioState((state) => state.hasUsed);
  const error = useAmbientAudioState((state) => state.error);

  return (
    <>
      {AMBIENT_TRACKS.map((track, index) => {
        const current = selectedTrackId === track.id;
        const loading = current && status === 'loading';
        const playing = current && status === 'playing';
        const chosen = current && (hasUsed || loading);
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
            <AmbientText
              numberOfLines={1}
              style={[
                styles.songNumber,
                styles.tabular,
                { color: colors.textMuted, width: songNumberWidth },
              ]}
            >
              {String(index + 1).padStart(2, '0')}
            </AmbientText>
            <AmbientText style={[styles.optionTitle, styles.flex, { color: colors.text }]}>
              {track.title}
            </AmbientText>
            <AmbientText
              numberOfLines={1}
              style={[styles.subtitle, styles.duration, { color: colors.textMuted }]}
            >
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
      {status === 'error' ? (
        <AmbientText
          accessibilityRole="alert"
          style={[styles.note, { color: colors.accent }]}
        >
          {error || 'This sound could not play. Try again or choose another.'}
        </AmbientText>
      ) : null}
    </>
  );
}

function SheetShuffleRow() {
  const { colors } = useTheme();
  const shuffle = useAmbientAudioState((state) => state.shuffle);

  return (
    <>
      <AmbientText style={[styles.note, { color: colors.textMuted }]}>
        {shuffle ? 'The next piece is mixed in.' : 'The next piece follows softly.'}
      </AmbientText>
      <Pressable
        onPress={() => {
          setAmbientShuffle(!shuffle);
          void Haptics.selectionAsync();
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: shuffle }}
        accessibilityLabel="Shuffle"
        style={[styles.timerRow, { borderColor: colors.borderFocused }]}
      >
        <ShuffleIcon size={18} color={shuffle ? colors.accent : colors.textMuted} />
        <AmbientText style={[styles.actionText, styles.flex, { color: colors.text }]}>
          Shuffle
        </AmbientText>
        <AmbientText style={[styles.actionText, { color: colors.textMuted }]}>
          {shuffle ? 'On' : 'Off'}
        </AmbientText>
      </Pressable>
    </>
  );
}

function SheetTimerStatusRow({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const timerStatus = useAmbientAudioState((state) => state.timerStatus);
  const remainingSeconds = useAmbientAudioState((state) =>
    state.timerStatus === 'running' ? state.remainingSeconds : 0,
  );
  const detail =
    timerStatus === 'running'
      ? `${formatAmbientRemaining(remainingSeconds)} left`
      : timerStatus === 'ended'
        ? 'Finished'
        : 'Off';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Timer. ${detail}`}
      style={[styles.timerRow, { borderColor: colors.borderFocused }]}
    >
      <ClockIcon size={18} color={colors.textMuted} />
      <AmbientText style={[styles.actionText, styles.flex, { color: colors.text }]}>
        Timer
      </AmbientText>
      <AmbientText style={[styles.actionText, styles.tabular, { color: colors.textMuted }]}>
        {detail}
      </AmbientText>
      <CaretRightIcon size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function SheetTimerPanel({
  selectedDuration,
  onSelectDuration,
  close,
}: {
  selectedDuration: number;
  onSelectDuration: (minutes: number) => void;
  close: () => void;
}) {
  const { colors } = useTheme();
  const timerStatus = useAmbientAudioState((state) => state.timerStatus);
  const remainingSeconds = useAmbientAudioState((state) =>
    state.timerStatus === 'running' ? state.remainingSeconds : 0,
  );

  return (
    <>
      {timerStatus === 'running' ? (
        <View style={styles.timerReadout}>
          <AmbientText
            accessibilityRole="timer"
            accessibilityLabel={`${formatAmbientRemaining(remainingSeconds)} remaining`}
            style={[styles.timerHuge, { color: colors.text }]}
          >
            {formatAmbientRemaining(remainingSeconds)}
          </AmbientText>
          <AmbientText style={[styles.note, { color: colors.textMuted }]}>
            remaining
          </AmbientText>
        </View>
      ) : null}
      {TIMER_CHOICES.map((minutes) => (
        <Pressable
          key={minutes}
          onPress={() => onSelectDuration(minutes)}
          accessibilityRole="radio"
          accessibilityState={{ checked: selectedDuration === minutes }}
          accessibilityLabel={`${minutes} minutes`}
          style={[styles.timerOption, { borderColor: colors.border }]}
        >
          <AmbientText
            style={[
              styles.optionTitle,
              { color: selectedDuration === minutes ? colors.accent : colors.text },
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
          {timerStatus === 'running' ? 'Restart timer' : 'Start timer'}
        </AmbientText>
      </Pressable>
      {timerStatus === 'running' ? (
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
  const translateY = useSharedValue(height);
  const animationGeneration = useRef(0);
  const title = useRef<View>(null);
  const [timerPanel, setTimerPanel] = useState(initialPanel === 'timer');
  const [selectedDuration, setSelectedDuration] = useState(15);
  const timerMinutes = useAmbientAudioState((state) => state.timerMinutes);
  const choose = useAmbientSoundActions();

  useEffect(() => {
    if (visible) {
      setTimerPanel(initialPanel === 'timer');
      setSelectedDuration(timerMinutes || 15);
    }
  }, [visible, initialPanel, timerMinutes]);

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

  const finishClose = useCallback((generation: number) => {
    if (generation === animationGeneration.current) onClose();
  }, [onClose]);

  const finishOpen = useCallback((generation: number) => {
    if (generation === animationGeneration.current) focusTitle();
  }, [focusTitle]);

  const close = useCallback(() => {
    const generation = ++animationGeneration.current;
    cancelAnimation(translateY);
    if (reducedMotion) {
      onClose();
      return;
    }
    translateY.value = withTiming(height, { duration: Duration.fast, easing: Ease.out }, (finished) => {
      if (finished) runOnJS(finishClose)(generation);
    });
  }, [finishClose, height, onClose, reducedMotion, translateY]);

  const openSheet = useCallback(() => {
    const generation = ++animationGeneration.current;
    cancelAnimation(translateY);
    translateY.value = reducedMotion ? 0 : height;
    if (reducedMotion) {
      focusTitle();
      return;
    }
    translateY.value = withTiming(0, { duration: Duration.normal, easing: Ease.out }, (finished) => {
      if (finished) runOnJS(finishOpen)(generation);
    });
  }, [finishOpen, focusTitle, height, reducedMotion, translateY]);

  useEffect(() => {
    if (visible && contained) {
      const frame = requestAnimationFrame(openSheet);
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimation(translateY);
      };
    }
    if (!visible) translateY.value = height;
  }, [visible, contained, height, openSheet, translateY]);

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => cancelAnimation(translateY),
        onPanResponderMove: (_, gesture) => {
          translateY.value = Math.max(0, gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if ((Math.abs(gesture.dx) < 4 && Math.abs(gesture.dy) < 4) || gesture.dy > 85 || (gesture.vy > 0.65 && gesture.dy > 28)) close();
          else if (reducedMotion) translateY.value = 0;
          else
            translateY.value = withSpring(0, {
              damping: 25,
              stiffness: 300,
              mass: 1,
            });
        },
        onPanResponderTerminate: () => {
          translateY.value = 0;
        },
      }),
    [close, reducedMotion, translateY],
  );

  const sheetHeight = Math.min(
    height - insets.top - 12,
    (timerPanel ? 420 : 640) * Math.min(fontScale, 1.5) + insets.bottom,
  );

  const contents = (
    <View collapsable={false} style={styles.modalRoot}>
      <SheetMotionLayer
        translateY={translateY}
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
        translateY={translateY}
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
        <View style={styles.sheetChrome}>
          <SheetHandle
            {...pan.panHandlers}
            collapsable={false}
            ref={title}
            accessible
            accessibilityRole="button"
            accessibilityLabel={timerPanel ? 'Close timer' : 'Close background sound'}
            onAccessibilityTap={close}
            style={styles.sheetHandleHit}
          />
          <View pointerEvents="box-none" style={styles.sheetHeader}>
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
            <View pointerEvents="none" style={styles.flex} />
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
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <SheetEndedNote />
          {timerPanel ? (
            <SheetTimerPanel
              selectedDuration={selectedDuration}
              onSelectDuration={setSelectedDuration}
              close={close}
            />
          ) : (
            <>
              <SheetSoundsList choose={choose} />
              <SheetShuffleRow />
              <AmbientVolumeControl />
              <SheetTimerStatusRow onPress={() => setTimerPanel(true)} />
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
  sheetChrome: { position: 'relative' },
  sheetHandleHit: { minHeight: 44 },
  sheetContent: { paddingHorizontal: 23 },
  sheetHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 23,
  },
  sheetTitle: { fontFamily: FontFamily.uiMedium, fontSize: 17 },
  actionText: { fontFamily: FontFamily.ui, fontSize: 13 },
  tabular: { fontVariant: ['tabular-nums'] },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
  },
  songNumber: { fontFamily: FontFamily.ui, fontSize: 12, flexShrink: 0 },
  optionTitle: { fontFamily: FontFamily.uiMedium, fontSize: 14, minWidth: 0 },
  subtitle: { fontFamily: FontFamily.ui, fontSize: 12 },
  duration: { flexShrink: 0 },
  volumeLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 19,
  },
  volumePercentSlot: { alignItems: 'flex-end', justifyContent: 'center' },
  volumePercentReserve: { color: 'transparent' },
  volumePercentValue: { position: 'absolute', right: 0 },
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
