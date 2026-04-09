import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { PencilSimpleIcon, HeartIcon, CheckIcon, BookOpenIcon, CaretLeftIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { useUnfoldStore, ACCENT_THEMES } from '@/lib/store';



const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Page data ───────────────────────────────────────────────────

export interface FeatureCard {
  headline: string;
  body: string;
  animation: 'dots' | 'orb' | 'waveform' | 'pulse' | 'infinity' | 'lines' | 'glow' | 'rings' | 'pencil' | 'heartbeat' | 'weekCircles' | 'network' | 'openBook' | 'pulseLine';
}

export const FEATURE_PAGES: FeatureCard[] = [
  {
    headline: 'Written for you',
    body: 'Every word shaped by your story, your struggles, where you are right now. No one in the world will have the same experience as you.',
    animation: 'pencil',
  },
  {
    headline: 'Personal daily check-ins',
    body: "Your answers today shape tomorrow's Word.",
    animation: 'heartbeat',
  },
  {
    headline: 'Build a rhythm',
    body: 'Streaks that matter. A gentle push to show up, even when it\u2019s hard.',
    animation: 'weekCircles',
  },
  {
    headline: '32 Bible study methods',
    body: 'Lectio Divina. SOAP. Ignatian reflection. Character studies. Parables. Pick the approach that fits how you learn.',
    animation: 'network',
  },
  {
    headline: 'A full Bible reader',
    body: 'Every book, chapter, and verse. Tap any scripture in your devotional to read it in context.',
    animation: 'openBook',
  },
  {
    headline: 'A real note-taking suite',
    body: 'Rich-text journal with folders, favorites, and scripture linking. Your thoughts stay with the verses that sparked them.',
    animation: 'pulseLine',
  },
  {
    headline: 'Everything in one place',
    body: 'Bible. Devotionals. Notes. No more switching between three apps to do your quiet time.',
    animation: 'infinity',
  },
];

// ─── Ambient animation components ────────────────────────────────

function FloatingDots({ accent }: { accent: string }) {
  const a1 = useSharedValue(0);
  const a2 = useSharedValue(0);
  const a3 = useSharedValue(0);
  const a4 = useSharedValue(0);
  const a5 = useSharedValue(0);

  useEffect(() => {
    a1.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true);
    a2.value = withDelay(400, withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, true));
    a3.value = withDelay(800, withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true));
    a4.value = withDelay(200, withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true));
    a5.value = withDelay(600, withRepeat(withTiming(1, { duration: 2700, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);

  const s1 = useAnimatedStyle(() => ({
    opacity: interpolate(a1.value, [0, 1], [0.15, 0.5]),
    transform: [{ translateY: interpolate(a1.value, [0, 1], [8, -12]) }],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: interpolate(a2.value, [0, 1], [0.2, 0.55]),
    transform: [{ translateY: interpolate(a2.value, [0, 1], [12, -8]) }],
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: interpolate(a3.value, [0, 1], [0.1, 0.4]),
    transform: [{ translateY: interpolate(a3.value, [0, 1], [6, -14]) }],
  }));
  const s4 = useAnimatedStyle(() => ({
    opacity: interpolate(a4.value, [0, 1], [0.15, 0.45]),
    transform: [
      { translateY: interpolate(a4.value, [0, 1], [10, -6]) },
      { translateX: interpolate(a4.value, [0, 1], [-4, 4]) },
    ],
  }));
  const s5 = useAnimatedStyle(() => ({
    opacity: interpolate(a5.value, [0, 1], [0.2, 0.5]),
    transform: [{ translateY: interpolate(a5.value, [0, 1], [5, -10]) }],
  }));

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: accent, left: 30, top: 50 }, s1]} />
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: accent, left: 95, top: 25 }, s2]} />
      <Animated.View style={[{ position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: accent, left: 70, top: 105 }, s3]} />
      <Animated.View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: accent, left: 135, top: 70 }, s4]} />
      <Animated.View style={[{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: accent, left: 45, top: 135 }, s5]} />
    </View>
  );
}

