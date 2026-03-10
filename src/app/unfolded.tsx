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
  runOnJS,
  cancelAnimation,
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
  CalendarIcon,
  TreeIcon,
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

// ─── Animated Counter ─────────────────────────────────────────
interface CountUpProps {
  to: number;
  duration?: number;
  delay?: number;
  style?: any;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

function CountUp({ to, duration = 1200, delay: startDelay = 300, style, suffix = '', prefix = '', decimals = 0 }: CountUpProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;
    let timeoutId: ReturnType<typeof setTimeout>;

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
      }
    };

    timeoutId = setTimeout(() => {
      rafId = requestAnimationFrame(animate);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [to, duration, startDelay, decimals]);

  return (
    <Text style={style}>
      {prefix}{decimals > 0 ? display.toFixed(decimals) : display}{suffix}
    </Text>
  );
}

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

// ─── Progress Dots ────────────────────────────────────────────
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i === current ? GOLD : 'rgba(255,255,255,0.15)',
              width: i === current ? 24 : 6,
            },
          ]}
        />
      ))}
    </View>
  );
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

// ─── Individual Cards ─────────────────────────────────────────

function HeroCard({ data, userName }: { data: RecapData; userName: string }) {
  const titleOpacity = useSharedValue(0);
  const nameOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  useEffect(() => {
    titleOpacity.value = withDelay(200, withTiming(1, { duration: 800 }));
    nameOpacity.value = withDelay(600, withTiming(1, { duration: 800 }));
    subtitleOpacity.value = withDelay(1000, withTiming(1, { duration: 800 }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));

  return (
    <View style={styles.heroContainer}>
      <Animated.View style={titleStyle}>
        <Text style={styles.heroLabel}>Your story so far</Text>
      </Animated.View>
      <Animated.View style={nameStyle}>
        <Text style={styles.heroTitle}>Unfolded</Text>
      </Animated.View>
      <Animated.View style={subtitleStyle}>
        <View style={styles.heroDivider} />
        <Text style={styles.heroName}>{userName}</Text>
        <Text style={styles.heroSubtitle}>
          {data.totalDaysRead} {data.totalDaysRead === 1 ? 'day' : 'days'} of showing up.{'\n'}
          Here is what unfolded.
        </Text>
      </Animated.View>
    </View>
  );
}

function DaysCard({ data }: { data: RecapData }) {
  return (
    <View style={styles.centeredCard}>
      <SunIcon size={28} color={GOLD} weight="light" />
      <Text style={styles.cardLabel}>Days with God</Text>
      <CountUp
        to={data.totalDaysRead}
        style={styles.bigNumber}
        duration={1500}
        delay={400}
      />
      <Text style={styles.cardUnit}>days of devotion</Text>
      <View style={styles.subStatsRow}>
        <View style={styles.subStat}>
          <Text style={styles.subStatValue}>{data.totalSeries}</Text>
          <Text style={styles.subStatLabel}>{data.totalSeries === 1 ? 'journey' : 'journeys'} started</Text>
        </View>
        <View style={[styles.subStatDivider]} />
        <View style={styles.subStat}>
          <Text style={styles.subStatValue}>{data.completedSeries}</Text>
          <Text style={styles.subStatLabel}>completed</Text>
        </View>
      </View>
      {data.totalDaysRead >= 7 && (
        <Text style={styles.cardInsight}>
          That is {Math.round(data.totalDaysRead / 7)} {Math.round(data.totalDaysRead / 7) === 1 ? 'week' : 'weeks'} of intentional time with God.
        </Text>
      )}
    </View>
  );
}

function StreakCard({ data }: { data: RecapData }) {
  const hasStreak = data.currentStreak > 0 || data.longestStreak > 0;
  return (
    <View style={styles.centeredCard}>
      <FireIcon size={28} color={GOLD} weight="light" />
      <Text style={styles.cardLabel}>Your Streak</Text>
      {hasStreak ? (
        <>
          <CountUp
            to={data.longestStreak}
            style={styles.bigNumber}
            duration={1500}
            delay={400}
          />
          <Text style={styles.cardUnit}>longest streak</Text>
          {data.currentStreak > 0 && (
            <View style={styles.streakBadge}>
              <FireIcon size={14} color={GOLD} weight="fill" />
              <Text style={styles.streakBadgeText}>
                {data.currentStreak} day streak right now
              </Text>
            </View>
          )}
          <Text style={styles.cardInsight}>
            {data.longestStreak >= 14
              ? 'Consistency is not about perfection. It is about returning.'
              : data.longestStreak >= 7
                ? 'A whole week of faithfulness. That matters more than you know.'
                : 'Every streak starts with a single day.'}
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.bigNumber, { fontSize: FontSize['4xl'] }]}>New</Text>
          <Text style={styles.cardUnit}>Your streak story is just beginning</Text>
          <Text style={styles.cardInsight}>
            Come back tomorrow and the count begins.
          </Text>
        </>
      )}
    </View>
  );
}

