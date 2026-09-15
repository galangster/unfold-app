import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useAppForegrounded } from '@/hooks/useAppForegrounded';

const RINGS = [0, 1, 2] as const;

function Ripple({ color, size, index, moving }: {
  color: string;
  size: number;
  index: number;
  moving: boolean;
}) {
  const phase = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (!moving) return;

    phase.value = withDelay(index * 900, withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    ));
    return () => cancelAnimation(phase);
  }, [moving, index, phase]);

  const motionStyle = useAnimatedStyle(() => ({
    opacity: moving ? interpolate(phase.value, [0, 0.2, 1], [0, 0.5, 0]) : 0.22 - index * 0.05,
    transform: [{ scale: moving ? interpolate(phase.value, [0, 1], [0.25, 1]) : 0.45 + index * 0.25 }],
  }));

  return (
    <Animated.View
      style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }, motionStyle]}
    />
  );
}

/** Ongoing activity, without implying a percentage or time remaining. */
export function GenerationPulse({ color, size = 200, active = true }: {
  color: string;
  size?: number;
  active?: boolean;
}) {
  const { reducedMotion } = useAccessibleAnimation();
  const foregrounded = useAppForegrounded();
  const moving = active && foregrounded && !reducedMotion;
  const dotSize = Math.max(5, size * 0.04);

  return (
    <View
      testID="generation-pulse"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, { width: size, height: size }]}
    >
      {RINGS.map((index) => (
        <Ripple key={index} index={index} color={color} size={size * 0.9} moving={moving} />
      ))}
      <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color, opacity: 0.85 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5 },
});