function PencilWriting({ accent }: { accent: string }) {
  // Single progress drives everything: 0→1 line1, 1→1.15 pause, 1.15→2.15 line2, 2.15→2.3 pause, 2.3→3.3 line3, 3.3→3.8 pause/reset
  const progress = useSharedValue(0);
  const fadeIn = useSharedValue(0);

  const LINE_LEFT = 25;
  const LINE_TOP_1 = 65;
  const LINE_GAP = 18;
  const LINE_W1 = 130;
  const LINE_W2 = 110;
  const LINE_W3 = 80;
  const ICON_SIZE = 32;
  // Pencil tip offset: position so the tip leads the line
  const TIP_OFFSET_X = ICON_SIZE * 0.15;
  const TIP_OFFSET_Y = ICON_SIZE - 4;

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 500 });
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),      // write line 1
        withTiming(1.15, { duration: Duration.normal }),                              // hop down
        withTiming(2.15, { duration: 1400, easing: Easing.out(Easing.quad) }),    // write line 2
        withTiming(2.3, { duration: Duration.normal }),                               // hop down
        withTiming(3.3, { duration: 1000, easing: Easing.out(Easing.quad) }),     // write line 3
        withTiming(3.8, { duration: 800 }),                                        // pause before restart
      ),
      -1,
      false,
    );
  }, []);

  const line1Style = useAnimatedStyle(() => {
    const w = interpolate(progress.value, [0, 1], [0, LINE_W1], 'clamp');
    return {
      width: w,
      opacity: w > 0 ? 0.5 : 0,
    };
  });
  const line2Style = useAnimatedStyle(() => {
    const w = interpolate(progress.value, [1.15, 2.15], [0, LINE_W2], 'clamp');
    return {
      width: w,
      opacity: w > 0 ? 0.5 : 0,
    };
  });
  const line3Style = useAnimatedStyle(() => {
    const w = interpolate(progress.value, [2.3, 3.3], [0, LINE_W3], 'clamp');
    return {
      width: w,
      opacity: w > 0 ? 0.5 : 0,
    };
  });

  const pencilStyle = useAnimatedStyle(() => {
    const p = progress.value;
    let x: number;
    let y: number;

    if (p <= 1) {
      // Writing line 1
      x = LINE_LEFT + interpolate(p, [0, 1], [0, LINE_W1]);
      y = LINE_TOP_1;
    } else if (p <= 1.15) {
      // Hopping to line 2
      x = LINE_LEFT + interpolate(p, [1, 1.15], [LINE_W1, 0]);
      y = LINE_TOP_1 + interpolate(p, [1, 1.15], [0, LINE_GAP]);
    } else if (p <= 2.15) {
      // Writing line 2
      x = LINE_LEFT + interpolate(p, [1.15, 2.15], [0, LINE_W2]);
      y = LINE_TOP_1 + LINE_GAP;
    } else if (p <= 2.3) {
      // Hopping to line 3
      x = LINE_LEFT + interpolate(p, [2.15, 2.3], [LINE_W2, 0]);
      y = LINE_TOP_1 + LINE_GAP + interpolate(p, [2.15, 2.3], [0, LINE_GAP]);
    } else if (p <= 3.3) {
      // Writing line 3
      x = LINE_LEFT + interpolate(p, [2.3, 3.3], [0, LINE_W3]);
      y = LINE_TOP_1 + LINE_GAP * 2;
    } else {
      // Pause / fade
      x = LINE_LEFT + LINE_W3;
      y = LINE_TOP_1 + LINE_GAP * 2;
    }

    return {
      opacity: fadeIn.value * (p <= 3.3 ? 1 : interpolate(p, [3.3, 3.8], [1, 0.3])),
      transform: [
        { translateX: x + TIP_OFFSET_X - ICON_SIZE * 0.3 },
        { translateY: y - TIP_OFFSET_Y },
      ],
    };
  });

  return (
    <View style={{ width: 180, height: 180 }}>
      {/* Written lines */}
      <Animated.View style={[{ position: 'absolute', left: LINE_LEFT, top: LINE_TOP_1, height: 3, borderRadius: 1.5, backgroundColor: accent }, line1Style]} />
      <Animated.View style={[{ position: 'absolute', left: LINE_LEFT, top: LINE_TOP_1 + LINE_GAP, height: 3, borderRadius: 1.5, backgroundColor: accent }, line2Style]} />
      <Animated.View style={[{ position: 'absolute', left: LINE_LEFT, top: LINE_TOP_1 + LINE_GAP * 2, height: 3, borderRadius: 1.5, backgroundColor: accent }, line3Style]} />
      {/* Pencil icon — tip tracks end of current line */}
      <Animated.View style={[{ position: 'absolute' }, pencilStyle]}>
        <PencilSimpleIcon size={ICON_SIZE} color={accent} weight="light" />
      </Animated.View>
    </View>
  );
}

