/**
 * RippleLoader
 *
 * Staggered concentric rings expanding outward from a center point. Same
 * visual language as the devotional generation screen — reuse this anywhere
 * we need a brief "working..." loader that matches the rest of the app.
 *
 * Tuned for short transitions (~500–1000ms). The stagger is fast enough that
 * at least one ripple is always visible even on very short displays. All
 * animations use critically-damped timing — no bounce.
 */

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';

interface RippleLoaderProps {
  /** Outer ring diameter at full expansion. Default 140. */
  size?: number;
  /** Ring stroke color. Default uses the app accent (gold-ish). */
  color?: string;
  /** How many concentric rings to render. Default 3. */
  ringCount?: number;
  /** Duration of each ring's expand cycle in ms. Default 2000. */
  duration?: number;
  /** Delay between successive rings in ms. Default 600. */
  stagger?: number;
}

const DEFAULT_COLOR = '#C8A55C';

export function RippleLoader({
  size = 140,
  color = DEFAULT_COLOR,
  ringCount = 3,
  duration = 2000,
  stagger = 600,
}: RippleLoaderProps) {
  // Always create the max number of shared values up front so the hook count
  // stays stable across renders (React rules-of-hooks).
  const r0 = useSharedValue(0);
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);
  const r3 = useSharedValue(0);
  const rings = [r0, r1, r2, r3].slice(0, ringCount);

  useEffect(() => {
    rings.forEach((sv, i) => {
      sv.value = withDelay(
        i * stagger,
        withRepeat(
          withTiming(1, {
            duration,
            easing: Easing.out(Easing.cubic),
          }),
          -1,
          false,
        ),
      );
    });
    return () => {
      rings.forEach((sv) => cancelAnimation(sv));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringCount, duration, stagger]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {rings.map((sv, i) => (
        <Ring key={i} sv={sv} size={size} color={color} />
      ))}
      {/* Solid center dot to anchor the animation visually */}
      <View
        style={[
          styles.center,
          { backgroundColor: color, width: size * 0.08, height: size * 0.08, borderRadius: (size * 0.08) / 2 },
        ]}
      />
    </View>
  );
}

function Ring({
  sv,
  size,
  color,
}: {
  sv: SharedValue<number>;
  size: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - sv.value),
    transform: [{ scale: 0.3 + sv.value * 0.7 }],
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  center: {
    position: 'absolute',
  },
});
