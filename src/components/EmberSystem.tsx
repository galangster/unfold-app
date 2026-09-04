/**
 * EmberSystem — the app's single ember vocabulary (plans/07-ui-deslop-brief.md §2).
 *
 * Promoted from GoldEmberField's architecture with CompletionCelebration's
 * canonical look. One vocabulary, two grammars:
 *   - `variant="celebration"`: the pinned tier-7 field (count 22, size 3.5–7,
 *     opacity 0.55–0.9, glow 0.22/340) + 18 one-shot luminous motes. The
 *     dark-mode rendering of this preset is canon and must not change.
 *   - `variant="ambient"`: the same sprites/ramp/glow, parameterized per
 *     surface via streakLevel or count/intensity presets.
 *
 * Gating (appActive && !lowPowerMode && active) is hoisted here so every
 * surface gets it for free. Reduce motion renders a designed still — a poster,
 * not a pause — never `null` and never frozen velocity.
 *
 * Colors always derive from the user-selectable accent (`colors.accent` via
 * useTheme, or the `accentColor` prop). Never a hardcoded gold hex: an Ocean
 * user gets blue embers by design.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Dimensions,
  type LayoutChangeEvent,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useLowPowerMode } from '@/hooks/useLowPowerMode';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  CELEBRATION_MOTE_COUNT,
  exclusionOpacityMultiplier,
  getCelebrationStillGlow,
  getEmberPalette,
  getStaticAmbientEmbers,
  getStaticCelebrationRing,
  hexToRgb,
  darken,
  resolveEmberParams,
  shouldRenderEmberLayer,
  splitDirections,
  type EmberDirection,
  type EmberPalette,
  type EmberVariant,
  type ExclusionZone,
  type ResolvedEmberParams,
  type StaticEmber,
} from '@/lib/ember-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CENTER_X = SCREEN_WIDTH / 2;
const CENTER_Y = SCREEN_HEIGHT / 2;

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
  travel: 1 | -1; // 1 = rising (canon), -1 = falling
}

const COLOR_KEYS = ['primary', 'secondary', 'tertiary'] as const;

// ---------------------------------------------------------------------------
// Sprite — plain dot on dark (canon), soft radial halo on light (§2 retune)
// ---------------------------------------------------------------------------

function EmberSprite({
  size,
  color,
  halo,
  haloId,
}: {
  size: number;
  color: string;
  halo: boolean;
  haloId: string;
}) {
  if (!halo) return null;
  const haloSize = size * 3;
  return (
    <Svg
      width={haloSize}
      height={haloSize}
      style={{ position: 'absolute', left: -size, top: -size }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id={haloId} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <Stop offset="35%" stopColor={color} stopOpacity="0.5" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill={`url(#${haloId})`} />
      <Circle cx={haloSize / 2} cy={haloSize / 2} r={size / 2} fill={color} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Single particle — self-looping, no JS callbacks, 2 shared values only.
// Motion envelopes copied verbatim from GoldEmberField (canon).
// ---------------------------------------------------------------------------

const EmberParticleComponent = React.memo(function EmberParticleComponent({
  particle,
  emberColors,
  halo,
  layoutWidth,
  layoutHeight,
  exclusionZones,
}: {
  particle: EmberParticle;
  emberColors: EmberPalette;
  halo: boolean;
  layoutWidth: number;
  layoutHeight: number;
  exclusionZones: ReadonlyArray<ExclusionZone>;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const translateY = interpolate(p, [0, 1], [0, -particle.travel * (layoutHeight + 80)]);
    const translateX = interpolate(drift.value, [0, 1], [-particle.driftAmount, particle.driftAmount]);
    const scale = interpolate(p, [0, 0.05, 0.12, 0.88, 1], [0.2, 0.7, 1, 1, 0.3]);
    let opacity = interpolate(p, [0, 0.04, 0.12, 0.7, 0.9, 1], [0, 0.3, 1, 1, 0.4, 0]) * particle.maxOpacity;

    if (exclusionZones.length > 0) {
      opacity *= exclusionOpacityMultiplier(
        particle.x + translateX,
        particle.y + translateY,
        exclusionZones,
        layoutWidth,
        layoutHeight,
      );
    }

    return {
      transform: [{ translateX }, { translateY }, { scale }],
      opacity,
    };
  });

  const color = emberColors[COLOR_KEYS[particle.colorIdx % 3]!];

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
          backgroundColor: halo ? 'transparent' : color,
        },
        animatedStyle,
      ]}
    >
      <EmberSprite size={particle.size} color={color} halo={halo} haloId={`ember-halo-${particle.travel}-${particle.id}`} />
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Luminous mote — folded in verbatim from CompletionCelebration (canon).
// One-shot drift upward with organic sway; celebration layer only.
// ---------------------------------------------------------------------------

function LuminousMote({
  startX,
  startY,
  size,
  delay,
  drift,
  accentColor,
  textColor,
  isAccent,
}: {
  startX: number;
  startY: number;
  size: number;
  delay: number;
  drift: number;
  accentColor: string;
  textColor: string;
  isAccent: boolean;
}) {
  const progress = useSharedValue(0);
  const sway = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 3200 + Math.random() * 800, easing: Easing.out(Easing.quad) })
    );
    sway.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1600 + Math.random() * 600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      )
    );
  }, [delay, progress, sway]);

  const style = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.08, 0.3, 0.75, 1], [0, 0.9, 0.7, 0.3, 0]);
    const translateY = interpolate(progress.value, [0, 1], [0, -(SCREEN_HEIGHT * 0.35 + drift)]);
    const translateX = interpolate(sway.value, [0, 1], [-12, 12]);
    const s = interpolate(progress.value, [0, 0.15, 0.6, 1], [0.2, 1, 0.8, 0.3]);
    return {
      opacity,
      transform: [{ translateY }, { translateX }, { scale: s }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX - size / 2,
          top: startY,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isAccent ? accentColor : textColor,
        },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Reduce-motion still — a poster, not a pause.
// Designed states per §2: ambient = glow + ~6 seeded static embers;
// celebration = sparse radial ring around the hero block, glow up one step,
// at most one opacity cross-fade on entry.
// ---------------------------------------------------------------------------

function EmberStillPoster({
  variant,
  params,
  palette,
  halo,
  direction,
  layoutWidth,
  layoutHeight,
  exclusionZones,
  glowBase,
  glowOpacity,
  glowHeight,
  isDark,
}: {
  variant: EmberVariant;
  params: ResolvedEmberParams;
  palette: EmberPalette;
  halo: boolean;
  direction: EmberDirection;
  layoutWidth: number;
  layoutHeight: number;
  exclusionZones: ReadonlyArray<ExclusionZone>;
  glowBase: string;
  glowOpacity: number;
  glowHeight: number;
  isDark: boolean;
}) {
  const fade = useSharedValue(variant === 'celebration' ? 0 : 1);

  useEffect(() => {
    if (variant === 'celebration') {
      // The single sanctioned cross-fade on entry.
      fade.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const embers: StaticEmber[] = useMemo(() => {
    if (variant === 'celebration') {
      return getStaticCelebrationRing(params, layoutWidth, layoutHeight);
    }
    return getStaticAmbientEmbers(params, layoutWidth, layoutHeight, direction, exclusionZones);
  }, [variant, params, layoutWidth, layoutHeight, direction, exclusionZones]);

  const glowAnchorTop = variant === 'ambient' && direction === 'down';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="none">
      {embers.map((ember, i) => {
        const color = palette[COLOR_KEYS[ember.colorIdx % 3]!];
        return (
          <View
            key={i}
            style={[
              styles.particle,
              {
                left: ember.x,
                top: ember.y,
                width: ember.size,
                height: ember.size,
                borderRadius: ember.size / 2,
                backgroundColor: halo ? 'transparent' : color,
                opacity: ember.opacity,
              },
            ]}
          >
            <EmberSprite size={ember.size} color={color} halo={halo} haloId={`ember-still-halo-${i}`} />
          </View>
        );
      })}

      {glowOpacity > 0 && (
        <LinearGradient
          colors={[
            `${glowBase} ${isDark ? glowOpacity : glowOpacity * 1.4})`,
            `${glowBase} 0)`,
          ]}
          start={glowAnchorTop ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 }}
          end={glowAnchorTop ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 }}
          style={[
            styles.glowGradient,
            glowAnchorTop ? { top: 0 } : { bottom: 0 },
            { height: glowHeight },
          ]}
          pointerEvents="none"
        />
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// App-active gating (hoisted from AmbientArtCanvas)
// ---------------------------------------------------------------------------

function useIsAppActive(): boolean {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return appState === 'active';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface EmberSystemProps {
  variant: EmberVariant;
  /** Ambient only — maps to the streak intensity tiers (count 8→28). */
  streakLevel?: number;
  /** Particle travel. Native replacement for the old paywall scaleY:-1 hack. */
  direction?: EmberDirection;
  /** Celebration layer: 18 one-shot luminous motes emitted from the hero block. */
  motes?: boolean;
  /** 0–1 scalar on count + opacity for chrome-adjacent surfaces. Ambient only. */
  intensity?: number;
  /** Explicit ambient ember count (per-surface preset override). */
  count?: number;
  /** Raise the ambient opacity floor (Today home uses ≥0.5). */
  opacityFloor?: number;
  /**
   * Bottom glow on/off (default on). The glow is anchored to the container's
   * bottom edge and clips flat when the mount ends mid-screen, so contained,
   * non-full-screen mounts pass `glow={false}`.
   */
  glow?: boolean;
  /** Normalized (0–1) rects where embers fade out — headline blocks, chrome. */
  exclusionZones?: ReadonlyArray<ExclusionZone>;
  /** Defaults to the theme accent. Never pass a hardcoded brand hex. */
  accentColor?: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