function ScriptureCard({ data }: { data: RecapData }) {
  const topBooks = data.bookBreakdown.slice(0, 4);
  return (
    <View style={styles.centeredCard}>
      <BookOpenIcon size={28} color={GOLD} weight="light" />
      <Text style={styles.cardLabel}>Scripture Map</Text>
      <CountUp
        to={data.uniqueScriptures}
        style={styles.bigNumber}
        duration={1500}
        delay={400}
      />
      <Text style={styles.cardUnit}>unique passages explored</Text>
      {data.topBook && (
        <View style={styles.topBookContainer}>
          <Text style={styles.topBookLabel}>You kept returning to</Text>
          <Text style={styles.topBookName}>{data.topBook}</Text>
          <Text style={styles.topBookCount}>
            {data.topBookCount} {data.topBookCount === 1 ? 'passage' : 'passages'}
          </Text>
        </View>
      )}
      {topBooks.length > 1 && (
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
      )}
    </View>
  );
}

function MoodCard({ data }: { data: RecapData }) {
  const hasMoodData = data.totalCheckIns > 0;
  const TrendIcon = data.moodTrend === 'rising' ? TrendUpIcon : data.moodTrend === 'falling' ? TrendDownIcon : EqualsIcon;
  const trendLabel = data.moodTrend === 'rising' ? 'Trending upward' : data.moodTrend === 'falling' ? 'Trending downward' : 'Steady';
  const moodEmoji = data.averageMood >= 4.5 ? 'Grateful' : data.averageMood >= 3.5 ? 'Good' : data.averageMood >= 2.5 ? 'Okay' : 'Growing';

  return (
    <View style={styles.centeredCard}>
      <HeartIcon size={28} color={GOLD} weight="light" />
      <Text style={styles.cardLabel}>Heart Check</Text>
      {hasMoodData ? (
        <>
          <CountUp
            to={data.averageMood}
            style={styles.bigNumber}
            duration={1200}
            delay={400}
            decimals={1}
            suffix={` / 5`}
          />
          <Text style={styles.cardUnit}>{moodEmoji}</Text>

          <View style={styles.trendRow}>
            <TrendIcon size={16} color={GOLD} weight="light" />
            <Text style={styles.trendText}>{trendLabel}</Text>
          </View>

          {data.moodByMonth.length > 0 && (
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
          )}

          <Text style={styles.cardInsight}>
            {data.totalCheckIns} check-ins recorded. Your heart has a story too.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.bigNumber, { fontSize: FontSize['4xl'] }]}>--</Text>
          <Text style={styles.cardUnit}>No check-ins yet</Text>
          <Text style={styles.cardInsight}>
            Start checking in to track your heart's journey.
          </Text>
        </>
      )}
    </View>
  );
}

function JournalCard({ data }: { data: RecapData }) {
  return (
    <View style={styles.centeredCard}>
      <PencilLineIcon size={28} color={GOLD} weight="light" />
      <Text style={styles.cardLabel}>Journal Depth</Text>
      <CountUp
        to={data.totalJournalEntries}
        style={styles.bigNumber}
        duration={1500}
        delay={400}
      />
      <Text style={styles.cardUnit}>{data.totalJournalEntries === 1 ? 'reflection' : 'reflections'} written</Text>

      {data.totalWordsWritten > 0 && (
        <View style={styles.wordCountContainer}>
          <CountUp
            to={data.totalWordsWritten}
            style={styles.wordCountNumber}
            duration={1800}
            delay={600}
          />
          <Text style={styles.wordCountLabel}>words poured out</Text>
        </View>
      )}

      {data.mostReflectiveMonth && (
        <View style={styles.reflectiveMonthContainer}>
          <CalendarIcon size={14} color={GOLD} weight="light" />
          <Text style={styles.reflectiveMonthText}>
            Most reflective in{' '}
            <Text style={{ color: GOLD }}>{data.mostReflectiveMonth}</Text>
            {' '}({data.mostReflectiveMonthCount} {data.mostReflectiveMonthCount === 1 ? 'entry' : 'entries'})
          </Text>
        </View>
      )}

      <Text style={styles.cardInsight}>
        {data.totalJournalEntries >= 10
          ? 'Writing is how the soul processes what the mind cannot hold alone.'
          : data.totalJournalEntries > 0
            ? 'Every word is a conversation with the One who already knows.'
            : 'Your journal awaits the first page.'}
      </Text>
    </View>
  );
}

