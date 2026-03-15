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
import { PencilSimpleIcon, HeartIcon, CheckIcon, BookOpenIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { DarkColors, createThemedColors } from '@/constants/colors';
import { useUnfoldStore, ACCENT_THEMES } from '@/lib/store';
import { CompanionOrb } from '@/components/CompanionOrb';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Page data ───────────────────────────────────────────────────

interface FeatureCard {
  headline: string;
  body: string;
  animation: 'dots' | 'orb' | 'waveform' | 'pulse' | 'stack' | 'lines' | 'glow' | 'rings' | 'pencil' | 'heartbeat' | 'weekCircles' | 'network' | 'openBook' | 'pulseLine';
}

type Page =
  | { type: 'companion' }
  | { type: 'feature'; card: FeatureCard };

const PAGES: Page[] = [
  { type: 'companion' },
  {
    type: 'feature',
    card: {
      headline: 'Written for you',
      body: 'Every word shaped by your story, your struggles, where you are right now. No one in the world will have the same devotionals as you.',
      animation: 'pencil',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Personal daily check-ins',
      body: "Your answers today help give shape to tomorrow's Word.",
      animation: 'heartbeat',
    },
  },
  {
    type: 'feature',
    card: {
      headline: "Listen, don't just read",
      body: 'Full audio narration in voices that feel like someone sitting across from you.',
      animation: 'waveform',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Build a rhythm',
      body: 'Streaks that matter. A gentle push to show up, even when it\u2019s hard.',
      animation: 'weekCircles',
    },
  },
  {
    type: 'feature',
    card: {
      headline: '32 Bible study methods',
      body: 'Lectio Divina. SOAP. Ignatian reflection. Character studies. Parables. Pick the approach that fits how you learn.',
      animation: 'network',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'A full Bible reader',
      body: 'Read any book, chapter, and verse right inside the app. No switching between apps.',
      animation: 'openBook',
    },
  },
  {
    type: 'feature',
    card: {
      headline: 'Reflect and journal',
      body: 'Guided prompts after each reading. Write what stirred your heart. Watch your growth over time.',
      animation: 'pulseLine',
    },
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
  // Pencil tip offset: the icon's bottom-left corner is roughly where the tip is
  const TIP_OFFSET_X = -2;
  const TIP_OFFSET_Y = ICON_SIZE - 6;

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 500 });
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),      // write line 1
        withTiming(1.15, { duration: 250 }),                                       // hop down
        withTiming(2.15, { duration: 1400, easing: Easing.out(Easing.quad) }),    // write line 2
        withTiming(2.3, { duration: 250 }),                                        // hop down
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
        { translateX: x + TIP_OFFSET_X - ICON_SIZE / 2 },
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
    fill.value = withDelay(delay, withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }));
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
      withTiming(1, { duration: 2500, easing: Easing.linear }),
      -1,
      false,
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
        withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(0.3, { duration: 120, easing: Easing.in(Easing.quad) }),
        withTiming(0.8, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) }),
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

function StackedCards({ accent }: { accent: string }) {
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const s1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shift.value, [0, 1], [-8, 8]) },
      { translateY: interpolate(shift.value, [0, 1], [4, -4]) },
      { rotate: `${interpolate(shift.value, [0, 1], [-2, 2])}deg` },
    ],
  }));
  const s2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shift.value, [0, 1], [4, -4]) },
      { translateY: interpolate(shift.value, [0, 1], [-3, 3]) },
      { rotate: `${interpolate(shift.value, [0, 1], [1, -1])}deg` },
    ],
  }));
  const s3 = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shift.value, [0, 1], [-2, 2]) },
      { translateY: interpolate(shift.value, [0, 1], [2, -2]) },
    ],
  }));

  const card = {
    width: 80,
    height: 100,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: accent,
    position: 'absolute' as const,
  };

  return (
    <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[card, { opacity: 0.15 }, s1]} />
      <Animated.View style={[card, { opacity: 0.3 }, s2]} />
      <Animated.View style={[card, { opacity: 0.45, backgroundColor: accent + '0D' }, s3]} />
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

const EASE_TEXT = Easing.bezier(0.25, 0.1, 0.25, 1);

function RevealWord({ word, delay, color, style }: { word: string; delay: number; color: string; style: any }) {
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

const AnimatedHeadline = memo(function AnimatedHeadline({ text, color, pageKey }: { text: string; color: string; pageKey: number }) {
  const words = useMemo(() => text.split(' '), [text]);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {words.map((word, i) => (
        <RevealWord
          key={`${pageKey}-${i}`}
          word={word}
          delay={300 + i * 120}
          color={color}
          style={{
            fontFamily: FontFamily.display,
            fontSize: 28,
            letterSpacing: -0.5,
            lineHeight: 36,
          }}
        />
      ))}
    </View>
  );
});

function AnimatedBody({ text, color, pageKey }: { text: string; color: string; pageKey: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);
  const wordCount = text.split(' ').length;
  // Body fades in after all headline words have revealed
  const bodyDelay = 300 + wordCount * 120 + 200;

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
          fontSize: 16,
          color,
          textAlign: 'center',
          lineHeight: 24,
        },
        animStyle,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

function CardAnimation({ type, accent }: { type: string; accent: string }) {
  switch (type) {
    case 'dots': return <FloatingDots accent={accent} />;
    case 'pencil': return <PencilWriting accent={accent} />;
    case 'heartbeat': return <BeatingHeart accent={accent} />;
    case 'weekCircles': return <WeekCircles accent={accent} />;
    case 'network': return <NetworkNodes accent={accent} />;
    case 'openBook': return <OpenBook accent={accent} />;
    case 'pulseLine': return <PulseLine accent={accent} />;
    case 'orb': return <CompanionOrb accentColor={accent} size={96} isActive />;
    case 'waveform': return <WaveformBars accent={accent} />;
    case 'pulse': return <PulseCircle accent={accent} />;
    case 'stack': return <StackedCards accent={accent} />;
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

  const isLastPage = currentPage === PAGES.length - 1;

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
    setCurrentPage((p) => Math.min(p + 1, PAGES.length - 1));
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

  const safePage = Math.min(currentPage, PAGES.length - 1);
  const page = PAGES[safePage];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8, height: 44 }}>
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
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(150)}
              style={StyleSheet.absoluteFill}
            >
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                {page.type === 'companion' ? (
                  <View style={{ alignItems: 'center', gap: 36 }}>
                    <CompanionOrb accentColor={colors.accent} size={120} isActive />

                    <View style={{ gap: 14 }}>
                      <AnimatedHeadline
                        text="The only app that grows with you."
                        color={colors.text}
                        pageKey={currentPage}
                      />

                      <AnimatedBody
                        text="Your companion shows up daily. Learns what matters to you. Makes each devotional feel more like yours."
                        color={colors.textMuted}
                        pageKey={currentPage}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', gap: 36 }}>
                    <CardAnimation type={page.card.animation} accent={colors.accent} />

                    <View style={{ gap: 12 }}>
                      <AnimatedHeadline
                        text={page.card.headline}
                        color={colors.text}
                        pageKey={currentPage}
                      />

                      <AnimatedBody
                        text={page.card.body}
                        color={colors.textMuted}
                        pageKey={currentPage}
                      />
                    </View>
                  </View>
                )}
              </View>
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Bottom: page dots + continue button */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
          {/* Page dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 24 }}>
            {PAGES.map((_, index) => (
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
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 16,
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
