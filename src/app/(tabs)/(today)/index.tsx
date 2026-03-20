import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  interpolate,
  interpolateColor,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { ColorTheme } from '@/constants/colors';
import { useUnfoldStore, type MoodLevel } from '@/lib/store';
import { PlusIcon, SunIcon, MoonIcon, CloudIcon, ChatCircleDotsIcon, HeartIcon, HandIcon, XIcon, CaretRightIcon, LockSimpleIcon } from 'phosphor-react-native';
import * as StoreReview from 'expo-store-review';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { cancelMiddayCheckIn, scheduleMiddayCheckIn } from '@/lib/notifications';
import { StreakDisplay } from '@/components/StreakDisplay';
import { StreakBox } from '@/components/StreakBox';
import { HomeOnboardingTooltips } from '@/components/HomeOnboardingTooltips';
import { StreakCelebration } from '@/components/StreakCelebration';
import { CheckInSheet } from '@/components/CheckInSheet';
import { CompanionOrb } from '@/components/CompanionOrb';
import { AccentGlow } from '@/components/AccentGlow';
import { GoldEmberField } from '@/components/GoldEmberField';
import { syncWidgets } from '@/lib/widget-bridge';
import { generateBridge, type BridgeCheckIn } from '@/lib/bridge-service';
import { triggerNextDayGeneration } from '@/lib/progressive-generation';
import { logBugEvent } from '@/lib/bug-logger';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { getContentAwareMiddayMessage, getContentAwareEveningMessage } from '@/constants/check-in-messages';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { ProfileAvatar } from '@/components/ProfileAvatar';

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still awake?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Wind down';
}

function formatResumeRelativeTime(iso?: string): string {
  if (!iso) return 'Saved just now';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) return `Saved ${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Saved ${days}d ago`;
}

