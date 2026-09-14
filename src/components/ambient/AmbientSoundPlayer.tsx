/** @jsxImportSource react */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MusicNotesIcon, PauseIcon, PlayIcon, XIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { getAmbientTrack } from '@/lib/ambient-audio-catalog';
import { useAmbientAudioState } from '@/lib/ambient-audio-state';
import { AmbientText } from './AmbientText';
import { ambientStatusText, useAmbientSoundActions } from './AmbientSoundControls';

type PlayerDisplay = {
  selectedTrackId: ReturnType<typeof useAmbientAudioState.getState>['selectedTrackId'];
  status: ReturnType<typeof useAmbientAudioState.getState>['status'];
  pauseReason: string | null;
  volume: number;
};

export function AmbientSoundPlayer({
  onOpen,
  onDismissStart,
  onDismissEnd,
  onFocusReturn,
}: {
  onOpen: () => void;
  onDismissStart: () => void;
  onDismissEnd: () => void;
  onFocusReturn?: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const selectedTrackId = useAmbientAudioState((state) => state.selectedTrackId);
  const status = useAmbientAudioState((state) => state.status);
  const pauseReason = useAmbientAudioState((state) => state.pauseReason);
  const volume = useAmbientAudioState((state) => state.volume);
  const liveDisplay = useMemo<PlayerDisplay>(
    () => ({ selectedTrackId, status, pauseReason, volume }),
    [pauseReason, selectedTrackId, status, volume],
  );
  const displayRef = useRef(liveDisplay);
  displayRef.current = liveDisplay;
  const onDismissStartRef = useRef(onDismissStart);
  const onDismissEndRef = useRef(onDismissEnd);
  const onFocusReturnRef = useRef(onFocusReturn);
  onDismissStartRef.current = onDismissStart;
  onDismissEndRef.current = onDismissEnd;
  onFocusReturnRef.current = onFocusReturn;
  const [frozenState, setFrozenState] = useState<PlayerDisplay | null>(null);
  const displayState = frozenState ?? liveDisplay;
  const toggle = useAmbientSoundActions();
  const track = getAmbientTrack(displayState.selectedTrackId);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const dockWidth = useSharedValue(320);
  const dismissing = useSharedValue(false);

  useEffect(() => {
    translateX.value = 0;
    opacity.value = reducedMotion ? 1 : withTiming(1, { duration: 150 });
  }, [opacity, reducedMotion, translateX]);

  const finishDismiss = useCallback(() => {
    onFocusReturnRef.current?.();
    onDismissEndRef.current();
  }, []);

  const commitDismiss = useCallback(() => {
    setFrozenState(displayRef.current);
    onDismissStartRef.current();
  }, []);

  const close = () => {
    onDismissStart();
    onFocusReturn?.();
    onDismissEnd();
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
          if (dismissing.value) return;
          translateX.value = event.translationX;
          opacity.value = 1 - Math.min(0.35, Math.abs(event.translationX) / dockWidth.value * 0.35);
        })
        .onEnd((event) => {
          if (dismissing.value) return;
          const sameDirection = Math.sign(event.translationX) === Math.sign(event.velocityX);
          const shouldDismiss =
            Math.abs(event.translationX) >= dockWidth.value * 0.25
            || (Math.abs(event.translationX) > 28 && sameDirection && Math.abs(event.velocityX) > 550);
          if (shouldDismiss) {
            dismissing.value = true;
            const direction = Math.sign(event.translationX) || 1;
            runOnJS(commitDismiss)();
            if (reducedMotion) {
              opacity.value = 0;
              runOnJS(finishDismiss)();
              return;
            }
            translateX.value = withTiming(direction * (dockWidth.value + 36), { duration: 160 });
            opacity.value = withTiming(0, { duration: 160 }, () => {
              runOnJS(finishDismiss)();
            });
            return;
          }
          translateX.value = reducedMotion ? 0 : withSpring(0, { damping: 28, stiffness: 280 });
          opacity.value = reducedMotion ? 1 : withSpring(1);
        })
        .onFinalize((_event, success) => {
          if (success || dismissing.value) return;
          translateX.value = reducedMotion ? 0 : withSpring(0, { damping: 28, stiffness: 280 });
          opacity.value = reducedMotion ? 1 : withSpring(1);
        }),
    [commitDismiss, dismissing, dockWidth, finishDismiss, opacity, reducedMotion, translateX],
  );

  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const playing = displayState.status === 'playing';

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        pointerEvents={frozenState ? 'none' : 'auto'}
        onLayout={(event) => {
          dockWidth.value = event.nativeEvent.layout.width;
        }}
        accessibilityRole="none"
        style={[
          styles.dock,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.borderFocused,
          },
          motionStyle,
        ]}
      >
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Change background sound. ${track.title}. ${ambientStatusText(displayState)}`}
          style={({ pressed }) => [styles.detail, pressed && styles.pressed]}
        >
          <View style={[styles.mark, { borderColor: colors.border }]}>
            <MusicNotesIcon
              size={20}
              color={playing ? colors.accent : colors.textMuted}
              weight="light"
            />
          </View>
          <View style={styles.copy}>
            <AmbientText style={[styles.title, { color: colors.text }]}>
              {track.title}
            </AmbientText>
            <AmbientText style={[styles.subtitle, { color: colors.textMuted }]}>
              {ambientStatusText(displayState)}
            </AmbientText>
          </View>
        </Pressable>
        <Pressable
          onPress={() => toggle()}
          accessibilityRole="button"
          accessibilityLabel={
            playing
              ? 'Pause sound'
              : displayState.status === 'loading'
                ? 'Cancel loading sound'
                : displayState.status === 'error'
                  ? 'Retry sound'
                  : 'Play sound'
          }
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          {playing ? (
            <PauseIcon size={20} color={colors.accent} />
          ) : (
            <PlayIcon size={20} color={colors.accent} />
          )}
        </Pressable>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Stop and dismiss music"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <XIcon size={17} color={colors.textMuted} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 17,
    paddingRight: 4,
  },
  detail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mark: {
    width: 35,
    height: 35,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { fontFamily: FontFamily.uiMedium, fontSize: 13 },
  subtitle: { fontFamily: FontFamily.ui, fontSize: 11, marginTop: 4 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
});
