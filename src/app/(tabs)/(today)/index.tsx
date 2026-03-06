import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { ColorTheme } from '@/constants/colors';
import { useUnfoldStore } from '@/lib/store';
import { PlusIcon, SunIcon, MoonIcon, CloudIcon, ChatCircleDotsIcon, HeartIcon, HandIcon, XIcon } from 'phosphor-react-native';
import * as StoreReview from 'expo-store-review';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { StreakDisplay } from '@/components/StreakDisplay';
import { StreakBox } from '@/components/StreakBox';
import { HomeOnboardingTooltips } from '@/components/HomeOnboardingTooltips';
import { FeatureOnboarding } from '@/components/FeatureOnboarding';
import { CheckInSheet } from '@/components/CheckInSheet';
import { syncWidgets } from '@/lib/widget-bridge';
import { generateBridge, type BridgeCheckIn } from '@/lib/bridge-service';
import { getMessageForToday, MIDDAY_MESSAGES, EVENING_MESSAGES } from '@/constants/check-in-messages';

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

function MiddayCheckInCard({ colors, onPress, message }: { colors: ColorTheme; onPress: () => void; message: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(150)}
      style={{ paddingHorizontal: 24, marginTop: 12 }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <View
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            borderLeftWidth: 3,
            borderLeftColor: colors.accent,
            paddingVertical: 14,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
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
          <View style={{ marginLeft: 12 }}>
            <ChatCircleDotsIcon size={16} color={colors.textSubtle} weight="light" />
          </View>
        </View>
      </Pressable>
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

function EveningWindDownCard({ colors, onPress, message }: { colors: ColorTheme; onPress: () => void; message: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(200)}
      style={{ paddingHorizontal: 24, marginTop: 8 }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <View
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            borderLeftWidth: 3,
            borderLeftColor: colors.accent + '80',
            paddingVertical: 14,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
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
          <View style={{ marginLeft: 12 }}>
            <MoonIcon size={16} color={colors.textSubtle} weight="light" />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

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

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay());
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);

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
    queryFn: () => hasEntitlement('premium'),
    enabled: isRevenueCatEnabled(),
    staleTime: 1000 * 60,
  });

  const isPremium = premiumResult?.ok ? premiumResult.data : user?.isPremium ?? false;

  useEffect(() => {
    if (premiumResult?.ok && premiumResult.data !== user?.isPremium) {
      updateUser({ isPremium: premiumResult.data });
    }
  }, [premiumResult, user?.isPremium, updateUser]);

  // Sync widget data whenever home screen mounts or re-focuses
  useFocusEffect(
    useCallback(() => {
      syncWidgets();
    }, [])
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
      router.push('/paywall');
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

  const handleEveningWindDown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(today)/evening-wind-down');
  };

  // Check if midday check-in already completed today
  const todayCheckIn = currentDevotional
    ? getCheckIn(currentDevotional.id, currentDevotional.currentDay, 'midday')
    : undefined;

  // Time-aware card visibility
  const showCheckInCard = timeOfDay === 'afternoon' && !!currentDevotional && !todayCheckIn;
  const showEveningCard = !!currentDevotional;

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
                      alignSelf: 'flex-start',
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
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(700)}
            style={{
              paddingHorizontal: 24,
              paddingTop: 20,
              paddingBottom: 12,
            }}
          >
            <View
              style={{
                width: 24,
                height: 1.5,
                backgroundColor: colors.accent,
                marginBottom: 16,
                borderRadius: 1,
                opacity: 0.5,
              }}
            />
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
          </Animated.View>

          {/* Daily Bridge — personalized transition from yesterday */}
          {bridgeLoading && bridgeInput && (
            <BridgeShimmer colors={colors} />
          )}
          {bridgeText && !bridgeLoading && (
            <DailyBridgeCard text={bridgeText} colors={colors} />
          )}

          {/* Notification cards — above journey card */}
          {showCheckInCard && (
            <MiddayCheckInCard colors={colors} onPress={handleCheckIn} message={middayMessage} />
          )}
          {showEveningCard && (
            <EveningWindDownCard colors={colors} onPress={handleEveningWindDown} message={eveningMessage} />
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
            entering={FadeInDown.duration(700).delay(100)}
            style={{ paddingHorizontal: 24, marginTop: 20 }}
          >
            {isJourneyComplete ? (
              <Pressable
                onPress={handleCreateNew}
                accessibilityRole="button"
                accessibilityLabel="Start a new journey"
                style={({ pressed }) => ({
                  borderRadius: 20,
                  overflow: 'hidden',
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 28,
                    alignItems: 'center',
                    backgroundColor: colors.inputBackground,
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
                accessibilityRole="button"
                accessibilityLabel={`Continue ${currentDevotional.title}, day ${currentDevotional.currentDay} of ${currentDevotional.totalDays}`}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  overflow: 'hidden',
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 24,
                    backgroundColor: colors.inputBackground,
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

                <View style={{ gap: 10 }}>
                  <Pressable
                    onPress={() => handleDay1ReviewOption('love')}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      backgroundColor: pressed ? colors.accent + '15' : colors.buttonBackground,
                    })}
                  >
                    <HeartIcon size={18} color={colors.accent} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.text }}>
                      I love it
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleDay1ReviewOption('okay')}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      backgroundColor: pressed ? colors.accent + '15' : colors.buttonBackground,
                    })}
                  >
                    <HandIcon size={18} color={colors.textMuted} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.text }}>
                      It's okay
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleDay1ReviewOption('not-for-me')}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      backgroundColor: pressed ? colors.accent + '15' : colors.buttonBackground,
                    })}
                  >
                    <XIcon size={18} color={colors.textMuted} weight="light" />
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 14, color: colors.text }}>
                      Not for me
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Streak Box */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(300)}
            style={{ paddingHorizontal: 24, marginTop: 24 }}
          >
            <StreakBox
              streakCount={streakCurrent}
              onPress={() => router.push('/(tabs)/(you)/streak-settings')}
            />
          </Animated.View>
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
    </View>
  );
}