// Animated progress bar component with shimmer glow
function AnimatedProgressBar({ progress, colors }: { progress: number; colors: ColorTheme }) {
  const { reducedMotion } = useAccessibleAnimation();
  const animatedProgress = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) {
        // Show progress immediately, skip shimmer
        animatedProgress.value = progress;
        return;
      }
      const timer = setTimeout(() => {
        animatedProgress.value = withTiming(progress, {
          duration: 900,
          easing: Easing.out(Easing.cubic),
        });

        shimmer.value = withDelay(
          1200,
          withRepeat(
            withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            -1,
            false
          )
        );
      }, 400);

      return () => clearTimeout(timer);
    }, [progress, animatedProgress, shimmer, reducedMotion])
  );

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%`,
  }));

  const shimmerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      shimmer.value,
      [0, 0.3, 0.5, 0.7, 1],
      [0, 0, 0.4, 0, 0]
    );
    const translateX = interpolate(
      shimmer.value,
      [0, 1],
      [-40, 200]
    );
    return {
      opacity,
      transform: [{ translateX }],
    };
  });

  return (
    <View style={[homeStyles.progressTrack, { backgroundColor: colors.border }]}>
      <Animated.View
        style={[homeStyles.progressFill, { backgroundColor: colors.accent }, barStyle]}
      >
        <Animated.View style={[homeStyles.progressShimmer, shimmerStyle]} />
      </Animated.View>
    </View>
  );
}

// MiniCompanionRing removed — replaced by CompanionOrb (size=28) for visual consistency

// ─── Character reveal for "Unfold" title ─────────────────────────
const GOLD = '#C8A55C';
const REVEAL_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

const RevealChar = React.memo(({ char, animDelay }: { char: string; animDelay: number }) => {
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(animDelay, withTiming(1, { duration: 600, easing: REVEAL_EASE }));
    colorProgress.value = withDelay(animDelay, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }));
    return () => { cancelAnimation(opacity); cancelAnimation(colorProgress); };
  }, [animDelay]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const textColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(colorProgress.value, [0, 1], ['#FFFFFF', GOLD]),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text style={[{ fontFamily: FontFamily.display, fontSize: 56, letterSpacing: -1.5 }, textColorStyle]}>
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

function shuffleRevealOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 7919 + 104729) * 0.5 + 0.5) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// Swipeable notification card — shared by midday check-in and evening wind-down
function NotificationCard({
  colors,
  onPress,
  message,
  icon,
  accentColor,
  delay = 150,
}: {
  colors: ColorTheme;
  onPress: () => void;
  message: string;
  icon: React.ReactNode;
  accentColor: string;
  delay?: number;
}) {
  const { entering, exiting } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(400).delay(delay))}
      exiting={exiting(FadeOut.duration(300))}
      style={{ paddingHorizontal: 24, marginTop: 12 }}
    >
      <TouchableOpacity activeOpacity={0.7}
        onPress={onPress}
      >
        <View
          style={[homeStyles.notificationCard, { backgroundColor: accentColor + '0D' }]}
        >
          {/* Companion orb */}
          <View style={homeStyles.notificationOrb}>
            <CompanionOrb accentColor={accentColor} size={28} />
          </View>

          {/* Message text */}
          <View style={homeStyles.flex1}>
            <Text style={[homeStyles.notificationMessage, { color: colors.text }]}>
              {message}
            </Text>
          </View>

          {/* Action chevron */}
          <CaretRightIcon size={16} color={colors.textSubtle} weight="light" style={homeStyles.notificationChevron} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Skeleton shimmer for loading bridge
function BridgeShimmer({ colors }: { colors: ColorTheme }) {
  const { reducedMotion, entering } = useAccessibleAnimation();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      entering={entering(FadeIn.duration(300))}
      style={homeStyles.shimmerWrapper}
    >
      <View
        style={[homeStyles.shimmerCard, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
      >
        <Animated.View style={shimmerStyle}>
          <View style={[homeStyles.shimmerLine1, { backgroundColor: colors.border }]} />
          <View style={[homeStyles.shimmerLine2, { backgroundColor: colors.border }]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// Daily Bridge card — personalized transition from yesterday to today
// Styled consistently with CompanionTooltip — clean bubble, regular font
function DailyBridgeCard({ text, colors }: { text: string; colors: ColorTheme }) {
  const { entering } = useAccessibleAnimation();
  return (
    <Animated.View
      entering={entering(FadeIn.duration(600))}
      style={homeStyles.bridgeWrapper}
    >
      <View style={homeStyles.bridgeRow}>
        {/* Mini companion orb */}
        <View style={homeStyles.bridgeOrbContainer}>
          <CompanionOrb accentColor={colors.accent} size={24} />
        </View>

        {/* Message bubble */}
        <View style={homeStyles.flex1}>
          <View
            style={[
              homeStyles.bridgeBubble,
              { backgroundColor: colors.accent + '10', borderColor: colors.accent + '20' },
            ]}
          >
            <Text style={[homeStyles.bridgeText, { color: colors.text }]}>
              {text}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// EveningWindDownCard removed — now uses shared NotificationCard component

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { entering, exiting } = useAccessibleAnimation();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const resumeContext = useUnfoldStore((s) => s.resumeContext);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const addCheckIn = useUnfoldStore((s) => s.addCheckIn);
  const getCheckIn = useUnfoldStore((s) => s.getCheckIn);
  const hasSeenDay1Review = useUnfoldStore((s) => s.hasSeenDay1Review);
  const setHasSeenDay1Review = useUnfoldStore((s) => s.setHasSeenDay1Review);

  const checkIns = useUnfoldStore((s) => s.checkIns);
  // dismissedMiddayCardDate/dismissedEveningCardDate removed — cards now expire by time window


  // Refs for onboarding spotlight targets
  const journeyCardRef = useRef<View>(null);
  const streakBoxRef = useRef<View>(null);
  const onboardingTargets = useMemo(
    () => ({ reading: journeyCardRef, streak: streakBoxRef }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay());
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [showTomorrowLockInfo, setShowTomorrowLockInfo] = useState(false);

  // Update time of day every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Check premium status from RevenueCat
  const { data: premiumResult } = useQuery({
    queryKey: ['revenuecat', 'premium'],
    queryFn: () => hasEntitlement('Unfold Premium'),
    enabled: isRevenueCatEnabled(),
    staleTime: 1000 * 60,
  });

  const isPremium = premiumResult?.ok ? premiumResult.data : user?.isPremium ?? false;

  useEffect(() => {
    if (premiumResult?.ok && premiumResult.data !== user?.isPremium) {
      updateUser({ isPremium: premiumResult.data });
    }
  }, [premiumResult, user?.isPremium, updateUser]);

  // Premium nudge system
  const { nudge: premiumNudge, onAction: nudgeAction, onDismiss: nudgeDismiss } = usePremiumNudge({ screen: 'home' });

  // Sync widget data whenever home screen mounts or re-focuses
  // Also reset nudge session so one nudge can show per focus cycle
  useFocusEffect(
    useCallback(() => {
      syncWidgets();
      useUnfoldStore.getState().resetNudgeSession();
    }, [])
  );

  // Check if today's reading has been completed — drives ember visibility
  const hasReadToday = useMemo(() => {
    if (!currentDevotionalId) return false;
    const dev = devotionals.find((d) => d.id === currentDevotionalId);
    if (!dev) return false;
    const today = new Date().toDateString();
    return dev.days.some((day) => day.isRead && day.readAt && new Date(day.readAt).toDateString() === today);
  }, [currentDevotionalId, devotionals]);

  // Streak celebration: show once when hasReadToday flips from false→true
  const [showCelebration, setShowCelebration] = useState(false);
  const prevHasReadToday = React.useRef(hasReadToday);
  useEffect(() => {
    if (hasReadToday && !prevHasReadToday.current) {
      setShowCelebration(true);
    }
    prevHasReadToday.current = hasReadToday;
  }, [hasReadToday]);

  const currentDevotional = devotionals.find((d) => d.id === currentDevotionalId);

  // Progressive generation: detect missing current day and trigger generation on app open
  const [isPreparingCurrentDay, setIsPreparingCurrentDay] = useState(false);
  const progressiveGenTriggeredRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!currentDevotional || currentDevotional.generationMode !== 'progressive') return;
    const currentDay = currentDevotional.currentDay;
    const dayExists = currentDevotional.days.some(d => d.dayNumber === currentDay);
    if (dayExists) {
      setIsPreparingCurrentDay(false);
      return;
    }

    // Avoid duplicate triggers for the same day
    const triggerKey = `${currentDevotional.id}::${currentDay}`;
    if (progressiveGenTriggeredRef.current === triggerKey) return;
    progressiveGenTriggeredRef.current = triggerKey;

    // Current day is missing — trigger generation
    setIsPreparingCurrentDay(true);
    void logBugEvent('progressive-gen', 'app-open-trigger', {
      devotionalId: currentDevotional.id,
      missingDay: currentDay,
    });

    triggerNextDayGeneration(currentDevotional.id, currentDay - 1)
      .finally(() => setIsPreparingCurrentDay(false));
  }, [currentDevotional]);

  // Content-aware messages are computed after currentDayData is available (line ~698)
  // See middayMessage / eveningMessage below

  // Daily Bridge — generate a personalized transition from yesterday to today
  const bridgeInput = useMemo(() => {
    if (!currentDevotional || !user?.name) return null;
    if (currentDevotional.currentDay <= 1) return null; // No bridge for Day 1

    const todayDay = currentDevotional.days.find((d) => d.dayNumber === currentDevotional.currentDay);
    if (!todayDay) return null;

    // Find yesterday's check-in
    const yesterdayCheckIn = checkIns.find(
      (c) => c.devotionalId === currentDevotional.id && c.dayNumber === currentDevotional.currentDay - 1
    );

    const bridgeCheckIn: BridgeCheckIn | undefined = yesterdayCheckIn
      ? {
          mood: yesterdayCheckIn.mood,
          moodLabel: yesterdayCheckIn.moodLabel,
          chipAnswer: yesterdayCheckIn.chipAnswer,
          freeText: yesterdayCheckIn.freeText,
        }
      : undefined;

    return {
      input: {
        userName: user.name,
        yesterdayCheckIn: bridgeCheckIn,
        todayTheme: todayDay.title,
        todayScripture: todayDay.scriptureReference,
        currentSituation: user.currentSituation || '',
      },
      devotionalId: currentDevotional.id,
      dayNumber: currentDevotional.currentDay,
    };
  }, [currentDevotional, user?.name, user?.currentSituation, checkIns]);

  const { data: bridgeText, isLoading: bridgeLoading } = useQuery({
    queryKey: ['bridge', bridgeInput?.devotionalId, bridgeInput?.dayNumber],
    queryFn: () => generateBridge(bridgeInput!.input, bridgeInput!.devotionalId, bridgeInput!.dayNumber),
    enabled: !!bridgeInput,
    staleTime: 1000 * 60 * 60, // 1 hour — bridge is cached in MMKV anyway
    retry: 1,
  });
  const resumeDevotional = useMemo(() => {
    if (!resumeContext?.devotionalId) return null;
    return devotionals.find((d) => d.id === resumeContext.devotionalId) ?? null;
  }, [resumeContext?.devotionalId, devotionals]);

  const shouldShowResumeCard = useMemo(() => {
    if (!resumeContext || !resumeDevotional) return false;
    const isResumeDevotionalComplete = resumeDevotional.days.filter(d => d.isRead).length === resumeDevotional.totalDays;
    if (isResumeDevotionalComplete) return false;
    const resumeDay = resumeDevotional.days.find(d => d.dayNumber === resumeContext.dayNumber);
    // Journal route — always show; user may want to add notes to a completed day
    if (resumeContext.route === 'journal') return true;
    // Reading route — hide if that specific day is already read (not just "current day advanced")
    if (resumeDay?.isRead) return false;
    return resumeContext.dayNumber !== resumeDevotional.currentDay;
  }, [resumeContext, resumeDevotional]);

  const getReadingDayLabel = () => {
    if (!currentDevotional) return 'Today';
    const previousDayData = currentDevotional.days.find(d => d.dayNumber === currentDevotional.currentDay - 1);
    if (previousDayData?.readAt) {
      const lastReadDate = new Date(previousDayData.readAt);
      const today = new Date();
      if (
        lastReadDate.getDate() === today.getDate() &&
        lastReadDate.getMonth() === today.getMonth() &&
        lastReadDate.getFullYear() === today.getFullYear()
      ) {
        return 'Tomorrow';
      }
    }
    return 'Today';
  };

  // Button press micro-interaction — spring scale
  const journeyCardScale = useSharedValue(1);
  const journeyCardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: journeyCardScale.value }],
  }));

  const handleContinueReading = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/(today)/reading');
  };

  const handleResume = () => {
    if (!resumeContext || !resumeDevotional) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentDevotional(resumeContext.devotionalId);

    if (resumeContext.route === 'journal') {
      router.push({
        pathname: '/(tabs)/(today)/journal',
        params: {
          devotionalId: resumeContext.devotionalId,
          dayNumber: String(resumeContext.dayNumber),
        },
      });
      return;
    }

    router.push({
      pathname: '/(tabs)/(today)/reading',
      params: {
        dayNumber: String(resumeContext.dayNumber),
      },
    });
  };

  const handleCreateNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isPremium && devotionals.length >= 1) {
      setShowPremiumSheet(true);
    } else {
      router.push('/onboarding');
    }
  };

  const handleCheckIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCheckInSheet(true);
  };

  const handleCheckInComplete = (data: {
    mood: MoodLevel;
    moodLabel: string;
    chipAnswer?: string;
    freeText?: string;
  }) => {
    if (!currentDevotional) return;
    addCheckIn({
      devotionalId: currentDevotional.id,
      dayNumber: currentDevotional.currentDay,
      mood: data.mood,
      moodLabel: data.moodLabel,
      chipAnswer: data.chipAnswer,
      freeText: data.freeText,
      timeOfDay: 'midday',
    });
    // Reschedule midday notification with tomorrow's rotating message
    cancelMiddayCheckIn().then(() => scheduleMiddayCheckIn());
    setShowCheckInSheet(false);
  };


  const handleEveningWindDown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(today)/evening-wind-down');
  };

  // Check if midday/evening check-ins already completed today
  // Evening check-in belongs to the day just completed, which may be currentDay - 1
  // if the reading was finished and the day already advanced
  const eveningCheckInDay = currentDevotional
    ? (currentDevotional.currentDay > 1
      ? currentDevotional.currentDay - 1
      : currentDevotional.currentDay)
    : 1;
  const todayCheckIn = currentDevotional
    ? getCheckIn(currentDevotional.id, currentDevotional.currentDay, 'midday')
    : undefined;
  const todayEveningCheckIn = currentDevotional
    ? getCheckIn(currentDevotional.id, eveningCheckInDay, 'evening')
    : undefined;

  // Time-aware card visibility — cards appear during their window and expire naturally
  // Midday: 12pm–5pm (afternoon)  |  Evening: 5pm–11:30pm
  const currentHour = new Date().getHours();
  const currentMinute = new Date().getMinutes();
  const showCheckInCard =
    timeOfDay === 'afternoon' &&
    !!currentDevotional &&
    !todayCheckIn;
  const showEveningCard =
    (timeOfDay === 'evening' || timeOfDay === 'night') &&
    !(currentHour === 23 && currentMinute >= 30) && // Expires at 11:30pm
    !!currentDevotional &&
    hasReadToday &&
    !todayEveningCheckIn;

  const handleDay1ReviewOption = async (option: 'love' | 'okay' | 'not-for-me') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasSeenDay1Review();
    if (option === 'love') {
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
        }
      } catch (e) {
        // Silently fail — review prompt is non-critical
      }
    }
  };

  // Empty state — animated welcome with character reveal + embers
  const titleChars = useMemo(() => 'Unfold'.split(''), []);
  const charOrder = useMemo(() => shuffleRevealOrder(titleChars.length), [titleChars.length]);
  const charDelays = useMemo(() => {
    const baseDelay = 500;
    const stagger = 200;
    return titleChars.map((_, i) => baseDelay + charOrder[i] * stagger);
  }, [titleChars, charOrder]);
  const titleEndTime = useMemo(() => Math.max(...charDelays) + 700, [charDelays]);

  if (!currentDevotional) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
            {/* Character-by-character "Unfold" reveal */}
            <View style={{ flexDirection: 'row', marginBottom: 20 }}>
              {titleChars.map((char, i) => (
                <RevealChar key={`c-${i}`} char={char} animDelay={charDelays[i]} />
              ))}
            </View>

            <Animated.Text
              entering={entering(FadeIn.duration(800).delay(titleEndTime))}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 18,
                color: 'rgba(200, 165, 92, 0.7)',
                textAlign: 'center',
                lineHeight: 28,
                marginBottom: 56,
              }}
            >
              The world's most personal{'\n'}Bible studies.
            </Animated.Text>

            <Animated.View entering={entering(FadeIn.duration(600).delay(titleEndTime + 400))}>
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleCreateNew}
                accessibilityRole="button"
                accessibilityLabel="Begin your devotional journey"
              >
                <View
                  style={{
                    paddingVertical: 18,
                    paddingHorizontal: 48,
                    borderRadius: 28,
                    backgroundColor: colors.accent,
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 17,
                      color: colors.background,
                      letterSpacing: 0.3,
                    }}
                  >
                    Begin Your Journey
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const daysCompleted = currentDevotional.days.filter(d => d.isRead).length;
  const progressPercent = (daysCompleted / currentDevotional.totalDays) * 100;
  const currentDayData = currentDevotional.days.find(d => d.dayNumber === currentDevotional.currentDay);

  // Content-aware check-in messages — reference today's devotional when available
  const middayMessage = useMemo(() => getContentAwareMiddayMessage(currentDayData ? {
    title: currentDayData.title,
    scriptureReference: currentDayData.scriptureReference,
    quotableLine: currentDayData.quotableLine,
    checkInQuestion: currentDayData.checkInQuestion,
  } : null), [currentDayData?.title, currentDayData?.scriptureReference, currentDayData?.quotableLine, currentDayData?.checkInQuestion]);

  const eveningMessage = useMemo(() => getContentAwareEveningMessage(currentDayData ? {
    title: currentDayData.title,
    scriptureReference: currentDayData.scriptureReference,
    quotableLine: currentDayData.quotableLine,
  } : null), [currentDayData?.title, currentDayData?.scriptureReference, currentDayData?.quotableLine]);

  const isJourneyComplete = daysCompleted === currentDevotional.totalDays;
  const isFirstDay = currentDevotional.currentDay === 1 && daysCompleted === 0;
  const isLastDay = currentDevotional.currentDay === currentDevotional.totalDays;
  const showDay1Review = daysCompleted >= 1 && !hasSeenDay1Review && !isJourneyComplete;

  // True when today's reading is done and the card is previewing tomorrow's content
  const isTomorrow = !isJourneyComplete && getReadingDayLabel() === 'Tomorrow';

  // Extract a teaser sentence from tomorrow's bodyText to surface on the home card
  const homeTomorrowTeaser = (() => {
    if (!isTomorrow || !currentDayData?.bodyText) return null;
    const stripped = currentDayData.bodyText
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/^---$/gm, '')
      .trim();
    const firstSentence = stripped.match(/^.+?[.!?]/s);
    return firstSentence ? firstSentence[0].trim() : stripped.slice(0, 130) + '…';
  })();

  const getCtaText = () => {
    if (isFirstDay && streakCurrent === 0) return 'Begin Your Journey';
    if (isFirstDay) return 'Build Your Rhythm';
    if (isLastDay && !isJourneyComplete) return 'Finish Your Journey';
    if (streakCurrent >= 7) return 'Deepen Your Practice';
    if (streakCurrent >= 3) return 'Stay Rooted';
    if (streakCurrent >= 1) return 'Keep Going';
    return 'Continue Reading';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Embers — reward for completing today's reading */}
        {hasReadToday && <GoldEmberField streakLevel={streakCurrent} />}

        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — greeting + avatar */}
          <Animated.View
            entering={entering(FadeIn.duration(400))}
            style={{
              paddingHorizontal: 24,
              paddingTop: 20,
              paddingBottom: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 15,
                  color: colors.textSubtle,
                  marginBottom: 6,
                }}
              >
                {getGreeting()}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 34,
                    color: colors.text,
                    letterSpacing: -0.5,
                  }}
                >
                  {user?.name}
                </Text>
                <StreakDisplay compact hideDayLabel />
              </View>
            </View>
            <View style={{ marginTop: 4 }}>
              <ProfileAvatar
                size={38}
                onPress={() => router.push('/(tabs)/(you)')}
              />
            </View>
          </Animated.View>

          {/* Daily Bridge — personalized transition from yesterday */}
          {bridgeLoading && bridgeInput && (
            <BridgeShimmer colors={colors} />
          )}
          {bridgeText && !bridgeLoading && bridgeText.length > 20 && /[.!?…"']$/.test(bridgeText.trim()) && (
            <DailyBridgeCard text={bridgeText} colors={colors} />
          )}

          {/* Notification cards — above journey card */}
          {showCheckInCard && (
            <NotificationCard
              colors={colors}
              onPress={handleCheckIn}
              message={middayMessage}
              icon={<ChatCircleDotsIcon size={16} color={colors.textSubtle} weight="light" />}
              accentColor={colors.accent}
              delay={150}
            />
          )}
          {showEveningCard && (
            <NotificationCard
              colors={colors}
              onPress={handleEveningWindDown}
              message={eveningMessage}
              icon={<MoonIcon size={16} color={colors.textSubtle} weight="light" />}
              accentColor={colors.accent}
              delay={200}
            />
          )}

          {/* Resume card */}
          {shouldShowResumeCard && resumeContext && resumeDevotional && (
            <Animated.View
              entering={entering(FadeIn.duration(400).delay(80))}
              style={{ paddingHorizontal: 24, marginTop: 16 }}
            >
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleResume}
                accessibilityRole="button"
                accessibilityLabel={`Resume ${resumeDevotional.title} day ${resumeContext.dayNumber}`}
              >
                <View
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 16,
                    // Light elevation for resume card
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    elevation: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 13,
                      color: colors.accent,
                      marginBottom: 6,
                    }}
                  >
                    {resumeContext.route === 'journal'
                      ? (resumeDevotional.days.find(d => d.dayNumber === resumeContext.dayNumber)?.isRead
                        ? `Add to Day ${resumeContext.dayNumber}`
                        : 'Resume your reflection')
                      : 'Resume where you left off'}
                  </Text>

                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    {resumeDevotional.title} · Day {resumeContext.dayNumber}
                    {resumeContext.dayTitle ? `: ${resumeContext.dayTitle}` : ''}
                  </Text>

                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
                      color: colors.textSubtle,
                    }}
                  >
                    {formatResumeRelativeTime(resumeContext.touchedAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Main Journey Card */}
          <View ref={journeyCardRef} collapsable={false}>
          <Animated.View
            entering={entering(FadeIn.delay(100).duration(400))}
            style={[{ paddingHorizontal: 24, marginTop: 20 }, journeyCardAnimStyle]}
          >
            {isJourneyComplete ? (
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleCreateNew}
                onPressIn={() => {
                  journeyCardScale.value = withTiming(0.98, { duration: 120 });
                }}
                onPressOut={() => {
                  journeyCardScale.value = withTiming(1, { duration: 150 });
                }}
                accessibilityRole="button"
                accessibilityLabel="Start a new journey"
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.accent + '18',
                    padding: 28,
                    alignItems: 'center',
                    backgroundColor: colors.backgroundElevated,
                    // Hero card elevation
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.08,
                    shadowRadius: 16,
                    elevation: 4,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 1.5,
                      backgroundColor: colors.accent,
                      marginBottom: 24,
                      borderRadius: 1,
                    }}
                  />

                  <Text
                    style={{
                      fontFamily: FontFamily.display,
                      fontSize: 28,
                      color: colors.text,
                      textAlign: 'center',
                      marginBottom: 8,
                    }}
                  >
                    Start a New Journey
                  </Text>

                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.textMuted,
                      textAlign: 'center',
                      lineHeight: 23,
                      marginBottom: 28,
                      paddingHorizontal: 8,
                    }}
                  >
                    Continue your journey with a new{'\n'}personalized devotional series.
                  </Text>

                  <View
                    style={{
                      backgroundColor: colors.accent,
                      paddingVertical: 15,
                      paddingHorizontal: 36,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.background,
                        letterSpacing: 0.3,
                      }}
                    >
                      Create Journey
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={0.7}
                onPress={isPreparingCurrentDay ? undefined : (isTomorrow ? () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowTomorrowLockInfo(v => !v);
                } : handleContinueReading)}
                disabled={isPreparingCurrentDay}
                onPressIn={() => {
                  if (!isPreparingCurrentDay) journeyCardScale.value = withTiming(0.98, { duration: 120 });
                }}
                onPressOut={() => {
                  journeyCardScale.value = withTiming(1, { duration: 150 });
                }}
                accessibilityRole="button"
                accessibilityLabel={isPreparingCurrentDay
                  ? 'Preparing your reading, please wait'
                  : `Continue ${currentDevotional.title}, day ${currentDevotional.currentDay} of ${currentDevotional.totalDays}`
                }
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  opacity: isPreparingCurrentDay ? 0.85 : 1,
                }}
              >
                <View
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: colors.accent + '18',
                    padding: 24,
                    backgroundColor: colors.backgroundElevated,
                    // Hero card — strongest elevation in the hierarchy
                    shadowColor: colors.accent,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.08,
                    shadowRadius: 16,
                    elevation: 4,
                  }}
                >
                  {/* Series label + day pill */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textSubtle,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {currentDevotional.title}
                    </Text>

                    <View
                      style={{
                        backgroundColor: colors.buttonBackground,
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        borderRadius: 20,
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginLeft: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 11,
                          color: colors.textMuted,
                          letterSpacing: 0.3,
                        }}
                      >
                        {getReadingDayLabel()} · Day {currentDevotional.currentDay}/{currentDevotional.totalDays}
                      </Text>
                    </View>
                  </View>

                  {currentDayData ? (
                    <>
                      <Text
                        sharedTransitionTag={`devotional-title-${currentDevotional.id}-${currentDevotional.currentDay}`}
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: 30,
                          color: colors.text,
                          lineHeight: 38,
                          marginBottom: 8,
                          letterSpacing: -0.3,
                        }}
                      >
                        {currentDayData.title}
                      </Text>

                      {/* Scripture teaser — draws the reader in */}
                      {currentDayData.scriptureReference && (
                        <Text
                          style={{
                            fontFamily: FontFamily.bodyItalic,
                            fontSize: 14,
                            color: colors.textMuted,
                            lineHeight: 22,
                            marginBottom: currentDayData.studyMethod ? 12 : 20,
                            opacity: 0.8,
                          }}
                          numberOfLines={2}
                        >
                          {currentDayData.scriptureReference}
                          {currentDayData.scriptureText ? ` — "${currentDayData.scriptureText.slice(0, 80).trim()}..."` : ''}
                        </Text>
                      )}

                      {/* Tomorrow teaser — first hook sentence from next day's content */}
                      {isTomorrow && homeTomorrowTeaser && (
                        <Text
                          style={{
                            fontFamily: FontFamily.body,
                            fontSize: 13,
                            color: colors.textMuted,
                            lineHeight: 20,
                            marginBottom: 14,
                            opacity: 0.72,
                          }}
                          numberOfLines={3}
                        >
                          {homeTomorrowTeaser}
                        </Text>
                      )}

                      {/* Today's approach — subtle method hint */}
                      {currentDayData.studyMethod && BIBLE_STUDY_METHODS[currentDayData.studyMethod] && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                          <View
                            style={{
                              backgroundColor: colors.accent + '12',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: FontFamily.mono,
                                fontSize: 10,
                                color: colors.accent,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                              }}
                            >
                              {BIBLE_STUDY_METHODS[currentDayData.studyMethod].name}
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  ) : isPreparingCurrentDay ? (
                    <View style={{ alignItems: 'center', paddingVertical: 12, marginBottom: 20 }}>
                      <ActivityIndicator color={colors.accent} size="small" style={{ marginBottom: 10 }} />
                      <Text
                        style={{
                          fontFamily: FontFamily.bodyItalic,
                          fontSize: 15,
                          color: colors.textMuted,
                          textAlign: 'center',
                          lineHeight: 22,
                        }}
                      >
                        {'Preparing today\u2019s reading\u2026'}
                      </Text>
                    </View>
                  ) : null}

                  {/* Progress section */}
                  <View style={{ marginBottom: 24 }}>
                    <AnimatedProgressBar progress={progressPercent} colors={colors} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 12,
                          color: colors.textSubtle,
                        }}
                      >
                        {daysCompleted} of {currentDevotional.totalDays} completed
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.uiSemiBold,
                          fontSize: 12,
                          color: colors.accent,
                          opacity: 0.9,
                        }}
                      >
                        {Math.round(progressPercent)}%
                      </Text>
                    </View>
                  </View>

                  {/* CTA Button */}
                  {isTomorrow ? (
                    <>
                      <View
                        style={{
                          backgroundColor: colors.buttonBackground,
                          paddingVertical: 15,
                          borderRadius: 12,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: colors.border,
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <LockSimpleIcon size={15} color={colors.textMuted} weight="light" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 15,
                            color: colors.textMuted,
                            letterSpacing: 0.3,
                          }}
                        >
                          Unlocks Tomorrow
                        </Text>
                      </View>
                      {showTomorrowLockInfo && (
                        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 10, paddingHorizontal: 4 }}>
                          <Text
                            style={{
                              fontFamily: FontFamily.body,
                              fontSize: 13,
                              color: colors.textSubtle,
                              textAlign: 'center',
                              lineHeight: 20,
                            }}
                          >
                            Give today a chance to sink in.{'\n'}Come back tomorrow — it'll be worth it.
                          </Text>
                        </Animated.View>
                      )}
                    </>
                  ) : (
                    <AccentGlow
                      color={colors.accent}
                      intensity="medium"
                      active={!isJourneyComplete}
                      style={{ borderRadius: 12 }}
                    >
                      <View
                        style={{
                          backgroundColor: colors.accent,
                          paddingVertical: 15,
                          borderRadius: 12,
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 15,
                            color: colors.background,
                            letterSpacing: 0.3,
                          }}
                        >
                          {getCtaText()}
                        </Text>
                      </View>
                    </AccentGlow>
                  )}

                  {/* New Journey - Secondary Action */}
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={handleCreateNew}
                    accessibilityRole="button"
                    accessibilityLabel="Start a new journey"
                    style={{
                      marginTop: 12,
                      opacity: 1,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 10,
                      }}
                    >
                      <PlusIcon size={14} color={colors.textSubtle} weight="light" />
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 13,
                          color: colors.textSubtle,
                        }}
                      >
                        New Journey
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>
          </View>

          {/* Day 1 Review Prompt */}
          {showDay1Review && (
            <Animated.View
              entering={entering(FadeIn.duration(400).delay(200))}
              style={{ paddingHorizontal: 24, marginTop: 20 }}
            >
              <View
                style={{
                  backgroundColor: colors.inputBackground,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 20,
                  // Light elevation for secondary card
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 18,
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  How's this feeling so far?
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 13,
                    color: colors.textSubtle,
                    marginBottom: 16,
                  }}
                >
                  Your honest take helps us get better.
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleDay1ReviewOption('love')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      backgroundColor: colors.buttonBackground,
                    }}
                  >
                    <HeartIcon size={16} color={colors.accent} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.text }}>
                      Love it
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleDay1ReviewOption('okay')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      backgroundColor: colors.buttonBackground,
                    }}
                  >
                    <HandIcon size={16} color={colors.textMuted} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.text }}>
                      It's okay
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleDay1ReviewOption('not-for-me')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      backgroundColor: colors.buttonBackground,
                    }}
                  >
                    <XIcon size={16} color={colors.textMuted} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.text }}>
                      Not for me
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Streak Box */}
          <View ref={streakBoxRef} collapsable={false}>
          <Animated.View
            entering={entering(FadeIn.delay(200).duration(400))}
            style={{ paddingHorizontal: 24, marginTop: 24 }}
          >
            <StreakBox
              streakCount={streakCurrent}
              onPress={() => router.push('/(tabs)/(you)/streak-settings')}
            />
          </Animated.View>
          </View>

          {/* Premium Nudge Card — contextual, inline upsell */}
          {premiumNudge && (
            <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
              <PremiumNudgeCard
                type={premiumNudge.type}
                message={premiumNudge.message}
                cta={premiumNudge.cta}
                premiumFeature={premiumNudge.premiumFeature}
                onAction={nudgeAction}
                onDismiss={nudgeDismiss}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {currentDevotional && (
        <CheckInSheet
          visible={showCheckInSheet}
          onClose={() => setShowCheckInSheet(false)}
          onComplete={handleCheckInComplete}
          question={currentDayData?.checkInQuestion}
          chips={currentDayData?.checkInChips}
          devotionalId={currentDevotional.id}
          dayNumber={currentDevotional.currentDay}
        />
      )}

      {/* CompanionCheckInSheet removed — companion surfaces via contextual notification cards */}

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="series"
      />

      {/* Streak celebration — fires once when today's reading is completed */}
      {showCelebration && (
        <StreakCelebration
          streak={streakCurrent}
          onComplete={() => setShowCelebration(false)}
        />
      )}

      {/* First-time onboarding tooltips — shown once, persisted in store */}
      <HomeOnboardingTooltips targets={onboardingTargets} />
    </View>
  );
}

const homeStyles = StyleSheet.create({
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressShimmer: {
    position: 'absolute',
    top: -1,
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  flex1: {
    flex: 1,
  },
  notificationCard: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  notificationOrb: {
    marginRight: 12,
  },
  notificationMessage: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
  },
  notificationChevron: {
    marginLeft: 8,
  },
  shimmerWrapper: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  shimmerCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shimmerLine1: {
    height: 10,
    width: '85%',
    borderRadius: 5,
    marginBottom: 10,
  },
  shimmerLine2: {
    height: 10,
    width: '65%',
    borderRadius: 5,
  },
  bridgeWrapper: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  bridgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bridgeOrbContainer: {
    marginTop: 10,
  },
  bridgeBubble: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bridgeText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
});