function WeekCircleDay({ accent, delay, resetKey }: { accent: string; delay: number; resetKey: number }) {
  const fill = useSharedValue(0);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    fill.value = 0;
    checkScale.value = 0;
    fill.value = withDelay(delay, withTiming(1, { duration: Duration.slow, easing: Easing.out(Easing.quad) }));
    checkScale.value = withDelay(delay + 250, withSequence(
      withTiming(1.3, { duration: 180, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 120 }),
    ));
  }, [resetKey]);

  const bgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fill.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(fill.value, [0, 0.5, 1], [1, 1.08, 1]) }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkScale.value > 0 ? 1 : 0,
    transform: [{ scale: checkScale.value }],
  }));

  return (
    <Animated.View style={[{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: accent }, bgStyle]}>
      <Animated.View style={checkStyle}>
        <CheckIcon size={16} color={accent} weight="bold" />
      </Animated.View>
    </Animated.View>
  );
}

function WeekCircles({ accent }: { accent: string }) {
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    // Total animation: 7 circles * 400ms stagger + 1500ms hold + 500ms gap = ~5800ms
    const interval = setInterval(() => {
      setResetKey((k) => k + 1);
    }, 5800);
    return () => clearInterval(interval);
  }, []);

  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <View style={{ width: 280, height: 100, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {DAYS.map((day, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <WeekCircleDay accent={accent} delay={i * 400} resetKey={resetKey} />
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 10, color: accent, opacity: 0.5 }}>{day}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function OpenBook({ accent }: { accent: string }) {
  const open = useSharedValue(0);

  useEffect(() => {
    open.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.back(1.2)) }),
        withTiming(1, { duration: 1800 }), // hold open
        withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 600 }), // hold closed
      ),
      -1,
      false,
    );
  }, []);

  const COVER_W = 50;
  const COVER_H = 70;
  const SPINE_W = 6;

  // Left cover hinges from its right edge
  const leftCover = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${interpolate(open.value, [0, 1], [0, -55])}deg` },
    ],
  }));
  // Right cover hinges from its left edge
  const rightCover = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${interpolate(open.value, [0, 1], [0, 55])}deg` },
    ],
  }));
  // Pages visible when open
  const pagesOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.3, 1], [0, 0.3, 0.6]),
  }));
  // Text lines on pages
  const linesOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.5, 1], [0, 0, 0.5]),
  }));
  // Subtle glow when fully open
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.7, 1], [0, 0, 0.15]),
    transform: [{ scale: interpolate(open.value, [0, 1], [0.5, 1.2]) }],
  }));

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      {/* Subtle glow */}
      <Animated.View style={[{
        position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: accent,
      }, glowStyle]} />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Left cover */}
        <Animated.View style={[{
          width: COVER_W, height: COVER_H,
          backgroundColor: accent, opacity: 0.2,
          borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
          borderWidth: 1.5, borderColor: accent,
          transformOrigin: 'right center',
        }, leftCover]}>
          {/* Page inside left cover */}
          <Animated.View style={[{
            position: 'absolute', right: 3, top: 6, bottom: 6, left: 6,
            backgroundColor: accent, borderRadius: 2,
          }, pagesOpacity]}>
            {/* Text lines */}
            <Animated.View style={linesOpacity}>
              <View style={{ marginTop: 8, marginHorizontal: 4, gap: 5 }}>
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '90%', borderRadius: 1 }} />
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '70%', borderRadius: 1 }} />
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '80%', borderRadius: 1 }} />
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '50%', borderRadius: 1 }} />
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {/* Spine */}
        <View style={{
          width: SPINE_W, height: COVER_H,
          backgroundColor: accent, opacity: 0.4,
        }} />

        {/* Right cover */}
        <Animated.View style={[{
          width: COVER_W, height: COVER_H,
          backgroundColor: accent, opacity: 0.2,
          borderTopRightRadius: 4, borderBottomRightRadius: 4,
          borderWidth: 1.5, borderColor: accent,
          transformOrigin: 'left center',
        }, rightCover]}>
          {/* Page inside right cover */}
          <Animated.View style={[{
            position: 'absolute', left: 3, top: 6, bottom: 6, right: 6,
            backgroundColor: accent, borderRadius: 2,
          }, pagesOpacity]}>
            <Animated.View style={linesOpacity}>
              <View style={{ marginTop: 8, marginHorizontal: 4, gap: 5 }}>
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '85%', borderRadius: 1 }} />
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '95%', borderRadius: 1 }} />
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '60%', borderRadius: 1 }} />
                <View style={{ height: 1.5, backgroundColor: accent, opacity: 0.6, width: '75%', borderRadius: 1 }} />
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

