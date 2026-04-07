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
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { ColorTheme } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_WIDTH = SCREEN_WIDTH - Spacing['6'] * 2 - 32;
const GRAPH_HEIGHT = 160;
const ACCENT = '#C8A55C';

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

  useEffect(() => {
    // Line reveals over 6000ms — slow, deliberate, let it breathe
    clipProgress.value = withDelay(animationDelay, withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.cubic) }));
    // Gradient fill fades in after line completes
    fillOpacity.value = withDelay(animationDelay + 6000, withTiming(0.15, { duration: 800 }));

    const timer = setTimeout(() => onDrawComplete?.(), animationDelay + 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View>
      {/* Graph label */}
      <Text style={{
        fontFamily: FontFamily.ui,
        fontSize: 10,
        color: colors.textHint,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: Spacing['3'],
        textAlign: 'center',
      }}>
        How personal your devotionals become
      </Text>

      {/* Canvas */}
      <View style={{ height: GRAPH_HEIGHT + 40, marginHorizontal: 16 }}>
        <Canvas style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}>
          {/* Gradient fill under curve (fades in after draw) */}
          {fillPath && (
            <Path path={fillPath} opacity={fillOpacity}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, GRAPH_HEIGHT)}
                colors={[`${ACCENT}40`, `${ACCENT}00`]}
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
                color={ACCENT}
                strokeCap="round"
              />
            </Group>
          )}
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
