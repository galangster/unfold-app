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
  rotationSpeed: number;
  scale: any;
  opacity: any;
  translateX: any;
  translateY: any;
  rotationValue: any;
}

export function SparkleBurst({ 
  trigger, 
  color = '#C8A55C',
  particleCount = 16 
}: SparkleBurstProps) {
  // Create particles with pre-calculated values (no hooks in loop)
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      // Create organic clustering - not perfectly even
      const baseAngle = (i * (360 / particleCount)) * (Math.PI / 180);
      const angleVariation = (Math.random() - 0.5) * 0.3; // ±15% variation
      const angle = baseAngle + angleVariation;
      
      return {
        angle,
        distance: 60 + Math.random() * 50, // Varied distances
        delay: i * 15 + Math.random() * 60, // Organic clustering
        rotation: Math.random() * 360,
        rotationSpeed: 180 + Math.random() * 360, // Varied rotation speeds
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

        const { delay, distance, angle, rotation, rotationSpeed } = particle;
        
        // Scale up with slight overshoot, then settle
        particle.scale.value = withDelay(delay, 
          withSequence(
            withTiming(1.3, { duration: 180, easing: Easing.out(Easing.ease) }),
            withTiming(0.9, { duration: 200 }),
            withTiming(0.3, { duration: 400 })
          )
        );

        // Fade in quickly then fade out slowly
        particle.opacity.value = withDelay(delay,
          withSequence(
            withTiming(1, { duration: 80 }),
            withTiming(0.85, { duration: 400 }),
            withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) })
          )
        );

        // Move outward with natural deceleration and slight gravity
        particle.translateX.value = withDelay(delay,
          withTiming(Math.cos(angle) * distance, { 
            duration: 900, 
            easing: Easing.bezier(0.25, 0.1, 0.25, 1) 
          })
        );
        particle.translateY.value = withDelay(delay,
          withSequence(
            withTiming(Math.sin(angle) * distance * 0.3, { 
              duration: 300, 
              easing: Easing.out(Easing.quad) 
            }),
            withTiming(Math.sin(angle) * distance + 20, { 
              duration: 600, 
              easing: Easing.bezier(0.25, 0.1, 0.25, 1) 
            })
          )
        );

        // Rotation with varied speed
        particle.rotationValue.value = withDelay(delay,
          withTiming(rotation + rotationSpeed, { duration: 900, easing: Easing.out(Easing.quad) })
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
