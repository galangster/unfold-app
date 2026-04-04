/**
 * Current — Elemental particle animations driven by parametric math curves.
 *
 * Inspired by mathematical curve loaders, but designed for elemental effects:
 * wind, warmth, storm, stillwater, spirit, joy.
 *
 * Each element type defines particle behavior via seed data.
 * All position math runs inline inside useDerivedValue (worklet-safe).
 * Rendered via Skia Atlas for 60fps with 40-80+ particles.
 *
 * Usage:
 *   <Current type="wind" color="#C8A55C" />
 *   <Current type="storm" color="#C8A55C" intensity={0.8} />
 */

import { useMemo } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import {
  Canvas,
  Atlas,
  Skia,
  rect,
  vec,
  TileMode,
  useClock,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import type { SkImage, SkRect, SkRSXform } from '@shopify/react-native-skia';

const { width: SW, height: SH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Element configs — seed generation parameters (NOT worklet functions)
// ---------------------------------------------------------------------------

export type CurrentType = 'wind' | 'storm' | 'warmth' | 'stillwater' | 'spirit' | 'joy' | 'chaos' | 'rise' | 'trinity';

interface ElementConfig {
  count: number;
  durationRange: [number, number];
  sizeRange: [number, number];
  opacityRange: [number, number];
  fadeIn: number;
  fadeOut: number;
}

const CONFIGS: Record<CurrentType, ElementConfig> = {
  wind: {
    count: 35,
    durationRange: [3000, 6000],
    sizeRange: [1.5, 3.5],
    opacityRange: [0.08, 0.25],
    fadeIn: 0.15,
    fadeOut: 0.2,
  },
  storm: {
    count: 50,
    durationRange: [1800, 3500],
    sizeRange: [1.5, 3],
    opacityRange: [0.1, 0.3],
    fadeIn: 0.1,
    fadeOut: 0.15,
  },
  warmth: {
    count: 25,
    durationRange: [5000, 9000],
    sizeRange: [2, 5],
    opacityRange: [0.1, 0.3],
    fadeIn: 0.2,
    fadeOut: 0.3,
  },
  stillwater: {
    count: 20,
    durationRange: [8000, 14000],
    sizeRange: [1.5, 3],
    opacityRange: [0.05, 0.15],
    fadeIn: 0.25,
    fadeOut: 0.25,
  },
  spirit: {
    count: 18,
    durationRange: [10000, 18000],
    sizeRange: [2, 4.5],
    opacityRange: [0.08, 0.22],
    fadeIn: 0.2,
    fadeOut: 0.2,
  },
  joy: {
    count: 45,
    durationRange: [2500, 5000],
    sizeRange: [2, 4],
    opacityRange: [0.15, 0.4],
    fadeIn: 0.05,
    fadeOut: 0.4,
  },

  /**
   * Chaos — particles flying in every direction, no harmony.
   * Represents confusion, not knowing where to start.
   * Each particle has its own random angle and speed.
   * Larger, more visible particles than wind.
   */
  chaos: {
    count: 40,
    durationRange: [3000, 7000],
    sizeRange: [3, 6],
    opacityRange: [0.12, 0.35],
    fadeIn: 0.15,
    fadeOut: 0.2,
  },

  /**
   * Rise — particles rushing upward with purpose. Energy, growth, acceleration.
   * Used after stillness to show that the answer has arrived.
   */
  rise: {
    count: 50,
    durationRange: [1500, 3000],
    sizeRange: [2, 4.5],
    opacityRange: [0.1, 0.3],
    fadeIn: 0.1,
    fadeOut: 0.15,
  },

  /**
   * Trinity — Three-Petal Spiral (hypotrochoid R=3, r=1, d=3).
   * Three petals for Father, Son, Holy Spirit.
   * Compact spiral flower, slow rotation, no pulse.
   * Used as the companion's visual identity.
   */
  trinity: {
    count: 82,
    durationRange: [4600, 4600], // Fixed loop for consistent shape
    sizeRange: [2.5, 4],
    opacityRange: [0.25, 0.6],
    fadeIn: 0.08,
    fadeOut: 0.12,
  },
};

// ---------------------------------------------------------------------------
// Particle seed — random properties generated once per particle
// ---------------------------------------------------------------------------

interface ParticleSeed {
  baseY: number;
  baseX: number;
  freq: number;
  amplitude: number;
  duration: number;
  delay: number;
  size: number;
  maxOpacity: number;
  offsetX: number;
  offsetY: number;
  angle: number;
}

function generateSeeds(config: ElementConfig): ParticleSeed[] {
  return Array.from({ length: config.count }, () => ({
    baseY: Math.random() * SH,
    baseX: Math.random() * SW,
    freq: 0.8 + Math.random() * 2.4,
    amplitude: 15 + Math.random() * 40,
    duration:
      config.durationRange[0] +
      Math.random() * (config.durationRange[1] - config.durationRange[0]),
    delay: Math.random() * 4000,
    size:
      config.sizeRange[0] +
      Math.random() * (config.sizeRange[1] - config.sizeRange[0]),
    maxOpacity:
      config.opacityRange[0] +
      Math.random() * (config.opacityRange[1] - config.opacityRange[0]),
    offsetX: (Math.random() - 0.5) * SW * 0.5,
    offsetY: (Math.random() - 0.5) * SH * 0.15,
    angle: Math.random() * Math.PI * 2,
  }));
}

// ---------------------------------------------------------------------------
// Inline position calculators — worklet-safe (no closures over JS scope)
// All screen dimensions are passed as constants via the seeds.
// ---------------------------------------------------------------------------

// Pre-bake screen dims into constants the worklet can capture
const SCREEN_W = SW;
const SCREEN_H = SH;

// ---------------------------------------------------------------------------
// Sprite texture — soft radial gradient dot
// ---------------------------------------------------------------------------

const SPRITE_SIZE = 16;
const SPRITE_RECT = rect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
const HALF_SPRITE = SPRITE_SIZE / 2;

function createSprite(hex: string): SkImage | null {
  const surface = Skia.Surface.Make(SPRITE_SIZE, SPRITE_SIZE);
  if (!surface) return null;

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeRadialGradient(
    vec(HALF_SPRITE, HALF_SPRITE),
    HALF_SPRITE,
    [Skia.Color(hex), Skia.Color(`${hex}00`)],
    [0, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  canvas.drawCircle(HALF_SPRITE, HALF_SPRITE, HALF_SPRITE, paint);
  surface.flush();
  return surface.makeImageSnapshot();
}

// ---------------------------------------------------------------------------
// Current component
// ---------------------------------------------------------------------------

interface CurrentProps {
  type: CurrentType;
  color: string;
  intensity?: number;
  /** Center X for focused effects like trinity (defaults to screen center) */
  centerX?: number;
  /** Center Y for focused effects like trinity (defaults to 40% screen height) */
  centerY?: number;
  /** Scale factor for focused effects (defaults to 1) */
  scale?: number;
  /** Reanimated shared value 0-1 controlling animation speed. 1 = full speed, 0 = frozen. */
  speed?: { value: number };
  /** Reanimated shared value for vertical drift. Positive = downward, negative = upward. Applied as pixels per frame. */
  drift?: { value: number };
}

export function Current({ type, color, intensity = 1, centerX, centerY, scale = 1, speed, drift }: CurrentProps) {
  const config = CONFIGS[type];

  const sprite = useMemo(() => createSprite(color), [color]);
  const seeds = useMemo(() => generateSeeds(config), [config]);
  const sprites = useMemo<SkRect[]>(() => seeds.map(() => SPRITE_RECT), [seeds]);

  // Capture values as locals the worklet can close over
  const elementType = type;
  const fadeIn = config.fadeIn;
  const fadeOut = config.fadeOut;
  const _intensity = intensity;
  const _cx = centerX ?? SCREEN_W / 2;
  const _cy = centerY ?? SCREEN_H * 0.4;
  const _scale = scale;

  const clock = useClock();

  // Track accumulated time that respects speed changes
  const prevClock = useSharedValue(0);
  const accumulatedTime = useSharedValue(0);
  // Track accumulated vertical drift offset
  const driftOffset = useSharedValue(0);

  const transforms = useDerivedValue<SkRSXform[]>(() => {
    'worklet';
    const rawT = clock.value;
    const dt = rawT - prevClock.value;
    prevClock.value = rawT;

    // Scale dt by speed (default 1 = full speed, 0 = frozen)
    const spd = speed ? speed.value : 1;
    accumulatedTime.value += dt * spd;

    // Accumulate vertical drift (negative = upward)
    const driftVal = drift ? drift.value : 0;
    driftOffset.value += driftVal * (dt / 16.67); // normalize to ~60fps

    const t = accumulatedTime.value;
    const w = SCREEN_W;
    const h = SCREEN_H;

    return seeds.map((seed) => {
      const elapsed = Math.max(0, t - seed.delay);
      const p = (elapsed % seed.duration) / seed.duration;

      // --- Position math inline per element type ---
      let px = 0;
      let py = 0;

      if (elementType === 'wind') {
        px = -40 + p * (w + 80);
        py = seed.baseY + Math.sin(p * Math.PI * 2 * seed.freq) * seed.amplitude;
      } else if (elementType === 'storm') {
        px = -60 + p * (w + 120);
        py = seed.baseY +
          Math.sin(p * Math.PI * 2 * seed.freq) * seed.amplitude +
          Math.sin(p * Math.PI * 2 * seed.freq * 2.3 + t * 0.0008) * seed.amplitude * 0.4;
      } else if (elementType === 'warmth') {
        px = seed.baseX + Math.sin(p * Math.PI * 2 * seed.freq) * seed.amplitude;
        py = h * 0.9 - p * h * 1.1;
      } else if (elementType === 'stillwater') {
        px = -20 + p * (w + 40);
        py = seed.baseY + Math.sin(p * Math.PI * seed.freq) * seed.amplitude * 0.3;
      } else if (elementType === 'spirit') {
        const angle = p * Math.PI * 2 * seed.freq;
        const radius = seed.amplitude * (0.7 + 0.3 * Math.sin(angle * 1.5));
        px = w / 2 + seed.offsetX + Math.cos(angle) * radius;
        py = h * 0.4 + seed.offsetY + Math.sin(angle) * radius * 0.7;
      } else if (elementType === 'joy') {
        const angle = seed.angle + p * 0.3;
        const radius = p * Math.max(w, h) * 0.7;
        px = w / 2 + Math.cos(angle) * radius;
        py = h * 0.4 + Math.sin(angle) * radius;
      } else if (elementType === 'chaos') {
        // Each particle travels in its own random direction from a random start
        const dx = Math.cos(seed.angle) * (w + 100);
        const dy = Math.sin(seed.angle) * (h + 100);
        px = seed.baseX + p * dx * 0.5;
        py = seed.baseY + p * dy * 0.5;
        px += Math.sin(p * Math.PI * 4 * seed.freq) * seed.amplitude * 0.3;
        py += Math.cos(p * Math.PI * 3 * seed.freq) * seed.amplitude * 0.3;
      } else if (elementType === 'rise') {
        // Rush upward from bottom — fast, purposeful, slight horizontal scatter
        px = seed.baseX + Math.sin(p * Math.PI * 2 * seed.freq) * 15;
        py = h + 40 - p * (h + 80); // Bottom to top, bleeds off both edges
      } else if (elementType === 'trinity') {
        // Three-Petal Spiral: hypotrochoid R=3, r=1, d=3
        // Slow rotation via clock time
        const rotation = t * 0.00015; // Very slow spin
        const tt = p * Math.PI * 2 + rotation;
        const R = 3;
        const r = 1;
        const d = 3 + 0.25; // slight detailScale baked in
        const baseX = (R - r) * Math.cos(tt) + d * Math.cos(((R - r) / r) * tt);
        const baseY = (R - r) * Math.sin(tt) - d * Math.sin(((R - r) / r) * tt);
        const curveScale = 2.2 * _scale;
        px = _cx + baseX * curveScale * 8; // 8 = pixel scale for screen size
        py = _cy + baseY * curveScale * 8;
      }

      const breathe = 0.9 + 0.1 * Math.sin(elapsed * 0.001);
      const sizeScale = (seed.size / SPRITE_SIZE) * breathe * _intensity;

      const tx = px - HALF_SPRITE * sizeScale;
      // Apply drift + wrap vertically so particles reappear at bottom when drifting off top
      let finalY = py + driftOffset.value;
      if (driftOffset.value !== 0) {
        const totalH = h + 80; // include bleed
        finalY = ((finalY % totalH) + totalH) % totalH - 40; // wrap with bleed margin
      }
      const ty = finalY - HALF_SPRITE * sizeScale;

      return Skia.RSXform(sizeScale, 0, tx, ty);
    });
  }, [clock, seeds]);

  const colors = useDerivedValue(() => {
    'worklet';
    const t = clock.value;
    const base = Skia.Color(color);
    const cr = base[0];
    const cg = base[1];
    const cb = base[2];

    return seeds.map((seed) => {
      const elapsed = Math.max(0, t - seed.delay);
      const p = (elapsed % seed.duration) / seed.duration;

      let opacity: number;
      if (p < fadeIn) {
        opacity = p / fadeIn;
      } else if (p > 1 - fadeOut) {
        opacity = (1 - p) / fadeOut;
      } else {
        opacity = 1;
      }

      opacity *= seed.maxOpacity * _intensity;

      return Float32Array.of(cr, cg, cb, opacity);
    });
  }, [clock, seeds]);

  if (!sprite) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Atlas image={sprite} sprites={sprites} transforms={transforms} colors={colors} />
    </Canvas>
  );
}
