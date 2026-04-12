import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
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
import { RippleLoader } from '@/components/RippleLoader';
import { useUIState } from '@/lib/ui-state';
import { StreakCelebration } from '@/components/StreakCelebration';
import { CheckInSheet } from '@/components/CheckInSheet';
import { AmbientArtCanvas } from '@/components/home/AmbientArtCanvas';
import { syncWidgets } from '@/lib/widget-bridge';
import { generateBridge, type BridgeCheckIn } from '@/lib/bridge-service';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { useCreationGate } from '@/hooks/useCreationGate';
import { ExclusiveOfferSheet } from '@/components/ExclusiveOfferSheet';
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { getContentAwareMiddayMessage, getContentAwareEveningMessage } from '@/constants/check-in-messages';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { submitGenerationJob, findCompletedJob, fetchJobResult, ApiError } from '@/lib/generation-api';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { RememberThisCard } from '@/components/home/RememberThisCard';
import { getBibleDbStatus, downloadBibleDb } from '@/lib/bible-db';

// Must match the key used in generating.tsx
const INFLIGHT_KEY = 'inflight-generation-job';

// Zone components
import { getContextSlotType } from '@/lib/context-slot-priority';
import { computeDevotionalState } from '@/components/home/compute-devotional-state';
import { DevotionalCard } from '@/components/home/DevotionalCard';
import { ContextSlot } from '@/components/home/ContextSlot';
import { GreetingRow } from '@/components/home/GreetingRow';
import { BentoGrid } from '@/components/home/BentoGrid';
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
  const clearResumeContext = useUnfoldStore((s) => s.clearResumeContext);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const addCheckIn = useUnfoldStore((s) => s.addCheckIn);
  const getCheckIn = useUnfoldStore((s) => s.getCheckIn);
  const hasSeenDay1Review = useUnfoldStore((s) => s.hasSeenDay1Review);
  const setHasSeenDay1Review = useUnfoldStore((s) => s.setHasSeenDay1Review);
  const hasSeenHomeTooltips = useUnfoldStore((s) => s.hasSeenHomeTooltips);
  const addGeneratedDay = useUnfoldStore((s) => s.addGeneratedDay);
  const archiveCurrentDevotional = useUnfoldStore((s) => s.archiveCurrentDevotional);
  const markDayAsRevealed = useUnfoldStore((s) => s.markDayAsRevealed);
  const isReturningUser = useUnfoldStore((s) => s.isReturningUser());

  const checkIns = useUnfoldStore((s) => s.checkIns);

  // Auto-navigate to reading when coming from the reveal screen.
  // The reveal sets resumeContext with a fresh touchedAt timestamp,
  // then navigates here. We detect the fresh context and immediately
  // push to reading — avoids the home screen flash.
  useEffect(() => {
    if (!resumeContext?.touchedAt) return;
    // Only auto-navigate for reading context (set by reveal.tsx).
    // Journal context also sets resumeContext but should NOT trigger
    // auto-navigate to reading — that steals focus from the journal.
    if (resumeContext.route !== 'reading') return;
    const age = Date.now() - new Date(resumeContext.touchedAt).getTime();
    if (age < 3000) {
      // Fresh from reveal — auto-navigate and clear
      clearResumeContext();
      router.push({
        pathname: '/(tabs)/(today)/reading',
        params: { dayNumber: String(resumeContext.dayNumber) },
      });
    }
  }, [resumeContext?.touchedAt]);

  // Safe area insets for tooltip y-offset calculation
  const insets = useSafeAreaInsets();

  // Tooltip target refs — measured via measureInWindow after a delay
  // so entering animations have settled (onLayout fires too early on Fabric).
  const readingRef = useRef<View>(null);
  const streakRef = useRef<View>(null);

  // Scroll tracking for AmbientArtCanvas fade
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay());
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();

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

  // Resume inflight generation job from a previous app session (app-kill recovery)
  const inflightResumeAttempted = useRef(false);
  useEffect(() => {
    if (inflightResumeAttempted.current) return;
    inflightResumeAttempted.current = true;

    const raw = mmkvStorage.getItem(INFLIGHT_KEY) as string | null;
    if (!raw) return;

    try {
      const inflight = JSON.parse(raw) as {
        jobId: string;
        devotionalId?: string;
        submittedAt: number;
      };
      // Only resume if not expired (15 min)
      if (Date.now() - inflight.submittedAt < 15 * 60 * 1000) {
        console.log('[home] Resuming inflight generation job from MMKV:', inflight.jobId);
        // Navigate to generating screen — it will pick up the inflight job from MMKV
        router.replace('/generating');
        return;
      }
      // Expired — clean up
      mmkvStorage.removeItem(INFLIGHT_KEY);
    } catch {
      mmkvStorage.removeItem(INFLIGHT_KEY);
    }
  }, [router]);

  // Check premium status from RevenueCat
  const { data: premiumResult } = useQuery({
    queryKey: ['revenuecat', 'premium'],
    queryFn: () => hasEntitlement('Unfold Premium'),
    enabled: isRevenueCatEnabled(),
    staleTime: 1000 * 60,
  });

  const isPremium = premiumResult?.ok ? premiumResult.data : user?.isPremium ?? false;

  // Premium sync handled globally by useRevenueCatSync in _layout.tsx

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

  // Server-side generation handles content creation. The client only tracks
  // whether the current day's content hasn't arrived yet (shows a loading card).
  // Never show "preparing" for days beyond today's calendar position — those are
  // tomorrow's content and shouldn't trigger auto-generation.
  const isPreparingCurrentDay = useMemo(() => {
    if (!currentDevotional || currentDevotional.generationMode !== 'progressive') return false;
    const dayExists = (currentDevotional.days ?? []).some(d => d.dayNumber === currentDevotional.currentDay);
    if (dayExists) return false;

    // Calendar gate: don't prepare days beyond today's position
    if (currentDevotional.seriesStartDate) {
      const startDate = new Date(currentDevotional.seriesStartDate);
      const now = new Date();
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const calendarDay = Math.floor((today.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      if (currentDevotional.currentDay > calendarDay) return false;
    }

    return true;
  }, [currentDevotional]);

  // Content discovery flow: check for server-generated content before submitting a new job.
  // 1. Check if a completed job already exists on the server (e.g., from midnight cron)
  // 2. If found, apply it directly — no generation needed
  // 3. If not, submit a new generation job as a client-side fallback
  // 4. If 409 (already generated), recover by fetching the existing job result
  const autoGenAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isPreparingCurrentDay || !currentDevotional) return;

    const devId = currentDevotional.id;
    const dayNum = currentDevotional.currentDay;
    const key = `${devId}-${dayNum}`;
    if (autoGenAttemptedRef.current === key) return;

    let cancelled = false;

    // Normalize a discovered day payload so it has sync-compatible identity fields.
    // Without this, the day has no `id` and sync pull appends a duplicate row.
    const normalizeDayForSync = (day: any) => ({
      ...day,
      id: day.id ?? `day-${devId}-${dayNum}`,
      devotionalId: day.devotionalId ?? devId,
      dayNumber: day.dayNumber ?? dayNum,
    });

    (async () => {
      try {
        // Step 1: Check if content already exists on server
        const existing = await findCompletedJob(devId, dayNum);
        if (cancelled) return;

        if (existing?.result?.devotionalDay) {
          addGeneratedDay(devId, normalizeDayForSync(existing.result.devotionalDay));
          autoGenAttemptedRef.current = key;
          console.log('[home] Applied existing server content for day', dayNum);
          return;
        }

        // Step 2: No content exists — submit generation job
        const resp = await submitGenerationJob({
          devotionalId: devId,
          dayNumber: dayNum,
          jobType: 'day',
        });
        if (cancelled) return;
        autoGenAttemptedRef.current = key;
        console.log('[home] Submitted generation job:', resp.jobId);
      } catch (err) {
        if (cancelled) return;

        // Handle 409 with structured error — server already has this day's content
        if (err instanceof ApiError && err.status === 409 && err.existingJobId) {
          const jobResult = await fetchJobResult(err.existingJobId).catch(() => null);
          if (cancelled) return;
          if (jobResult?.result?.devotionalDay) {
            addGeneratedDay(devId, normalizeDayForSync(jobResult.result.devotionalDay));
            autoGenAttemptedRef.current = key;
            return;
          }
        }
        // Don't set autoGenAttemptedRef — allow retry on next render cycle
        console.warn('[home] Auto-generation failed, will retry:', err instanceof Error ? err.message : err);
      }
    })();

    return () => { cancelled = true; };
  }, [isPreparingCurrentDay, currentDevotional]);

  // Daily Bridge — generate a personalized transition from yesterday to today
  const bridgeInput = useMemo(() => {
    if (!currentDevotional || !user?.name) return null;
    if (currentDevotional.currentDay <= 1) return null; // No bridge for Day 1

    const todayDay = (currentDevotional.days ?? []).find((d) => d.dayNumber === currentDevotional.currentDay);
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
    enabled: isPremium && !!bridgeInput,
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

  const getReadingDayLabel = (): 'Yesterday' | 'Today' | 'Tomorrow' => {
    if (!currentDevotional) return 'Today';
    const dayData = (currentDevotional.days ?? []).find(d => d.dayNumber === currentDevotional.currentDay);
    if (!dayData) return 'Today';

    const todayStr = new Date().toDateString();

    // Case 1: Current day already read today — it's today's completed reading.
    // (In the old system this returned 'Tomorrow' because currentDay advanced immediately.
    // Now currentDay stays put until the server cron advances it overnight.)
    if (dayData.isRead && dayData.readAt && new Date(dayData.readAt).toDateString() === todayStr) {
      return 'Today';
    }

    // Case 2: Current day NOT read — check if it's overdue
    // If the content was generated before today, the user missed it yesterday
    if (!dayData.isRead && dayData.generatedAt) {
      const genDate = new Date(dayData.generatedAt);
      if (genDate.toDateString() !== todayStr) {
        // Generated on a different day than today — content is overdue
        return 'Yesterday';
      }
    }

    // Case 3: Content generated today or just now — it's today's reading
    return 'Today';
  };

  const handleContinueReading = (dayNumber?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (dayNumber) {
      router.push({ pathname: '/(tabs)/(today)/reading', params: { dayNumber: String(dayNumber) } });
    } else {
      router.push('/(tabs)/(today)/reading');
    }
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
    if (!gate()) return;
    if (currentDevotionalId) {
      Alert.alert(
        'Start a new series?',
        'Starting a new series will end your current one.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              archiveCurrentDevotional();
              router.push('/onboarding');
            },
          },
        ],
      );
    } else {
      router.push('/onboarding');
    }
  };

  const handleCheckIn = () => {
    if (!gate()) return;
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

  const daysCompleted = currentDevotional ? (currentDevotional.days ?? []).filter(d => d.isRead).length : 0;
  const progressPercent = currentDevotional ? (daysCompleted / currentDevotional.totalDays) * 100 : 0;
  const currentDayData = (currentDevotional?.days ?? []).find(d => d.dayNumber === currentDevotional?.currentDay)
    // When today's reading is done but next day isn't generated yet (progressive mode),
    // fall back to last completed day to avoid showing "Preparing today's reading..."
    ?? (hasReadToday && currentDevotional
      ? (currentDevotional.days ?? []).filter(d => d.isRead).sort((a, b) => b.dayNumber - a.dayNumber)[0] ?? null
      : null);

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

  const handleReveal = useCallback(() => {
    if (!currentDevotional || !currentDayData) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/reveal',
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(currentDayData.dayNumber),
        seriesTitle: currentDevotional.title,
        dayTitle: currentDayData.title,
        totalDays: String(currentDevotional.totalDays),
      },
    });
  }, [currentDevotional, currentDayData, router]);

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
    isPremium,
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
    dayLabel: getReadingDayLabel(),
    isJourneyComplete,
    isPreparing: !hasReadToday && (isPreparingCurrentDay || (!currentDayData && !!currentDevotional)),
    daysCompleted,
    totalDays: currentDevotional?.totalDays ?? 0,
    progress: progressPercent,
    tomorrowTeaser: homeTomorrowTeaser,
    onContinue: handleContinueReading,
    onCreateNew: handleCreateNew,
    onReveal: handleReveal,
    ctaText: getCtaText(),
  });

  // During reveal → reading transition, render a centered ripple loader to
  // smooth over the brief gap while the reading screen mounts and paints.
  // The reading screen clears this flag ~650ms after mount.
  const revealTransitioning = useUIState((s) => s.revealTransitioning);
  if (revealTransitioning) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0A0A0A',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RippleLoader size={140} color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Layer 0: Ambient art — Skia shaders + ember particles */}
      <AmbientArtCanvas
        streakLevel={streakCurrent}
        hasReadToday={hasReadToday}
        scrollY={scrollY}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Zone 1: Greeting */}
          <GreetingRow
            userName={user?.name}
            onAvatarPress={() => router.push('/(tabs)/(you)')}
          />

          {/* Zone 2: Context Slot */}
          <Animated.View entering={entering(FadeIn.duration(280).delay(80))}>
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
          </Animated.View>

          {/* Remember This — daily random highlight */}
          <RememberThisCard />

          {/* Zone 3: Hero Devotional — single card */}
          <View ref={readingRef} collapsable={false}>
            <Animated.View entering={entering(FadeIn.duration(280).delay(160))}>
              <DevotionalCard
                state={devotionalState}
                scrollY={scrollY}
                isReturningUser={isReturningUser}
              />
            </Animated.View>
          </View>

          {/* Zone 5: Series Carousel — removed per user request */}

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
          <View ref={streakRef} collapsable={false}>
            <Animated.View
              entering={entering(FadeIn.delay(200).duration(400))}
              style={styles.streakWrapper}
            >
              <StreakBox
                streakCount={streakCurrent}
                onPress={() => router.push('/streak-settings')}
              />
            </Animated.View>
          </View>

          {/* Zone 7: Bento Grid */}
          <BentoGrid />

          {/* DEBUG: Preview reveal screen (dev only, works without active devotional) */}
          {__DEV__ && (
            <TouchableOpacity
              onPress={() => {
                // Use real devotional if available, otherwise fake params
                if (currentDevotional && currentDayData) {
                  handleReveal();
                } else {
                  router.push({
                    pathname: '/reveal',
                    params: {
                      devotionalId: 'debug',
                      dayNumber: '1',
                      seriesTitle: 'Preview Series',
                      dayTitle: 'When the Map Dissolves',
                      totalDays: '7',
                    },
                  });
                }
              }}
              style={{
                alignSelf: 'center',
                marginTop: Spacing['4'],
                paddingHorizontal: Spacing['4'],
                paddingVertical: Spacing['2'],
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
              }}
            >
              <Text style={{ fontFamily: FontFamily.ui, fontSize: 11, color: colors.textSubtle }}>
                DEBUG: Preview reveal
              </Text>
            </TouchableOpacity>
          )}

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
        </Animated.ScrollView>
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

      <ExclusiveOfferSheet
        visible={showExclusiveOffer}
        onDismiss={dismissOffer}
        context="churned"
      />

      {/* Streak celebration — fires once when today's reading is completed */}
      {showCelebration && (
        <StreakCelebration
          streak={streakCurrent}
          onComplete={() => setShowCelebration(false)}
        />
      )}

      {/* First-time onboarding tooltips — shown once, persisted in store.
          Keyed by hasSeenHomeTooltips so the debug "Replay Home Tooltips"
          button (which flips the flag back to false) forces a full remount
          and clean re-measurement of the target rects. */}
      <HomeOnboardingTooltips
        key={String(hasSeenHomeTooltips)}
        readingRef={readingRef}
        streakRef={streakRef}
      />
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
    marginTop: Spacing['5'],
  },
  premiumNudgeWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
  },
});
