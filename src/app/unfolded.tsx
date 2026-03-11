import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, TouchableOpacity } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import {
  XIcon,
  SunIcon,
  FireIcon,
  BookOpenIcon,
  HeartIcon,
  PencilLineIcon,
  ShareNetworkIcon,
  TrendUpIcon,
  TrendDownIcon,
  EqualsIcon,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { format } from 'date-fns';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';
import { computeRecapData, type RecapData } from '@/lib/recap-stats';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TOTAL_CARDS = 8;
const CLOSE_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

// ─── Color System ────────────────────────────────────────────
// Each card has its own distinct mood — not just gold on black

const PALETTE = {
  black: '#08080A',
  offBlack: '#0C0A08',
  gold: '#C8A55C',
  goldDim: 'rgba(200, 165, 92, 0.15)',
  cream: '#F5F0EB',
  warmWhite: 'rgba(255,255,255,0.85)',
  mutedWhite: 'rgba(255,255,255,0.55)',
  dimWhite: 'rgba(255,255,255,0.35)',
  faintWhite: 'rgba(255,255,255,0.2)',
  ghostWhite: 'rgba(255,255,255,0.08)',
};

// Full-screen gradient per card — dramatic, not subtle
const CARD_BACKGROUNDS = [
  // 0 Hook: deep black → warm brown center → black — cinematic
  { colors: ['#060504', '#1A140E', '#0A0806', '#060504'], locations: [0, 0.35, 0.7, 1] },
  // 1 Days: warm amber bloom
  { colors: ['#0D0A06', '#1C1508', '#120E06', '#0A0806'], locations: [0, 0.4, 0.75, 1] },
  // 2 Archetype: rich gold atmosphere — the crown jewel
  { colors: ['#0E0B05', '#241A08', '#1A1306', '#0A0806'], locations: [0, 0.35, 0.7, 1] },
  // 3 Scripture: cool teal — shift the whole mood
  { colors: ['#060A0D', '#0A161E', '#08101A', '#06080A'], locations: [0, 0.4, 0.75, 1] },
  // 4 Heart: warm rose — emotional
  { colors: ['#0D0608', '#1E0A10', '#180812', '#0A0608'], locations: [0, 0.4, 0.75, 1] },
  // 5 Journal: deep forest — contemplative
  { colors: ['#060D08', '#0A1E10', '#081A0E', '#060A08'], locations: [0, 0.4, 0.75, 1] },
  // 6 Streak: fire orange — intensity
  { colors: ['#0D0806', '#1E1208', '#1A0E06', '#0A0806'], locations: [0, 0.35, 0.7, 1] },
  // 7 Closing: return to gold — full circle
  { colors: ['#0E0B05', '#201808', '#1A1306', '#0A0806'], locations: [0, 0.35, 0.7, 1] },
] as const;

// Accent colors per card — breaks the monotone gold
const CARD_ACCENTS = [
  PALETTE.gold,                // Hook
  '#D4A84B',                   // Days: warmer gold
  PALETTE.gold,                // Archetype: classic gold
  '#6BB3C9',                   // Scripture: teal
  '#C97B8B',                   // Heart: rose
  '#7BC98B',                   // Journal: sage green
  '#D98B4B',                   // Streak: ember orange
  PALETTE.gold,                // Closing: gold
];

// ─── Animated Counter ─────────────────────────────────────────
interface CountUpProps {
  to: number;
  duration?: number;
  delay?: number;
  style?: any;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  onComplete?: () => void;
}

function CountUp({
  to,
  duration = 1200,
  delay: startDelay = 300,
  style,
  suffix = '',
  prefix = '',
  decimals = 0,
  onComplete,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const hasCompleted = useRef(false);

  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;
    let timeoutId: ReturnType<typeof setTimeout>;
    hasCompleted.current = false;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * to * Math.pow(10, decimals)) / Math.pow(10, decimals);
      setDisplay(value);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else if (!hasCompleted.current) {
        hasCompleted.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onComplete?.();
      }
    };

    timeoutId = setTimeout(() => {
      rafId = requestAnimationFrame(animate);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [to, duration, startDelay, decimals, onComplete]);

  return (
    <Text style={style}>
      {prefix}{decimals > 0 ? display.toFixed(decimals) : display.toLocaleString()}{suffix}
    </Text>
  );
}

// Per-card duration in ms — how long each card stays before auto-advancing
// Hook + Archetype get extra time for dramatic reveals; Closing never auto-advances
const CARD_DURATIONS = [
  10000, // 0 Hook: cinematic reveal needs time
  9000,  // 1 Days
  10000, // 2 Archetype: the crown jewel moment
  9000,  // 3 Scripture
  8000,  // 4 Heart
  8000,  // 5 Journal
  8000,  // 6 Streak
  0,     // 7 Closing: stays until user dismisses (has share button)
];

// ─── Instagram Stories Progress Bar ───────────────────────────
function StoryProgressBar({
  current,
  total,
  paused,
  duration,
  onSegmentComplete,
}: {
  current: number;
  total: number;
  paused: boolean;
  duration: number;
  onSegmentComplete: () => void;
}) {
  return (
    <View style={s.progressContainer}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={s.progressSegment}>
          <ProgressFill
            isActive={i === current}
            isComplete={i < current}
            paused={paused}
            duration={duration}
            onComplete={onSegmentComplete}
          />
        </View>
      ))}
    </View>
  );
}

