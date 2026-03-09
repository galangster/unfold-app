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
  riseHeight: number; // Pre-computed to avoid Math.random() in worklet
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
    
    // Animate the upward progress — linear rise like real embers drifting up
    progress.value = withDelay(
      spawnDelay,
      withTiming(1, {
        duration: particle.duration,
        easing: Easing.linear,
      }, (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      })
    );

    // Fade in, hold, then slowly fade out over the last 30%
    opacityProgress.value = withDelay(
      spawnDelay,
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: particle.duration * 0.5 }),
        withTiming(0, { duration: particle.duration * 0.3, easing: Easing.in(Easing.ease) })
      )
    );

    // Wider, slower horizontal drift — like embers floating in warm air
    driftOffset.value = withDelay(
      spawnDelay,
      withRepeat(
        withSequence(
          withTiming(25, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-25, { duration: 3000, easing: Easing.inOut(Easing.ease) })
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
    const y = interpolate(progress.value, [0, 1], [particle.y, particle.y - particle.riseHeight]);
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
      y: SCREEN_HEIGHT + 20 + Math.random() * 60, // Start just below screen
      size: 2 + Math.random() * 3, // 2-5px
      duration: 6000 + Math.random() * 6000, // 6-12 seconds — slow rise
      delay: Math.random() * 3000, // Staggered initial delay
      drift: 0.3 + Math.random() * 0.7, // Drift intensity
      opacity: 0.3 + Math.random() * 0.5, // Softer opacity range
      riseHeight: SCREEN_HEIGHT + 60 + Math.random() * 100, // Rise full screen height and beyond
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

  // Ember colors - use theme accent with a lighter variant
  const emberColors = useMemo(() => ({
    accent: colors.accent,
    accentLight: colors.accent + 'AA', // Slightly transparent variant of accent
  }), [colors.accent]);

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
