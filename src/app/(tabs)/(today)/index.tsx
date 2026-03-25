import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Shadow } from '@/constants/shadows';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type MoodLevel } from '@/lib/store';
import { HeartIcon, HandIcon, XIcon } from 'phosphor-react-native';
import * as StoreReview from 'expo-store-review';
import { useQuery } from '@tanstack/react-query';
import { hasEntitlement, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { cancelAndRescheduleMiddayForTomorrow } from '@/lib/notifications';
import { StreakBox } from '@/components/StreakBox';
import { HomeOnboardingTooltips } from '@/components/HomeOnboardingTooltips';
import { StreakCelebration } from '@/components/StreakCelebration';
import { CheckInSheet } from '@/components/CheckInSheet';
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
import { RememberThisCard } from '@/components/home/RememberThisCard';
import { getBibleDbStatus, downloadBibleDb } from '@/lib/bible-db';

// Zone components
import { getContextSlotType } from '@/lib/context-slot-priority';
import { computeDevotionalState } from '@/components/home/compute-devotional-state';
import { DevotionalCard } from '@/components/home/DevotionalCard';
import { ContextSlot } from '@/components/home/ContextSlot';
import { GreetingRow } from '@/components/home/GreetingRow';
import { QuickActionsRow } from '@/components/home/QuickActionsRow';
import { SeriesCarousel } from '@/components/home/SeriesCarousel';
import { CompactStreakRow } from '@/components/home/CompactStreakRow';

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
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

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
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

  // Update time of day every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Silently download Bible DB in background if not yet ready
  const bibleDbTriggered = useRef(false);
  useEffect(() => {
    if (bibleDbTriggered.current) return;
    const { status } = getBibleDbStatus();
    if (status === 'ready' || status === 'downloading') return;
    bibleDbTriggered.current = true;
    // Fire-and-forget — no UI, no progress indicators
    downloadBibleDb().catch(() => {});
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

  // Streak celebration: show once when hasReadToday flips from false->true
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
    // Cancel today's midday notification and reschedule for tomorrow
    cancelAndRescheduleMiddayForTomorrow();
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
  // Midday: 12pm-5pm (afternoon)  |  Evening: 5pm-11:30pm
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

  const daysCompleted = currentDevotional ? currentDevotional.days.filter(d => d.isRead).length : 0;
  const progressPercent = currentDevotional ? (daysCompleted / currentDevotional.totalDays) * 100 : 0;
  const currentDayData = currentDevotional?.days.find(d => d.dayNumber === currentDevotional.currentDay) ?? null;

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

  // --- Derived state for zone components ---

  const isJourneyComplete = currentDevotional ? daysCompleted === currentDevotional.totalDays : false;
  const isFirstDay = currentDevotional ? currentDevotional.currentDay === 1 && daysCompleted === 0 : false;
  const isLastDay = currentDevotional ? currentDevotional.currentDay === currentDevotional.totalDays : false;
  const showDay1Review = daysCompleted >= 1 && !hasSeenDay1Review && !isJourneyComplete;

  // True when today's reading is done and the card is previewing tomorrow's content
  const isTomorrow = currentDevotional ? !isJourneyComplete && getReadingDayLabel() === 'Tomorrow' : false;

  // Extract a teaser sentence from tomorrow's bodyText to surface on the home card
  const homeTomorrowTeaser = useMemo(() => {
    if (!isTomorrow || !currentDayData?.bodyText) return null;
    const stripped = currentDayData.bodyText
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/^---$/gm, '')
      .trim();
    const firstSentence = stripped.match(/^.+?[.!?]/s);
    return firstSentence ? firstSentence[0].trim() : stripped.slice(0, 130) + '\u2026';
  }, [isTomorrow, currentDayData?.bodyText]);

  const getCtaText = () => {
    if (isFirstDay && streakCurrent === 0) return 'Begin Your Journey';
    if (isFirstDay) return 'Build Your Rhythm';
    if (isLastDay && !isJourneyComplete) return 'Finish Your Series';
    if (streakCurrent >= 7) return 'Deepen Your Practice';
    if (streakCurrent >= 3) return 'Stay Rooted';
    if (streakCurrent >= 1) return 'Keep Going';
    return 'Continue Reading';
  };

  // Compute context slot type
  const validBridgeText = bridgeText && bridgeText.length > 20 && /[.!?…"']$/.test(bridgeText.trim()) ? bridgeText : undefined;
  const slotType = getContextSlotType({
    hasResumeContext: shouldShowResumeCard,
    currentHour,
    currentMinute,
    hasDevotional: !!currentDevotional,
    hasReadToday,
    hasMiddayCheckIn: !!todayCheckIn,
    hasEveningCheckIn: !!todayEveningCheckIn,
    hasBridgeText: !!validBridgeText,
    isBridgeLoading: bridgeLoading && !!bridgeInput,
    hasBridgeInput: !!bridgeInput,
  });

  // Compute resume props for context slot
  const resumeProps = shouldShowResumeCard && resumeContext && resumeDevotional ? {
    onPress: handleResume,
    label: resumeContext.route === 'journal'
      ? (resumeDevotional.days.find(d => d.dayNumber === resumeContext.dayNumber)?.isRead
        ? `Add to Day ${resumeContext.dayNumber}`
        : 'Resume your reflection')
      : 'Resume where you left off',
    title: `${resumeDevotional.title} · Day ${resumeContext.dayNumber}${resumeContext.dayTitle ? `: ${resumeContext.dayTitle}` : ''}`,
    timeAgo: formatResumeRelativeTime(resumeContext.touchedAt),
  } : undefined;

  // Compute devotional card state
  const devotionalState = computeDevotionalState({
    currentDevotional: currentDevotional ?? null,
    currentDayData,
    hasReadToday,
    isJourneyComplete,
    isPreparing: isPreparingCurrentDay || (!currentDayData && !!currentDevotional),
    daysCompleted,
    totalDays: currentDevotional?.totalDays ?? 0,
    progress: progressPercent,
    tomorrowTeaser: homeTomorrowTeaser,
    onContinue: handleContinueReading,
    onCreateNew: handleCreateNew,
    ctaText: getCtaText(),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Embers — reward for completing today's reading */}
        {hasReadToday && currentDevotional && <GoldEmberField streakLevel={streakCurrent} />}
        {/* Ambient embers for cinematic feel (empty state) */}
        {!currentDevotional && <GoldEmberField density="low" active style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />}

        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Zone 1: Greeting */}
          <GreetingRow
            userName={user?.name}
            onAvatarPress={() => router.push('/(tabs)/(you)')}
          />

          {/* Zone 2: Context Slot */}
          <ContextSlot
            slotType={slotType}
            colors={colors}
            onMiddayPress={handleCheckIn}
            middayMessage={middayMessage}
            onEveningPress={handleEveningWindDown}
            eveningMessage={eveningMessage}
            bridgeText={validBridgeText}
            resumeProps={resumeProps}
          />

          {/* Remember This — daily random highlight */}
          <RememberThisCard />

          {/* Zone 3: Hero Devotional */}
          <View ref={journeyCardRef} collapsable={false}>
            <DevotionalCard state={devotionalState} />
          </View>

          {/* Zone 4: Quick Actions */}
          <QuickActionsRow
            onJournalPress={() => router.push('/(tabs)/(journal)')}
            onCompanionPress={() => router.push('/(tabs)/(ask)')}
            onBiblePress={() => router.push('/bible')}
          />

          {/* Zone 5: Series Carousel */}
          <SeriesCarousel />

          {/* Day 1 Review Prompt */}
          {showDay1Review && (
            <Animated.View
              entering={entering(FadeIn.duration(400).delay(200))}
              style={styles.day1ReviewWrapper}
            >
              <View
                style={[
                  styles.day1ReviewCard,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border,
                    ...Shadow.sm,
                  },
                ]}
              >
                <Text
                  style={[styles.day1ReviewTitle, { color: colors.text }]}
                >
                  How's this feeling so far?
                </Text>
                <Text
                  style={[styles.day1ReviewSubtitle, { color: colors.textSubtle }]}
                >
                  Your honest take helps us get better.
                </Text>

                <View style={styles.day1ReviewOptions}>
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleDay1ReviewOption('love')}
                    style={[styles.day1ReviewOption, { backgroundColor: colors.buttonBackground }]}
                  >
                    <HeartIcon size={16} color={colors.accent} weight="light" />
                    <Text style={[styles.day1ReviewOptionText, { color: colors.text }]}>
                      Love it
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleDay1ReviewOption('okay')}
                    style={[styles.day1ReviewOption, { backgroundColor: colors.buttonBackground }]}
                  >
                    <HandIcon size={16} color={colors.textMuted} weight="light" />
                    <Text style={[styles.day1ReviewOptionText, { color: colors.text }]}>
                      It's okay
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => handleDay1ReviewOption('not-for-me')}
                    style={[styles.day1ReviewOption, { backgroundColor: colors.buttonBackground }]}
                  >
                    <XIcon size={16} color={colors.textMuted} weight="light" />
                    <Text style={[styles.day1ReviewOptionText, { color: colors.text }]}>
                      Not for me
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Zone 6: Streak */}
          <View ref={streakBoxRef} collapsable={false}>
            <Animated.View
              entering={entering(FadeIn.delay(200).duration(400))}
              style={styles.streakWrapper}
            >
              <StreakBox
                streakCount={streakCurrent}
                onPress={() => router.push('/(tabs)/(you)/streak-settings')}
              />
            </Animated.View>
          </View>

          {/* Premium Nudge Card — contextual, inline upsell */}
          {premiumNudge && (
            <View style={styles.premiumNudgeWrapper}>
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

const styles = StyleSheet.create({
  day1ReviewWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  day1ReviewCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing['5'],
  },
  day1ReviewTitle: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.lg,
    marginBottom: Spacing['1'],
  },
  day1ReviewSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    marginBottom: Spacing['4'],
  },
  day1ReviewOptions: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  day1ReviewOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing['3'],
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  day1ReviewOptionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
  },
  streakWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['6'],
  },
  premiumNudgeWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
  },
});
