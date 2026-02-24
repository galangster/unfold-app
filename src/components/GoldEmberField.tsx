import React, { useEffect, useCallback, useMemo } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface EmberParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  opacity: number;
}

interface EmberParticleProps {
  particle: EmberParticle;
  onComplete: () => void;
  colors: {
    accent: string;
    accentLight: string;
  };
}

function EmberParticleComponent({ particle, onComplete, colors }: EmberParticleProps) {
  const progress = useSharedValue(0);
  const opacityProgress = useSharedValue(0);
  const driftOffset = useSharedValue(0);

  useEffect(() => {
    // Initial delay before this particle spawns
    const spawnDelay = particle.delay;
    
    // Animate the upward progress
    progress.value = withDelay(
      spawnDelay,
      withTiming(1, {
        duration: particle.duration,
        easing: Easing.out(Easing.ease),
      }, (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      })
    );

    // Fade in quickly, stay visible, then fade out at the end
    opacityProgress.value = withDelay(
      spawnDelay,
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: particle.duration * 0.6 }),
        withTiming(0, { duration: 600, easing: Easing.in(Easing.ease) })
      )
    );

    // Gentle horizontal drift using sine-like motion
    driftOffset.value = withDelay(
      spawnDelay,
      withRepeat(
        withSequence(
          withTiming(15, { duration: 2000, easing: Easing.linear }),
          withTiming(-15, { duration: 2000, easing: Easing.linear })
        ),
        -1,
        true
      )
    );

    return () => {
      cancelAnimation(progress);
      cancelAnimation(opacityProgress);
      cancelAnimation(driftOffset);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const y = interpolate(progress.value, [0, 1], [particle.y, particle.y - 200 - Math.random() * 100]);
    const x = particle.x + driftOffset.value * particle.drift;
    const scale = interpolate(progress.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0.5]);
    
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { scale },
      ],
      opacity: opacityProgress.value * particle.opacity,
    };
  });

  // Alternate between gold and warm amber colors
  const isGolden = particle.id % 3 === 0;
  const backgroundColor = isGolden ? colors.accent : colors.accentLight;
  
  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor,
          shadowColor: backgroundColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: particle.size,
        },
        animatedStyle,
      ]}
    />
  );
}

interface GoldEmberFieldProps {
  density?: 'low' | 'medium' | 'high';
  active?: boolean;
  style?: any;
}

export function GoldEmberField({ 
  density = 'medium', 
  active = true,
  style 
}: GoldEmberFieldProps) {
  const { colors, isDark } = useTheme();
  
  const particleCount = useMemo(() => {
    switch (density) {
      case 'low': return 12;
      case 'high': return 25;
      default: return 18;
    }
  }, [density]);

  // Create pool of particles that recycle
  const [particles, setParticles] = React.useState<EmberParticle[]>([]);
  const particleIdRef = React.useRef(0);

  const createParticle = useCallback((id: number): EmberParticle => {
    return {
      id,
      x: Math.random() * SCREEN_WIDTH,
      y: SCREEN_HEIGHT + 20 + Math.random() * 100, // Start below screen
      size: 2 + Math.random() * 4, // 2-6px
      duration: 4000 + Math.random() * 3000, // 4-7 seconds
      delay: Math.random() * 2000, // Random initial delay
      drift: 0.5 + Math.random() * 0.5, // Drift intensity
      opacity: 0.4 + Math.random() * 0.6, // Random opacity
    };
  }, []);

  // Initialize particles
  useEffect(() => {
    if (!active) return;
    
    const initialParticles = Array.from({ length: particleCount }, (_, i) => 
      createParticle(i)
    );
    setParticles(initialParticles);
    particleIdRef.current = particleCount;
  }, [active, particleCount, createParticle]);

  const handleParticleComplete = useCallback((particleId: number) => {
    // Recycle this particle with new random properties
    setParticles(prev => 
      prev.map(p => 
        p.id === particleId 
          ? createParticle(particleIdRef.current++)
          : p
      )
    );
  }, [createParticle]);

  // Ember colors - golden and amber tones
  const emberColors = useMemo(() => ({
    accent: colors.accent,
    accentLight: isDark ? '#D4A85C' : '#C9A55C', // Warmer amber
  }), [colors.accent, isDark]);

  if (!active) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, style]} pointerEvents="none">
      {particles.map((particle) => (
        <EmberParticleComponent
          key={particle.id}
          particle={particle}
          onComplete={() => handleParticleComplete(particle.id)}
          colors={emberColors}
        />
      ))}
      
      {/* Subtle warm glow overlay at bottom */}
      <View 
        style={[
          styles.glowOverlay,
          {
            backgroundColor: isDark 
              ? 'rgba(200, 165, 92, 0.03)' 
              : 'rgba(154, 123, 60, 0.02)',
          }
        ]} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
  },
  glowOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
});
