import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  StyleSheet,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  withRepeat,
  Easing,
  FadeIn,
  runOnJS,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import {
  XIcon,
  SunIcon,
  FireIcon,
  BookOpenIcon,
  HeartIcon,
  PencilLineIcon,
  SparkleIcon,
  ShareNetworkIcon,
  TrendUpIcon,
  TrendDownIcon,
  EqualsIcon,
  DiamondIcon,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { FontFamily, FontSize } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';
import { computeRecapData, type RecapData } from '@/lib/recap-stats';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TOTAL_CARDS = 8;
const GOLD = '#C8A55C';
const GOLD_DIM = 'rgba(200, 165, 92, 0.15)';
const GOLD_GLOW = 'rgba(200, 165, 92, 0.06)';
const BG_DARK = '#08080A';
const TEXT_PRIMARY = '#F5F0EB';
const TEXT_MUTED = 'rgba(255,255,255,0.45)';
const TEXT_DIM = 'rgba(255,255,255,0.35)';
const TEXT_FAINT = 'rgba(255,255,255,0.25)';
const SURFACE = 'rgba(255,255,255,0.03)';
const SURFACE_LIGHT = 'rgba(255,255,255,0.06)';

// Per-card gradient accent colors
const CARD_GRADIENTS: [string, string][] = [
  ['rgba(40, 32, 24, 0.6)', 'rgba(20, 16, 12, 0.2)'],           // 0 Hook: charcoal to warm brown
  ['rgba(200, 165, 92, 0.08)', 'transparent'],                     // 1 Days: warm amber
  ['rgba(200, 165, 92, 0.12)', 'transparent'],                     // 2 Archetype: richer gold
  ['rgba(92, 160, 200, 0.06)', 'transparent'],                     // 3 Scripture: teal-blue
  ['rgba(200, 120, 120, 0.06)', 'transparent'],                    // 4 Heart: rose
  ['rgba(120, 180, 120, 0.06)', 'transparent'],                    // 5 Journal: green
  ['rgba(220, 150, 60, 0.08)', 'transparent'],                     // 6 Streak: fire orange
  ['rgba(200, 165, 92, 0.16)', 'transparent'],                     // 7 Closing: gold strongest
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
      // Ease out cubic
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

// ─── Sparkle Burst (finale card) ──────────────────────────────
function SparkleBurst() {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const angle = (i / 20) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const distance = 60 + Math.random() * 120;
      const targetX = Math.cos(angle) * distance;
      const targetY = Math.sin(angle) * distance;
      const size = 2 + Math.random() * 4;
      const delay = Math.random() * 400;
      return { targetX, targetY, size, delay, index: i };
    });
  }, []);

  return (
    <View style={sparkleStyles.container} pointerEvents="none">
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
}: {
  targetX: number;
  targetY: number;
  size: number;
  delay: number;
  index: number;
}) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }),
        withDelay(200, withTiming(0, { duration: 400, easing: Easing.in(Easing.ease) })),
      ),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: progress.value * targetX },
      { translateY: progress.value * targetY },
      { scale: interpolate(progress.value, [0, 0.5, 1], [0, 1.2, 0.6]) },
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
          backgroundColor: GOLD,
          shadowColor: GOLD,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: size * 3,
        },
        animStyle,
      ]}
    />
  );
}

const sparkleStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Ember Particle for cinematic backgrounds ─────────────────
interface FloatingEmberProps {
  index: number;
  color: string;
}

