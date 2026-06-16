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
  RiveColor,
  RiveView,
  useRive,
  useRiveFile,
  useViewModelInstance,
  type RiveFileInput,
  type ViewModelInstance,
} from '@rive-app/react-native';
import { darken, hexToRgb, lighten } from '@/lib/ember-system';

const STATE_MACHINE_NAME = 'State Machine 1';
const VIEW_MODEL_NAME = 'ViewModel1';
const LOG_PREFIX = 'today-wind-leaves-rive';

const optionalColorProperties = [
  'background__color',
  'glow_color',
  'artwork_color',
  'mask_gradient_start',
  'mask_gradient_end',
  // Present in the animator screenshot but not in the first bundled file. Set
  // when future files expose it; otherwise silently skip to keep logs clean.
  'waterfall_glow_color',
] as const;

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
  colorValues: Record<(typeof optionalColorProperties)[number], number>;
  numberValues: Record<(typeof optionalNumberProperties)[number], number>;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#00000000';
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `#${normalized}${a.toString(16).padStart(2, '0')}`;
}

function riveColorInt(hex: string): number {
  return RiveColor.fromHexString(hex).toInt();
}

function buildRiveThemeValues({
  accentColor,
  isDark,
  width,
  height,
}: {
  accentColor: string;
  isDark: boolean;
  width: number;
  height: number;
}): RiveThemeValues {
  const accent = /^[#][0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#C8A55C';
  const glow = isDark ? lighten(accent, 0.35) : lighten(accent, 0.18);
  const background = isDark ? darken(accent, 0.72) : lighten(accent, 0.62);
  const maskStart = isDark ? lighten(accent, 0.22) : accent;
  const maskEnd = isDark ? darken(accent, 0.5) : lighten(accent, 0.72);
  const { r, g, b } = hexToRgb(accent);

  return {
    colorValues: {
      background__color: riveColorInt(withAlpha(background, isDark ? 0.16 : 0.1)),
      glow_color: riveColorInt(withAlpha(glow, isDark ? 0.88 : 0.72)),
      artwork_color: riveColorInt(withAlpha(accent, 0.95)),
      mask_gradient_start: riveColorInt(withAlpha(maskStart, isDark ? 0.72 : 0.55)),
      mask_gradient_end: riveColorInt(withAlpha(maskEnd, 0)),
      waterfall_glow_color: riveColorInt(withAlpha(glow, isDark ? 0.68 : 0.5)),
    },
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

  for (const propertyName of optionalColorProperties) {
    const property = instance.colorProperty(propertyName);
    if (property) {
      property.set(values.colorValues[propertyName]);
    }
  }

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
  const values = buildRiveThemeValues({ accentColor, isDark, width, height });
  const { riveFile, error: riveFileError } = useRiveFile(source);
  const { riveViewRef, setHybridRef } = useRive();
  const { instance, error: viewModelError } = useViewModelInstance(riveFile, {
    viewModelName: VIEW_MODEL_NAME,
    onInit: (newInstance) => applyViewModelTheme(newInstance, values),
  });
  const loopProgress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = loopProgress.get();
    return {
      opacity: interpolate(p, [0, 0.5, 1], [0.9, 1, 0.9]),
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
