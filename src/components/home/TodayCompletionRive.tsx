import React, { useEffect, useMemo } from 'react';
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
  RiveColor,
  RiveView,
  useRive,
  useRiveFile,
  useViewModelInstance,
  type RiveFileInput,
  type ViewModelInstance,
} from '@rive-app/react-native';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  buildRiveThemeValues,
  RIVE_ACCENT_COLOR_PROPERTIES,
  RIVE_ACCENT_NUMBER_PROPERTIES,
  type RiveThemeValues,
} from '@/lib/rive-theme';

const STATE_MACHINE_NAME = 'State Machine 1';
const VIEW_MODEL_NAME = 'ViewModel1';
const LOG_PREFIX = 'today-rive';

interface TodayCompletionRiveProps {
  source: RiveFileInput;
  active: boolean;
  accentColor: string;
  backgroundColor: string;
  isDark: boolean;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}

function riveColorInt(hex: string): number {
  return RiveColor.fromHexString(hex).toInt();
}

function applyViewModelTheme(instance: ViewModelInstance | null | undefined, values: RiveThemeValues): void {
  if (!instance) return;

  // Every bundled Today Rive file must follow the user-selected accent. Older
  // files expose generic `color`/`Color` slots; the wind/leaves file exposes
  // named palette slots. Missing optional properties are skipped quietly.
  for (const propertyName of RIVE_ACCENT_COLOR_PROPERTIES) {
    const property = instance.colorProperty(propertyName);
    if (property) {
      property.set(riveColorInt(values.colorValues[propertyName]));
    }
  }

  for (const propertyName of RIVE_ACCENT_NUMBER_PROPERTIES) {
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
  backgroundColor,
  isDark,
  width,
  height,
  style,
}: TodayCompletionRiveProps) {
  const values = useMemo(() => buildRiveThemeValues({
    accentColor,
    backgroundColor,
    isDark,
    width,
    height,
  }), [accentColor, backgroundColor, height, isDark, width]);
  const { riveFile, error: riveFileError } = useRiveFile(source);
  const { riveViewRef, setHybridRef } = useRive();
  const { reducedMotion } = useAccessibleAnimation();
  const { instance, error: viewModelError } = useViewModelInstance(riveFile, {
    viewModelName: VIEW_MODEL_NAME,
    onInit: (newInstance) => applyViewModelTheme(newInstance, values),
  });
  const loopProgress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = loopProgress.get();
    // Keep the ambient art clearly visible (a gentle breath, high floor) — the
    // earlier low light-mode range washed the animation out almost entirely.
    // Light mode holds the ambient art near full strength (0.92–1.0) so accent
    // art stays legible on the light surface; dark breathes a little more
    // (0.88–1.0). (Raised from an earlier 0.72–0.92 light range that washed out.)
    const minOpacity = isDark ? 0.88 : 0.92;
    const maxOpacity = 1;
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
    if (!active || reducedMotion) {
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
  }, [active, loopProgress, reducedMotion]);

  useEffect(() => {
    applyViewModelTheme(instance, values);
  }, [instance, values]);

  useEffect(() => {
    if (!riveViewRef || !active || reducedMotion) return;

    let cancelled = false;
    const syncRive = async () => {
      try {
        await riveViewRef.awaitViewReady();
        if (cancelled) return;

        const boundInstance = instance ?? riveViewRef.getViewModelInstance();
        applyViewModelTheme(boundInstance, values);

        // Some scenes consume the accent via state-machine number inputs (the
        // particle systems) rather than ViewModel properties. Push the 0-255
        // channels there too; harmlessly ignored when the input doesn't exist.
        for (const propertyName of RIVE_ACCENT_NUMBER_PROPERTIES) {
          try {
            riveViewRef.setNumberInputValue(propertyName, values.numberValues[propertyName]);
          } catch {
            // Input not present on this scene's state machine — fine.
          }
        }

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
  }, [active, instance, reducedMotion, riveViewRef, values]);

  if (!active || reducedMotion || !riveFile) return null;

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
