import React from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { useTheme } from '@/lib/theme';

interface SparkleBurstProps {
  trigger: boolean;
  color?: string;
  particleCount?: number;
}

interface Particle {
  angle: number;
  distance: number;
  delay: number;
  rotation: number;
  rotationSpeed: number;
}

interface SparkleParticleProps {
  particle: Particle;
  color: string;
  trigger: boolean;
}

// Maximum number of particles supported
const MAX_PARTICLES = 32;

const SparkleParticle = React.memo(function SparkleParticle({ particle, color, trigger }: SparkleParticleProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotationValue = useSharedValue(0);

  useEffect(() => {
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(rotationValue);
    };
  }, [opacity, rotationValue, scale, translateX, translateY]);

  useEffect(() => {
    if (!trigger) return;

    // Reset values
    scale.value = 0;
    opacity.value = 0;
    translateX.value = 0;
    translateY.value = 0;
    rotationValue.value = 0;

    const { delay, distance, angle, rotation, rotationSpeed } = particle;

    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.3, { duration: 180, easing: Easing.out(Easing.ease) }),
        withTiming(0.9, { duration: 200 }),
        withTiming(0.3, { duration: 400 })
      )
    );

    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0.85, { duration: 400 }),
        withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) })
      )
    );

    translateX.value = withDelay(
      delay,
      withTiming(Math.cos(angle) * distance, {
        duration: 900,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );

    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(Math.sin(angle) * distance * 0.3, {
          duration: 300,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(Math.sin(angle) * distance + 20, {
          duration: 600,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      )
    );

    rotationValue.value = withDelay(
      delay,
      withTiming(rotation + rotationSpeed, {
        duration: 900,
        easing: Easing.out(Easing.quad),
      })
    );
  }, [opacity, particle, rotationValue, scale, translateX, translateY, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotationValue.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 10,
          height: 10,
          marginLeft: -5,
          marginTop: -5,
        },
        animatedStyle,
      ]}
    >
      <View
        style={{
          width: 0,
          height: 0,
          backgroundColor: 'transparent',
          borderStyle: 'solid',
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderBottomWidth: 8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 5,
          width: 0,
          height: 0,
          backgroundColor: 'transparent',
          borderStyle: 'solid',
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </Animated.View>
  );
});

export function SparkleBurst({
  trigger,
  color: propColor,
  particleCount = 16,
}: SparkleBurstProps) {
  const { colors } = useTheme();
  const color = propColor ?? colors.accent;
  const count = Math.min(particleCount, MAX_PARTICLES);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const baseAngle = (i * (360 / count)) * (Math.PI / 180);
      const angleVariation = (Math.random() - 0.5) * 0.3;
      return {
        angle: baseAngle + angleVariation,
        distance: 60 + Math.random() * 50,
        delay: i * 15 + Math.random() * 60,
        rotation: Math.random() * 360,
        rotationSpeed: 180 + Math.random() * 360,
      };
    });
  }, [count]);

  return (
    <View
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {particles.map((particle, i) => (
        <SparkleParticle
          key={i}
          particle={particle}
          color={color}
          trigger={trigger}
        />
      ))}
    </View>
  );
}