function PulseLine({ accent }: { accent: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  // Create a traveling pulse dot along a sine wave
  const WAVE_WIDTH = 200;
  const WAVE_HEIGHT = 60;
  const NUM_POINTS = 30;

  return (
    <View style={{ width: WAVE_WIDTH, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: NUM_POINTS }).map((_, i) => (
        <PulsePoint key={i} index={i} total={NUM_POINTS} accent={accent} pulse={pulse} width={WAVE_WIDTH} height={WAVE_HEIGHT} />
      ))}
    </View>
  );
}

function PulsePoint({ index, total, accent, pulse, width, height }: {
  index: number; total: number; accent: string;
  pulse: { value: number }; width: number; height: number;
}) {
  const x = (index / (total - 1)) * width;
  // Sine wave shape
  const baseY = Math.sin((index / (total - 1)) * Math.PI * 3) * (height / 2);

  const style = useAnimatedStyle(() => {
    // Traveling glow: pulse.value goes 0→1, light up points near the pulse position
    const pulseX = pulse.value * width;
    const dist = Math.abs(x - pulseX);
    const glow = interpolate(dist, [0, 30, 60], [1, 0.4, 0.1], 'clamp');
    return {
      opacity: glow,
      transform: [{ scale: interpolate(glow, [0.1, 0.4, 1], [0.6, 0.8, 1.2]) }],
    };
  });

  return (
    <Animated.View style={[{
      position: 'absolute',
      left: x - 2.5,
      top: 90 + baseY - 2.5,
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: accent,
    }, style]} />
  );
}

// 10 nodes in a network that connect and glow sequentially
const NETWORK_NODES = [
  { x: 90, y: 20 },
  { x: 155, y: 35 },
  { x: 35, y: 55 },
  { x: 120, y: 65 },
  { x: 60, y: 100 },
  { x: 170, y: 90 },
  { x: 20, y: 140 },
  { x: 100, y: 135 },
  { x: 155, y: 145 },
  { x: 75, y: 170 },
];

// Pre-computed edges (pairs of node indices that connect)
const NETWORK_EDGES: [number, number][] = [
  [0, 1], [0, 3], [2, 0], [2, 4], [3, 1], [3, 5],
  [4, 3], [4, 7], [5, 8], [6, 4], [6, 7], [7, 8], [7, 9], [9, 6],
];

function NetworkNode({ accent, x, y, delay }: { accent: string; x: number; y: number; delay: number }) {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
        withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    ));
  }, []);

  const nodeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 0.3, 1], [0.2, 0.4, 1]),
    transform: [{ scale: interpolate(glow.value, [0, 0.3, 1], [0.8, 1, 1.3]) }],
  }));

  const glowBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 0.3, 1], [0, 0, 0.3]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 2.5]) }],
  }));

  return (
    <>
      <Animated.View style={[{
        position: 'absolute', left: x - 10, top: y - 10,
        width: 20, height: 20, borderRadius: 10, backgroundColor: accent,
      }, glowBgStyle]} />
      <Animated.View style={[{
        position: 'absolute', left: x - 4, top: y - 4,
        width: 8, height: 8, borderRadius: 4, backgroundColor: accent,
      }, nodeStyle]} />
    </>
  );
}

