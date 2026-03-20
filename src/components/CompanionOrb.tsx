import { useEffect, useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  Group,
  SweepGradient,
  BlurMask,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

interface CompanionOrbProps {
  accentColor: string;
  size?: number;
  onPress?: () => void;
  isActive?: boolean;
  showBadge?: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shiftedRgba(
  hex: string,
  rShift: number,
  gShift: number,
  bShift: number,
  alpha: number,
): string {
  const cleaned = hex.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(cleaned.substring(0, 2), 16) + rShift));
  const g = Math.min(255, Math.max(0, parseInt(cleaned.substring(2, 4), 16) + gShift));
  const b = Math.min(255, Math.max(0, parseInt(cleaned.substring(4, 6), 16) + bShift));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildRingColors(accent: string) {
  return {
    // More stops with gentler shifts for smooth gradient rotation
    sweepColors: [
      hexToRgba(accent, 1.0),
      shiftedRgba(accent, 15, 12, 6, 0.97),
      shiftedRgba(accent, 25, 20, 10, 0.95),
      shiftedRgba(accent, 15, 10, 0, 0.93),
      shiftedRgba(accent, -5, -8, -15, 0.92),
      shiftedRgba(accent, -12, -16, -25, 0.93),
      shiftedRgba(accent, -5, -8, -15, 0.95),
      shiftedRgba(accent, 10, 8, 4, 0.97),
      hexToRgba(accent, 1.0),
    ],
    outerGlow: hexToRgba(accent, 1.0),
    midGlow: hexToRgba(accent, 1.0),
    innerGlow: shiftedRgba(accent, 20, 16, 8, 1.0),
  };
}

// More points = smoother curves at the Catmull-Rom interpolation stage
const NUM_POINTS = 64;

/**
 * Build a closed smooth path from points around a center.
 * Uses low-frequency sine waves (2-4 bumps) for gentle, fluid deformation
 * that feels like breathing water — not a spiky blob.
 */
function buildMorphPath(
  cx: number,
  cy: number,
  baseRadius: number,
  time: number,
  morphAmount: number,
): string {
  'worklet';
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (i / NUM_POINTS) * Math.PI * 2;

    // Low-frequency waves (2-4 bumps) for smooth, organic undulation
    // Different speeds so the shape evolves unpredictably
    const d1 = Math.sin(angle * 2 + time * 0.7) * morphAmount * 0.45;
    const d2 = Math.sin(angle * 3 - time * 0.5) * morphAmount * 0.35;
    const d3 = Math.cos(angle * 2 + time * 1.1) * morphAmount * 0.2;

    const r = baseRadius + d1 + d2 + d3;
    points.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }

  // Build smooth cubic bezier path through points
  // Using Catmull-Rom → Bezier conversion for smooth curves
  let path = `M ${points[0].x} ${points[0].y} `;

  for (let i = 0; i < NUM_POINTS; i++) {
    const p0 = points[(i - 1 + NUM_POINTS) % NUM_POINTS];
    const p1 = points[i];
    const p2 = points[(i + 1) % NUM_POINTS];
    const p3 = points[(i + 2) % NUM_POINTS];

    // Catmull-Rom to cubic bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y} `;
  }

  path += 'Z';
  return path;
}

