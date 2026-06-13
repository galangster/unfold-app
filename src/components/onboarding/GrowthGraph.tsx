import { useEffect, useMemo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  LinearGradient,
  vec,
  Group,
  Rect,
  Circle,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import type { ColorTheme } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_WIDTH = SCREEN_WIDTH - Spacing['6'] * 2 - 32;
const GRAPH_HEIGHT = 160;

const LABELS = ['3 Days', '7 Days', '30 Days'];

function buildCurvePath(w: number, h: number): string {
  const startX = 0;
  const startY = h * 0.92;
  const endX = w;
  const endY = h * 0.08;
  return `M ${startX} ${startY} C ${w * 0.35} ${h * 0.85}, ${w * 0.5} ${h * 0.4}, ${endX} ${endY}`;
}

function buildFillPath(w: number, h: number): string {
  const curvePath = buildCurvePath(w, h);
  return `${curvePath} L ${w} ${h} L 0 ${h} Z`;
}

interface GrowthGraphProps {
  colors: ColorTheme;
  /** Delay before animation starts (ms) — use to sync with parent fade-in */
  animationDelay?: number;
  onDrawComplete?: () => void;
}

export function GrowthGraph({ colors, animationDelay = 0, onDrawComplete }: GrowthGraphProps) {
  const accent = colors.accent;
  const reducedMotion = useReducedMotion();
  const path = useMemo(
    () => Skia.Path.MakeFromSVGString(buildCurvePath(GRAPH_WIDTH, GRAPH_HEIGHT)),
    [],
  );
  const fillPath = useMemo(
    () => Skia.Path.MakeFromSVGString(buildFillPath(GRAPH_WIDTH, GRAPH_HEIGHT)),
    [],
  );

  // Animate clip width from 0 → GRAPH_WIDTH (reveals line left to right)
  const clipProgress = useSharedValue(0);
  const fillOpacity = useSharedValue(0);

  // Derived clip rect that grows horizontally
  const clipRect = useDerivedValue(() => {
    return {
      x: 0,
      y: 0,
      width: clipProgress.value * GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
    };
  });

  // Dot position — tracks the clip rect's leading edge exactly.
  // dotX = clipProgress * GRAPH_WIDTH (same as the clip rect width).
  // dotY = solve the bezier y for that x by finding the t that produces dotX,
  // then evaluating y at that t. We use Newton's method (3 iterations) to invert
  // the bezier x(t) → t, then evaluate y(t).
  const dotX = useDerivedValue(() => {
    return clipProgress.value * GRAPH_WIDTH;
  });

  const dotY = useDerivedValue(() => {
    const targetX = clipProgress.value * GRAPH_WIDTH;
    // Bezier control points (x-coordinates)
    const x0 = 0, x1 = GRAPH_WIDTH * 0.35, x2 = GRAPH_WIDTH * 0.5, x3 = GRAPH_WIDTH;
    // Bezier control points (y-coordinates)
    const y0 = GRAPH_HEIGHT * 0.92, y1 = GRAPH_HEIGHT * 0.85, y2 = GRAPH_HEIGHT * 0.4, y3 = GRAPH_HEIGHT * 0.08;

    // Newton's method: find t where bezierX(t) = targetX
    let t = clipProgress.value; // good initial guess
    for (let i = 0; i < 5; i++) {
      const mt = 1 - t;
      const bx = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
      // Derivative of bezier x w.r.t. t
      const dx = 3 * mt * mt * (x1 - x0) + 6 * mt * t * (x2 - x1) + 3 * t * t * (x3 - x2);
      if (Math.abs(dx) < 0.001) break;
      t = t - (bx - targetX) / dx;
      t = Math.max(0, Math.min(1, t));
    }

    const mt = 1 - t;
    return mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
  });

  // Pulsing glow for the dot (blink effect)
  const dotPulse = useSharedValue(0.6);

  useEffect(() => {
    // Line reveals over 6000ms — slow, deliberate, let it breathe
    clipProgress.value = withDelay(animationDelay, withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.cubic) }));
    // Gradient fill fades in after line completes
    fillOpacity.value = withDelay(animationDelay + 6000, withTiming(0.15, { duration: 800 }));
    // Dot pulse — blink continuously
    if (!reducedMotion) {
      dotPulse.value = withDelay(animationDelay, withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ));
    }

    const timer = setTimeout(() => onDrawComplete?.(), animationDelay + 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View>
      {/* Graph label */}
      <Text style={{
        ...Typography.cardMeta,
        color: colors.textHint,
        marginBottom: Spacing['3'],
        textAlign: 'center',
      }}>
        How personal your devotionals become
      </Text>

      {/* Canvas */}
      <View style={{ height: GRAPH_HEIGHT + 40, marginHorizontal: 4 }}>
        <Canvas style={{ width: GRAPH_WIDTH + 24, height: GRAPH_HEIGHT + 24 }}>
        <Group transform={[{ translateX: 12 }, { translateY: 12 }]}>
          {/* Gradient fill under curve (fades in after draw) */}
          {fillPath && (
            <Path path={fillPath} opacity={fillOpacity}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, GRAPH_HEIGHT)}
                colors={[`${accent}40`, `${accent}00`]}
              />
            </Path>
          )}

          {/* Curve line — clipped by a rect that grows left to right */}
          {path && (
            <Group clip={clipRect}>
              <Path
                path={path}
                style="stroke"
                strokeWidth={2.5}
                color={accent}
                strokeCap="round"
              />
            </Group>
          )}

          {/* Traveling dot — follows the leading edge of the curve reveal */}
          <Circle cx={dotX} cy={dotY} r={5} color={accent} opacity={dotPulse} />
          {/* Outer glow ring */}
          <Circle cx={dotX} cy={dotY} r={10} color={accent} opacity={useDerivedValue(() => dotPulse.value * 0.25)} />
        </Group>
        </Canvas>

        {/* X-axis labels */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing['2'] }}>
          {LABELS.map((label, i) => (
            <Text key={label} style={{
              fontFamily: FontFamily.ui,
              fontSize: 11,
              color: colors.textHint,
              width: GRAPH_WIDTH / 3,
              textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
            }}>
              {label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