function ThemeCard({ data }: { data: RecapData }) {
  const topThemes = data.themeBreakdown.slice(0, 5);
  return (
    <View style={styles.centeredCard}>
      <TreeIcon size={28} color={GOLD} weight="light" />
      <Text style={styles.cardLabel}>Where Your Heart Went</Text>
      {data.topThemeName ? (
        <>
          <Text style={styles.themeHighlight}>{data.topThemeName}</Text>
          <Text style={styles.cardUnit}>
            You gravitated toward {data.topThemeName.toLowerCase()}
          </Text>

          {topThemes.length > 1 && (
            <View style={styles.themeListContainer}>
              {topThemes.map((t, i) => (
                <View key={t.theme} style={styles.themeListRow}>
                  <View
                    style={[
                      styles.themeListDot,
                      { opacity: 1 - i * 0.18 },
                    ]}
                  />
                  <Text style={styles.themeListName}>{t.name}</Text>
                  <Text style={styles.themeListCount}>
                    {t.count} {t.count === 1 ? 'journey' : 'journeys'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.cardInsight}>
            {data.themesExplored} {data.themesExplored === 1 ? 'theme' : 'themes'} explored.{' '}
            {data.themesExplored >= 5
              ? 'A wide and curious heart.'
              : 'Each theme is a different conversation with God.'}
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.bigNumber, { fontSize: FontSize['4xl'] }]}>--</Text>
          <Text style={styles.cardUnit}>Your themes will appear as you explore</Text>
        </>
      )}
    </View>
  );
}

function ClosingCard({ data, userName }: { data: RecapData; userName: string }) {
  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shareText = [
      `My journey with Unfold so far:`,
      `${data.totalDaysRead} days of devotion`,
      data.longestStreak > 0 ? `${data.longestStreak}-day longest streak` : null,
      data.uniqueScriptures > 0 ? `${data.uniqueScriptures} scriptures explored` : null,
      data.totalJournalEntries > 0 ? `${data.totalJournalEntries} journal reflections` : null,
      data.topThemeName ? `Drawn to the theme of ${data.topThemeName}` : null,
      '',
      'Unfold — AI-powered daily devotionals',
    ].filter(Boolean).join('\n');

    try {
      await Share.share({
        message: shareText,
      });
    } catch {
      // User cancelled
    }
  }, [data]);

  return (
    <View style={styles.closingContainer}>
      <SparkleIcon size={32} color={GOLD} weight="light" />
      <Text style={styles.closingTitle}>Keep Unfolding</Text>
      <Text style={styles.closingName}>{userName}</Text>
      <View style={styles.closingDivider} />
      <Text style={styles.closingMessage}>
        {data.totalDaysRead >= 30
          ? 'You have built something rare — a rhythm of returning. Whatever comes next, you have the roots for it.'
          : data.totalDaysRead >= 7
            ? 'A week of showing up changes more than you think. The seeds planted here are already taking root.'
            : 'The journey has begun. The most important step is the next one.'}
      </Text>

      <Pressable
        onPress={handleShare}
        style={styles.shareButton}
      >
        <ShareNetworkIcon size={18} color={BG_DARK} weight="bold" />
        <Text style={styles.shareButtonText}>Share your story</Text>
      </Pressable>
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
          <CardContent visible key="hero">
            <HeroCard data={data} userName={userName} />
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
          <CardContent visible key="streak">
            <StreakCard data={data} />
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
          <CardContent visible key="mood">
            <MoodCard data={data} />
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
          <CardContent visible key="theme">
            <ThemeCard data={data} />
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

  // Ember particles (only 10 for performance)
  const embers = useMemo(
    () => Array.from({ length: 10 }, (_, i) => i),
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
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1,
  },

  // Hero card
  heroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  heroLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 72,
    color: '#F5F0EB',
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
  heroSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 24,
  },

  // Centered stat cards
  centeredCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  cardLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  bigNumber: {
    fontFamily: FontFamily.display,
    fontSize: 80,
    color: '#F5F0EB',
    letterSpacing: -4,
    lineHeight: 88,
  },
  cardUnit: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    marginBottom: 16,
  },
  cardInsight: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 20,
    paddingHorizontal: 16,
    maxWidth: 320,
  },

  // Sub-stats row
  subStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  subStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    marginBottom: 16,
  },
  topBookLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
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
    paddingHorizontal: 8,
  },
  bookBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookBarLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
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
    color: 'rgba(255,255,255,0.45)',
  },
  moodBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    height: 100,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 20,
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    marginBottom: 12,
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
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  reflectiveMonthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  reflectiveMonthText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },

  // Theme card
  themeHighlight: {
    fontFamily: FontFamily.display,
    fontSize: 52,
    color: GOLD,
    letterSpacing: -2,
    marginTop: 8,
    marginBottom: 4,
  },
  themeListContainer: {
    width: '100%',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 20,
  },
  themeListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  themeListDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  themeListName: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
  },
  themeListCount: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
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
    color: '#F5F0EB',
    letterSpacing: -1.5,
    marginTop: 20,
    marginBottom: 4,
  },
  closingName: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 22,
    color: GOLD,
    marginBottom: 8,
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
