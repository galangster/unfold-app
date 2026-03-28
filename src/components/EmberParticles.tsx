/**
 * Floating ember particles — subtle, nature-y glow animation
 * Used on the mirror-back onboarding screen
 */

import { useEffect, useMemo } from 'react';
import { View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ParticleConfig {
  x: number;
  size: number;
  duration: number;
  delay: number;
  sway: number;
  maxOpacity: number;
}

function Ember({ x, size, duration, delay, sway, maxOpacity, color }: ParticleConfig & { color: string }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Pulse: fade in then slowly fade out as particle rises
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(maxOpacity, { duration: duration * 0.25, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: duration * 0.75, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    // Float upward
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-320, { duration, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );

    // Gentle horizontal sway
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(sway, { duration: duration * 0.5, easing: Easing.inOut(Easing.sin) }),
          withTiming(-sway, { duration: duration * 0.5, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: 0,
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: size * 3,
        },
        animatedStyle,
      ]}
    />
  );
}

interface EmberParticlesProps {
  color: string;
  count?: number;
}

export function EmberParticles({ color, count = 12 }: EmberParticlesProps) {
  const particles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: count }, () => ({
        x: Math.random() * SCREEN_WIDTH * 0.85 + SCREEN_WIDTH * 0.075,
        size: 2 + Math.random() * 3.5,
        duration: 5000 + Math.random() * 5000,
        delay: Math.random() * 4000,
        sway: 8 + Math.random() * 18,
        maxOpacity: 0.12 + Math.random() * 0.22,
      })),
    [count],
  );

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {particles.map((p, i) => (
        <Ember key={i} {...p} color={color} />
      ))}
    </View>
  );
}
