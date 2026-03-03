/**
 * Animated glow background — recreates the unfoldapp.co website effect.
 * 3 drifting amber-gold orbs (SVG radial gradient) + rising ember particles.
 * All animations via react-native-reanimated for 60fps on UI thread.
 *
 * Props:
 *   color — glow color (defaults to brand gold #C8A55C, follows accent theme for premium)
 *   intensity — opacity multiplier 0-1 (1 = full, 0.4 = subtle behind content)
 *   emberCount — number of ember particles (defaults to 18, use fewer on busy screens)
 */
import React, { useEffect, useMemo } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');
const DEFAULT_GOLD = '#C8A55C';

// --- Orbs ---

interface OrbConfig {
  size: number;
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  duration: number;
  opacity: number;
}

const ORBS: OrbConfig[] = [
  { size: 300, x: SW * 0.15, y: SH * 0.3, driftX: 80, driftY: 60, duration: 12000, opacity: 0.18 },
  { size: 380, x: SW * 0.7, y: SH * 0.2, driftX: -70, driftY: 80, duration: 18000, opacity: 0.12 },
  { size: 250, x: SW * 0.4, y: SH * 0.65, driftX: 60, driftY: -50, duration: 15000, opacity: 0.15 },
];

function GlowOrb({ config, index, color, intensity }: { config: OrbConfig; index: number; color: string; intensity: number }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  useEffect(() => {
    tx.value = withRepeat(
      withSequence(
        withTiming(config.driftX, { duration: config.duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: config.duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    ty.value = withRepeat(
      withSequence(
        withTiming(config.driftY, { duration: config.duration * 0.8, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: config.duration * 0.8, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  const id = `orb${index}`;
  const { size, x, y, opacity } = config;
  const scaledOpacity = opacity * intensity;

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size },
        animStyle,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={String(scaledOpacity)} />
            <Stop offset="60%" stopColor={color} stopOpacity={String(scaledOpacity * 0.35)} />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

// --- Embers ---

interface EmberConfig {
  delay: number;
  x: number;
  size: number;
  duration: number;
  sway: number;
}

function makeEmbers(count: number): EmberConfig[] {
  return Array.from({ length: count }, () => ({
    delay: Math.random() * 8000,
    x: Math.random() * SW,
    size: 2 + Math.random() * 3,
    duration: 5000 + Math.random() * 7000,
    sway: 10 + Math.random() * 30,
  }));
}

// Pre-generate default set (stable across renders at module level)
const DEFAULT_EMBERS = makeEmbers(18);

function Ember({ config, color, intensity }: { config: EmberConfig; color: string; intensity: number }) {
  const ty = useSharedValue(0);
  const tx = useSharedValue(0);
  const opacity = useSharedValue(0);

  const peakOpacity = 0.8 * intensity;
  const holdOpacity = 0.6 * intensity;

  useEffect(() => {
    ty.value = withDelay(
      config.delay,
      withRepeat(
        withTiming(-SH - 50, { duration: config.duration, easing: Easing.linear }),
        -1,
      ),
    );
    tx.value = withDelay(
      config.delay,
      withRepeat(
        withSequence(
          withTiming(config.sway, { duration: config.duration / 3, easing: Easing.inOut(Easing.sin) }),
          withTiming(-config.sway, { duration: config.duration / 3, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: config.duration / 3, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    opacity.value = withDelay(
      config.delay,
      withRepeat(
        withSequence(
          withTiming(peakOpacity, { duration: config.duration * 0.15 }),
          withTiming(holdOpacity, { duration: config.duration * 0.55 }),
          withTiming(0, { duration: config.duration * 0.3 }),
        ),
        -1,
      ),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: config.x,
          bottom: -10,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

// --- Exported component ---

interface GlowBackgroundProps {
  /** Glow color — defaults to brand gold, pass colors.accent for premium accent */
  color?: string;
  /** Opacity multiplier 0–1 (1 = full splash intensity, 0.4 = subtle behind content) */
  intensity?: number;
  /** Number of ember particles (fewer = better for busy screens) */
  emberCount?: number;
}

export function GlowBackground({ color = DEFAULT_GOLD, intensity = 1, emberCount = 18 }: GlowBackgroundProps) {
  // Use default embers if standard count, otherwise generate custom set
  const embers = useMemo(
    () => (emberCount === 18 ? DEFAULT_EMBERS : makeEmbers(emberCount)),
    [emberCount],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ORBS.map((orb, i) => (
        <GlowOrb key={i} config={orb} index={i} color={color} intensity={intensity} />
      ))}
      {embers.map((ember, i) => (
        <Ember key={i} config={ember} color={color} intensity={intensity} />
      ))}
    </View>
  );
}