export function CompanionOrb({
  accentColor,
  size = 48,
  onPress,
  isActive = false,
  showBadge = false,
}: CompanionOrbProps) {
  const { reducedMotion } = useAccessibleAnimation();
  const morphTime = useSharedValue(0);
  const breathe = useSharedValue(0);
  const tapPulse = useSharedValue(0);
  const gradientRotation = useSharedValue(0);

  useEffect(() => {
    // Skip all looping animations when reduced motion is on
    if (reducedMotion) return;

    // Morph animation — continuous, slow cycle
    morphTime.value = withRepeat(
      withTiming(Math.PI * 20, { duration: 30000, easing: Easing.linear }),
      -1,
      false,
    );
    // Gradient rotation
    gradientRotation.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 6000, easing: Easing.linear }),
      -1,
      false,
    );
    // Breathing cycle
    breathe.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [reducedMotion]);

  // Canvas padding so glow doesn't clip
  const padding = Math.ceil(size * 0.45);
  const canvasSize = size + padding * 2;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const baseRadius = size * 0.34;

  // How much the ring morphs (in pixels)
  // Scales sub-linearly with size so large orbs stay fluid, not blobby
  const morphIntensity = isActive
    ? Math.min(size * 0.035, 2.8)
    : Math.min(size * 0.02, 1.5);

  // Stroke widths
  const outerGlowStroke = size * 0.2;
  const midGlowStroke = size * 0.14;
  const innerGlowStroke = size * 0.08;
  const sharpRingStroke = size * 0.06;

  // Blur radii
  const outerBlurRadius = Math.max(6, size * 0.3);
  const innerBlurRadius = Math.max(2, size * 0.06);

  const colors = useMemo(() => buildRingColors(accentColor), [accentColor]);

  // Animated morph path — rebuilt every frame via worklet
  const morphPathStr = useDerivedValue(() => {
    return buildMorphPath(cx, cy, baseRadius, morphTime.value, morphIntensity);
  });

  // Create Skia path from string on the UI thread
  const outerGlowPath = useDerivedValue(() => {
    return Skia.Path.MakeFromSVGString(morphPathStr.value) ?? Skia.Path.Make();
  });
  const midGlowPath = useDerivedValue(() => {
    return Skia.Path.MakeFromSVGString(morphPathStr.value) ?? Skia.Path.Make();
  });
  const innerGlowPath = useDerivedValue(() => {
    return Skia.Path.MakeFromSVGString(morphPathStr.value) ?? Skia.Path.Make();
  });
  const sharpRingPath = useDerivedValue(() => {
    return Skia.Path.MakeFromSVGString(morphPathStr.value) ?? Skia.Path.Make();
  });

  const gradientTransform = useDerivedValue(() => {
    return [{ rotate: gradientRotation.value }];
  });

  const glowOpacity = useDerivedValue(() => {
    return interpolate(breathe.value, [0, 1], [0.2, 0.4]);
  });

  // Use a fixed blur radius — animating BlurMask blur causes Skia rendering artifacts
  const midGlowBlur = Math.max(6, size * 0.13);

  const containerStyle = useAnimatedStyle(() => {
    const scaleMin = isActive ? 0.97 : 0.98;
    const scaleMax = isActive ? 1.03 : 1.01;
    const scale = interpolate(breathe.value, [0, 1], [scaleMin, scaleMax]);
    const tapBoost = interpolate(tapPulse.value, [0, 1], [1, 1.15]);
    return {
      transform: [{ scale: scale * tapBoost }],
    };
  });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    tapPulse.value = withSequence(
      withSpring(1, { damping: 45, stiffness: 500 }),
      withSpring(0, { damping: 35, stiffness: 300 }),
    );
    onPress?.();
  };

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      <TouchableOpacity activeOpacity={0.7}
        onPress={handlePress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Companion orb"
        style={{ width: size, height: size }}
      >
        <Animated.View style={[{ width: size, height: size, overflow: 'visible' }, containerStyle]}>
          <Canvas
            style={{
              width: canvasSize,
              height: canvasSize,
              marginLeft: -padding,
              marginTop: -padding,
            }}
          >
            {/* Layer 1: Wide soft outer glow */}
            <Group
              style="stroke"
              strokeWidth={outerGlowStroke}
              opacity={0.12}
            >
              <Path path={outerGlowPath} color={colors.outerGlow}>
                <BlurMask blur={outerBlurRadius} style="normal" />
              </Path>
            </Group>

            {/* Layer 2: Mid glow — breathing */}
            <Group
              style="stroke"
              strokeWidth={midGlowStroke}
              opacity={glowOpacity}
            >
              <Path path={midGlowPath} color={colors.midGlow}>
                <BlurMask blur={midGlowBlur} style="normal" />
              </Path>
            </Group>

            {/* Layer 3: Inner glow */}
            <Group
              style="stroke"
              strokeWidth={innerGlowStroke}
              opacity={0.5}
            >
              <Path path={innerGlowPath} color={colors.innerGlow}>
                <BlurMask blur={innerBlurRadius} style="normal" />
              </Path>
            </Group>

            {/* Layer 4: Sharp ring with rotating sweep gradient */}
            <Group
              style="stroke"
              strokeWidth={sharpRingStroke}
              strokeCap="round"
              strokeJoin="round"
            >
              <Path path={sharpRingPath}>
                <SweepGradient
                  c={vec(cx, cy)}
                  colors={colors.sweepColors}
                  transform={gradientTransform}
                />
              </Path>
            </Group>
          </Canvas>
        </Animated.View>
      </TouchableOpacity>

      {/* Badge dot */}
      {showBadge && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: accentColor,
          }}
        />
      )}
    </View>
  );
}
