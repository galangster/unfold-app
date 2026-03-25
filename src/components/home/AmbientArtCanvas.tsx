import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Dimensions, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import {
  Canvas,
  Fill,
  Shader,
  Group,
  Rect,
  Mask,
  LinearGradient,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedSensor,
  SensorType,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { AmbientTiming } from '@/constants/animations';
import { concentricRingsSource } from '@/components/home/shaders/concentric-rings';
import { organicNoiseSource } from '@/components/home/shaders/organic-noise';
import { EmberAtlas } from '@/components/home/EmberAtlas';
import type { SharedValue } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Hex-to-normalized-RGB for shader uniforms
// ---------------------------------------------------------------------------

function hexToNormalizedRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

// ---------------------------------------------------------------------------
// Reusable time loop config
// ---------------------------------------------------------------------------

function createTimeLoop() {
  return withRepeat(
    withTiming(Math.PI * 200, {
      duration: AmbientTiming.timeLoop,
      easing: Easing.linear,
    }),
    -1,
    false,
  );
}

// ---------------------------------------------------------------------------
// AmbientArtCanvas
// ---------------------------------------------------------------------------

interface Props {
  streakLevel: number;
  hasReadToday: boolean;
  scrollY: SharedValue<number>;
}

export function AmbientArtCanvas({ streakLevel, hasReadToday, scrollY }: Props) {
  const { colors, isDark } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  // --- Time driver ---
  const time = useSharedValue(0);
  const isActive = useRef(true);

  // Start the time loop (no-op if reducedMotion — animation never starts)
  useEffect(() => {
    if (reducedMotion) return;
    time.value = createTimeLoop();

    return () => {
      cancelAnimation(time);
    };
  }, [time, reducedMotion]);

  // --- App state: pause when backgrounded ---
  useEffect(() => {
    if (reducedMotion) return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && !isActive.current) {
        isActive.current = true;
        time.value = createTimeLoop();
      } else if (nextState !== 'active' && isActive.current) {
        isActive.current = false;
        cancelAnimation(time);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [time, reducedMotion]);

  // --- Tab focus: pause/resume ---
  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) return;

      // On focus: restart animation
      time.value = createTimeLoop();

      return () => {
        // On blur: pause
        cancelAnimation(time);
      };
    }, [time, reducedMotion]),
  );

  // --- Accent color as normalized RGB for shader uniforms ---
  const accentRgb = useMemo(
    () => hexToNormalizedRgb(colors.accent),
    [colors.accent],
  );

  // --- Shader opacity based on theme ---
  const ringsOpacity = isDark ? 0.03 : 0.02;
  const noiseOpacity = isDark ? 0.02 : 0.01;

  // --- Scroll fade: opacity decreases as user scrolls down ---
  // 1.0 at top, 0.3 at 400px scroll
  const scrollOpacity = useDerivedValue(() => {
    'worklet';
    const progress = Math.min(scrollY.value / 400, 1);
    return 1 - progress * 0.7;
  });

  // --- Device tilt parallax ---
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

  const tiltStyle = useAnimatedStyle(() => {
    'worklet';
    const { roll, pitch } = sensor.sensor.value;
    return {
      transform: [
        { translateX: roll * 6 },
        { translateY: pitch * 6 },
      ],
    };
  });

  // --- Shader uniforms ---
  const ringsUniforms = useDerivedValue(() => ({
    iTime: time.value,
    iResolution: [SCREEN_WIDTH, SCREEN_HEIGHT],
    accentColor: accentRgb,
  }));

  const noiseUniforms = useDerivedValue(() => ({
    iTime: time.value,
    iResolution: [SCREEN_WIDTH, SCREEN_HEIGHT],
    accentColor: accentRgb,
  }));

  // Bail out entirely for reduced motion users — after all hooks are called
  if (reducedMotion) return null;

  return (
    <>
      {/* Layer 0a: Skia shaders with device-tilt parallax */}
      <Animated.View style={[StyleSheet.absoluteFill, tiltStyle]} pointerEvents="none">
        <Canvas
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityElementsHidden
        >
          <Group opacity={scrollOpacity}>
            {/* Edge fade mask: transparent at top/bottom, opaque in middle */}
            <Mask
              mode="alpha"
              mask={
                <Rect x={0} y={0} width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(0, SCREEN_HEIGHT)}
                    colors={[
                      'transparent',
                      'white',
                      'white',
                      'transparent',
                    ]}
                    positions={[0, 0.08, 0.85, 1]}
                  />
                </Rect>
              }
            >
              {/* Concentric rings shader */}
              <Group opacity={ringsOpacity}>
                <Fill>
                  <Shader source={concentricRingsSource} uniforms={ringsUniforms} />
                </Fill>
              </Group>

              {/* Organic noise shader */}
              <Group opacity={noiseOpacity}>
                <Fill>
                  <Shader source={organicNoiseSource} uniforms={noiseUniforms} />
                </Fill>
              </Group>
            </Mask>
          </Group>
        </Canvas>
      </Animated.View>

      {/* Layer 0b: Ember particles — only when today's reading is complete */}
      {hasReadToday && (
        <EmberAtlas streakLevel={streakLevel} active />
      )}
    </>
  );
}
