import { useEffect, useMemo, useState } from 'react';
import { AppState, Dimensions, StyleSheet, View } from 'react-native';
import type { AppStateStatus, LayoutChangeEvent } from 'react-native';
import { Blur, Canvas, Fill, Group, Shader } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import {
  REVEAL_GRADIENT_FRAME_MS,
  REVEAL_REPRESENTATIVE_TIME,
  buildRevealPalette,
  resolveRevealCanvas,
  shouldRevealClockRun,
  type RevealGradientVariant,
} from '@/lib/reveal-gradient-palette';
import { getRevealRuntimeEffect } from '@/components/reveal/reveal-gradient-shader';

export type { RevealGradientVariant };

export type RevealGradientProps = {
  variant: RevealGradientVariant;
  accent: string;
  background: string;
  isDark: boolean;
  active?: boolean;
  reducedMotion?: boolean;
  soften?: number;
  testID?: string;
};

function useIsAppActive(): boolean {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return appState === 'active';
}

function useFieldSize() {
  const windowSize = Dimensions.get('window');
  const [size, setSize] = useState({ width: windowSize.width, height: windowSize.height });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  return { size, onLayout };
}

export function RevealGradient({
  variant,
  accent,
  background,
  isDark,
  active = true,
  reducedMotion = false,
  soften = 15,
  testID,
}: RevealGradientProps) {
  const appActive = useIsAppActive();
  const { size, onLayout } = useFieldSize();
  const palette = useMemo(
    () => buildRevealPalette(accent, background, isDark),
    [accent, background, isDark],
  );
  const canvas = useMemo(
    () => resolveRevealCanvas(size.width, size.height, soften),
    [size.height, size.width, soften],
  );
  const effect = useMemo(() => getRevealRuntimeEffect(variant), [variant]);

  const time = useSharedValue(reducedMotion ? REVEAL_REPRESENTATIVE_TIME : 0);
  const origin = useSharedValue(0);
  const lastStamp = useSharedValue(0);
  const rebase = useSharedValue(0);
  const colors = useSharedValue(palette);

  useEffect(() => {
    colors.value = palette;
  }, [colors, palette]);

  useEffect(() => {
    if (reducedMotion) {
      time.value = REVEAL_REPRESENTATIVE_TIME;
    }
  }, [reducedMotion, time]);

  const clockShouldRun = effect !== null && shouldRevealClockRun({
    active,
    reducedMotion,
    appActive,
  });

  const frameCallback = useFrameCallback((info) => {
    'worklet';
    if (rebase.value === 1) {
      origin.value = info.timestamp - time.value * 1000;
      lastStamp.value = -1;
      rebase.value = 0;
    }
    const frame = Math.floor((info.timestamp - origin.value) / REVEAL_GRADIENT_FRAME_MS);
    if (frame === lastStamp.value) return;
    lastStamp.value = frame;
    time.value = (info.timestamp - origin.value) / 1000;
  }, false);

  useEffect(() => {
    if (clockShouldRun) {
      rebase.value = 1;
      frameCallback.setActive(true);
    } else {
      frameCallback.setActive(false);
    }
    return () => {
      frameCallback.setActive(false);
    };
  }, [clockShouldRun, frameCallback, rebase]);

  const uniforms = useDerivedValue(() => ({
    u_res: [canvas.width, canvas.height],
    u_t: time.value,
    u_bg: colors.value.background,
    u_low: colors.value.low,
    u_mid: colors.value.mid,
    u_high: colors.value.high,
    u_paper: colors.value.paper,
  }));

  const canvasStyle = {
    width: canvas.width,
    height: canvas.height,
    transform: [
      { translateX: (canvas.width * (canvas.enlargeX - 1)) / 2 },
      { translateY: (canvas.height * (canvas.enlargeY - 1)) / 2 },
      { scaleX: canvas.enlargeX },
      { scaleY: canvas.enlargeY },
    ],
  };

  return (
    <View
      testID={testID}
      pointerEvents="none"
      onLayout={onLayout}
      style={styles.host}
    >
      <Canvas style={canvasStyle}>
        {effect ? (
          <Group>
            <Blur blur={canvas.canvasBlur} mode="clamp" />
            <Fill>
              <Shader source={effect} uniforms={uniforms} />
            </Fill>
          </Group>
        ) : (
          <Fill color={background} />
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
});
