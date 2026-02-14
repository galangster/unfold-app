import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface SparkleBurstProps {
  trigger: boolean;
  color?: string;
  particleCount?: number;
}

export function SparkleBurst({ 
  trigger, 
  color = '#C8A55C',
  particleCount = 12 
}: SparkleBurstProps) {
  // Create particles with different angles
  const particles = Array.from({ length: particleCount }, (_, i) => ({
    angle: (i * (360 / particleCount)) * (Math.PI / 180),
    scale: useSharedValue(0),
    opacity: useSharedValue(0),
    translateX: useSharedValue(0),
    translateY: useSharedValue(0),
  }));

  useEffect(() => {
    if (trigger) {
      particles.forEach((particle, i) => {
        // Reset values
        particle.scale.value = 0;
        particle.opacity.value = 0;
        particle.translateX.value = 0;
        particle.translateY.value = 0;

        // Animate with stagger
        const delay = i * 30;
        
        // Scale up quickly
        particle.scale.value = withDelay(delay, 
          withSequence(
            withTiming(1.2, { duration: 200 }),
            withTiming(0, { duration: 300 })
          )
        );

        // Fade in then out
        particle.opacity.value = withDelay(delay,
          withSequence(
            withTiming(1, { duration: 100 }),
            withTiming(0, { duration: 400 })
          )
        );

        // Move outward
        const distance = 80 + Math.random() * 40;
        particle.translateX.value = withDelay(delay,
          withTiming(Math.cos(particle.angle) * distance, { duration: 500 })
        );
        particle.translateY.value = withDelay(delay,
          withTiming(Math.sin(particle.angle) * distance, { duration: 500 })
        );
      });
    }
  }, [trigger]);

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
        <Animated.View
          key={i}
          style={[
            {
              position: 'absolute',
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: color,
              marginLeft: -4,
              marginTop: -4,
            },
            useAnimatedStyle(() => ({
              transform: [
                { translateX: particle.translateX.value },
                { translateY: particle.translateY.value },
                { scale: particle.scale.value },
              ],
              opacity: particle.opacity.value,
            })),
          ]}
        />
      ))}
    </View>
  );
}
