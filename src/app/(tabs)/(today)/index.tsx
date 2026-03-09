import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSpring,
  withSequence,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { ColorTheme } from '@/constants/colors';
import { useUnfoldStore } from '@/lib/store';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PlusIcon, SunIcon, MoonIcon, CloudIcon, ChatCircleDotsIcon, HeartIcon, HandIcon, XIcon } from 'phosphor-react-native';
import * as StoreReview from 'expo-store-review';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { StreakDisplay } from '@/components/StreakDisplay';
import { StreakBox } from '@/components/StreakBox';
import { HomeOnboardingTooltips } from '@/components/HomeOnboardingTooltips';
import { FeatureOnboarding } from '@/components/FeatureOnboarding';
import { CheckInSheet } from '@/components/CheckInSheet';
import { CompanionOrb } from '@/components/CompanionOrb';
import { CompanionCheckInSheet } from '@/components/CompanionCheckInSheet';
import { CompanionTooltip } from '@/components/CompanionTooltip';
import { AccentGlow } from '@/components/AccentGlow';
import { syncWidgets } from '@/lib/widget-bridge';
import { generateBridge, type BridgeCheckIn } from '@/lib/bridge-service';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { getMessageForToday, MIDDAY_MESSAGES, EVENING_MESSAGES } from '@/constants/check-in-messages';
import { selectTooltipMessage } from '@/constants/companion-messages';

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
  const animatedProgress = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
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
    }, [progress, animatedProgress, shimmer])
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
    <View
      style={{
        height: 3,
        backgroundColor: colors.border,
        borderRadius: 1.5,
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: colors.accent,
            borderRadius: 1.5,
            overflow: 'hidden',
          },
          barStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: -1,
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
            },
            shimmerStyle,
          ]}
        />
      </Animated.View>
    </View>
  );
}

// Mini companion ring — lightweight visual reference to the companion orb
function MiniCompanionRing({ accentColor }: { accentColor: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.15]) }],
  }));

  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: accentColor,
          },
          ringStyle,
        ]}
      />
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: accentColor + '30',
          borderWidth: 1,
          borderColor: accentColor + '60',
        }}
      />
    </View>
  );
}

