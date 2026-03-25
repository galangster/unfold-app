import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Atlas,
  Circle,
  RadialGradient,
  Skia,
  rect,
  vec,
  TileMode,
  useClock,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

import type { SkImage, SkRect, SkRSXform } from '@shopify/react-native-skia';

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
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
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
  if (streak <= 0)
    return {
      count: 18,
      sizeMin: 2,
      sizeMax: 4,
      opacityMin: 0.3,
      opacityMax: 0.6,
      glowOpacity: 0.05,
      glowHeight: 180,
    };
  if (streak <= 2)
    return {
      count: 28,
      sizeMin: 2.5,
      sizeMax: 5,
      opacityMin: 0.4,
      opacityMax: 0.7,
      glowOpacity: 0.1,
      glowHeight: 220,
    };
  if (streak <= 6)
    return {
      count: 40,
      sizeMin: 2.5,
      sizeMax: 5.5,
      opacityMin: 0.45,
      opacityMax: 0.8,
      glowOpacity: 0.16,
      glowHeight: 280,
    };
  if (streak <= 13)
    return {
      count: 55,
      sizeMin: 3,
      sizeMax: 6.5,
      opacityMin: 0.5,
      opacityMax: 0.85,
      glowOpacity: 0.22,
      glowHeight: 340,
    };
  return {
    count: 70,
    sizeMin: 3,
    sizeMax: 7,
    opacityMin: 0.6,
    opacityMax: 0.95,
    glowOpacity: 0.28,
    glowHeight: 400,
  };
}

// ---------------------------------------------------------------------------
// Particle seed data — generated once, animated via useDerivedValue
// ---------------------------------------------------------------------------

interface ParticleSeed {
  x: number;
  yStart: number;
  size: number;
  duration: number;
  delay: number;
  driftAmount: number;
  maxOpacity: number;
  driftPeriod: number;
}

const SPRITE_SIZE = 16;
const SPRITE_RECT = rect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
const HALF_SPRITE = SPRITE_SIZE / 2;

function generateSeeds(
  count: number,
  sizeMin: number,
  sizeMax: number,
  opacityMin: number,
  opacityMax: number,
): ParticleSeed[] {
  const sizeRange = sizeMax - sizeMin;
  return Array.from({ length: count }, (_, i) => ({
    x: Math.random() * SCREEN_WIDTH,
    yStart: SCREEN_HEIGHT + 20 + Math.random() * 60,
    size: sizeMin + Math.random() * sizeRange,
    duration: 7000 + Math.random() * 5000,
    delay: Math.random() * 4000,
    driftAmount: 12 + Math.random() * 20,
    maxOpacity: opacityMin + Math.random() * (opacityMax - opacityMin),
    driftPeriod: 2400 + (i * 137) % 1200,
  }));
}

// ---------------------------------------------------------------------------
// Create a 16x16 soft radial gradient sprite as an SkImage
// ---------------------------------------------------------------------------

