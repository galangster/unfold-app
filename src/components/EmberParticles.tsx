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

function Ember({ x, size, duration, delay, sway, maxOpacity, color, direction = 'up' }: ParticleConfig & { color: string; direction?: 'up' | 'down' }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
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

    // Float up or down
    const travel = direction === 'up' ? -320 : 320;
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(travel, { duration, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );

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
          [direction === 'up' ? 'bottom' : 'top']: 0,
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
  /** Also emit falling embers from the top of the screen */
  bidirectional?: boolean;
}

export function EmberParticles({ color, count = 12, bidirectional = false }: EmberParticlesProps) {
  const upCount = bidirectional ? Math.ceil(count * 0.6) : count;
  const downCount = bidirectional ? count - upCount : 0;

  const upParticles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: upCount }, () => ({
        x: Math.random() * SCREEN_WIDTH * 0.85 + SCREEN_WIDTH * 0.075,
        size: 2.5 + Math.random() * 4,
        duration: 5000 + Math.random() * 5000,
        delay: Math.random() * 4000,
        sway: 8 + Math.random() * 18,
        maxOpacity: 0.25 + Math.random() * 0.35,
      })),
    [upCount],
  );

  const downParticles = useMemo<ParticleConfig[]>(
    () =>
      Array.from({ length: downCount }, () => ({
        x: Math.random() * SCREEN_WIDTH * 0.85 + SCREEN_WIDTH * 0.075,
        size: 2 + Math.random() * 3,
        duration: 6000 + Math.random() * 5000,
        delay: Math.random() * 4000,
        sway: 6 + Math.random() * 14,
        maxOpacity: 0.15 + Math.random() * 0.25,
      })),
    [downCount],
  );

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
      pointerEvents="none"
    >
      {upParticles.map((p, i) => (
        <Ember key={`up-${i}`} {...p} color={color} direction="up" />
      ))}
      {downParticles.map((p, i) => (
        <Ember key={`dn-${i}`} {...p} color={color} direction="down" />
      ))}
    </View>
  );
}