// Swipeable notification card — shared by midday check-in and evening wind-down
function NotificationCard({
  colors,
  onPress,
  onDismiss,
  message,
  icon,
  accentColor,
  delay = 150,
}: {
  colors: ColorTheme;
  onPress: () => void;
  onDismiss: () => void;
  message: string;
  icon: React.ReactNode;
  accentColor: string;
  delay?: number;
}) {
  const translateX = useSharedValue(0);
  const dismissed = useSharedValue(false);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX(20)
    .onUpdate((e) => {
      if (e.translationX > 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX > 120) {
        translateX.value = withTiming(400, { duration: 200 });
        dismissed.value = true;
        runOnJS(onDismiss)();
      } else {
        translateX.value = withSpring(0, { damping: 15 });
      }
    });

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: interpolate(translateX.value, [0, 200], [1, 0]),
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(delay)}
      exiting={FadeOut.duration(300)}
      style={{ paddingHorizontal: 24, marginTop: 12 }}
    >
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={cardAnimStyle}>
          <Pressable
            onPress={onPress}
            style={{ opacity: 1 }}
          >
            <View
              style={{
                backgroundColor: accentColor + '0D',
                borderRadius: 14,
                paddingVertical: 16,
                paddingHorizontal: 16,
                paddingRight: 12,
                flexDirection: 'row',
                alignItems: 'center',
                // Subtle lift for notification cards
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              {/* Mini companion ring — signals this is from the companion */}
              <View style={{ marginRight: 12 }}>
                <MiniCompanionRing accentColor={accentColor} />
              </View>

              {/* Message text */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 14,
                    color: colors.text,
                    lineHeight: 20,
                  }}
                >
                  {message}
                </Text>
              </View>

              {/* Icon */}
              <View style={{ marginLeft: 8, marginRight: 4 }}>
                {icon}
              </View>

              {/* Dismiss X */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDismiss();
                }}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
                style={{ padding: 4 }}
              >
                <XIcon size={14} color={colors.textSubtle} weight="light" />
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// Skeleton shimmer for loading bridge
function BridgeShimmer({ colors }: { colors: ColorTheme }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ paddingHorizontal: 24, marginTop: 16 }}
    >
      <View
        style={{
          backgroundColor: colors.inputBackground,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Animated.View style={shimmerStyle}>
          <View
            style={{
              height: 10,
              width: '85%',
              backgroundColor: colors.border,
              borderRadius: 5,
              marginBottom: 10,
            }}
          />
          <View
            style={{
              height: 10,
              width: '65%',
              backgroundColor: colors.border,
              borderRadius: 5,
            }}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// Daily Bridge card — personalized transition from yesterday to today
function DailyBridgeCard({ text, colors }: { text: string; colors: ColorTheme }) {
  return (
    <Animated.View
      entering={FadeIn.duration(600)}
      style={{ paddingHorizontal: 24, marginTop: 16 }}
    >
      <View
        style={{
          backgroundColor: colors.inputBackground,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 18,
          // Subtle depth for bridge card
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontFamily: FontFamily.bodyItalic,
            fontSize: 15,
            color: colors.textMuted,
            lineHeight: 24,
          }}
        >
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

// EveningWindDownCard removed — now uses shared NotificationCard component

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const resumeContext = useUnfoldStore((s) => s.resumeContext);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const hasSeenFeatureOnboarding = useUnfoldStore((s) => s.hasSeenFeatureOnboarding);
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const addCheckIn = useUnfoldStore((s) => s.addCheckIn);
  const getCheckIn = useUnfoldStore((s) => s.getCheckIn);
  const hasSeenDay1Review = useUnfoldStore((s) => s.hasSeenDay1Review);
  const setHasSeenDay1Review = useUnfoldStore((s) => s.setHasSeenDay1Review);

  const checkIns = useUnfoldStore((s) => s.checkIns);
  const dismissedMiddayCardDate = useUnfoldStore((s) => s.dismissedMiddayCardDate);
  const dismissedEveningCardDate = useUnfoldStore((s) => s.dismissedEveningCardDate);
  const setDismissedMiddayCardDate = useUnfoldStore((s) => s.setDismissedMiddayCardDate);
  const setDismissedEveningCardDate = useUnfoldStore((s) => s.setDismissedEveningCardDate);

  // Companion orb state
  const hasSeenCompanionIntro = useUnfoldStore((s) => s.hasSeenCompanionIntro);
  const setHasSeenCompanionIntro = useUnfoldStore((s) => s.setHasSeenCompanionIntro);
  const lastCompanionCheckInDate = useUnfoldStore((s) => s.lastCompanionCheckInDate);
  const setLastCompanionCheckInDate = useUnfoldStore((s) => s.setLastCompanionCheckInDate);

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay());
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [showCompanionSheet, setShowCompanionSheet] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipMessage, setTooltipMessage] = useState('');
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const [companionSessionCheckedIn, setCompanionSessionCheckedIn] = useState(false);

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

  // Companion orb — compute context for check-in + tooltip
  const hasActiveSeries = !!currentDevotionalId && devotionals.some((d) => d.id === currentDevotionalId);
  const hasReadToday = useMemo(() => {
    if (!currentDevotionalId) return false;
    const dev = devotionals.find((d) => d.id === currentDevotionalId);
    if (!dev) return false;
    const today = new Date().toDateString();
    return dev.days.some((day) => day.isRead && day.readAt && new Date(day.readAt).toDateString() === today);
  }, [currentDevotionalId, devotionals]);

  const daysSinceLastOpen = useMemo(() => {
    if (!lastCompanionCheckInDate) return 999;
    const diff = Date.now() - new Date(lastCompanionCheckInDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [lastCompanionCheckInDate]);

  const isCompanionActive = useMemo(() => {
    if (!lastCompanionCheckInDate) return true;
    const today = new Date().toDateString();
    const lastDate = new Date(lastCompanionCheckInDate).toDateString();
    if (lastDate === today) return false;
    // Active if 2+ hours since last check-in
    const hoursSince = (Date.now() - new Date(lastCompanionCheckInDate).getTime()) / (1000 * 60 * 60);
    return hoursSince >= 2;
  }, [lastCompanionCheckInDate]);

  const showBadge = isCompanionActive && tooltipDismissed && !companionSessionCheckedIn;

  // Tooltip trigger — once per screen focus, max 1 per session
  useFocusEffect(
    useCallback(() => {
      if (tooltipDismissed || companionSessionCheckedIn || showCompanionSheet) return;

      // Determine tooltip condition
      let condition = 'first_open_morning';
      const hour = new Date().getHours();
      if (!hasSeenCompanionIntro) {
        condition = 'first_open_morning';
      } else if (daysSinceLastOpen >= 3) {
        condition = 'returning_after_gap';
      } else if (!hasActiveSeries) {
        condition = 'between_series';
      } else if (streakCurrent > 0 && streakCurrent % 7 === 0) {
        condition = 'streak_milestone';
      } else if (hour < 12) {
        condition = 'first_open_morning';
      } else if (hour < 17) {
        condition = 'first_open_afternoon';
      } else {
        condition = 'first_open_evening';
      }

      const msg = selectTooltipMessage(condition);
      if (msg && isCompanionActive) {
        // Small delay so the screen settles before tooltip appears
        const timer = setTimeout(() => {
          setTooltipMessage(msg);
          setShowTooltip(true);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }, [tooltipDismissed, companionSessionCheckedIn, showCompanionSheet, hasSeenCompanionIntro, daysSinceLastOpen, hasActiveSeries, streakCurrent, isCompanionActive])
  );

  const currentDevotional = devotionals.find((d) => d.id === currentDevotionalId);

  const middayMessage = useMemo(() => getMessageForToday(MIDDAY_MESSAGES), []);
  const eveningMessage = useMemo(() => getMessageForToday(EVENING_MESSAGES), []);

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
    if (resumeContext.route === 'journal') return true;
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
    mood: 1 | 2 | 3 | 4 | 5;
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
    setShowCheckInSheet(false);
  };

  const handleCompanionOpen = () => {
    setShowTooltip(false);
    setTooltipDismissed(true);
    setShowCompanionSheet(true);
  };

  const handleCompanionComplete = (data: { mood: number; moodLabel: string; chipAnswer?: string }) => {
    const devotionalId = currentDevotional?.id || 'none';
    const dayNumber = currentDevotional?.currentDay || 0;
    addCheckIn({
      devotionalId,
      dayNumber,
      mood: Math.min(5, data.mood) as 1 | 2 | 3 | 4 | 5,
      moodLabel: data.moodLabel,
      chipAnswer: data.chipAnswer,
      timeOfDay: 'companion',
    });
    setLastCompanionCheckInDate(new Date().toISOString());
    if (!hasSeenCompanionIntro) {
      setHasSeenCompanionIntro(true);
    }
    setCompanionSessionCheckedIn(true);
    setShowCompanionSheet(false);
  };

  const handleTooltipTap = () => {
    setShowTooltip(false);
    setTooltipDismissed(true);
    setShowCompanionSheet(true);
  };

  const handleTooltipDismiss = () => {
    setShowTooltip(false);
    setTooltipDismissed(true);
  };

  const handleEveningWindDown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(today)/evening-wind-down');
  };

  // Check if midday/evening check-ins already completed today
  const todayCheckIn = currentDevotional
    ? getCheckIn(currentDevotional.id, currentDevotional.currentDay, 'midday')
    : undefined;
  const todayEveningCheckIn = currentDevotional
    ? getCheckIn(currentDevotional.id, currentDevotional.currentDay, 'evening')
    : undefined;

  const todayDateStr = new Date().toISOString().split('T')[0];

  // Time-aware card visibility — hidden if completed, dismissed today, or wrong time
  const showCheckInCard =
    timeOfDay === 'afternoon' &&
    !!currentDevotional &&
    !todayCheckIn &&
    dismissedMiddayCardDate !== todayDateStr;
  const showEveningCard =
    (timeOfDay === 'evening' || timeOfDay === 'night') &&
    !!currentDevotional &&
    !todayEveningCheckIn &&
    dismissedEveningCardDate !== todayDateStr;

  const handleDismissMiddayCard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedMiddayCardDate(todayDateStr);
  };

  const handleDismissEveningCard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedEveningCardDate(todayDateStr);
  };

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

  // Empty state
  if (!currentDevotional) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
            <Animated.View
              entering={FadeIn.duration(1200)}
              style={{
                width: 40,
                height: 1,
                backgroundColor: colors.accent,
                marginBottom: 32,
                borderRadius: 1,
                opacity: 0.6,
              }}
            />

            <Animated.Text
              entering={FadeIn.duration(1000).delay(200)}
              style={{
                fontFamily: FontFamily.display,
                fontSize: 48,
                color: colors.text,
                letterSpacing: -1,
                marginBottom: 20,
              }}
            >
              Unfold
            </Animated.Text>

            <Animated.Text
              entering={FadeIn.duration(800).delay(500)}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 20,
                color: colors.textMuted,
                lineHeight: 30,
                marginBottom: 56,
              }}
            >
              The world's most personal{'\n'}Bible studies.
            </Animated.Text>

            <Animated.View entering={FadeIn.duration(600).delay(800)}>
              <AccentGlow color={colors.accent} intensity="medium" style={{ borderRadius: 14, alignSelf: 'flex-start' }}>
                <Pressable
                  onPress={handleCreateNew}
                  accessibilityRole="button"
                  accessibilityLabel="Begin your devotional journey"
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        paddingVertical: 18,
                        paddingHorizontal: 32,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.accent,
                        backgroundColor: pressed ? colors.accent : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 15,
                          color: pressed ? colors.background : colors.accent,
                          letterSpacing: 0.5,
                        }}
                      >
                        Begin Your Journey
                      </Text>
                    </View>
                  )}
                </Pressable>
              </AccentGlow>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const daysCompleted = currentDevotional.days.filter(d => d.isRead).length;
  const progressPercent = (daysCompleted / currentDevotional.totalDays) * 100;
  const currentDayData = currentDevotional.days.find(d => d.dayNumber === currentDevotional.currentDay);
  const isJourneyComplete = daysCompleted === currentDevotional.totalDays;
  const isFirstDay = currentDevotional.currentDay === 1 && daysCompleted === 0;
  const isLastDay = currentDevotional.currentDay === currentDevotional.totalDays;
  const showDay1Review = daysCompleted >= 1 && !hasSeenDay1Review && !isJourneyComplete;

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
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — greeting + orb */}
          <Animated.View
            entering={FadeInDown.delay(0).duration(600)}
            style={{
              paddingHorizontal: 24,
              paddingTop: 20,
              paddingBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', overflow: 'visible' }}>
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

              {/* Companion Orb + Tooltip */}
              <View style={{ position: 'relative', overflow: 'visible' }}>
                {showTooltip && tooltipMessage && (
                  <CompanionTooltip
                    message={tooltipMessage}
                    accentColor={colors.accent}
                    textColor={colors.text}
                    onTap={handleTooltipTap}
                    onDismiss={handleTooltipDismiss}
                  />
                )}
                <CompanionOrb
                  accentColor={colors.accent}
                  size={48}
                  onPress={handleCompanionOpen}
                  isActive={isCompanionActive}
                  showBadge={showBadge}
                />
              </View>
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
              onDismiss={handleDismissMiddayCard}
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
              onDismiss={handleDismissEveningCard}
              message={eveningMessage}
              icon={<MoonIcon size={16} color={colors.textSubtle} weight="light" />}
              accentColor={colors.accent}
              delay={200}
            />
          )}

          {/* Resume card */}
          {shouldShowResumeCard && resumeContext && resumeDevotional && (
            <Animated.View
              entering={FadeInDown.duration(520).delay(80)}
              style={{ paddingHorizontal: 24, marginTop: 16 }}
            >
              <Pressable
                onPress={handleResume}
                accessibilityRole="button"
                accessibilityLabel={`Resume ${resumeDevotional.title} day ${resumeContext.dayNumber}`}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
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
                    {resumeContext.route === 'journal' ? 'Resume your reflection' : 'Resume where you left off'}
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
              </Pressable>
            </Animated.View>
          )}

          {/* Main Journey Card */}
          <Animated.View
            entering={FadeInUp.delay(200).duration(600)}
            style={[{ paddingHorizontal: 24, marginTop: 20 }, journeyCardAnimStyle]}
          >
            {isJourneyComplete ? (
              <Pressable
                onPress={handleCreateNew}
                onPressIn={() => {
                  journeyCardScale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
                }}
                onPressOut={() => {
                  journeyCardScale.value = withSpring(1, { damping: 15, stiffness: 400 });
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
              </Pressable>
            ) : (
              <Pressable
                onPress={handleContinueReading}
                onPressIn={() => {
                  journeyCardScale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
                }}
                onPressOut={() => {
                  journeyCardScale.value = withSpring(1, { damping: 15, stiffness: 400 });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Continue ${currentDevotional.title}, day ${currentDevotional.currentDay} of ${currentDevotional.totalDays}`}
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
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

                  {currentDayData && (
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
                            marginBottom: 20,
                            opacity: 0.8,
                          }}
                          numberOfLines={2}
                        >
                          {currentDayData.scriptureReference}
                          {currentDayData.scriptureText ? ` — "${currentDayData.scriptureText.slice(0, 80).trim()}..."` : ''}
                        </Text>
                      )}
                    </>
                  )}

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

                  {/* New Journey - Secondary Action */}
                  <Pressable
                    onPress={handleCreateNew}
                    accessibilityRole="button"
                    accessibilityLabel="Start a new journey"
                    style={({ pressed }) => ({
                      marginTop: 12,
                      opacity: pressed ? 0.7 : 1,
                    })}
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
                  </Pressable>
                </View>
              </Pressable>
            )}
          </Animated.View>

          {/* Day 1 Review Prompt */}
          {showDay1Review && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(400)}
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
                  <Pressable
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
                  </Pressable>

                  <Pressable
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
                  </Pressable>

                  <Pressable
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
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Streak Box */}
          <Animated.View
            entering={FadeInUp.delay(350).duration(600)}
            style={{ paddingHorizontal: 24, marginTop: 24 }}
          >
            <StreakBox
              streakCount={streakCurrent}
              onPress={() => router.push('/(tabs)/(you)/streak-settings')}
            />
          </Animated.View>

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

      <HomeOnboardingTooltips />
      {!hasSeenFeatureOnboarding && <FeatureOnboarding />}

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

      <CompanionCheckInSheet
        visible={showCompanionSheet}
        onClose={() => setShowCompanionSheet(false)}
        onComplete={handleCompanionComplete}
        hasActiveSeries={hasActiveSeries}
        hasReadToday={hasReadToday}
        daysSinceLastOpen={daysSinceLastOpen}
        streakCurrent={streakCurrent}
        isFirstCompanionCheckIn={!hasSeenCompanionIntro}
      />

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="series"
      />
    </View>
  );
}
