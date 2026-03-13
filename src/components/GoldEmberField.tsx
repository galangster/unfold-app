import React, { useEffect, useMemo } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Hex color helpers — derive lighter/darker variants from accent
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color by a factor (0-1) */
function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Darken a hex color by a factor (0-1) */
function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

// ---------------------------------------------------------------------------
// Particle types
// ---------------------------------------------------------------------------

interface EmberParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  driftAmount: number;
  maxOpacity: number;
  colorIdx: number; // 0=primary, 1=secondary, 2=tertiary
}

// ---------------------------------------------------------------------------
// Single particle — self-looping, no JS callbacks, 2 shared values only
// ---------------------------------------------------------------------------

const EmberParticleComponent = React.memo(function EmberParticleComponent({
  particle,
  emberColors,
}: {
  particle: EmberParticle;
  emberColors: { primary: string; secondary: string; tertiary: string };
}) {
  const progress = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      particle.delay,
      withRepeat(
        withTiming(1, {
          duration: particle.duration,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    );

    drift.value = withDelay(
      particle.delay,
      withRepeat(
        withTiming(1, {
          duration: 2400 + (particle.id * 137) % 1200,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const translateY = interpolate(p, [0, 1], [0, -(SCREEN_HEIGHT + 80)]);
    const translateX = interpolate(drift.value, [0, 1], [-particle.driftAmount, particle.driftAmount]);
    const scale = interpolate(p, [0, 0.05, 0.12, 0.88, 1], [0.2, 0.7, 1, 1, 0.3]);
    const opacity = interpolate(p, [0, 0.04, 0.12, 0.7, 0.9, 1], [0, 0.3, 1, 1, 0.4, 0]) * particle.maxOpacity;

    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity,
    };
  });

  const colorKey = particle.colorIdx === 0 ? 'primary' : particle.colorIdx === 1 ? 'secondary' : 'tertiary';

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: particle.x,
          top: particle.y,
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: emberColors[colorKey],
        },
        animatedStyle,
      ]}
    />
  );
});

// ---------------------------------------------------------------------------
// Streak-based intensity tiers
// ---------------------------------------------------------------------------

interface EmberTier {
  count: number;
  sizeMin: number;
  sizeMax: number;
  opacityMin: number;
  opacityMax: number;
  glowOpacity: number;
  glowHeight: number;
}

function getEmberTier(streak: number): EmberTier {
  if (streak <= 0) return { count: 18, sizeMin: 2, sizeMax: 4, opacityMin: 0.3, opacityMax: 0.6, glowOpacity: 0.05, glowHeight: 180 };
  if (streak <= 2) return { count: 28, sizeMin: 2.5, sizeMax: 5, opacityMin: 0.4, opacityMax: 0.7, glowOpacity: 0.1, glowHeight: 220 };
  if (streak <= 6) return { count: 40, sizeMin: 2.5, sizeMax: 5.5, opacityMin: 0.45, opacityMax: 0.8, glowOpacity: 0.16, glowHeight: 280 };
  if (streak <= 13) return { count: 55, sizeMin: 3, sizeMax: 6.5, opacityMin: 0.5, opacityMax: 0.85, glowOpacity: 0.22, glowHeight: 340 };
  return { count: 70, sizeMin: 3, sizeMax: 7, opacityMin: 0.6, opacityMax: 0.95, glowOpacity: 0.28, glowHeight: 400 };
}

function densityToCount(density: 'low' | 'medium' | 'high'): number {
  switch (density) {
    case 'low': return 12;
    case 'high': return 25;
    default: return 18;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GoldEmberFieldProps {
  density?: 'low' | 'medium' | 'high';
  streakLevel?: number;
  active?: boolean;
  style?: any;
}

export function GoldEmberField({
  density = 'medium',
  streakLevel,
  active = true,
  style,
}: GoldEmberFieldProps) {
  const { colors, isDark } = useTheme();

  const tier = useMemo<EmberTier | null>(() => {
    if (streakLevel !== undefined) return getEmberTier(streakLevel);
    return null;
  }, [streakLevel]);

  const particleCount = tier?.count ?? densityToCount(density);
  const sizeMin = tier?.sizeMin ?? 2;
  const sizeMax = tier?.sizeMax ?? 3;
  const opacityMin = tier?.opacityMin ?? 0.3;
  const opacityMax = tier?.opacityMax ?? 0.6;

  // Derive 3 ember color variants from the current accent color.
  // Optimize for contrast: dark bg needs bright particles, light bg needs saturated/dark particles.
  const emberColors = useMemo(() => {
    const accent = colors.accent;
    if (isDark) {
      // Dark background (#0A0A0A) — make particles brighter
      return {
        primary: lighten(accent, 0.15),    // brighten for visibility
        secondary: lighten(accent, 0.35),  // bright highlight variant
        tertiary: accent,                  // base as the darkest
      };
    } else {
      // Light background (#FAF7F2 cream) — make particles darker/more saturated
      return {
        primary: darken(accent, 0.2),      // noticeably darker
        secondary: darken(accent, 0.05),   // slightly darker than base
        tertiary: darken(accent, 0.35),    // deep for strong contrast
      };
    }
  }, [colors.accent, isDark]);

  // Generate particles once — they self-loop, no recycling needed
  const particles = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: particleCount }, (_, i): EmberParticle => {
      const sizeRange = sizeMax - sizeMin;
      return {
        id: i,
        x: Math.random() * SCREEN_WIDTH,
        y: SCREEN_HEIGHT + 20 + Math.random() * 60,
        size: sizeMin + Math.random() * sizeRange,
        duration: 7000 + Math.random() * 5000,
        delay: Math.random() * 4000,
        driftAmount: 12 + Math.random() * 20,
        maxOpacity: opacityMin + Math.random() * (opacityMax - opacityMin),
        colorIdx: i % 3,
      };
    });
  }, [active, particleCount, sizeMin, sizeMax, opacityMin, opacityMax]);

  // Ambient glow — uses accent color
  const glowOpacity = tier?.glowOpacity ?? (isDark ? 0.05 : 0.08);
  const glowHeight = tier?.glowHeight ?? 200;

  // For glow gradient, darken the accent on light mode for better contrast against cream
  const glowHex = isDark ? colors.accent : darken(colors.accent, 0.15);
  const { r, g, b } = useMemo(() => hexToRgb(glowHex), [glowHex]);
  const glowBase = `rgba(${r}, ${g}, ${b},`;

  if (!active) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, style]} pointerEvents="none">
      {particles.map((particle) => (
        <EmberParticleComponent
          key={particle.id}
          particle={particle}
          emberColors={emberColors}
        />
      ))}

      {/* Ambient glow from below — accent-colored */}
      {glowOpacity > 0 && (
        <LinearGradient
          colors={[
            `${glowBase} ${isDark ? glowOpacity : glowOpacity * 1.4})`,
            `${glowBase} 0)`,
          ]}
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