function FloatingEmber({ index, color }: FloatingEmberProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  const size = 2 + (index % 3) * 1.5;
  const startX = (index * 47 + 13) % SCREEN_WIDTH;
  const startY = SCREEN_HEIGHT * 0.3 + ((index * 73) % (SCREEN_HEIGHT * 0.6));
  const driftDuration = 4000 + (index % 5) * 1500;
  const riseDuration = 6000 + (index % 4) * 2000;

  useEffect(() => {
    opacity.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(0.4 + (index % 3) * 0.15, { duration: 1500, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: riseDuration * 0.3, easing: Easing.in(Easing.ease) }),
        ),
        -1,
      ),
    );
    translateY.value = withDelay(
      index * 200,
      withRepeat(
        withTiming(-SCREEN_HEIGHT * 0.5, { duration: riseDuration, easing: Easing.linear }),
        -1,
      ),
    );
    translateX.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(20, { duration: driftDuration, easing: Easing.inOut(Easing.ease) }),
          withTiming(-20, { duration: driftDuration, easing: Easing.inOut(Easing.ease) }),
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
          shadowRadius: size * 2,
        },
        animStyle,
      ]}
    />
  );
}

// ─── Animated Progress Dots ──────────────────────────────────
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: total }, (_, i) => (
        <AnimatedDot key={i} isActive={i === current} />
      ))}
    </View>
  );
}

function AnimatedDot({ isActive }: { isActive: boolean }) {
  const width = useSharedValue(isActive ? 24 : 6);
  const bgOpacity = useSharedValue(isActive ? 1 : 0.15);

  useEffect(() => {
    width.value = withTiming(isActive ? 24 : 6, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    bgOpacity.value = withTiming(isActive ? 1 : 0.15, { duration: 300 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor: isActive
      ? GOLD
      : `rgba(255,255,255,${bgOpacity.value})`,
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

// ─── Card wrapper with entrance animation ─────────────────────
function CardContent({ children, visible }: { children: React.ReactNode; visible: boolean }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const translateY = useSharedValue(30);

  useEffect(() => {
    if (visible) {
      opacity.value = withDelay(100, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      scale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 160, mass: 0.8 }));
      translateY.value = withDelay(100, withSpring(0, { damping: 20, stiffness: 140 }));
    } else {
      opacity.value = 0;
      scale.value = 0.92;
      translateY.value = 30;
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.cardContent, animStyle]}>
      {children}
    </Animated.View>
  );
}

// ─── Staggered element wrapper ──────────────────────────────
function StaggerIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(500)}>
      {children}
    </Animated.View>
  );
}

// ─── Glassy Card Blob ─────────────────────────────────────────
function GlassyBlob({ children, cardIndex }: { children: React.ReactNode; cardIndex: number }) {
  const gradientColors = CARD_GRADIENTS[cardIndex] ?? CARD_GRADIENTS[0];

  return (
    <View style={styles.glassyBlobOuter}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glassyBlobInner}>
        {children}
      </View>
    </View>
  );
}

