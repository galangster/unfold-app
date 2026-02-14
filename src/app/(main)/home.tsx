import { useMemo, useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, AccessibilityInfo } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { ColorTheme } from '@/constants/colors';
import { THEME_CATEGORIES } from '@/constants/devotional-types';
import { useUnfoldStore } from '@/lib/store';
import { Plus, BookOpen, PenLine, Settings, Flame, Bookmark, Highlighter } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { StreakDisplay } from '@/components/StreakDisplay';
import { NamePromptModal } from '@/components/NamePromptModal';

function getGreeting(): string {
  const hour = new Date().getHours();
  // 12:30 AM = 0.5 hours, still "night"
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

const INSPIRATIONAL_QUOTES = [
  { text: "Be still, and know that I am God.", reference: "Psalm 46:10" },
  { text: "The Lord is my shepherd; I shall not want.", reference: "Psalm 23:1" },
  { text: "Trust in the Lord with all your heart.", reference: "Proverbs 3:5" },
  { text: "Cast all your anxiety on him because he cares for you.", reference: "1 Peter 5:7" },
  { text: "I can do all things through Christ who strengthens me.", reference: "Philippians 4:13" },
  { text: "The steadfast love of the Lord never ceases.", reference: "Lamentations 3:22" },
  { text: "He makes me lie down in green pastures.", reference: "Psalm 23:2" },
  { text: "For I know the plans I have for you.", reference: "Jeremiah 29:11" },
];

const UNFOLD_TAGLINES = [
  'Unfold the story\nGod is writing in you.',
  'Unfold your faith,\none day at a time.',
  'Unfold what has\nalways been there.',
  'Unfold the sacred\nin the ordinary.',
];

// Animated progress bar component with spring physics
function AnimatedProgressBar({ progress, colors }: { progress: number; colors: ColorTheme }) {
  const animatedProgress = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        // Spring animation for progress
        animatedProgress.value = withSpring(progress, {
          damping: 15,
          stiffness: 100,
          mass: 0.8,
        });
        // Fade in glow effect
        glowOpacity.value = withTiming(0.5, { duration: 600 });
      }, 400);

      return () => clearTimeout(timer);
    }, [progress, animatedProgress, glowOpacity])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value}%`,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View
      style={{
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Glow effect behind progress */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: -4,
            bottom: -4,
            backgroundColor: colors.accent,
            opacity: 0.3,
            borderRadius: 4,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: colors.accent,
            borderRadius: 2,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const resumeContext = useUnfoldStore((s) => s.resumeContext);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const bookmarkCount = useUnfoldStore((s) => s.bookmarks.length);

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

  // Show name prompt if user is authenticated but doesn't have a display name
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  useEffect(() => {
    // Check if we should show the name prompt
    // Show if: user is signed in with Apple but has no display name
    const shouldPrompt =
      user?.authProvider === 'apple' &&
      !user?.authDisplayName &&
      !user?.name;

    if (shouldPrompt) {
      // Small delay to let the screen settle
      const timer = setTimeout(() => {
        setShowNamePrompt(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.authProvider, user?.authDisplayName, user?.name]);

  // Get a quote based on the day
  const dailyQuote = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return INSPIRATIONAL_QUOTES[dayOfYear % INSPIRATIONAL_QUOTES.length];
  }, []);

  const currentDevotional = devotionals.find((d) => d.id === currentDevotionalId);
  const resumeDevotional = useMemo(() => {
    if (!resumeContext?.devotionalId) return null;
    return devotionals.find((d) => d.id === resumeContext.devotionalId) ?? null;
  }, [resumeContext?.devotionalId, devotionals]);

  const shouldShowResumeCard = useMemo(() => {
    if (!resumeContext || !resumeDevotional) return false;
    if (resumeContext.route === 'journal') return true;
    return resumeContext.dayNumber !== resumeDevotional.currentDay;
  }, [resumeContext, resumeDevotional]);

  const weeklyRecap = useMemo(() => {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - 6);
    windowStart.setHours(0, 0, 0, 0);
    const windowStartMs = windowStart.getTime();

    let daysReadThisWeek = 0;
    let journeysTouched = 0;
    const weeklyThemeCounts = new Map<string, number>();

    devotionals.forEach((devotional) => {
      const weeklyReadDays = devotional.days.filter(
        (day) => day.readAt && new Date(day.readAt).getTime() >= windowStartMs
      );

      daysReadThisWeek += weeklyReadDays.length;
      if (weeklyReadDays.length > 0) {
        journeysTouched += 1;

        if (devotional.themeCategory) {
          weeklyThemeCounts.set(
            devotional.themeCategory,
            (weeklyThemeCounts.get(devotional.themeCategory) ?? 0) + weeklyReadDays.length
          );
        }
      }
    });

    const reflectionsThisWeek = journalEntries.filter((entry) => {
      const touchedAt = entry.updatedAt || entry.createdAt;
      return new Date(touchedAt).getTime() >= windowStartMs;
    }).length;

    const estimatedMinutes = daysReadThisWeek * (user?.readingDuration ?? 15);

    let headline = 'Keep your rhythm this week';
    if (daysReadThisWeek > 0 && reflectionsThisWeek > 0) {
      headline = `You showed up ${daysReadThisWeek} day${daysReadThisWeek === 1 ? '' : 's'} this week`;
    } else if (daysReadThisWeek > 0) {
      headline = `You spent about ${estimatedMinutes} min with God this week`;
    } else if (reflectionsThisWeek > 0) {
      headline = `You captured ${reflectionsThisWeek} reflection${reflectionsThisWeek === 1 ? '' : 's'} this week`;
    }

    const topTheme = [...weeklyThemeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topThemeId = topTheme?.[0] ?? null;
    const topThemeName = topThemeId
      ? (THEME_CATEGORIES.find((theme) => theme.id === topThemeId)?.name ?? topThemeId)
      : null;

    return {
      headline,
      daysReadThisWeek,
      reflectionsThisWeek,
      journeysTouched,
      topThemeId,
      topThemeName,
      hasActivity: daysReadThisWeek > 0 || reflectionsThisWeek > 0,
    };
  }, [devotionals, journalEntries, user?.readingDuration]);

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
    router.push('/(main)/reading');
  };

  const handleResume = () => {
    if (!resumeContext || !resumeDevotional) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentDevotional(resumeContext.devotionalId);

    if (resumeContext.route === 'journal') {
      router.push({
        pathname: '/(main)/journal',
        params: {
          devotionalId: resumeContext.devotionalId,
          dayNumber: String(resumeContext.dayNumber),
        },
      });
      return;
    }

    router.push({
      pathname: '/(main)/reading',
      params: {
        dayNumber: String(resumeContext.dayNumber),
      },
    });
  };

  const handleOpenStats = (themeId?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (themeId) {
      router.push({
        pathname: '/(main)/stats',
        params: { theme: themeId },
      });
      return;
    }

    router.push('/(main)/stats');
  };

  const handleCreateNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isPremium && devotionals.length >= 1) {
      router.push('/paywall');
    } else {
      router.push('/onboarding');
    }
  };

  // Rotating taglines for the empty state
  const tagline = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return UNFOLD_TAGLINES[dayOfYear % UNFOLD_TAGLINES.length];
  }, []);

  // Empty state
  if (!currentDevotional) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
            {/* Gentle breathing accent line */}
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

            {/* App name - large and quiet */}
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

            {/* Tagline */}
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
              {tagline}
            </Animated.Text>

            {/* CTA - understated, inviting */}
            <Animated.View entering={FadeIn.duration(600).delay(800)}>
              <Pressable
                onPress={handleCreateNew}
                accessibilityRole="button"
                accessibilityLabel="Begin your devotional journey"
                accessibilityHint="Starts a new personalized devotional series"
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

  const getCtaText = () => {
    const streak = useUnfoldStore.getState().streakCurrent;
    if (isFirstDay && streak === 0) return 'Begin Your Journey';
    if (isFirstDay) return 'Build Your Rhythm';
    if (isLastDay && !isJourneyComplete) return 'Finish Your Journey';
    if (streak >= 7) return 'Deepen Your Practice';
    if (streak >= 3) return 'Stay Rooted';
    if (streak >= 1) return 'Keep Going';
    return 'Continue Reading';
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(700)}
            style={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 8,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 15,
                  color: colors.textSubtle,
                  marginBottom: 4,
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
                <StreakDisplay compact />
              </View>
            </View>

            {/* Settings icon */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(main)/settings');
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => ({
                padding: 10,
                marginTop: 4,
                opacity: pressed ? 0.5 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              accessibilityHint="Open app settings and preferences"
            >
              <Settings size={22} color={colors.textSubtle} strokeWidth={1.5} />
            </Pressable>
          </Animated.View>

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
                accessibilityHint={resumeContext.route === 'journal' ? 'Returns to your journal reflection' : 'Continues reading where you left off'}
                accessibilityState={{ selected: false }}
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

          {/* Daily quote - editorial style */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(100)}
            style={{ paddingHorizontal: 24, marginTop: shouldShowResumeCard ? 20 : 28 }}
          >
            <View
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={`Daily scripture: ${dailyQuote.text} from ${dailyQuote.reference}`}
              style={{
                paddingVertical: 20,
                paddingHorizontal: 20,
                borderLeftWidth: 2,
                borderLeftColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 16,
                  color: colors.textMuted,
                  lineHeight: 26,
                  marginBottom: 10,
                }}
              >
                "{dailyQuote.text}"
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 11,
                  color: colors.accent,
                  letterSpacing: 0.8,
                  opacity: 0.8,
                }}
              >
                {dailyQuote.reference.toUpperCase()}
              </Text>
            </View>
          </Animated.View>

          {/* Main Journey Card */}
          <Animated.View
            entering={FadeInDown.duration(700).delay(200)}
            style={{ paddingHorizontal: 24, marginTop: 28 }}
          >
            {isJourneyComplete ? (
              // Completed state
              <Pressable
                onPress={handleCreateNew}
                accessibilityRole="button"
                accessibilityLabel="Start a new journey"
                accessibilityHint="Creates a new devotional series when your current journey is complete"
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
                  {/* Accent line */}
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

                  {/* CTA */}
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
              // In-progress Journey Card
              <Pressable
                onPress={handleContinueReading}
                accessibilityRole="button"
                accessibilityLabel={`Continue ${currentDevotional.title}, day ${currentDevotional.currentDay} of ${currentDevotional.totalDays}`}
                accessibilityHint={`${getCtaText()}. ${Math.round(progressPercent)} percent complete`}
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
                          fontFamily: FontFamily.mono,
                          fontSize: 11,
                          color: colors.textMuted,
                          letterSpacing: 0.5,
                        }}
                      >
                        {getReadingDayLabel()} · Day {currentDevotional.currentDay}/{currentDevotional.totalDays}
                      </Text>
                    </View>
                  </View>

                  {/* Day title - THE HERO - Shared Element Transition */}
                  {currentDayData && (
                    <Text
                      sharedTransitionTag={`devotional-title-${currentDevotional.id}-${currentDevotional.currentDay}`}
                      style={{
                        fontFamily: FontFamily.display,
                        fontSize: 30,
                        color: colors.text,
                        lineHeight: 38,
                        marginBottom: 20,
                        letterSpacing: -0.3,
                      }}
                    >
                      {currentDayData.title}
                    </Text>
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
                          fontFamily: FontFamily.mono,
                          fontSize: 12,
                          color: colors.accent,
                          opacity: 0.7,
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
                    accessibilityHint={!isPremium && devotionals.length >= 1 ? "Premium feature. Opens upgrade options." : "Starts a new devotional journey alongside your current one"}
                    accessibilityState={{ disabled: !isPremium && devotionals.length >= 1 }}
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
                      <Plus size={14} color={colors.textSubtle} strokeWidth={2} />
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

          {/* Quick links - side by side, full width */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(350)}
            style={{ paddingHorizontal: 24, marginTop: 24 }}
          >
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/(main)/past-devotionals');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Past Journeys"
                  accessibilityHint={`View your ${devotionals.length} saved devotional journeys`}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <View
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 18,
                    }}
                  >
                    <BookOpen size={20} color={colors.accent} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                        marginBottom: 3,
                      }}
                    >
                      Past Journeys
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textSubtle,
                      }}
                    >
                      {devotionals.length} {devotionals.length === 1 ? 'journey' : 'journeys'}
                    </Text>
                  </View>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/(main)/my-content');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="My Content"
                  accessibilityHint="View your journal, highlights, and bookmarks"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <View
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 18,
                    }}
                  >
                    <PenLine size={20} color={colors.accent} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                        marginBottom: 3,
                      }}
                    >
                      My Content
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textSubtle,
                      }}
                    >
                      Journal & saves
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* Saved Passages row */}
          {bookmarkCount > 0 && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(375)}
              style={{ paddingHorizontal: 24, marginTop: 12 }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/(main)/saved-passages');
                }}
                accessibilityRole="button"
                accessibilityLabel="Saved Passages"
                accessibilityHint={`View your ${bookmarkCount} saved scripture passages`}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Bookmark size={20} color={colors.accent} strokeWidth={1.5} />
                  <View style={{ marginLeft: 14, flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      Saved Passages
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 13,
                        color: colors.textSubtle,
                      }}
                    >
                      {bookmarkCount} {bookmarkCount === 1 ? 'passage' : 'passages'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* Weekly recap - simplified */}
          {weeklyRecap.hasActivity && (
            <Animated.View
              entering={FadeInDown.duration(600).delay(388)}
              style={{ paddingHorizontal: 24, marginTop: 12 }}
            >
              <Pressable
                onPress={() => handleOpenStats(weeklyRecap.topThemeId ?? undefined)}
                accessibilityRole="button"
                accessibilityLabel="Weekly activity recap"
                accessibilityHint={`This week: ${weeklyRecap.headline}. Tap to view detailed stats`}
                accessibilityValue={{ text: `${weeklyRecap.daysReadThisWeek} days read, ${weeklyRecap.reflectionsThisWeek} reflections` }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Flame size={22} color={colors.accent} strokeWidth={1.5} />
                  <View style={{ marginLeft: 14, flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.text,
                        lineHeight: 22,
                      }}
                    >
                      {weeklyRecap.headline}
                    </Text>
                    {weeklyRecap.topThemeName && (
                      <Text
                        style={{
                          fontFamily: FontFamily.ui,
                          fontSize: 13,
                          color: colors.textSubtle,
                          marginTop: 2,
                        }}
                      >
                        Focus: {weeklyRecap.topThemeName}
                      </Text>
                    )}
                  </View>
                  <View
                    style={{
                      backgroundColor: colors.accent + '20',
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      marginLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.mono,
                        fontSize: 12,
                        color: colors.accent,
                        letterSpacing: 0.5,
                      }}
                    >
                      {weeklyRecap.daysReadThisWeek} days
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Name Prompt Modal - shown if user signed in with Apple but has no name */}
      <NamePromptModal
        visible={showNamePrompt}
        onComplete={() => setShowNamePrompt(false)}
      />
    </View>
  );
}