function NetworkEdge({ accent, x1, y1, x2, y2, delay }: { accent: string; x1: number; y1: number; x2: number; y2: number; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }),
        withTiming(0.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    ));
  }, []);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 1], [0, 0.1, 0.35]),
  }));

  return (
    <Animated.View style={[{
      position: 'absolute',
      left: x1,
      top: y1 - 0.5,
      width: length,
      height: 1,
      backgroundColor: accent,
      transformOrigin: 'left center',
      transform: [{ rotate: `${angle}deg` }],
    }, lineStyle]} />
  );
}

function NetworkNodes({ accent }: { accent: string }) {
  return (
    <View style={{ width: 200, height: 200 }}>
      {NETWORK_EDGES.map(([a, b], i) => (
        <NetworkEdge
          key={`e${i}`}
          accent={accent}
          x1={NETWORK_NODES[a].x}
          y1={NETWORK_NODES[a].y}
          x2={NETWORK_NODES[b].x}
          y2={NETWORK_NODES[b].y}
          delay={Math.min(a, b) * 300}
        />
      ))}
      {NETWORK_NODES.map((n, i) => (
        <NetworkNode key={`n${i}`} accent={accent} x={n.x} y={n.y} delay={i * 300} />
      ))}
    </View>
  );
}

function BeatingHeart({ accent }: { accent: string }) {
  const beat = useSharedValue(0);

  useEffect(() => {
    // Realistic heartbeat: quick double-pump, then rest
    beat.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Duration.fast, easing: Easing.out(Easing.quad) }),
        withTiming(0.3, { duration: 120, easing: Easing.in(Easing.quad) }),
        withTiming(0.8, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: Duration.slow, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600 }), // rest
      ),
      -1,
      false,
    );
  }, []);

  const heartStyle = useAnimatedStyle(() => {
    const scale = interpolate(beat.value, [0, 0.3, 0.8, 1], [1, 1.02, 1.12, 1.18]);
    return {
      transform: [{ scale }],
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const scale = interpolate(beat.value, [0, 0.3, 0.8, 1], [1, 1.1, 1.35, 1.5]);
    const opacity = interpolate(beat.value, [0, 0.3, 0.8, 1], [0.05, 0.1, 0.2, 0.3]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      {/* Glow behind heart */}
      <Animated.View
        style={[{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: accent,
        }, glowStyle]}
      />
      {/* Heart icon */}
      <Animated.View style={heartStyle}>
        <HeartIcon size={64} color={accent} weight="fill" />
      </Animated.View>
    </View>
  );
}

function WaveBar({ accent, delay, minH, maxH }: { accent: string; delay: number; minH: number; maxH: number }) {
  const h = useSharedValue(minH);

  useEffect(() => {
    h.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(maxH, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(minH, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({ height: h.value }));

  return <Animated.View style={[{ width: 8, borderRadius: 4, backgroundColor: accent, opacity: 0.5 }, style]} />;
}

function WaveformBars({ accent }: { accent: string }) {
  const bars = [
    { delay: 0, min: 20, max: 55 },
    { delay: 200, min: 30, max: 75 },
    { delay: 100, min: 15, max: 45 },
    { delay: 300, min: 25, max: 65 },
    { delay: 150, min: 20, max: 50 },
  ];

  return (
    <View style={{ width: 120, height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      {bars.map((bar, i) => (
        <WaveBar key={i} accent={accent} delay={bar.delay} minH={bar.min} maxH={bar.max} />
      ))}
    </View>
  );
}

function PulseCircle({ accent }: { accent: string }) {
  const breathe = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.12, 0.3]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.85, 1.15]) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.3, 0.6]),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1.05, 0.9]) }],
  }));

  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 100, height: 100, borderRadius: 50, backgroundColor: accent }, outerStyle]} />
      <Animated.View style={[{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: accent }, innerStyle]} />
    </View>
  );
}

// Pre-compute infinity (lemniscate) path points once
const INFINITY_NUM_POINTS = 48;
const INFINITY_SCALE = 60;
const INFINITY_POINTS: { x: number; y: number }[] = [];
for (let i = 0; i < INFINITY_NUM_POINTS; i++) {
  const t = (i / INFINITY_NUM_POINTS) * Math.PI * 2;
  const denom = 1 + Math.sin(t) * Math.sin(t);
  INFINITY_POINTS.push({
    x: (INFINITY_SCALE * Math.cos(t)) / denom,
    y: (INFINITY_SCALE * Math.sin(t) * Math.cos(t)) / denom,
  });
}