function ProgressFill({
  isActive,
  isComplete,
  paused,
  duration,
  onComplete,
}: {
  isActive: boolean;
  isComplete: boolean;
  paused: boolean;
  duration: number;
  onComplete: () => void;
}) {
  const width = useSharedValue(isComplete ? 100 : 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start animation + timer when this segment becomes active
  useEffect(() => {
    clearTimer();
    elapsedRef.current = 0;

    if (isComplete) {
      width.value = 100;
      return;
    }
    if (!isActive || duration === 0) {
      if (!isActive) width.value = withTiming(0, { duration: 200 });
      return;
    }

    // Start fill animation and auto-advance timer
    width.value = 0;
    width.value = withTiming(100, { duration, easing: Easing.linear });
    startTimeRef.current = Date.now();

    timerRef.current = setTimeout(() => {
      onComplete();
    }, duration);

    return clearTimer;
  }, [isActive, isComplete, duration, onComplete, clearTimer]);

  // Pause/resume
  useEffect(() => {
    if (!isActive || duration === 0 || isComplete) return;

    if (paused) {
      // Freeze
      clearTimer();
      elapsedRef.current += Date.now() - startTimeRef.current;
      cancelAnimation(width);
    } else {
      // Resume
      const remaining = duration - elapsedRef.current;
      if (remaining > 100) {
        width.value = withTiming(100, { duration: remaining, easing: Easing.linear });
        startTimeRef.current = Date.now();
        timerRef.current = setTimeout(() => {
          onComplete();
        }, remaining);
      }
    }

    return clearTimer;
  }, [paused]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: isComplete ? 'rgba(255,255,255,0.5)' : PALETTE.gold,
  }));

  return <Animated.View style={[s.progressFill, fillStyle]} />;
}

// ─── Sparkle Burst (finale) ──────────────────────────────────
function SparkleBurst({ count = 30 }: { count?: number }) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.5 - 0.25);
      const distance = 40 + Math.random() * 160;
      return {
        targetX: Math.cos(angle) * distance,
        targetY: Math.sin(angle) * distance,
        size: 2 + Math.random() * 5,
        delay: Math.random() * 600,
        index: i,
        isGold: i % 3 === 0,
      };
    });
  }, [count]);

  return (
    <View style={sparkleS.container} pointerEvents="none">
      {particles.map((p) => (
        <SparkleParticle key={p.index} {...p} />
      ))}
    </View>
  );
}

function SparkleParticle({
  targetX,
  targetY,
  size,
  delay,
  isGold,
}: {
  targetX: number;
  targetY: number;
  size: number;
  delay: number;
  index: number;
  isGold: boolean;
}) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }),
        withDelay(300, withTiming(0, { duration: 500, easing: Easing.in(Easing.ease) })),
      ),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: progress.value * targetX },
      { translateY: progress.value * targetY },
      { scale: interpolate(progress.value, [0, 0.3, 1], [0, 1.4, 0.4]) },
    ],
  }));

  const color = isGold ? PALETTE.gold : PALETTE.cream;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: size * 4,
        },
        animStyle,
      ]}
    />
  );
}

const sparkleS = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Floating Ember Particles ─────────────────────────────────
function FloatingEmber({ index, color }: { index: number; color: string }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  const size = 1.5 + (index % 4) * 1.2;
  const startX = (index * 47 + 13) % SCREEN_WIDTH;
  const startY = SCREEN_HEIGHT * 0.4 + ((index * 73) % (SCREEN_HEIGHT * 0.5));
  const driftDuration = 3500 + (index % 5) * 1200;
  const riseDuration = 5000 + (index % 4) * 2000;

  useEffect(() => {
    opacity.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(0.3 + (index % 4) * 0.12, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: riseDuration * 0.3, easing: Easing.in(Easing.ease) }),
        ),
        -1,
      ),
    );
    translateY.value = withDelay(
      index * 150,
      withRepeat(
        withTiming(-SCREEN_HEIGHT * 0.6, { duration: riseDuration, easing: Easing.linear }),
        -1,
      ),
    );
    translateX.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(15, { duration: driftDuration, easing: Easing.inOut(Easing.ease) }),
          withTiming(-15, { duration: driftDuration, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      cancelAnimation(translateX);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: startX + translateX.value },
      { translateY: startY + translateY.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: size * 2.5,
        },
        animStyle,
      ]}
    />
  );
}

// ─── Pulsing Ring (for archetype card) ────────────────────────
function PulsingRing({ delay, size, color }: { delay: number; size: number; color: string }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2500, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 2500, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.4, { duration: 2500, easing: Easing.out(Easing.ease) }),
          withTiming(0.08, { duration: 2500, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: color,
        },
        animStyle,
      ]}
    />
  );
}

