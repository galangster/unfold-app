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
import { LinearGradient } from 'expo-linear-gradient';
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

// ---------------------------------------------------------------------------
// Streak-based intensity tiers (Guitar Hero multiplier style)
// Embers build up with streak, hitting a peak "don't lose this" state at 7+
// ---------------------------------------------------------------------------

interface EmberTier {
  count: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
  glowOpacity: number;    // Bottom ambient gradient strength
  glowHeight: number;     // How tall the gradient is
}

function getEmberTier(streak: number): EmberTier {
  if (streak <= 0) return { count: 8, sizeMin: 1.5, sizeMax: 3, opacityMin: 0.15, opacityMax: 0.35, glowOpacity: 0, glowHeight: 0 };
  if (streak <= 2) return { count: 14, sizeMin: 2, sizeMax: 3.5, opacityMin: 0.2, opacityMax: 0.4, glowOpacity: 0.03, glowHeight: 160 };
  if (streak <= 6) return { count: 22, sizeMin: 2, sizeMax: 4, opacityMin: 0.25, opacityMax: 0.5, glowOpacity: 0.06, glowHeight: 220 };
  // 7+ days: peak state — the fire is roaring
  if (streak <= 13) return { count: 32, sizeMin: 2, sizeMax: 5, opacityMin: 0.3, opacityMax: 0.6, glowOpacity: 0.09, glowHeight: 280 };
  // 14+ days: max state — locked in, don't drop this
  return { count: 40, sizeMin: 2.5, sizeMax: 5.5, opacityMin: 0.35, opacityMax: 0.65, glowOpacity: 0.12, glowHeight: 320 };
}

function densityToCount(density: 'low' | 'medium' | 'high'): number {
  switch (density) {
    case 'low': return 12;
    case 'high': return 25;
    default: return 18;
  }
}

interface GoldEmberFieldProps {
  /** Legacy density prop — use streakLevel for dynamic intensity */
  density?: 'low' | 'medium' | 'high';
  /** Streak day count — drives particle count, size, brightness, and ambient glow */
  streakLevel?: number;
  active?: boolean;
  style?: any;
}

export function GoldEmberField({
  density = 'medium',
  streakLevel,
  active = true,
  style
}: GoldEmberFieldProps) {
  const { colors, isDark } = useTheme();

  // Determine tier from streakLevel (if provided) or fall back to density
  const tier = useMemo<EmberTier | null>(() => {
    if (streakLevel !== undefined) return getEmberTier(streakLevel);
    return null;
  }, [streakLevel]);

  const particleCount = tier?.count ?? densityToCount(density);
  const sizeMin = tier?.sizeMin ?? 2;
  const sizeMax = tier?.sizeMax ?? 3;
  const opacityMin = tier?.opacityMin ?? 0.3;
  const opacityMax = tier?.opacityMax ?? 0.5;

  // Create pool of particles that recycle
  const [particles, setParticles] = React.useState<EmberParticle[]>([]);
  const particleIdRef = React.useRef(0);

  const createParticle = useCallback((id: number): EmberParticle => {
    const sizeRange = sizeMax - sizeMin;
    return {
      id,
      x: Math.random() * SCREEN_WIDTH,
      y: SCREEN_HEIGHT + 20 + Math.random() * 60,
      size: sizeMin + Math.random() * sizeRange,
      duration: 6000 + Math.random() * 6000,
      delay: Math.random() * 3000,
      drift: 0.3 + Math.random() * 0.7,
      opacity: opacityMin + Math.random() * (opacityMax - opacityMin),
      riseHeight: SCREEN_HEIGHT + 60 + Math.random() * 100,
    };
  }, [sizeMin, sizeMax, opacityMin, opacityMax]);

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
    setParticles(prev =>
      prev.map(p =>
        p.id === particleId
          ? createParticle(particleIdRef.current++)
          : p
      )
    );
  }, [createParticle]);

  // Ember colors
  const emberColors = useMemo(() => ({
    accent: colors.accent,
    accentLight: colors.accent + 'AA',
  }), [colors.accent]);

  // Ambient glow params
  const glowOpacity = tier?.glowOpacity ?? (isDark ? 0.03 : 0.02);
  const glowHeight = tier?.glowHeight ?? 200;

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

      {/* Ambient warm glow — pooled light from below, like a fire just off-screen */}
      {glowOpacity > 0 && (
        <LinearGradient
          colors={
            isDark
              ? [`rgba(200, 165, 92, ${glowOpacity})`, 'rgba(200, 165, 92, 0)']
              : [`rgba(154, 123, 60, ${glowOpacity})`, 'rgba(154, 123, 60, 0)']
          }
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          style={[styles.glowGradient, { height: glowHeight }]}
          pointerEvents="none"
        />
      )}
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
  glowGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