function InfinityDot({ accent, x, y, index, total, trace }: {
  accent: string; x: number; y: number; index: number; total: number;
  trace: { value: number };
}) {
  const style = useAnimatedStyle(() => {
    // trace.value is 0..1, representing the glow position along the path
    const tracePos = trace.value * total;
    // Wrap-aware distance so the glow smoothly crosses the loop point
    let dist = Math.abs(index - tracePos);
    if (dist > total / 2) dist = total - dist;
    // Glow falloff: bright near trace, dim far away
    const glow = interpolate(dist, [0, 4, 10, total / 2], [1, 0.6, 0.2, 0.08], 'clamp');
    return {
      opacity: glow,
      transform: [{ scale: interpolate(glow, [0.08, 0.6, 1], [0.5, 0.8, 1.3]) }],
    };
  });

  return (
    <Animated.View style={[{
      position: 'absolute',
      left: 90 + x - 3,
      top: 90 + y - 3,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: accent,
    }, style]} />
  );
}

function InfinityIcon({ accent }: { accent: string }) {
  const trace = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    // Continuous path trace — smooth loop, no bounce
    trace.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    // Gentle breathing scale
    breathe.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breathe.value, [0, 1], [0.95, 1.05]) }],
  }));

  // Glow dot — larger, follows the exact trace position
  const glowStyle = useAnimatedStyle(() => {
    const idx = trace.value * INFINITY_NUM_POINTS;
    const floor = Math.floor(idx) % INFINITY_NUM_POINTS;
    const ceil = (floor + 1) % INFINITY_NUM_POINTS;
    const frac = idx - Math.floor(idx);
    const gx = INFINITY_POINTS[floor].x * (1 - frac) + INFINITY_POINTS[ceil].x * frac;
    const gy = INFINITY_POINTS[floor].y * (1 - frac) + INFINITY_POINTS[ceil].y * frac;
    return {
      opacity: 0.25,
      transform: [
        { translateX: 90 + gx - 16 },
        { translateY: 90 + gy - 16 },
        { scale: interpolate(breathe.value, [0, 1], [0.8, 1.2]) },
      ],
    };
  });

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={containerStyle}>
        <View style={{ width: 180, height: 180 }}>
          {/* Soft glow that follows the trace point */}
          <Animated.View style={[{
            position: 'absolute',
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: accent,
          }, glowStyle]} />
          {/* Path dots */}
          {INFINITY_POINTS.map((pt, i) => (
            <InfinityDot
              key={i}
              accent={accent}
              x={pt.x}
              y={pt.y}
              index={i}
              total={INFINITY_NUM_POINTS}
              trace={trace}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function SlidingLines({ accent }: { accent: string }) {
  const a1 = useSharedValue(0);
  const a2 = useSharedValue(0);
  const a3 = useSharedValue(0);

  useEffect(() => {
    a1.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true);
    a2.value = withDelay(300, withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true));
    a3.value = withDelay(600, withRepeat(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);

  const s1 = useAnimatedStyle(() => ({
    opacity: interpolate(a1.value, [0, 0.5, 1], [0.15, 0.5, 0.15]),
    transform: [{ translateX: interpolate(a1.value, [0, 1], [-20, 20]) }],
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: interpolate(a2.value, [0, 0.5, 1], [0.2, 0.55, 0.2]),
    transform: [{ translateX: interpolate(a2.value, [0, 1], [15, -15]) }],
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: interpolate(a3.value, [0, 0.5, 1], [0.1, 0.4, 0.1]),
    transform: [{ translateX: interpolate(a3.value, [0, 1], [-10, 25]) }],
  }));

  const line = { height: 3, borderRadius: 2, backgroundColor: accent };

  return (
    <View style={{ width: 160, height: 120, justifyContent: 'center', gap: 16 }}>
      <Animated.View style={[line, { width: 100 }, s1]} />
      <Animated.View style={[line, { width: 130 }, s2]} />
      <Animated.View style={[line, { width: 80 }, s3]} />
    </View>
  );
}

function GlowCircle({ accent }: { accent: string }) {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.08, 0.3]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.7, 1.1]) }],
  }));

  return (
    <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 140, height: 140, borderRadius: 70, backgroundColor: accent }, style]} />
    </View>
  );
}