// ─── Animated Reveal (fade + slide up) ───────────────────────
function Reveal({
  delay,
  children,
  from = 20,
}: {
  delay: number;
  children: React.ReactNode;
  from?: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(from);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ScaleReveal is just Reveal with a smaller offset — use Reveal directly
const ScaleReveal = Reveal;

// ─── Card Content Wrapper ──────────────────────────────────
function CardContent({ children, visible }: { children: React.ReactNode; visible: boolean }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    } else {
      opacity.value = 0;
      scale.value = 0.94;
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[s.cardContent, animStyle]}>
      {children}
    </Animated.View>
  );
}

// ─── Format helpers ───────────────────────────────────────────
function formatDate(isoDate: string): string {
  return format(new Date(isoDate), 'MMMM d, yyyy');
}

// ═══════════════════════════════════════════════════════════════
//  CARD 1: THE HOOK — Cinematic Reveal
// ═══════════════════════════════════════════════════════════════
function HookCard({ data, userName }: { data: RecapData; userName: string }) {
  const titleScale = useSharedValue(0.85);
  const titleOpacity = useSharedValue(0);
  const lineWidth = useSharedValue(0);
  const nameOpacity = useSharedValue(0);
  const dateOpacity = useSharedValue(0);
  const teaserOpacity = useSharedValue(0);

  useEffect(() => {
    // Dramatic scale-in for title
    titleOpacity.value = withDelay(300, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    titleScale.value = withDelay(300, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    // Gold line expands
    lineWidth.value = withDelay(1200, withTiming(60, { duration: 800, easing: Easing.out(Easing.cubic) }));
    // Name appears
    nameOpacity.value = withDelay(1600, withTiming(1, { duration: 800 }));
    // Date
    dateOpacity.value = withDelay(2200, withTiming(1, { duration: 800 }));
    // Teaser
    teaserOpacity.value = withDelay(2800, withTiming(1, { duration: 1000 }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    width: lineWidth.value,
    opacity: interpolate(lineWidth.value, [0, 60], [0, 0.6]),
  }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const dateStyle = useAnimatedStyle(() => ({ opacity: dateOpacity.value }));
  const teaserStyle = useAnimatedStyle(() => ({ opacity: teaserOpacity.value }));

  return (
    <View style={s.hookContainer}>
      {/* Subtle label */}
      <Animated.View style={[nameStyle, { marginBottom: 20 }]}>
        <Text style={s.hookLabel}>YOUR STORY SO FAR</Text>
      </Animated.View>

      {/* The BIG title */}
      <Animated.View style={titleStyle}>
        <Text style={s.hookTitle}>Unfolded</Text>
      </Animated.View>

      {/* Expanding gold line */}
      <Animated.View style={[s.hookLine, lineStyle]} />

      {/* User name */}
      <Animated.View style={nameStyle}>
        <Text style={s.hookName}>{userName}</Text>
      </Animated.View>

      {/* Start date */}
      <Animated.View style={dateStyle}>
        {data.firstDevotionalDate && (
          <Text style={s.hookDate}>
            Since {formatDate(data.firstDevotionalDate)}
          </Text>
        )}
      </Animated.View>

      {/* Teaser */}
      <Animated.View style={teaserStyle}>
        <Text style={s.hookTeaser}>
          {data.totalDaysRead} {data.totalDaysRead === 1 ? 'day' : 'days'}.{' '}
          Here is what unfolded.
        </Text>
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 2: DAYS WITH GOD — The Big Number
// ═══════════════════════════════════════════════════════════════
function DaysCard({ data }: { data: RecapData }) {
  const accent = CARD_ACCENTS[1];

  return (
    <View style={s.fullCard}>
      <Reveal delay={0}>
        <SunIcon size={24} color={accent} weight="light" />
      </Reveal>
      <Reveal delay={100}>
        <Text style={[s.label, { color: accent }]}>DAYS WITH GOD</Text>
      </Reveal>

      <ScaleReveal delay={250}>
        <CountUp
          to={data.totalDaysRead}
          style={s.heroNumber}
          duration={1800}
          delay={0}
        />
      </ScaleReveal>

      <Reveal delay={600}>
        <Text style={s.heroUnit}>
          mornings you chose to show up
        </Text>
      </Reveal>

      {/* Sub-stats */}
      <Reveal delay={800}>
        <View style={s.statsRow}>
          <View style={s.statBlock}>
            <Text style={[s.statNumber, { color: accent }]}>
              {data.totalSeries}
            </Text>
            <Text style={s.statLabel}>
              {data.totalSeries === 1 ? 'journey' : 'journeys'}
            </Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={[s.statNumber, { color: accent }]}>
              {data.completedSeries}
            </Text>
            <Text style={s.statLabel}>completed</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={[s.statNumber, { color: accent }]}>
              ~{data.estimatedReadingMinutes}
            </Text>
            <Text style={s.statLabel}>minutes</Text>
          </View>
        </View>
      </Reveal>

      {data.mostActiveWeekday && (
        <Reveal delay={1000}>
          <Text style={s.insight}>
            You showed up most on {data.mostActiveWeekday}s.
          </Text>
        </Reveal>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 3: THE ARCHETYPE — Identity Reveal (Crown Jewel)
// ═══════════════════════════════════════════════════════════════
function ArchetypeCard({ data }: { data: RecapData }) {
  const accent = CARD_ACCENTS[2];
  const revealScale = useSharedValue(0.3);
  const revealOpacity = useSharedValue(0);

  useEffect(() => {
    revealOpacity.value = withDelay(400, withTiming(1, { duration: 800 }));
    revealScale.value = withDelay(
      400,
      withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const nameRevealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scale: revealScale.value }],
  }));

  return (
    <View style={s.fullCard}>
      {/* Concentric pulsing rings — behind content */}
      <View style={s.ringsContainer} pointerEvents="none">
        <PulsingRing delay={0} size={200} color={accent} />
        <PulsingRing delay={400} size={280} color={accent} />
        <PulsingRing delay={800} size={360} color={accent} />
      </View>

      <Reveal delay={0}>
        <Text style={[s.label, { color: PALETTE.dimWhite, zIndex: 1 }]}>YOU ARE</Text>
      </Reveal>

      {/* The big archetype name — this is THE moment */}
      <Animated.View style={[nameRevealStyle, { zIndex: 1 }]}>
        <Text style={s.archetypeName}>{data.archetypeName}</Text>
      </Animated.View>

      <Reveal delay={800}>
        <View style={[s.archetypeDivider, { zIndex: 1 }]} />
      </Reveal>

      <Reveal delay={1000}>
        <Text style={[s.archetypeDesc, { zIndex: 1 }]}>
          {data.archetypeDescription}
        </Text>
      </Reveal>

      {data.transformationNarrative && (
        <Reveal delay={1300}>
          <View style={[s.narrativePill, { zIndex: 1 }]}>
            <Text style={s.narrativeText}>
              {data.transformationNarrative}
            </Text>
          </View>
        </Reveal>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 4: SCRIPTURE MAP — Discovery
// ═══════════════════════════════════════════════════════════════
function ScriptureCard({ data }: { data: RecapData }) {
  const accent = CARD_ACCENTS[3];
  const topBooks = data.bookBreakdown.slice(0, 5);

  return (
    <View style={s.fullCard}>
      <Reveal delay={0}>
        <BookOpenIcon size={24} color={accent} weight="light" />
      </Reveal>
      <Reveal delay={100}>
        <Text style={[s.label, { color: accent }]}>SCRIPTURE MAP</Text>
      </Reveal>

      <ScaleReveal delay={250}>
        <CountUp
          to={data.uniqueScriptures}
          style={s.heroNumber}
          duration={1500}
          delay={0}
        />
      </ScaleReveal>

      <Reveal delay={550}>
        <Text style={s.heroUnit}>passages you sat with</Text>
      </Reveal>

      {data.topBook && (
        <Reveal delay={750}>
          <View style={s.featureBlock}>
            <Text style={s.featureLabel}>You kept returning to</Text>
            <Text style={[s.featureName, { color: accent }]}>{data.topBook}</Text>
            <Text style={s.featureCount}>
              {data.topBookCount} {data.topBookCount === 1 ? 'time' : 'times'}
            </Text>
          </View>
        </Reveal>
      )}

      {topBooks.length > 1 && (
        <Reveal delay={950}>
          <View style={s.barChart}>
            {topBooks.map((b, i) => {
              const maxCount = topBooks[0].count;
              const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
              return (
                <View key={b.book} style={s.barRow}>
                  <Text style={s.barLabel} numberOfLines={1}>{b.book}</Text>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.barFill,
                        {
                          width: `${Math.max(pct, 8)}%`,
                          backgroundColor: accent,
                          opacity: 1 - i * 0.18,
                        },
                      ]}
                    />
                  </View>
                  <Text style={s.barCount}>{b.count}</Text>
                </View>
              );
            })}
          </View>
        </Reveal>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 5: HEART CHECK — The Mood Journey
// ═══════════════════════════════════════════════════════════════
function HeartCard({ data }: { data: RecapData }) {
  const accent = CARD_ACCENTS[4];
  const hasMoodData = data.totalCheckIns > 0;

  const TrendIcon = data.moodTrend === 'rising'
    ? TrendUpIcon
    : data.moodTrend === 'falling'
      ? TrendDownIcon
      : EqualsIcon;

  const trendLabel = data.moodTrend === 'rising'
    ? 'Rising'
    : data.moodTrend === 'falling'
      ? 'Falling'
      : 'Steady';

  const getArcNarrative = (): string | null => {
    if (data.moodByMonth.length < 2) return null;
    const first = data.moodByMonth[0];
    const last = data.moodByMonth[data.moodByMonth.length - 1];
    const moodWord = (avg: number) => {
      if (avg >= 4.5) return 'Grateful';
      if (avg >= 3.5) return 'Good';
      if (avg >= 2.5) return 'Okay';
      return 'Struggling';
    };
    const firstWord = moodWord(first.avg);
    const lastWord = moodWord(last.avg);
    if (firstWord === lastWord) return null;
    return `From "${firstWord}" to "${lastWord}."`;
  };

  const arcNarrative = getArcNarrative();

  return (
    <View style={s.fullCard}>
      <Reveal delay={0}>
        <HeartIcon size={24} color={accent} weight="light" />
      </Reveal>
      <Reveal delay={100}>
        <Text style={[s.label, { color: accent }]}>HEART CHECK</Text>
      </Reveal>

      {hasMoodData ? (
        <>
          <ScaleReveal delay={250}>
            <CountUp
              to={data.averageMood}
              style={s.heroNumber}
              duration={1200}
              delay={0}
              decimals={1}
              suffix=" / 5"
            />
          </ScaleReveal>

          <Reveal delay={500}>
            <View style={s.trendPill}>
              <TrendIcon size={14} color={accent} weight="bold" />
              <Text style={[s.trendText, { color: accent }]}>{trendLabel}</Text>
            </View>
          </Reveal>

          {data.moodByMonth.length > 0 && (
            <Reveal delay={700}>
              <View style={s.moodBars}>
                {data.moodByMonth.slice(-6).map((m) => (
                  <View key={m.month} style={s.moodCol}>
                    <View style={s.moodTrack}>
                      <View
                        style={[
                          s.moodFill,
                          {
                            height: `${(m.avg / 5) * 100}%`,
                            backgroundColor: accent,
                          },
                        ]}
                      />
                    </View>
                    <Text style={s.moodLabel}>{m.month.slice(0, 3)}</Text>
                  </View>
                ))}
              </View>
            </Reveal>
          )}

          <Reveal delay={950}>
            <Text style={s.insight}>
              {arcNarrative || `${data.totalCheckIns} moments you paused to feel.`}
            </Text>
          </Reveal>
        </>
      ) : (
        <>
          <ScaleReveal delay={250}>
            <HeartIcon size={48} color={PALETTE.dimWhite} weight="thin" />
          </ScaleReveal>
          <Reveal delay={500}>
            <Text style={s.emptyText}>
              Start checking in to see{'\n'}how your heart moves over time
            </Text>
          </Reveal>
        </>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 6: JOURNAL DEPTH
// ═══════════════════════════════════════════════════════════════
function JournalCard({ data }: { data: RecapData }) {
  const accent = CARD_ACCENTS[5];
  const hasEntries = data.totalJournalEntries > 0;
  const pages = Math.max(1, Math.round(data.totalWordsWritten / 500));

  return (
    <View style={s.fullCard}>
      <Reveal delay={0}>
        <PencilLineIcon size={24} color={accent} weight="light" />
      </Reveal>
      <Reveal delay={100}>
        <Text style={[s.label, { color: accent }]}>JOURNAL DEPTH</Text>
      </Reveal>

      {hasEntries ? (
        <>
          <ScaleReveal delay={250}>
            <CountUp
              to={data.totalJournalEntries}
              style={s.heroNumber}
              duration={1500}
              delay={0}
            />
          </ScaleReveal>

          <Reveal delay={550}>
            <Text style={s.heroUnit}>
              {data.totalJournalEntries === 1 ? 'reflection' : 'reflections'} written
            </Text>
          </Reveal>

          {data.totalWordsWritten > 0 && (
            <Reveal delay={750}>
              <View style={s.wordBlock}>
                <CountUp
                  to={data.totalWordsWritten}
                  style={[s.statNumber, { color: accent, fontSize: 36 }]}
                  duration={2000}
                  delay={0}
                />
                <Text style={s.wordLabel}>
                  words — {pages} {pages === 1 ? 'page' : 'pages'} of a letter to God
                </Text>
              </View>
            </Reveal>
          )}

          {data.mostReflectiveMonth && (
            <Reveal delay={950}>
              <Text style={s.insight}>
                Your most reflective month was {data.mostReflectiveMonth}.
              </Text>
            </Reveal>
          )}

          <Reveal delay={1100}>
            <Text style={s.quote}>
              {data.totalJournalEntries >= 10
                ? '"Writing is how the soul processes what the mind cannot hold alone."'
                : '"Every word is a conversation with the One who already knows."'}
            </Text>
          </Reveal>
        </>
      ) : (
        <>
          <ScaleReveal delay={250}>
            <PencilLineIcon size={48} color={PALETTE.dimWhite} weight="thin" />
          </ScaleReveal>
          <Reveal delay={500}>
            <Text style={s.emptyText}>
              Your journal awaits{'\n'}its first page
            </Text>
          </Reveal>
        </>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 7: STREAK — The Fire
// ═══════════════════════════════════════════════════════════════
function StreakCard({ data }: { data: RecapData }) {
  const accent = CARD_ACCENTS[6];
  const hasStreak = data.currentStreak > 0 || data.longestStreak > 0;

  return (
    <View style={s.fullCard}>
      <Reveal delay={0}>
        <FireIcon size={24} color={accent} weight="light" />
      </Reveal>
      <Reveal delay={100}>
        <Text style={[s.label, { color: accent }]}>YOUR STREAK</Text>
      </Reveal>

      {hasStreak ? (
        <>
          <ScaleReveal delay={250}>
            <CountUp
              to={data.longestStreak}
              style={s.heroNumber}
              duration={1500}
              delay={0}
            />
          </ScaleReveal>

          <Reveal delay={550}>
            <Text style={s.heroUnit}>
              {data.longestStreak === 1 ? 'morning' : 'mornings'} without missing
            </Text>
          </Reveal>

          {data.currentStreak > 0 && (
            <Reveal delay={750}>
              <View style={[s.streakBadge, { backgroundColor: `${accent}20` }]}>
                <FireIcon size={14} color={accent} weight="fill" />
                <Text style={[s.streakBadgeText, { color: accent }]}>
                  {data.currentStreak} day streak right now
                </Text>
              </View>
            </Reveal>
          )}

          <Reveal delay={950}>
            <Text style={s.quote}>
              "Consistency is not perfection.{'\n'}It is returning."
            </Text>
          </Reveal>
        </>
      ) : (
        <>
          <ScaleReveal delay={250}>
            <FireIcon size={48} color={PALETTE.dimWhite} weight="thin" />
          </ScaleReveal>
          <Reveal delay={500}>
            <Text style={s.emptyText}>
              Your streak story{'\n'}is just beginning
            </Text>
          </Reveal>
          <Reveal delay={700}>
            <Text style={s.insight}>Come back tomorrow and the count begins.</Text>
          </Reveal>
        </>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CARD 8: THE CLOSING — Keep Unfolding
// ═══════════════════════════════════════════════════════════════
function ClosingCard({ data, userName }: { data: RecapData; userName: string }) {
  const [showBurst, setShowBurst] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  useEffect(() => {
    setShowBurst(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleShare = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (!shareCardRef.current) {
        setIsSharing(false);
        return;
      }

      // Small delay for rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        setIsSharing(false);
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your Unfolded story',
      });
    } catch {
      // User cancelled
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, data]);

  const closingMessage = data.totalDaysRead >= 30
    ? 'You have built something rare — a rhythm of returning. Whatever comes next, you have the roots for it.'
    : data.totalDaysRead >= 7
      ? 'A week of showing up changes more than you think. The seeds are already taking root.'
      : 'The journey has begun. The most important step is the next one.';

  return (
    <View style={s.closingContainer}>
      {showBurst && <SparkleBurst count={40} />}

      <Reveal delay={300} from={30}>
        <Text style={s.closingTitle}>Keep{'\n'}Unfolding</Text>
      </Reveal>

      <Reveal delay={600}>
        <Text style={s.closingName}>{userName}</Text>
      </Reveal>

      <Reveal delay={800}>
        <View style={s.closingLine} />
      </Reveal>

      <Reveal delay={1000}>
        <Text style={s.closingMessage}>{closingMessage}</Text>
      </Reveal>

      <Reveal delay={1300}>
        <TouchableOpacity
          onPress={handleShare}
          style={s.shareButton}
          activeOpacity={0.7}
        >
          <ShareNetworkIcon size={18} color={PALETTE.black} weight="bold" />
          <Text style={s.shareButtonText}>
            {isSharing ? 'Preparing...' : 'Share your story'}
          </Text>
        </TouchableOpacity>
      </Reveal>

      {/* Off-screen share card — captured as image when sharing */}
      <View style={s.shareCardOffscreen} pointerEvents="none">
        <View ref={shareCardRef} style={s.shareCard} collapsable={false}>
          <LinearGradient
            colors={['#0E0B05', '#201808', '#1A1306', '#0A0806']}
            locations={[0, 0.35, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={s.shareCardLabel}>MY UNFOLD JOURNEY</Text>
          <Text style={s.shareCardTitle}>Unfolded</Text>
          <View style={s.shareCardDivider} />
          <Text style={s.shareCardName}>{userName}</Text>

          <View style={s.shareCardStats}>
            <View style={s.shareCardStat}>
              <Text style={s.shareCardStatNum}>{data.totalDaysRead}</Text>
              <Text style={s.shareCardStatLabel}>
                {data.totalDaysRead === 1 ? 'day' : 'days'}
              </Text>
            </View>
            {data.longestStreak > 0 && (
              <View style={s.shareCardStat}>
                <Text style={s.shareCardStatNum}>{data.longestStreak}</Text>
                <Text style={s.shareCardStatLabel}>streak</Text>
              </View>
            )}
            {data.uniqueScriptures > 0 && (
              <View style={s.shareCardStat}>
                <Text style={s.shareCardStatNum}>{data.uniqueScriptures}</Text>
                <Text style={s.shareCardStatLabel}>passages</Text>
              </View>
            )}
          </View>

          {data.archetypeName && (
            <Text style={s.shareCardArchetype}>{data.archetypeName}</Text>
          )}

          <View style={s.shareCardFooter}>
            <Text style={s.shareCardFooterText}>unfold</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN SCREEN
// ═══════════════════════════════════════════════════════════════
export default function UnfoldedScreen() {
  const router = useRouter();
  const [currentCard, setCurrentCard] = useState(0);
  const [paused, setPaused] = useState(false);

  // Store data
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const checkIns = useUnfoldStore((s) => s.checkIns);
  const usedScriptures = useUnfoldStore((s) => s.usedScriptures);
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const streakLongest = useUnfoldStore((s) => s.streakLongest);
  const userName = useUnfoldStore((s) => s.user?.name ?? 'Friend');

  const data = useMemo(
    () =>
      computeRecapData({
        devotionals,
        journalEntries,
        checkIns,
        usedScriptures,
        streakCurrent,
        streakLongest,
      }),
    [devotionals, journalEntries, checkIns, usedScriptures, streakCurrent, streakLongest],
  );

  // Navigation
  const translateX = useSharedValue(0);
  const isAnimating = useRef(false);

  const goTo = useCallback(
    (index: number) => {
      if (isAnimating.current) return;
      if (index < 0 || index >= TOTAL_CARDS) return;
      isAnimating.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentCard(index);
      setTimeout(() => {
        isAnimating.current = false;
      }, 350);
    },
    [],
  );

  const goNext = useCallback(() => goTo(currentCard + 1), [currentCard, goTo]);
  const goPrev = useCallback(() => goTo(currentCard - 1), [currentCard, goTo]);

  // Auto-advance when progress bar completes
  const handleSegmentComplete = useCallback(() => {
    if (currentCard < TOTAL_CARDS - 1) {
      goTo(currentCard + 1);
    }
  }, [currentCard, goTo]);

  // Swipe left/right to navigate
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      translateX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      if (e.translationX < -50 && e.velocityX < 0) {
        runOnJS(goNext)();
      } else if (e.translationX > 50 && e.velocityX > 0) {
        runOnJS(goPrev)();
      }
    });

  // Long-press to pause (like Instagram Stories)
  const longPressGesture = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => {
      runOnJS(setPaused)(true);
    })
    .onEnd(() => {
      runOnJS(setPaused)(false);
    });

  // Tap: left 30% = back, right 70% = forward (Instagram Stories pattern)
  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      const tapX = e.x;
      if (tapX < SCREEN_WIDTH * 0.3) {
        runOnJS(goPrev)();
      } else {
        if (currentCard < TOTAL_CARDS - 1) {
          runOnJS(goNext)();
        }
      }
    });

  // Compose gestures: tap + long press are exclusive, swipe is simultaneous
  const composedGesture = Gesture.Race(
    longPressGesture,
    Gesture.Simultaneous(swipeGesture, tapGesture),
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  }, [router]);

  const renderCard = () => {
    switch (currentCard) {
      case 0:
        return <CardContent visible key="hook"><HookCard data={data} userName={userName} /></CardContent>;
      case 1:
        return <CardContent visible key="days"><DaysCard data={data} /></CardContent>;
      case 2:
        return <CardContent visible key="archetype"><ArchetypeCard data={data} /></CardContent>;
      case 3:
        return <CardContent visible key="scripture"><ScriptureCard data={data} /></CardContent>;
      case 4:
        return <CardContent visible key="heart"><HeartCard data={data} /></CardContent>;
      case 5:
        return <CardContent visible key="journal"><JournalCard data={data} /></CardContent>;
      case 6:
        return <CardContent visible key="streak"><StreakCard data={data} /></CardContent>;
      case 7:
        return <CardContent visible key="closing"><ClosingCard data={data} userName={userName} /></CardContent>;
      default:
        return null;
    }
  };

  // Ember particles — more on archetype/closing
  const emberCount = currentCard === 2 || currentCard === 7 ? 18 : 10;
  const embers = useMemo(
    () => Array.from({ length: emberCount }, (_, i) => i),
    [emberCount],
  );

  const swipeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 0.3 }],
  }));

  const bg = CARD_BACKGROUNDS[currentCard] ?? CARD_BACKGROUNDS[0];
  const cardDuration = CARD_DURATIONS[currentCard] ?? 6000;
  const emberColor = useMemo(() => CARD_ACCENTS[currentCard] ?? PALETTE.gold, [currentCard]);

  return (
    <View style={s.screen}>
      {/* Full-screen gradient — changes per card */}
      <LinearGradient
        colors={bg.colors}
        locations={bg.locations}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating embers */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {embers.map((i) => (
          <FloatingEmber
            key={i}
            index={i}
            color={emberColor}
          />
        ))}
      </View>

      <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
        {/* Top: Stories-style progress + close */}
        <View style={s.topBar}>
          <View style={s.progressAndClose}>
            <StoryProgressBar
              current={currentCard}
              total={TOTAL_CARDS}
              paused={paused}
              duration={cardDuration}
              onSegmentComplete={handleSegmentComplete}
            />
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={CLOSE_HIT_SLOP}
              style={s.closeButton}
              activeOpacity={0.6}
            >
              <XIcon size={18} color="rgba(255,255,255,0.6)" weight="bold" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Card area — tap left/right to navigate, long-press to pause, swipe */}
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[s.cardArea, swipeAnimStyle]}>
            {renderCard()}
          </Animated.View>
        </GestureDetector>
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PALETTE.black,
  },
  safeArea: {
    flex: 1,
  },

  // ─── Top bar ───
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  progressAndClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    height: 3,
  },
  progressSegment: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Card area ───
  cardArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Hook Card (1) ───
  hookContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  hookLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    color: PALETTE.dimWhite,
    letterSpacing: 5,
  },
  hookTitle: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 90,
    color: PALETTE.cream,
    letterSpacing: -3,
    textAlign: 'center',
  },
  hookLine: {
    height: 1,
    backgroundColor: PALETTE.gold,
    marginVertical: 24,
    alignSelf: 'center',
  },
  hookName: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    color: PALETTE.gold,
    textAlign: 'center',
    marginBottom: 8,
  },
  hookDate: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: PALETTE.dimWhite,
    textAlign: 'center',
    marginBottom: 16,
  },
  hookTeaser: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 16,
    color: PALETTE.mutedWhite,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 8,
  },

  // ─── Full-screen card layout ───
  fullCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 6,
  },
  label: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    letterSpacing: 5,
    marginTop: 14,
    marginBottom: 4,
    textAlign: 'center',
    opacity: 0.8,
  },
  heroNumber: {
    fontFamily: FontFamily.display,
    fontSize: 120,
    color: PALETTE.cream,
    letterSpacing: -5,
    lineHeight: 150,
    textAlign: 'center',
  },
  heroUnit: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 18,
    color: PALETTE.mutedWhite,
    textAlign: 'center',
    marginBottom: 24,
    marginTop: -4,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    letterSpacing: -1,
  },
  statLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    color: PALETTE.dimWhite,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Insight + quote
  insight: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: PALETTE.dimWhite,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  quote: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 14,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 20,
    paddingHorizontal: 16,
    maxWidth: 300,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    color: PALETTE.dimWhite,
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 16,
  },

  // ─── Archetype Card (3) ───
  ringsContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archetypeName: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 64,
    color: PALETTE.gold,
    letterSpacing: -2,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
    textShadowColor: 'rgba(200, 165, 92, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 40,
  },
  archetypeDivider: {
    width: 40,
    height: 1,
    backgroundColor: PALETTE.gold,
    opacity: 0.4,
    marginVertical: 16,
  },
  archetypeDesc: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    color: PALETTE.mutedWhite,
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: 16,
    maxWidth: 320,
  },
  narrativePill: {
    marginTop: 28,
    backgroundColor: 'rgba(200, 165, 92, 0.08)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(200, 165, 92, 0.15)',
  },
  narrativeText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 13,
    color: PALETTE.mutedWhite,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ─── Scripture Card (4) ───
  featureBlock: {
    alignItems: 'center',
    marginVertical: 16,
  },
  featureLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: PALETTE.dimWhite,
    marginBottom: 4,
  },
  featureName: {
    fontFamily: FontFamily.display,
    fontSize: 44,
    letterSpacing: -1.5,
  },
  featureCount: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 2,
  },
  barChart: {
    width: '100%',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: PALETTE.mutedWhite,
    width: 72,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barCount: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    width: 24,
  },

  // ─── Heart Card (5) ───
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 16,
  },
  trendText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 12,
  },
  moodBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    height: 90,
    marginVertical: 8,
    paddingHorizontal: 12,
  },
  moodCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  moodTrack: {
    width: '100%',
    height: '80%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  moodFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 3,
  },
  moodLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 5,
  },

  // ─── Journal Card (6) ───
  wordBlock: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginVertical: 12,
  },
  wordLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: PALETTE.dimWhite,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  // ─── Streak Card (7) ───
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  streakBadgeText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
  },

  // ─── Closing Card (8) ───
  closingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  closingTitle: {
    fontFamily: FontFamily.display,
    fontSize: 60,
    color: PALETTE.cream,
    letterSpacing: -2,
    marginTop: 20,
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 64,
  },
  closingName: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 24,
    color: PALETTE.gold,
    marginBottom: 4,
    textAlign: 'center',
  },
  closingLine: {
    width: 40,
    height: 1,
    backgroundColor: PALETTE.gold,
    marginVertical: 20,
    opacity: 0.4,
  },
  closingMessage: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    color: PALETTE.mutedWhite,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 36,
    maxWidth: 300,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.gold,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    shadowColor: PALETTE.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  shareButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
    color: PALETTE.black,
    letterSpacing: -0.2,
  },

  // ─── Off-screen share card (captured as image) ───
  shareCardOffscreen: {
    position: 'absolute',
    top: -9999,
    left: -9999,
  },
  shareCard: {
    width: 360,
    height: 640,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 32,
  },
  shareCardLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    letterSpacing: 5,
    color: PALETTE.dimWhite,
    marginBottom: 12,
  },
  shareCardTitle: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 64,
    color: PALETTE.cream,
    letterSpacing: -2,
    textAlign: 'center',
  },
  shareCardDivider: {
    width: 40,
    height: 1,
    backgroundColor: PALETTE.gold,
    opacity: 0.5,
    marginVertical: 16,
  },
  shareCardName: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: PALETTE.gold,
    textAlign: 'center',
    marginBottom: 24,
  },
  shareCardStats: {
    flexDirection: 'row',
    gap: 28,
    marginBottom: 24,
  },
  shareCardStat: {
    alignItems: 'center',
  },
  shareCardStatNum: {
    fontFamily: FontFamily.display,
    fontSize: 36,
    color: PALETTE.cream,
    letterSpacing: -1,
  },
  shareCardStatLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    color: PALETTE.dimWhite,
    letterSpacing: 2,
    marginTop: 2,
  },
  shareCardArchetype: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 16,
    color: PALETTE.mutedWhite,
    textAlign: 'center',
    marginTop: 4,
  },
  shareCardFooter: {
    position: 'absolute',
    bottom: 24,
  },
  shareCardFooterText: {
    fontFamily: FontFamily.display,
    fontSize: 14,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 3,
  },
});
