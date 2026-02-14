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
  scale: any;
  opacity: any;
  translateX: any;
  translateY: any;
  rotationValue: any;
}

export function SparkleBurst({ 
  trigger, 
  color = '#C8A55C',
  particleCount = 12 
}: SparkleBurstProps) {
  // Create particles with pre-calculated values (no hooks in loop)
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      const angle = (i * (360 / particleCount)) * (Math.PI / 180);
      return {
        angle,
        distance: 80 + Math.random() * 40,
        delay: i * 20 + Math.random() * 40, // Organic clustering
        rotation: Math.random() * 360,
        scale: useSharedValue(0),
        opacity: useSharedValue(0),
        translateX: useSharedValue(0),
        translateY: useSharedValue(0),
        rotationValue: useSharedValue(0),
      };
    });
  }, [particleCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      particles.forEach(p => {
        cancelAnimation(p.scale);
        cancelAnimation(p.opacity);
        cancelAnimation(p.translateX);
        cancelAnimation(p.translateY);
        cancelAnimation(p.rotationValue);
      });
    };
  }, [particles]);

  useEffect(() => {
    if (trigger) {
      particles.forEach((particle) => {
        // Reset values
        particle.scale.value = 0;
        particle.opacity.value = 0;
        particle.translateX.value = 0;
        particle.translateY.value = 0;
        particle.rotationValue.value = 0;

        const { delay, distance, angle, rotation } = particle;
        
        // Scale up with slight overshoot, then fade (end at 0.2 not 0)
        particle.scale.value = withDelay(delay, 
          withSequence(
            withTiming(1.2, { duration: 200, easing: Easing.out(Easing.ease) }),
            withTiming(0.8, { duration: 200 }),
            withTiming(0.2, { duration: 300 })
          )
        );

        // Fade in then out
        particle.opacity.value = withDelay(delay,
          withSequence(
            withTiming(1, { duration: 100 }),
            withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) })
          )
        );

        // Move outward with natural deceleration
        particle.translateX.value = withDelay(delay,
          withTiming(Math.cos(angle) * distance, { 
            duration: 600, 
            easing: Easing.bezier(0.25, 0.1, 0.25, 1) 
          })
        );
        particle.translateY.value = withDelay(delay,
          withTiming(Math.sin(angle) * distance, { 
            duration: 600, 
            easing: Easing.bezier(0.25, 0.1, 0.25, 1) 
          })
        );

        // Rotation
        particle.rotationValue.value = withDelay(delay,
          withTiming(rotation, { duration: 600 })
        );
      });
    }
  }, [trigger, particles]);

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
              width: 10,
              height: 10,
              marginLeft: -5,
              marginTop: -5,
            },
            useAnimatedStyle(() => ({
              transform: [
                { translateX: particle.translateX.value },
                { translateY: particle.translateY.value },
                { scale: particle.scale.value },
                { rotate: `${particle.rotationValue.value}deg` },
              ],
              opacity: particle.opacity.value,
            })),
          ]}
        >
          {/* Star shape using borders */}
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
      ))}
    </View>
  );
}
