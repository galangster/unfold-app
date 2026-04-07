import { useEffect, useMemo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  LinearGradient,
  vec,
  Circle,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { ColorTheme } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_WIDTH = SCREEN_WIDTH - Spacing['6'] * 2 - 32;
const GRAPH_HEIGHT = 160;
const ACCENT = '#C8A55C';

const POINTS = [
  { x: 0.05, y: 0.85, label: '3 Days' },
  { x: 0.42, y: 0.5, label: '7 Days' },
  { x: 0.95, y: 0.1, label: '30 Days' },
];

function buildCurvePath(w: number, h: number): string {
  const pts = POINTS.map((p) => ({ x: p.x * w, y: p.y * h }));
  const startX = 0;
  const startY = h * 0.92;
  let d = `M ${startX} ${startY}`;
  d += ` C ${pts[0].x * 0.5} ${startY}, ${pts[0].x * 0.8} ${pts[0].y + 10}, ${pts[0].x} ${pts[0].y}`;
  d += ` C ${pts[0].x + (pts[1].x - pts[0].x) * 0.4} ${pts[0].y - 5}, ${pts[1].x - (pts[1].x - pts[0].x) * 0.3} ${pts[1].y + 10}, ${pts[1].x} ${pts[1].y}`;
  d += ` C ${pts[1].x + (pts[2].x - pts[1].x) * 0.4} ${pts[1].y - 10}, ${pts[2].x - (pts[2].x - pts[1].x) * 0.3} ${pts[2].y + 20}, ${pts[2].x} ${pts[2].y}`;
  return d;
}

function buildFillPath(w: number, h: number): string {
  const curvePath = buildCurvePath(w, h);
  const pts = POINTS.map((p) => ({ x: p.x * w, y: p.y * h }));
  return `${curvePath} L ${pts[2].x} ${h} L 0 ${h} Z`;
}

interface GrowthGraphProps {
  colors: ColorTheme;
  onDrawComplete?: () => void;
}

export function GrowthGraph({ colors, onDrawComplete }: GrowthGraphProps) {
  const path = useMemo(
    () => Skia.Path.MakeFromSVGString(buildCurvePath(GRAPH_WIDTH, GRAPH_HEIGHT)),
    [],
  );
  const fillPath = useMemo(
    () => Skia.Path.MakeFromSVGString(buildFillPath(GRAPH_WIDTH, GRAPH_HEIGHT)),
    [],
  );

  const progress = useSharedValue(0);
  const node1Scale = useSharedValue(0);
  const node2Scale = useSharedValue(0);
  const node3Scale = useSharedValue(0);
  const fillOpacity = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
    node1Scale.value = withDelay(
      200,
      withSpring(1, { damping: 20, stiffness: 200, mass: 0.5 }),
    );
    node2Scale.value = withDelay(
      550,
      withSpring(1, { damping: 20, stiffness: 200, mass: 0.5 }),
    );
    node3Scale.value = withDelay(
      1000,
      withSpring(1, { damping: 20, stiffness: 200, mass: 0.5 }),
    );
    fillOpacity.value = withDelay(
      1200,
      withTiming(0.15, { duration: 600 }),
    );

    const timer = setTimeout(() => onDrawComplete?.(), 1200);
    return () => clearTimeout(timer);
  }, []);

  const pts = POINTS.map((p) => ({
    x: p.x * GRAPH_WIDTH,
    y: p.y * GRAPH_HEIGHT,
  }));

  return (
    <View>
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: 10,
          color: colors.textHint,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: Spacing['3'],
          textAlign: 'center',
        }}
      >
        How personal your devotionals become
      </Text>

      <View style={{ height: GRAPH_HEIGHT + 40, marginHorizontal: 16 }}>
        <Canvas style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}>
          {fillPath && (
            <Path path={fillPath} opacity={fillOpacity}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, GRAPH_HEIGHT)}
                colors={[`${ACCENT}40`, `${ACCENT}00`]}
              />
            </Path>
          )}

          {path && (
            <Path
              path={path}
              style="stroke"
              strokeWidth={2}
              color={ACCENT}
              end={progress}
            />
          )}

          {/* Filled dot nodes */}
          <Circle
            cx={pts[0].x}
            cy={pts[0].y}
            r={4}
            color={ACCENT}
            opacity={node1Scale}
          />
          <Circle
            cx={pts[1].x}
            cy={pts[1].y}
            r={4}
            color={ACCENT}
            opacity={node2Scale}
          />
          <Circle
            cx={pts[2].x}
            cy={pts[2].y}
            r={4}
            color={ACCENT}
            opacity={node3Scale}
          />

          {/* Outer ring nodes */}
          <Circle
            cx={pts[0].x}
            cy={pts[0].y}
            r={7}
            color={ACCENT}
            style="stroke"
            strokeWidth={1.5}
            opacity={node1Scale}
          />
          <Circle
            cx={pts[1].x}
            cy={pts[1].y}
            r={7}
            color={ACCENT}
            style="stroke"
            strokeWidth={1.5}
            opacity={node2Scale}
          />
          <Circle
            cx={pts[2].x}
            cy={pts[2].y}
            r={7}
            color={ACCENT}
            style="stroke"
            strokeWidth={1.5}
            opacity={node3Scale}
          />
        </Canvas>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: Spacing['2'],
          }}
        >
          {POINTS.map((p, i) => (
            <Text
              key={p.label}
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 11,
                color: colors.textHint,
                width: GRAPH_WIDTH / 3,
                textAlign:
                  i === 0 ? 'left' : i === 2 ? 'right' : 'center',
              }}
            >
              {p.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