function ExpandingRings({ accent }: { accent: string }) {
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);
  const r3 = useSharedValue(0);

  useEffect(() => {
    r1.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false);
    r2.value = withDelay(1000, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false));
    r3.value = withDelay(2000, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false));
  }, []);

  const ring = { position: 'absolute' as const, borderWidth: 1.5, borderColor: accent };

  const s1 = useAnimatedStyle(() => ({
    width: interpolate(r1.value, [0, 1], [20, 140]),
    height: interpolate(r1.value, [0, 1], [20, 140]),
    borderRadius: interpolate(r1.value, [0, 1], [10, 70]),
    opacity: interpolate(r1.value, [0, 0.7, 1], [0.5, 0.15, 0]),
  }));
  const s2 = useAnimatedStyle(() => ({
    width: interpolate(r2.value, [0, 1], [20, 140]),
    height: interpolate(r2.value, [0, 1], [20, 140]),
    borderRadius: interpolate(r2.value, [0, 1], [10, 70]),
    opacity: interpolate(r2.value, [0, 0.7, 1], [0.5, 0.15, 0]),
  }));
  const s3 = useAnimatedStyle(() => ({
    width: interpolate(r3.value, [0, 1], [20, 140]),
    height: interpolate(r3.value, [0, 1], [20, 140]),
    borderRadius: interpolate(r3.value, [0, 1], [10, 70]),
    opacity: interpolate(r3.value, [0, 0.7, 1], [0.5, 0.15, 0]),
  }));

  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[ring, s1]} />
      <Animated.View style={[ring, s2]} />
      <Animated.View style={[ring, s3]} />
    </View>
  );
}

// ─── Animated text reveal ─────────────────────────────────────────

export const EASE_TEXT = Easing.bezier(0.25, 0.1, 0.25, 1);

export function FeatureRevealWord({ word, delay, color, style }: { word: string; delay: number; color: string; style: any }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 450, easing: EASE_TEXT }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 450, easing: EASE_TEXT }));
  }, [delay]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text style={[style, { color }, animStyle]}>
      {word}{' '}
    </Animated.Text>
  );
}

export const AnimatedHeadline = memo(function AnimatedHeadline({ text, color, pageKey }: { text: string; color: string; pageKey: number }) {
  const words = useMemo(() => text.split(' '), [text]);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
      {words.map((word, i) => (
        <FeatureRevealWord
          key={`${pageKey}-${i}`}
          word={word}
          delay={300 + i * 70}
          color={color}
          style={{
            fontFamily: FontFamily.display,
            fontSize: 32,
            letterSpacing: -0.5,
            lineHeight: 40,
          }}
        />
      ))}
    </View>
  );
});

