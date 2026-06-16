import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  Alignment,
  DataBindMode,
  Fit,
  RiveView,
  useRive,
  useRiveFile,
  useViewModelInstance,
  type RiveFileInput,
  type ViewModelInstance,
} from '@rive-app/react-native';
import { hexToRgb } from '@/lib/ember-system';

const STATE_MACHINE_NAME = 'State Machine 1';
const VIEW_MODEL_NAME = 'ViewModel1';
const LOG_PREFIX = 'today-wind-leaves-rive';

const optionalNumberProperties = [
  'accentR',
  'accentG',
  'accentB',
  'width',
  'height',
] as const;

interface TodayCompletionRiveProps {
  source: RiveFileInput;
  active: boolean;
  accentColor: string;
  isDark: boolean;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}

interface RiveThemeValues {
  numberValues: Record<(typeof optionalNumberProperties)[number], number>;
}

function buildRiveThemeValues({
  accentColor,
  width,
  height,
}: {
  accentColor: string;
  width: number;
  height: number;
}): RiveThemeValues {
  const accent = /^[#][0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#C8A55C';
  const { r, g, b } = hexToRgb(accent);

  return {
    numberValues: {
      accentR: r / 255,
      accentG: g / 255,
      accentB: b / 255,
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
  };
}

function applyViewModelTheme(instance: ViewModelInstance | null | undefined, values: RiveThemeValues): void {
  if (!instance) return;

  // This asset's visual palette is authored in Rive. Do not override
  // background/glow/artwork/mask color ViewModel properties from app accent
  // colors; doing so turns the Today screen into a saturated theme wash.
  // Keep only non-color runtime values here unless a future animator contract
  // explicitly requires app-side color control and passes runtime proof.
  for (const propertyName of optionalNumberProperties) {
    const property = instance.numberProperty(propertyName);
    if (property) {
      property.set(values.numberValues[propertyName]);
    }
  }
}

export function TodayCompletionRive({
  source,
  active,
  accentColor,
  isDark,
  width,
  height,
  style,
}: TodayCompletionRiveProps) {
  const values = buildRiveThemeValues({ accentColor, width, height });
  const { riveFile, error: riveFileError } = useRiveFile(source);
  const { riveViewRef, setHybridRef } = useRive();
  const { instance, error: viewModelError } = useViewModelInstance(riveFile, {
    viewModelName: VIEW_MODEL_NAME,
    onInit: (newInstance) => applyViewModelTheme(newInstance, values),
  });
  const loopProgress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = loopProgress.get();
    const minOpacity = isDark ? 0.72 : 0.58;
    const maxOpacity = isDark ? 0.88 : 0.72;
    return {
      opacity: interpolate(p, [0, 0.5, 1], [minOpacity, maxOpacity, minOpacity]),
      transform: [
        { translateX: interpolate(p, [0, 1], [-6, 6]) },
        { translateY: interpolate(p, [0, 0.5, 1], [4, -7, 4]) },
        { scale: interpolate(p, [0, 0.5, 1], [1.01, 1.025, 1.01]) },
      ],
    };
  });

  useEffect(() => {
    if (riveFileError) {
      console.warn(`[${LOG_PREFIX}] Failed to load Rive file:`, riveFileError.message);
    }
  }, [riveFileError]);

  useEffect(() => {
    if (viewModelError) {
      console.warn(`[${LOG_PREFIX}] Failed to create ${VIEW_MODEL_NAME}:`, viewModelError.message);
    }
  }, [viewModelError]);

  useEffect(() => {
    if (!active) {
      loopProgress.set(0);
      return;
    }

    loopProgress.set(
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 7600,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration: 7600,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        false,
      ),
    );

    return () => loopProgress.set(0);
  }, [active, loopProgress]);

  useEffect(() => {
    applyViewModelTheme(instance, values);
  }, [instance, values]);

  useEffect(() => {
    if (!riveViewRef || !active) return;

    let cancelled = false;
    const syncRive = async () => {
      try {
        await riveViewRef.awaitViewReady();
        if (cancelled) return;

        const boundInstance = instance ?? riveViewRef.getViewModelInstance();
        applyViewModelTheme(boundInstance, values);

        riveViewRef.playIfNeeded();
        await riveViewRef.play();
      } catch (error) {
        if (!cancelled) {
          console.warn(
            `[${LOG_PREFIX}] Failed to sync Rive playback:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    };

    void syncRive();

    return () => {
      cancelled = true;
      void riveViewRef.pause().catch(() => {});
    };
  }, [active, instance, riveViewRef, values]);

  if (!active || !riveFile) return null;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="today-wind-leaves-rive-root"
      style={[StyleSheet.absoluteFill, styles.container, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <RiveView
          file={riveFile}
          stateMachineName={STATE_MACHINE_NAME}
          autoPlay={false}
          fit={Fit.Cover}
          alignment={Alignment.Center}
          dataBind={instance ?? DataBindMode.Auto}
          hybridRef={setHybridRef}
          onError={(error) => {
            console.warn(`[${LOG_PREFIX}] Rive render error:`, error.message);
          }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