const NO_ZONES: ReadonlyArray<ExclusionZone> = [];

export function EmberSystem({
  variant,
  streakLevel,
  direction = 'up',
  motes = false,
  intensity,
  count,
  opacityFloor,
  glow = true,
  exclusionZones = NO_ZONES,
  accentColor,
  active = true,
  style,
}: EmberSystemProps) {
  const { colors, isDark } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();
  const isAppActive = useIsAppActive();
  const lowPowerMode = useLowPowerMode();

  const accent = accentColor ?? colors.accent;
  const effectiveDirection: EmberDirection = variant === 'celebration' ? 'up' : direction;

  // Measure the mounted container; fall back to window dims so full-screen
  // mounts (the common case, incl. the canonical celebration) render
  // identically on the first frame.
  const [layout, setLayout] = useState({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (Math.abs(width - layout.width) > 8 || Math.abs(height - layout.height) > 8)) {
      setLayout({ width, height });
    }
  };

  const params = useMemo(
    () => resolveEmberParams({ variant, isDark, streakLevel, count, intensity, opacityFloor, glow }),
    [variant, isDark, streakLevel, count, intensity, opacityFloor, glow],
  );

  const emberColors = useMemo(() => getEmberPalette(accent, isDark), [accent, isDark]);

  // Generate particles once per layout — they self-loop, no recycling needed.
  // Generation math copied verbatim from GoldEmberField (canon), with the
  // falling grammar mirrored for direction='down'/'both'.
  const particles = useMemo(() => {
    if (reducedMotion) return [];
    const { width: w, height: h } = layout;
    const sizeRange = params.sizeMax - params.sizeMin;
    const { up } = splitDirections(params.count, effectiveDirection);
    return Array.from({ length: params.count }, (_, i): EmberParticle => {
      const travel: 1 | -1 = i < up ? 1 : -1;
      return {
        id: i,
        x: Math.random() * w,
        y: travel === 1 ? h + 20 + Math.random() * 60 : -(20 + Math.random() * 60),
        size: params.sizeMin + Math.random() * sizeRange,
        duration: 7000 + Math.random() * 5000,
        delay: Math.random() * 4000,
        driftAmount: 12 + Math.random() * 20,
        maxOpacity: params.opacityMin + Math.random() * (params.opacityMax - params.opacityMin),
        colorIdx: i % 3,
        travel,
      };
    });
  }, [reducedMotion, params, effectiveDirection, layout]);

  // Motes regenerate per mount (the celebration mounts fresh each time it
  // becomes visible). Cluster math copied verbatim from CompletionCelebration.
  const moteSeeds = useMemo(() => {
    if (variant !== 'celebration' || !motes || reducedMotion) return [];
    return Array.from({ length: CELEBRATION_MOTE_COUNT }, (_, i) => ({
      id: i,
      startX: CENTER_X + (Math.random() - 0.5) * SCREEN_WIDTH * 0.6,
      startY: CENTER_Y + (Math.random() - 0.3) * SCREEN_HEIGHT * 0.15,
      size: Math.random() * 4.5 + 2,
      delay: 200 + Math.random() * 700,
      drift: Math.random() * 80,
      isAccent: Math.random() > 0.65,
    }));
  }, [variant, motes, reducedMotion]);

  // For glow gradient, darken the accent on light mode for better contrast (canon).
  const glowHex = isDark ? accent : darken(accent, 0.15);
  const { r, g, b } = useMemo(() => hexToRgb(glowHex), [glowHex]);
  const glowBase = `rgba(${r}, ${g}, ${b},`;

  // Hoisted gating: unfocused screens, backgrounded app → nothing.
  // Low power and reduce motion render the designed still instead — the
  // poster costs no animation work, so the perf intent is preserved.
  const showAnimatedField = !reducedMotion
    && shouldRenderEmberLayer({ active, appActive: isAppActive, lowPowerMode: lowPowerMode === true });
  if (!active || !isAppActive) {
    return null;
  }

  const moteTextColor = isDark ? colors.textMuted : colors.textSubtle;
  const glowAnchorTop = variant === 'ambient' && effectiveDirection === 'down';

  if (!showAnimatedField) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.container, style]} pointerEvents="none" onLayout={onLayout}>
        <EmberStillPoster
          variant={variant}
          params={params}
          palette={emberColors}
          halo={params.halo}
          direction={effectiveDirection}
          layoutWidth={layout.width}
          layoutHeight={layout.height}
          exclusionZones={exclusionZones}
          glowBase={glowBase}
          glowOpacity={variant === 'celebration' ? getCelebrationStillGlow().glowOpacity : params.glowOpacity}
          glowHeight={variant === 'celebration' ? getCelebrationStillGlow().glowHeight : params.glowHeight}
          isDark={isDark}
        />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, style]} pointerEvents="none" onLayout={onLayout}>
      {particles.map((particle) => (
        <EmberParticleComponent
          key={`${particle.id}-${layout.width}x${layout.height}`}
          particle={particle}
          emberColors={emberColors}
          halo={params.halo}
          layoutWidth={layout.width}
          layoutHeight={layout.height}
          exclusionZones={exclusionZones}
        />
      ))}

      {/* Luminous motes drifting up from the hero block — celebration only */}
      {moteSeeds.map((m) => (
        <LuminousMote
          key={m.id}
          startX={m.startX}
          startY={m.startY}
          size={m.size}
          delay={m.delay}
          drift={m.drift}
          accentColor={accent}
          textColor={moteTextColor}
          isAccent={m.isAccent}
        />
      ))}

      {/* Single internal glow — the one light source all embers rise from */}
      {params.glowOpacity > 0 && (
        <LinearGradient
          colors={[
            `${glowBase} ${isDark ? params.glowOpacity : params.glowOpacity * 1.4})`,
            `${glowBase} 0)`,
          ]}
          start={glowAnchorTop ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 }}
          end={glowAnchorTop ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 }}
          style={[
            styles.glowGradient,
            glowAnchorTop ? { top: 0 } : { bottom: 0 },
            { height: params.glowHeight },
          ]}
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
    left: 0,
    right: 0,
  },
});