function createSpriteImage(accentHex: string): SkImage | null {
  const surface = Skia.Surface.Make(SPRITE_SIZE, SPRITE_SIZE);
  if (!surface) return null;

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  const center = vec(HALF_SPRITE, HALF_SPRITE);

  const shader = Skia.Shader.MakeRadialGradient(
    center,
    HALF_SPRITE,
    [Skia.Color(accentHex), Skia.Color(`${accentHex}00`)],
    [0, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);

  canvas.drawCircle(HALF_SPRITE, HALF_SPRITE, HALF_SPRITE, paint);
  surface.flush();

  return surface.makeImageSnapshot();
}

// ---------------------------------------------------------------------------
// EmberAtlas — Skia Atlas-based batched particle rendering
// ---------------------------------------------------------------------------

interface Props {
  streakLevel?: number;
  active?: boolean;
}

export function EmberAtlas({ streakLevel = 0, active = true }: Props) {
  const { colors, isDark } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  // Determine visibility — but hooks must still be called unconditionally
  const visible = active && !reducedMotion;

  const tier = useMemo(() => getEmberTier(streakLevel), [streakLevel]);

  // Derive ember color variants from accent
  const emberColor = useMemo(() => {
    const accent = colors.accent;
    if (isDark) {
      return lighten(accent, 0.15);
    } else {
      return darken(accent, 0.2);
    }
  }, [colors.accent, isDark]);

  // Create the 16x16 sprite image
  const spriteImage = useMemo(
    () => createSpriteImage(emberColor),
    [emberColor],
  );

  // Generate particle seeds once per tier change
  const seeds = useMemo(
    () =>
      generateSeeds(
        tier.count,
        tier.sizeMin,
        tier.sizeMax,
        tier.opacityMin,
        tier.opacityMax,
      ),
    [tier],
  );

  // Pre-compute sprite rects (all same — single sprite in the atlas image)
  const sprites = useMemo<SkRect[]>(
    () => seeds.map(() => SPRITE_RECT),
    [seeds],
  );

  // Clock drives all particles from a single shared value
  const clock = useClock();

  // Derive per-particle transforms from the clock
  const transforms = useDerivedValue<SkRSXform[]>(() => {
    const t = clock.value;
    return seeds.map((seed) => {
      // Compute progress within particle's looping lifecycle
      const elapsed = Math.max(0, t - seed.delay);
      const p = (elapsed % seed.duration) / seed.duration;

      // Y: float upward from bottom to top
      const translateY = seed.yStart - p * (SCREEN_HEIGHT + 80);

      // X: gentle horizontal sine drift
      const driftPhase = (elapsed % seed.driftPeriod) / seed.driftPeriod;
      const translateX =
        seed.x + Math.sin(driftPhase * Math.PI * 2) * seed.driftAmount;

      // Scale: slight pulsing with fade in/out at edges
      let scale: number;
      if (p < 0.05) {
        scale = 0.2 + (p / 0.05) * 0.5;
      } else if (p < 0.12) {
        scale = 0.7 + ((p - 0.05) / 0.07) * 0.3;
      } else if (p > 0.88) {
        scale = 1.0 - ((p - 0.88) / 0.12) * 0.7;
      } else {
        scale = 1.0;
      }

      // Apply particle size scaling relative to sprite
      const sizeScale = (seed.size / SPRITE_SIZE) * scale;

      // RSXform: scos=scale*cos(0)=scale, ssin=scale*sin(0)=0
      // tx/ty adjusted to keep the particle centered
      const tx = translateX - HALF_SPRITE * sizeScale;
      const ty = translateY - HALF_SPRITE * sizeScale;

      return Skia.RSXform(sizeScale, 0, tx, ty);
    });
  }, [clock, seeds]);

  // Derive per-particle colors (opacity animation via alpha)
  const particleColors = useDerivedValue(() => {
    const t = clock.value;
    // SkColor is Float32Array [r, g, b, a] in 0-1 range
    const baseColor = Skia.Color(emberColor);
    const cr = baseColor[0];
    const cg = baseColor[1];
    const cb = baseColor[2];

    return seeds.map((seed) => {
      const elapsed = Math.max(0, t - seed.delay);
      const p = (elapsed % seed.duration) / seed.duration;

      // Opacity: fade in, hold, fade out
      let opacity: number;
      if (p < 0.04) {
        opacity = (p / 0.04) * 0.3;
      } else if (p < 0.12) {
        opacity = 0.3 + ((p - 0.04) / 0.08) * 0.7;
      } else if (p < 0.7) {
        opacity = 1.0;
      } else if (p < 0.9) {
        opacity = 1.0 - ((p - 0.7) / 0.2) * 0.6;
      } else {
        opacity = 0.4 - ((p - 0.9) / 0.1) * 0.4;
      }

      opacity *= seed.maxOpacity;

      // SkColor as Float32Array [r, g, b, a]
      return Float32Array.of(cr, cg, cb, opacity);
    });
  }, [clock, seeds, emberColor]);

  // Glow settings
  const glowOpacity = tier.glowOpacity;
  const glowHeight = tier.glowHeight;
  const glowColor = isDark ? colors.accent : darken(colors.accent, 0.15);

  // Return null after all hooks have been called
  if (!visible || !spriteImage) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Batched particle rendering — single draw call for all particles */}
        <Atlas
          image={spriteImage}
          sprites={sprites}
          transforms={transforms}
          colors={particleColors}
        />

        {/* Ambient glow from the bottom of the screen */}
        <Circle
          cx={SCREEN_WIDTH / 2}
          cy={SCREEN_HEIGHT + glowHeight * 0.3}
          r={glowHeight}
          opacity={glowOpacity}
        >
          <RadialGradient
            c={vec(SCREEN_WIDTH / 2, SCREEN_HEIGHT + glowHeight * 0.3)}
            r={glowHeight}
            colors={[glowColor, `${glowColor}00`]}
          />
        </Circle>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