export function AnimatedBody({ text, color, pageKey }: { text: string; color: string; pageKey: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);
  const wordCount = text.split(' ').length;
  // Body fades in after all headline words have revealed
  const bodyDelay = 300 + wordCount * 70 + 200;

  useEffect(() => {
    opacity.value = 0;
    translateY.value = 10;
    opacity.value = withDelay(bodyDelay, withTiming(1, { duration: 500, easing: EASE_TEXT }));
    translateY.value = withDelay(bodyDelay, withTiming(0, { duration: 500, easing: EASE_TEXT }));
  }, [pageKey, bodyDelay]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text
      style={[
        {
          fontFamily: FontFamily.body,
          fontSize: FontSize.base,
          color,
          textAlign: 'left',
          lineHeight: 24,
        },
        animStyle,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

export function CardAnimation({ type, accent }: { type: string; accent: string }) {
  switch (type) {
    case 'dots': return <FloatingDots accent={accent} />;
    case 'pencil': return <PencilWriting accent={accent} />;
    case 'heartbeat': return <BeatingHeart accent={accent} />;
    case 'weekCircles': return <WeekCircles accent={accent} />;
    case 'network': return <NetworkNodes accent={accent} />;
    case 'openBook': return <OpenBook accent={accent} />;
    case 'pulseLine': return <PulseLine accent={accent} />;
    case 'orb': return null;
    case 'waveform': return <WaveformBars accent={accent} />;
    case 'pulse': return <PulseCircle accent={accent} />;
    case 'infinity': return <InfinityIcon accent={accent} />;
    case 'lines': return <SlidingLines accent={accent} />;
    case 'glow': return <GlowCircle accent={accent} />;
    case 'rings': return <ExpandingRings accent={accent} />;
    default: return null;
  }
}

// ─── Main screen ─────────────────────────────────────────────────

export default function HowItWorksScreen() {
  const router = useRouter();
  const accentThemeId = useUnfoldStore((s) => s.user?.accentTheme ?? 'gold');

  const colors = useMemo(() => {
    const accentTheme = ACCENT_THEMES.find((t) => t.id === accentThemeId);
    const accent = accentTheme ? accentTheme.dark : DarkColors.accent;
    return createThemedColors(DarkColors, accent);
  }, [accentThemeId]);

  const [currentPage, setCurrentPage] = useState(0);

  const isLastPage = currentPage === FEATURE_PAGES.length - 1;

  const navigateToOnboarding = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/onboarding');
  }, [router]);

  // Last page uses the Continue button like all other pages (no auto-advance)

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/onboarding');
  }, [router]);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastPage) {
      navigateToOnboarding();
    } else {
      setCurrentPage((p) => p + 1);
    }
  }, [isLastPage, navigateToOnboarding]);

  // Swipe left/right to navigate pages (gesture handler — no scroll API needed)
  const handleSwipeLeft = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage((p) => Math.min(p + 1, FEATURE_PAGES.length - 1));
  }, []);

  const handleSwipeRight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .onEnd((e) => {
      'worklet';
      if (e.translationX < -50) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > 50) {
        runOnJS(handleSwipeRight)();
      }
    });

  const safePage = Math.min(currentPage, FEATURE_PAGES.length - 1);
  const page = FEATURE_PAGES[safePage];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingTop: Spacing['2'], height: 44 }}>
          {currentPage > 0 ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSwipeRight}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40, height: 40 }} />
          )}
          <TouchableOpacity activeOpacity={0.7} onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.textMuted }}>
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        {/* Swipeable pages — state-driven (no scroll API, guaranteed to work) */}
        <GestureDetector gesture={swipeGesture}>
          <View style={{ flex: 1 }}>
            <Animated.View
              key={currentPage}
              entering={FadeIn.duration(Duration.normal)}
              exiting={FadeOut.duration(Duration.fast)}
              style={StyleSheet.absoluteFill}
            >
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
                <View style={{ alignItems: 'center', gap: 36, alignSelf: 'stretch' }}>
                  <View style={{ transform: [{ scale: 1.2 }] }}>
                    <CardAnimation type={page.animation} accent={colors.accent} />
                  </View>

                  <View style={{ gap: 12, alignSelf: 'stretch' }}>
                    <AnimatedHeadline
                      text={page.headline}
                      color={colors.text}
                      pageKey={currentPage}
                    />

                    <AnimatedBody
                      text={page.body}
                      color={colors.textMuted}
                      pageKey={currentPage}
                    />
                  </View>
                </View>
              </View>
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Bottom: page dots + continue button */}
        <View style={{ paddingHorizontal: Spacing['6'], paddingBottom: Spacing['6'] }}>
          {/* Page dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 6, marginBottom: Spacing['6'] }}>
            {FEATURE_PAGES.map((_, index) => (
              <View
                key={index}
                style={{
                  width: index === currentPage ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index <= currentPage ? colors.accent : colors.border,
                }}
              />
            ))}
          </View>

          {/* Continue button */}
          <TouchableOpacity activeOpacity={0.7} onPress={handleContinue}>
            <View
              style={{
                paddingVertical: Spacing['4'],
                borderRadius: Radius.md,
                alignItems: 'center',
                backgroundColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: FontSize.base,
                  color: colors.background,
                  letterSpacing: 0.3,
                }}
              >
                {isLastPage ? 'Get started' : 'Continue'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