// ─── Format helpers ───────────────────────────────────────────
function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── CARD 1: THE HOOK ────────────────────────────────────────
function HookCard({ data, userName }: { data: RecapData; userName: string }) {
  const titleOpacity = useSharedValue(0);
  const nameOpacity = useSharedValue(0);
  const dateOpacity = useSharedValue(0);
  const teaserOpacity = useSharedValue(0);

  useEffect(() => {
    titleOpacity.value = withDelay(200, withTiming(1, { duration: 800 }));
    nameOpacity.value = withDelay(700, withTiming(1, { duration: 800 }));
    dateOpacity.value = withDelay(1200, withTiming(1, { duration: 800 }));
    teaserOpacity.value = withDelay(1800, withTiming(1, { duration: 1000 }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const dateStyle = useAnimatedStyle(() => ({ opacity: dateOpacity.value }));
  const teaserStyle = useAnimatedStyle(() => ({ opacity: teaserOpacity.value }));

  return (
    <View style={styles.heroContainer}>
      <Animated.View style={titleStyle}>
        <Text style={styles.heroLabel}>YOUR STORY SO FAR</Text>
      </Animated.View>
      <Animated.View style={nameStyle}>
        <Text style={styles.heroTitle}>Unfolded</Text>
      </Animated.View>
      <Animated.View style={dateStyle}>
        <View style={styles.heroDivider} />
        <Text style={styles.heroName}>{userName}</Text>
        {data.firstDevotionalDate && (
          <Text style={styles.heroDateText}>
            Your journey began{'\n'}
            <Text style={{ color: GOLD }}>{formatDate(data.firstDevotionalDate)}</Text>
          </Text>
        )}
      </Animated.View>
      <Animated.View style={teaserStyle}>
        <Text style={styles.heroSubtitle}>
          {data.totalDaysRead} {data.totalDaysRead === 1 ? 'day' : 'days'} of showing up.{'\n'}
          Here is what unfolded.
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── CARD 2: THE BIG NUMBER — Days With God ──────────────────
function DaysCard({ data }: { data: RecapData }) {
  return (
    <GlassyBlob cardIndex={1}>
      <View style={styles.centeredCard}>
        <StaggerIn delay={0}>
          <View style={styles.iconCenter}>
            <SunIcon size={28} color={GOLD} weight="light" />
          </View>
        </StaggerIn>
        <StaggerIn delay={150}>
          <Text style={styles.cardLabel}>DAYS WITH GOD</Text>
        </StaggerIn>
        <StaggerIn delay={300}>
          <CountUp
            to={data.totalDaysRead}
            style={styles.bigNumber}
            duration={1500}
            delay={0}
          />
        </StaggerIn>
        <StaggerIn delay={500}>
          <Text style={styles.cardUnit}>
            mornings you chose to show up
          </Text>
        </StaggerIn>
        <StaggerIn delay={700}>
          <View style={styles.subStatsRow}>
            <View style={styles.subStat}>
              <Text style={styles.subStatValue}>{data.totalSeries}</Text>
              <Text style={styles.subStatLabel}>
                {data.totalSeries === 1 ? 'journey' : 'journeys'} started
              </Text>
            </View>
            <View style={styles.subStatDivider} />
            <View style={styles.subStat}>
              <Text style={styles.subStatValue}>{data.completedSeries}</Text>
              <Text style={styles.subStatLabel}>completed</Text>
            </View>
          </View>
        </StaggerIn>
        {data.estimatedReadingMinutes > 0 && (
          <StaggerIn delay={900}>
            <Text style={styles.cardInsight}>
              That is roughly {data.estimatedReadingMinutes} minutes spent in the Word.
              {data.mostActiveWeekday
                ? ` You read most often on ${data.mostActiveWeekday}s.`
                : ''}
            </Text>
          </StaggerIn>
        )}
      </View>
    </GlassyBlob>
  );
}

// ─── CARD 3: THE IDENTITY CARD — Archetype ──────────────────
function ArchetypeCard({ data }: { data: RecapData }) {
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    glowOpacity.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(glowOpacity);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <GlassyBlob cardIndex={2}>
      <View style={styles.centeredCard}>
        {/* Pulsing gold glow behind archetype */}
        <Animated.View style={[styles.archetypeGlow, glowStyle]} />

        <StaggerIn delay={0}>
          <View style={styles.iconCenter}>
            <DiamondIcon size={28} color={GOLD} weight="light" />
          </View>
        </StaggerIn>
        <StaggerIn delay={150}>
          <Text style={styles.cardLabel}>YOUR SPIRITUAL ARCHETYPE</Text>
        </StaggerIn>
        <StaggerIn delay={400}>
          <Text style={styles.archetypeName}>{data.archetypeName}</Text>
        </StaggerIn>
        <StaggerIn delay={650}>
          <Text style={styles.archetypeDescription}>
            {data.archetypeDescription}
          </Text>
        </StaggerIn>
        {data.transformationNarrative && (
          <StaggerIn delay={900}>
            <View style={styles.narrativeBadge}>
              <Text style={styles.narrativeText}>
                {data.transformationNarrative}
              </Text>
            </View>
          </StaggerIn>
        )}
      </View>
    </GlassyBlob>
  );
}

// ─── CARD 4: THE SURPRISE — Scripture Map ────────────────────
function ScriptureCard({ data }: { data: RecapData }) {
  const topBooks = data.bookBreakdown.slice(0, 4);
  return (
    <GlassyBlob cardIndex={3}>
      <View style={styles.centeredCard}>
        <StaggerIn delay={0}>
          <View style={styles.iconCenter}>
            <BookOpenIcon size={28} color={GOLD} weight="light" />
          </View>
        </StaggerIn>
        <StaggerIn delay={150}>
          <Text style={styles.cardLabel}>SCRIPTURE MAP</Text>
        </StaggerIn>
        <StaggerIn delay={300}>
          <CountUp
            to={data.uniqueScriptures}
            style={styles.bigNumber}
            duration={1500}
            delay={0}
          />
        </StaggerIn>
        <StaggerIn delay={500}>
          <Text style={styles.cardUnit}>passages you sat with</Text>
        </StaggerIn>

        {data.topBook && (
          <StaggerIn delay={700}>
            <View style={styles.topBookContainer}>
              <Text style={styles.topBookLabel}>You kept returning to</Text>
              <Text style={styles.topBookName}>{data.topBook}</Text>
              <Text style={styles.topBookCount}>
                {data.topBookCount} {data.topBookCount === 1 ? 'passage' : 'passages'}
              </Text>
            </View>
          </StaggerIn>
        )}

        {topBooks.length > 1 && (
          <StaggerIn delay={900}>
            <View style={styles.bookBarContainer}>
              {topBooks.map((b, i) => {
                const maxCount = topBooks[0].count;
                const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
                return (
                  <View key={b.book} style={styles.bookBarRow}>
                    <Text style={styles.bookBarLabel} numberOfLines={1}>{b.book}</Text>
                    <View style={styles.bookBarTrack}>
                      <View
                        style={[
                          styles.bookBarFill,
                          {
                            width: `${Math.max(pct, 8)}%`,
                            opacity: 1 - i * 0.2,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.bookBarCount}>{b.count}</Text>
                  </View>
                );
              })}
            </View>
          </StaggerIn>
        )}
      </View>
    </GlassyBlob>
  );
}

// ─── CARD 5: THE JOURNEY — Heart Check ──────────────────────
function HeartCard({ data }: { data: RecapData }) {
  const hasMoodData = data.totalCheckIns > 0;
  const TrendIcon = data.moodTrend === 'rising'
    ? TrendUpIcon
    : data.moodTrend === 'falling'
      ? TrendDownIcon
      : EqualsIcon;
  const trendLabel = data.moodTrend === 'rising'
    ? 'Trending upward'
    : data.moodTrend === 'falling'
      ? 'Trending downward'
      : 'Steady';

  // Descriptive arc narrative
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
    return `Your heart started at "${firstWord}" and climbed to "${lastWord}."`;
  };

  const arcNarrative = getArcNarrative();

  return (
    <GlassyBlob cardIndex={4}>
      <View style={styles.centeredCard}>
        <StaggerIn delay={0}>
          <View style={styles.iconCenter}>
            <HeartIcon size={28} color={GOLD} weight="light" />
          </View>
        </StaggerIn>
        <StaggerIn delay={150}>
          <Text style={styles.cardLabel}>HEART CHECK</Text>
        </StaggerIn>
        {hasMoodData ? (
          <>
            <StaggerIn delay={300}>
              <CountUp
                to={data.averageMood}
                style={styles.bigNumber}
                duration={1200}
                delay={0}
                decimals={1}
                suffix=" / 5"
              />
            </StaggerIn>
            <StaggerIn delay={500}>
              <View style={styles.trendRow}>
                <TrendIcon size={16} color={GOLD} weight="light" />
                <Text style={styles.trendText}>{trendLabel}</Text>
              </View>
            </StaggerIn>

            {data.moodByMonth.length > 0 && (
              <StaggerIn delay={700}>
                <View style={styles.moodBarContainer}>
                  {data.moodByMonth.slice(-5).map((m) => (
                    <View key={m.month} style={styles.moodBarCol}>
                      <View style={styles.moodBarTrack}>
                        <View
                          style={[
                            styles.moodBarFill,
                            { height: `${(m.avg / 5) * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.moodBarLabel}>{m.month.slice(0, 3)}</Text>
                    </View>
                  ))}
                </View>
              </StaggerIn>
            )}

            <StaggerIn delay={900}>
              <Text style={styles.cardInsight}>
                {arcNarrative
                  ? arcNarrative
                  : `${data.totalCheckIns} check-ins recorded. Your heart has a story too.`}
              </Text>
            </StaggerIn>
          </>
        ) : (
          <>
            <StaggerIn delay={300}>
              <Text style={[styles.bigNumber, { fontSize: FontSize['4xl'] }]}>--</Text>
            </StaggerIn>
            <StaggerIn delay={500}>
              <Text style={styles.cardUnit}>Start checking in to trace your heart's path</Text>
            </StaggerIn>
          </>
        )}
      </View>
    </GlassyBlob>
  );
}

// ─── CARD 6: THE DEPTH — Journal ─────────────────────────────
function JournalCard({ data }: { data: RecapData }) {
  const hasEntries = data.totalJournalEntries > 0;
  const pages = Math.max(1, Math.round(data.totalWordsWritten / 500));

  return (
    <GlassyBlob cardIndex={5}>
      <View style={styles.centeredCard}>
        <StaggerIn delay={0}>
          <View style={styles.iconCenter}>
            <PencilLineIcon size={28} color={GOLD} weight="light" />
          </View>
        </StaggerIn>
        <StaggerIn delay={150}>
          <Text style={styles.cardLabel}>JOURNAL DEPTH</Text>
        </StaggerIn>

        {hasEntries ? (
          <>
            <StaggerIn delay={300}>
              <CountUp
                to={data.totalJournalEntries}
                style={styles.bigNumber}
                duration={1500}
                delay={0}
              />
            </StaggerIn>
            <StaggerIn delay={500}>
              <Text style={styles.cardUnit}>
                {data.totalJournalEntries === 1 ? 'reflection' : 'reflections'} written
              </Text>
            </StaggerIn>

            {data.totalWordsWritten > 0 && (
              <StaggerIn delay={700}>
                <View style={styles.wordCountContainer}>
                  <CountUp
                    to={data.totalWordsWritten}
                    style={styles.wordCountNumber}
                    duration={1800}
                    delay={0}
                  />
                  <Text style={styles.wordCountLabel}>
                    words — enough to fill {pages} {pages === 1 ? 'page' : 'pages'} of a letter to God
                  </Text>
                </View>
              </StaggerIn>
            )}

            <StaggerIn delay={900}>
              <Text style={styles.cardInsight}>
                {data.totalJournalEntries >= 10
                  ? 'Writing is how the soul processes what the mind cannot hold alone.'
                  : 'Every word is a conversation with the One who already knows.'}
              </Text>
            </StaggerIn>
          </>
        ) : (
          <>
            <StaggerIn delay={300}>
              <Text style={[styles.bigNumber, { fontSize: FontSize['4xl'] }]}>--</Text>
            </StaggerIn>
            <StaggerIn delay={500}>
              <Text style={styles.cardUnit}>Your journal awaits its first page</Text>
            </StaggerIn>
          </>
        )}
      </View>
    </GlassyBlob>
  );
}

// ─── CARD 7: THE PERSISTENCE — Streak ────────────────────────
function StreakCard({ data }: { data: RecapData }) {
  const hasStreak = data.currentStreak > 0 || data.longestStreak > 0;

  return (
    <GlassyBlob cardIndex={6}>
      <View style={styles.centeredCard}>
        <StaggerIn delay={0}>
          <View style={styles.iconCenter}>
            <FireIcon size={28} color={GOLD} weight="light" />
          </View>
        </StaggerIn>
        <StaggerIn delay={150}>
          <Text style={styles.cardLabel}>YOUR STREAK</Text>
        </StaggerIn>
        {hasStreak ? (
          <>
            <StaggerIn delay={300}>
              <CountUp
                to={data.longestStreak}
                style={styles.bigNumber}
                duration={1500}
                delay={0}
              />
            </StaggerIn>
            <StaggerIn delay={500}>
              <Text style={styles.cardUnit}>mornings without missing</Text>
            </StaggerIn>
            {data.currentStreak > 0 && (
              <StaggerIn delay={700}>
                <View style={styles.streakBadge}>
                  <FireIcon size={14} color={GOLD} weight="fill" />
                  <Text style={styles.streakBadgeText}>
                    {data.currentStreak} day streak right now
                  </Text>
                </View>
              </StaggerIn>
            )}
            <StaggerIn delay={900}>
              <Text style={styles.cardInsight}>
                Consistency is not perfection. It is returning.
              </Text>
            </StaggerIn>
          </>
        ) : (
          <>
            <StaggerIn delay={300}>
              <Text style={[styles.bigNumber, { fontSize: FontSize['4xl'] }]}>New</Text>
            </StaggerIn>
            <StaggerIn delay={500}>
              <Text style={styles.cardUnit}>Your streak story is just beginning</Text>
            </StaggerIn>
            <StaggerIn delay={700}>
              <Text style={styles.cardInsight}>
                Come back tomorrow and the count begins.
              </Text>
            </StaggerIn>
          </>
        )}
      </View>
    </GlassyBlob>
  );
}

// ─── CARD 8: THE CLOSING ─────────────────────────────────────
function ClosingCard({ data, userName }: { data: RecapData; userName: string }) {
  const [showSparkleBurst, setShowSparkleBurst] = useState(false);

  useEffect(() => {
    // Trigger sparkle burst on entrance
    setShowSparkleBurst(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shareText = [
      `My journey with Unfold: ${data.totalDaysRead} days`,
      data.totalJournalEntries > 0 ? `${data.totalJournalEntries} reflections` : null,
      data.topThemeName ? `drawn to the theme of ${data.topThemeName}` : null,
      '#Unfolded',
    ].filter(Boolean).join(', ');

    try {
      await Share.share({ message: shareText });
    } catch {
      // User cancelled
    }
  }, [data]);

  const closingMessage = data.totalDaysRead >= 30
    ? 'You have built something rare — a rhythm of returning. Whatever comes next, you have the roots for it.'
    : data.totalDaysRead >= 7
      ? 'A week of showing up changes more than you think. The seeds planted here are already taking root.'
      : 'The journey has begun. The most important step is the next one.';

  return (
    <View style={styles.closingContainer}>
      {showSparkleBurst && <SparkleBurst />}

      <StaggerIn delay={0}>
        <View style={styles.iconCenter}>
          <SparkleIcon size={32} color={GOLD} weight="light" />
        </View>
      </StaggerIn>
      <StaggerIn delay={200}>
        <Text style={styles.closingTitle}>Keep Unfolding</Text>
      </StaggerIn>
      <StaggerIn delay={400}>
        <Text style={styles.closingName}>{userName}</Text>
      </StaggerIn>
      <StaggerIn delay={600}>
        <View style={styles.closingDivider} />
      </StaggerIn>
      <StaggerIn delay={800}>
        <Text style={styles.closingMessage}>{closingMessage}</Text>
      </StaggerIn>
      <StaggerIn delay={1000}>
        <Pressable
          onPress={handleShare}
          style={styles.shareButton}
        >
          <ShareNetworkIcon size={18} color={BG_DARK} weight="bold" />
          <Text style={styles.shareButtonText}>Share your story</Text>
        </Pressable>
      </StaggerIn>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────

export default function UnfoldedScreen() {
  const router = useRouter();
  const [currentCard, setCurrentCard] = useState(0);

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

  // Swipe gesture
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
      }, 400);
    },
    [],
  );

  const goNext = useCallback(() => goTo(currentCard + 1), [currentCard, goTo]);
  const goPrev = useCallback(() => goTo(currentCard - 1), [currentCard, goTo]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      if (e.translationX < -50 && e.velocityX < 0) {
        runOnJS(goNext)();
      } else if (e.translationX > 50 && e.velocityX > 0) {
        runOnJS(goPrev)();
      }
    });

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  }, [router]);

  // Tap to advance (except on closing card share button area)
  const handleTap = useCallback(() => {
    if (currentCard < TOTAL_CARDS - 1) {
      goNext();
    }
  }, [currentCard, goNext]);

  const renderCard = () => {
    switch (currentCard) {
      case 0:
        return (
          <CardContent visible key="hook">
            <HookCard data={data} userName={userName} />
          </CardContent>
        );
      case 1:
        return (
          <CardContent visible key="days">
            <DaysCard data={data} />
          </CardContent>
        );
      case 2:
        return (
          <CardContent visible key="archetype">
            <ArchetypeCard data={data} />
          </CardContent>
        );
      case 3:
        return (
          <CardContent visible key="scripture">
            <ScriptureCard data={data} />
          </CardContent>
        );
      case 4:
        return (
          <CardContent visible key="heart">
            <HeartCard data={data} />
          </CardContent>
        );
      case 5:
        return (
          <CardContent visible key="journal">
            <JournalCard data={data} />
          </CardContent>
        );
      case 6:
        return (
          <CardContent visible key="streak">
            <StreakCard data={data} />
          </CardContent>
        );
      case 7:
        return (
          <CardContent visible key="closing">
            <ClosingCard data={data} userName={userName} />
          </CardContent>
        );
      default:
        return null;
    }
  };

  // Ember particles (only 12 for performance — slight increase for richness)
  const embers = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i),
    [],
  );

  const swipeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 0.3 }],
  }));

  return (
    <View style={styles.screen}>
      {/* Deep dark background with gold tint */}
      <LinearGradient
        colors={[BG_DARK, '#0C0A08', BG_DARK]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Per-card ambient gradient overlay */}
      <LinearGradient
        colors={CARD_GRADIENTS[currentCard] ?? CARD_GRADIENTS[0]}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 0.8 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}
      />

      {/* Subtle radial gold glow */}
      <View style={styles.radialGlow} />

      {/* Floating ember particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {embers.map((i) => (
          <FloatingEmber key={i} index={i} color={GOLD} />
        ))}
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top bar: progress dots + close */}
        <View style={styles.topBar}>
          <ProgressDots current={currentCard} total={TOTAL_CARDS} />
          <Pressable
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.closeButton}
          >
            <XIcon size={20} color="rgba(255,255,255,0.5)" weight="bold" />
          </Pressable>
        </View>

        {/* Card area */}
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[styles.cardArea, swipeAnimStyle]}>
            <Pressable
              onPress={handleTap}
              style={{ flex: 1 }}
            >
              {renderCard()}
            </Pressable>
          </Animated.View>
        </GestureDetector>

        {/* Bottom navigation */}
        <View style={styles.bottomBar}>
          {currentCard > 0 ? (
            <Pressable onPress={goPrev} style={styles.navButton}>
              <Text style={styles.navButtonText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.navButton} />
          )}

          <Text style={styles.cardCounter}>
            {currentCard + 1} / {TOTAL_CARDS}
          </Text>

          {currentCard < TOTAL_CARDS - 1 ? (
            <Pressable onPress={goNext} style={styles.navButton}>
              <Text style={[styles.navButtonText, { color: GOLD }]}>Next</Text>
            </Pressable>
          ) : (
            <Pressable onPress={handleClose} style={styles.navButton}>
              <Text style={[styles.navButtonText, { color: GOLD }]}>Done</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  safeArea: {
    flex: 1,
  },
  radialGlow: {
    position: 'absolute',
    top: '30%',
    left: '20%',
    width: '60%',
    height: '40%',
    borderRadius: 999,
    backgroundColor: GOLD_GLOW,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 12,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },

  // Card area
  cardArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Glassy blob wrapper
  glassyBlobOuter: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  glassyBlobInner: {
    alignItems: 'center',
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  navButton: {
    minWidth: 60,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  navButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
  },
  cardCounter: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    color: TEXT_FAINT,
    letterSpacing: 1,
  },

  // Icon center
  iconCenter: {
    alignItems: 'center',
    marginBottom: 4,
  },

  // Hero/Hook card
  heroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  heroLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: TEXT_DIM,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 72,
    color: TEXT_PRIMARY,
    letterSpacing: -3,
    marginBottom: 8,
  },
  heroDivider: {
    width: 40,
    height: 1,
    backgroundColor: GOLD,
    marginVertical: 20,
    alignSelf: 'center',
    opacity: 0.5,
  },
  heroName: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 24,
    color: GOLD,
    textAlign: 'center',
    marginBottom: 12,
  },
  heroDateText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 16,
  },
  heroSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Centered stat cards
  centeredCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  cardLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    color: TEXT_DIM,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  bigNumber: {
    fontFamily: FontFamily.display,
    fontSize: 80,
    color: TEXT_PRIMARY,
    letterSpacing: -4,
    lineHeight: 88,
    textAlign: 'center',
  },
  cardUnit: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: TEXT_MUTED,
    marginTop: 4,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  cardInsight: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 16,
    paddingHorizontal: 12,
    maxWidth: 300,
  },

  // Sub-stats row
  subStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: SURFACE,
    borderRadius: 16,
    marginTop: 4,
  },
  subStat: {
    alignItems: 'center',
  },
  subStatValue: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    color: GOLD,
    letterSpacing: -1,
  },
  subStatLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    color: TEXT_DIM,
    marginTop: 2,
  },
  subStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // Archetype card
  archetypeGlow: {
    position: 'absolute',
    top: '20%',
    left: '15%',
    width: '70%',
    height: '60%',
    borderRadius: 999,
    backgroundColor: 'rgba(200, 165, 92, 0.08)',
  },
  archetypeName: {
    fontFamily: FontFamily.display,
    fontSize: 48,
    color: GOLD,
    letterSpacing: -2,
    marginTop: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  archetypeDescription: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 17,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
    maxWidth: 320,
  },
  narrativeBadge: {
    marginTop: 24,
    backgroundColor: SURFACE_LIGHT,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(200, 165, 92, 0.12)',
  },
  narrativeText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Streak badge
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GOLD_DIM,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  streakBadgeText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    color: GOLD,
  },

  // Scripture bars
  topBookContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  topBookLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: TEXT_DIM,
    marginBottom: 4,
  },
  topBookName: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    color: GOLD,
    letterSpacing: -1,
  },
  topBookCount: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
  bookBarContainer: {
    width: '100%',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  bookBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookBarLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: TEXT_MUTED,
    width: 70,
    textAlign: 'right',
  },
  bookBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  bookBarFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 3,
  },
  bookBarCount: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    width: 24,
  },

  // Mood bars
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  trendText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    color: TEXT_MUTED,
  },
  moodBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    height: 100,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  moodBarCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  moodBarTrack: {
    width: '100%',
    height: '80%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  moodBarFill: {
    width: '100%',
    backgroundColor: GOLD,
    borderRadius: 4,
    minHeight: 4,
  },
  moodBarLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 6,
  },

  // Journal card
  wordCountContainer: {
    alignItems: 'center',
    backgroundColor: SURFACE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginBottom: 8,
  },
  wordCountNumber: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    color: GOLD,
    letterSpacing: -1,
  },
  wordCountLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: TEXT_DIM,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  // Closing card
  closingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  closingTitle: {
    fontFamily: FontFamily.display,
    fontSize: 42,
    color: TEXT_PRIMARY,
    letterSpacing: -1.5,
    marginTop: 16,
    marginBottom: 4,
    textAlign: 'center',
  },
  closingName: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 22,
    color: GOLD,
    marginBottom: 8,
    textAlign: 'center',
  },
  closingDivider: {
    width: 40,
    height: 1,
    backgroundColor: GOLD,
    marginVertical: 20,
    opacity: 0.4,
  },
  closingMessage: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 32,
    maxWidth: 320,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GOLD,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  shareButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
    color: BG_DARK,
    letterSpacing: -0.2,
  },
});
