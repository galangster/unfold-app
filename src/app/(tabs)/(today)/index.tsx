import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { drainSyncOutbox } from '@/lib/sync-outbox';
import { usePrevious } from '@/hooks/usePrevious';
import { View, StyleSheet, Alert, type LayoutChangeEvent } from 'react-native';
import { useRouter, useFocusEffect, useIsFocused } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useUnfoldStore, type MoodLevel } from '@/lib/store';
import { requestReviewOncePerVersion } from '@/lib/review-prompt';
import { useQuery } from '@tanstack/react-query';
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
import { getPremiumNudgeCardTone } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { getContentAwareMiddayMessage, getContentAwareEveningMessage } from '@/constants/check-in-messages';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { Duration, Ease } from '@/constants/animations';
import { submitGenerationJob, recoverCompletedGenerationResult, ApiError } from '@/lib/generation-api';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { TodayCardStack, type TodayCardStackCard } from '@/components/home/TodayCardStack';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';
import { getBibleDbStatus, downloadBibleDb } from '@/lib/bible-db';
import { commitDevotionalPullCursor, pullDevotionalContent } from '@/lib/devotional-sync-pull';
import { applyPulledDevotionalContent } from '@/lib/devotional-pulled-content';
import {
  getCurrentDevotional,
  getHomeDevotionalDayData,
  hasReadDevotionalToday,
  shouldAutoPrepareCurrentDevotionalDay,
} from '@/lib/home-devotional-state';
import {
  getBridgeDayNumber,
  getEveningWindDownDayNumber,
  getMiddayCheckInDayNumber,
} from '@/lib/today-companion-state';
import { getCalendarDayNumber } from '@/lib/devotional-day-access';
import { getQaTodayProfileMarker } from '@/lib/qa-today-marker';
import { getStreakDayKey, shouldCelebrateStreakDayFlip } from '@/lib/streak-helpers';

// Must match the key used in generating.tsx
const INFLIGHT_KEY = 'inflight-generation-job';
const QA_TODAY_PROFILE_MARKER = getQaTodayProfileMarker();
const QA_TODAY_CONTEXT_SLOT_PREFIX = 'QA Today context slot:';
const QA_TODAY_PREPARING_LOADING_MARKER = 'QA Today preparing loading preview.';
const QA_BRIDGE_TEXT = 'Nick, today’s reading picks up the thread of waiting with God before you rush toward the next decision. Isaiah slows the pace down and asks what renewed strength actually feels like.';
const TODAY_RELATIONSHIP_SPACING = {
  heroToOptionalStack: Spacing['5'],
  heroToRhythm: Spacing['5'],
  optionalStackToRhythm: Spacing['4'],
  rhythmToBento: Spacing['3'],
} as const;

type TodayPremiumFeature = 'streak' | 'audio' | 'series' | 'general';

function getTodayPremiumFeature(feature: string): TodayPremiumFeature {
  if (feature === 'streak' || feature === 'audio' || feature === 'series') return feature;
  return 'general';
}

type QaContextSlotPreview = Extract<ContextSlotType, 'midday' | 'evening' | 'bridge' | 'bridge-loading'>;

// Zone components
import { type ContextSlotType } from '@/lib/context-slot-priority';
import { computeDevotionalState, type ReflectionStatus } from '@/components/home/compute-devotional-state';
import { DevotionalCard } from '@/components/home/DevotionalCard';
import { GreetingRow } from '@/components/home/GreetingRow';
import { BentoGrid } from '@/components/home/BentoGrid';
import { SeriesCarousel } from '@/components/home/SeriesCarousel';
import { CompactStreakRow } from '@/components/home/CompactStreakRow';
import { stripOuterQuotes } from '@/lib/cn';

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

const REVEAL_RESUME_WINDOW_MS = 15_000;

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
  const updateDevotionalDays = useUnfoldStore((s) => s.updateDevotionalDays);
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const streakLastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
  const addCheckIn = useUnfoldStore((s) => s.addCheckIn);
  const markMiddayCheckInCompleted = useUnfoldStore((s) => s.markMiddayCheckInCompleted);
  const getCheckIn = useUnfoldStore((s) => s.getCheckIn);
  const hasSeenDay1Review = useUnfoldStore((s) => s.hasSeenDay1Review);
  const setHasSeenDay1Review = useUnfoldStore((s) => s.setHasSeenDay1Review);
  const hasSeenHomeTooltips = useUnfoldStore((s) => s.hasSeenHomeTooltips);
  const addGeneratedDay = useUnfoldStore((s) => s.addGeneratedDay);
  const archiveCurrentDevotional = useUnfoldStore((s) => s.archiveCurrentDevotional);
  const markDayAsRevealed = useUnfoldStore((s) => s.markDayAsRevealed);
  const isReturningUser = useUnfoldStore((s) => s.isReturningUser());
  const dismissedMiddayCardDate = useUnfoldStore((s) => s.dismissedMiddayCardDate);
  const dismissedEveningCardDate = useUnfoldStore((s) => s.dismissedEveningCardDate);
  const dismissedBridgeCardDate = useUnfoldStore((s) => s.dismissedBridgeCardDate);
  const dismissedRememberThisCardDate = useUnfoldStore((s) => s.dismissedRememberThisCardDate);
  const highlights = useUnfoldStore((s) => s.highlights);
  const setDismissedMiddayCardDate = useUnfoldStore((s) => s.setDismissedMiddayCardDate);
  const setDismissedEveningCardDate = useUnfoldStore((s) => s.setDismissedEveningCardDate);
  const setDismissedBridgeCardDate = useUnfoldStore((s) => s.setDismissedBridgeCardDate);
  const setDismissedRememberThisCardDate = useUnfoldStore((s) => s.setDismissedRememberThisCardDate);

  const checkIns = useUnfoldStore((s) => s.checkIns);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);

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
    if (age < REVEAL_RESUME_WINDOW_MS) {
      // Fresh from reveal — auto-navigate and clear
      clearResumeContext();
      router.push({
        pathname: '/(tabs)/(today)/reading',
        params: {
          devotionalId: resumeContext.devotionalId,
          dayNumber: String(resumeContext.dayNumber),
        },
      });
    }
  }, [resumeContext?.touchedAt]);

  // Safe area insets for tooltip y-offset calculation
  const insets = useSafeAreaInsets();

  const [tooltipLayoutRects, setTooltipLayoutRects] = useState<{
    reading: { x: number; y: number; width: number; height: number } | null;
    context: { x: number; y: number; width: number; height: number } | null;
    rhythm: { x: number; y: number; width: number; height: number } | null;
  }>({ reading: null, context: null, rhythm: null });

  const getInsetSurfaceRect = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    const horizontalInset = Spacing['6'];
    return {
      x: x + horizontalInset,
      y: y + insets.top,
      width: Math.max(width - horizontalInset * 2, 0),
      height,
    };
  }, [insets.top]);

  const handleReadingLayout = useCallback((event: LayoutChangeEvent) => {
    const rect = getInsetSurfaceRect(event);
    const topInset = Spacing['5'];
    if (rect.width > 0 && rect.height > topInset) {
      setTooltipLayoutRects((prev) => ({
        ...prev,
        reading: {
          ...rect,
          y: rect.y + topInset,
          height: Math.max(rect.height - topInset, 0),
        },
      }));
    }
  }, [getInsetSurfaceRect]);

  const handleContextLayout = useCallback((event: LayoutChangeEvent) => {
    const rect = getInsetSurfaceRect(event);
    if (rect.width > 0 && rect.height > 0) {
      setTooltipLayoutRects((prev) => ({
        ...prev,
        context: rect,
      }));
    }
  }, [getInsetSurfaceRect]);

  const handleRhythmLayout = useCallback((event: LayoutChangeEvent) => {
    const rect = getInsetSurfaceRect(event);
    if (rect.width > 0 && rect.height > 0) {
      setTooltipLayoutRects((prev) => ({
        ...prev,
        rhythm: rect,
      }));
    }
  }, [getInsetSurfaceRect]);

  // Scroll tracking for the hero DevotionalCard parallax
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const isTodayFocused = useIsFocused();

  const [clockNow, setClockNow] = useState(() => new Date());
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [stackPremiumFeature, setStackPremiumFeature] = useState<TodayPremiumFeature | null>(null);
  const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();

  // Update clock-driven Today card visibility every minute — but only while
  // this screen is focused. Home stays mounted behind other tabs and the
  // reading stack, and an unfocused tick re-renders the whole screen for
  // nothing. Refreshing on refocus covers time that passed while away.
  useEffect(() => {
    if (!isTodayFocused) return;
    setClockNow(new Date());
    const interval = setInterval(() => {
      setClockNow(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [isTodayFocused]);

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
        logger.log('[home] Resuming inflight generation job from MMKV:', inflight.jobId);
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

  // Check premium status through the tri-state policy so QA premium override can
  // unlock UI without mutating RevenueCat's persisted mirror.
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';

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

  // Refresh the current devotional from server sync when Today gains focus.
  // Reading already has a missing-day fallback, but Home needs the same pull
  // because the hero card is where users expect to discover Day 2+.
  useFocusEffect(
    useCallback(() => {
      // Drain any queued offline completions before pulling new content
      void drainSyncOutbox();

      const devotionalId = currentDevotionalId;
      if (!devotionalId) return;

      let cancelled = false;
      void (async () => {
        try {
          const pulled = await pullDevotionalContent(devotionalId);
          if (cancelled) return;

          applyPulledDevotionalContent({
            devotionalId,
            pulled,
            updateDevotionalDays,
            updateDevotionals: (updater) => {
              useUnfoldStore.setState((state) => ({
                devotionals: updater(state.devotionals),
              }));
            },
          });
          // Only after the content is in the store — a cancelled focus above
          // discards the response, and must not advance the cursor.
          commitDevotionalPullCursor(pulled);
        } catch (err) {
          logger.warn('[home] Devotional sync refresh failed:', err instanceof Error ? err.message : err);
        }
      })();

      return () => { cancelled = true; };
    }, [currentDevotionalId, updateDevotionalDays])
  );

  // Check if today's reading has been completed — drives ember visibility.
  // clockNow in deps + passed as `now`: recomputes each minute so "today"
  // stays fresh across midnight while the screen stays mounted (COR-8).
  const hasReadToday = useMemo(() => (
    hasReadDevotionalToday({ devotionals, currentDevotionalId, now: clockNow })
  ), [currentDevotionalId, devotionals, clockNow]);

  // Streak celebration: once per calendar day, keyed off the unified streak
  // engine's day-flip. streakLastReadDate is only written by recordStreakRead,
  // which is a same-day no-op — so the key flips at most once per day and
  // devotional switches cannot re-fire a misleading "+1" (COR-7).
  const streakDayKey = getStreakDayKey(streakLastReadDate);
  const prevStreakDayKey = usePrevious(streakDayKey);
  const [showCelebration, setShowCelebration] = useState(false);
  useEffect(() => {
    if (shouldCelebrateStreakDayFlip({
      prevDayKey: prevStreakDayKey,
      dayKey: streakDayKey,
      todayKey: new Date().toDateString(),
    })) {
      setShowCelebration(true);
    }
  }, [streakDayKey, prevStreakDayKey]);

  const currentDevotional = useMemo(() => (
    getCurrentDevotional(devotionals, currentDevotionalId)
  ), [currentDevotionalId, devotionals]);

  // Server-side generation handles content creation. The client only tracks
  // whether the current day's content hasn't arrived yet (shows a loading card).
  // Never show "preparing" for days beyond today's calendar position — those are
  // tomorrow's content and shouldn't trigger auto-generation.
  const isPreparingCurrentDay = useMemo(() => (
    shouldAutoPrepareCurrentDevotionalDay(currentDevotional, premiumPolicy)
  ), [currentDevotional, premiumPolicy]);

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

    (async () => {
      try {
        const recovered = await recoverCompletedGenerationResult({
          devotionalId: devId,
          dayNumber: dayNum,
        });
        if (cancelled) return;

        if (recovered?.devotionalDay) {
          addGeneratedDay(devId, recovered.devotionalDay);
          autoGenAttemptedRef.current = key;
          logger.log('[home] Applied existing server content for day', dayNum);
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
        logger.log('[home] Submitted generation job:', resp.jobId);
      } catch (err) {
        if (cancelled) return;

        // Handle 409 with structured error — server already has this day's content
        if (err instanceof ApiError && err.status === 409) {
          const recovered = await recoverCompletedGenerationResult({
            devotionalId: devId,
            dayNumber: dayNum,
            existingJobId: err.existingJobId,
          }).catch(() => null);
          if (cancelled) return;
          if (recovered?.devotionalDay) {
            addGeneratedDay(devId, recovered.devotionalDay);
            autoGenAttemptedRef.current = key;
            return;
          }
        }
        // Don't set autoGenAttemptedRef — allow retry on next render cycle
        logger.warn('[home] Auto-generation failed, will retry:', err instanceof Error ? err.message : err);
      }
    })();

    return () => { cancelled = true; };
  }, [isPreparingCurrentDay, currentDevotional]);

  const qaContextSlot = useMemo<QaContextSlotPreview | null>(() => {
    if (!isQaToolsEnabled()) return null;
    if (user?.aboutMe !== QA_TODAY_PROFILE_MARKER) return null;

    const match = user.currentSituation.match(new RegExp(`${QA_TODAY_CONTEXT_SLOT_PREFIX} ([a-z-]+)`));
    const slot = match?.[1];
    if (slot === 'midday' || slot === 'evening' || slot === 'bridge' || slot === 'bridge-loading') return slot;
    return null;
  }, [user?.aboutMe, user?.currentSituation]);

  const isQaPreparingLoadingPreview = isQaToolsEnabled()
    && user?.aboutMe === QA_TODAY_PROFILE_MARKER
    && user.currentSituation.includes(QA_TODAY_PREPARING_LOADING_MARKER);

  // Daily Bridge — generate a personalized transition from yesterday to today
  const bridgeInput = useMemo(() => {
    if (qaContextSlot === 'bridge' || qaContextSlot === 'bridge-loading') return null;
    if (!currentDevotional || !user?.name) return null;

    const bridgeDayNumber = getBridgeDayNumber(currentDevotional, hasReadToday);
    if (!bridgeDayNumber) return null;

    const todayDay = (currentDevotional.days ?? []).find((d) => d.dayNumber === bridgeDayNumber);
    if (!todayDay) return null;

    // Find yesterday's check-in for the same allowed day the bridge introduces.
    const yesterdayCheckIn = checkIns.find(
      (c) => c.devotionalId === currentDevotional.id && c.dayNumber === bridgeDayNumber - 1
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
      dayNumber: bridgeDayNumber,
    };
  }, [currentDevotional, user?.name, user?.currentSituation, checkIns, qaContextSlot, hasReadToday]);

  const { data: bridgeText, isLoading: bridgeLoading } = useQuery({
    // Keyed to match generateBridge's own MMKV cache identity (devotional +
    // day + calendar date). Embedding the whole input object here forked a new
    // cache entry on every free-text profile edit for the same day's bridge.
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- input is deliberately not part of the bridge's cache identity
    queryKey: ['bridge', bridgeInput?.devotionalId, bridgeInput?.dayNumber, clockNow.toISOString().slice(0, 10)],
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

  const getReadingDayLabel = (): 'Overdue' | 'Today' | 'Tomorrow' => {
    if (!currentDevotional) return 'Today';
    const dayData = (currentDevotional.days ?? []).find(d => d.dayNumber === currentDevotional.currentDay);
    if (!dayData) return 'Today';

    const todayStr = new Date().toDateString();
    const calendarDayNumber = getCalendarDayNumber(currentDevotional);

    // If the current pointer is ahead of the user's calendar pace, it is the
    // generated-ahead reading and should stay locked as tomorrow after today's
    // completion. Otherwise, a generated day whose number is due today remains
    // today's reading even if it was generated earlier.
    if (!dayData.isRead && calendarDayNumber != null) {
      if (currentDevotional.currentDay > calendarDayNumber) return 'Tomorrow';
      return currentDevotional.currentDay < calendarDayNumber ? 'Overdue' : 'Today';
    }

    // Case 1: Current day already read today — it's today's completed reading.
    // (In the old system this returned 'Tomorrow' because currentDay advanced immediately.
    // Now currentDay stays put until the server cron advances it overnight.)
    if (dayData.isRead && dayData.readAt && new Date(dayData.readAt).toDateString() === todayStr) {
      return 'Today';
    }

    // Case 2: Current day NOT read — check if it's overdue.
    // If the content was generated before today, the user missed it on a prior day.
    if (!dayData.isRead && dayData.generatedAt) {
      const genDate = new Date(dayData.generatedAt);
      if (genDate.toDateString() !== todayStr) {
        return 'Overdue';
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

  const handleOpenBible = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(bible)');
  }, [router]);

  const handleRenewPremium = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPremiumSheet(true);
  }, []);

  const handleResume = useCallback(() => {
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
  }, [resumeContext, resumeDevotional, router, setCurrentDevotional]);

  const openNewSeriesDiscovery = () => {
    router.push({
      pathname: '/onboarding',
      params: { startAt: 'themeType', flow: 'newSeries' },
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
              openNewSeriesDiscovery();
            },
          },
        ],
      );
    } else {
      openNewSeriesDiscovery();
    }
  };

  const handleCheckIn = useCallback(() => {
    if (!gate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCheckInSheet(true);
  }, [gate]);

  const handleCheckInComplete = (data: {
    mood: MoodLevel;
    moodLabel: string;
    chipAnswer?: string;
    freeText?: string;
  }) => {
    if (!currentDevotional) return;
    const targetDayNumber = getMiddayCheckInDayNumber(currentDevotional) ?? currentDevotional.currentDay;
    addCheckIn({
      devotionalId: currentDevotional.id,
      dayNumber: targetDayNumber,
      mood: data.mood,
      moodLabel: data.moodLabel,
      chipAnswer: data.chipAnswer,
      freeText: data.freeText,
      timeOfDay: 'midday',
    });
    // Record the completion date. The single-owner useCheckInNotifications
    // hook does NOT react to this field — we keep the DAILY trigger on its
    // recurring schedule and the trigger naturally recurs tomorrow. This
    // replaces the old cancelAndRescheduleMiddayForTomorrow() helper which
    // silently downgraded the DAILY trigger to a one-shot DATE trigger.
    // See ~/vault/gotchas/expo-reschedule-helpers-silent-one-shot-downgrade.md
    markMiddayCheckInCompleted();
    setShowCheckInSheet(false);
  };

  const handleEveningWindDown = useCallback(() => {
    if (!gate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const targetDayNumber = getEveningWindDownDayNumber(currentDevotional);
    if (currentDevotional && targetDayNumber) {
      router.push({
        pathname: '/(tabs)/(today)/evening-wind-down',
        params: {
          devotionalId: currentDevotional.id,
          dayNumber: String(targetDayNumber),
        },
      });
      return;
    }
    router.push('/(tabs)/(today)/evening-wind-down');
  }, [currentDevotional, gate, router]);

  // Check if midday/evening check-ins already completed for their target day.
  // Midday follows the currently readable day. Evening follows the day actually
  // completed today, including the final day where currentDay does not advance.
  const middayCheckInDay = getMiddayCheckInDayNumber(currentDevotional);
  const eveningCheckInDay = getEveningWindDownDayNumber(currentDevotional);
  const todayCheckIn = currentDevotional && middayCheckInDay != null
    ? getCheckIn(currentDevotional.id, middayCheckInDay, 'midday')
    : undefined;
  const todayEveningCheckIn = currentDevotional && eveningCheckInDay != null
    ? getCheckIn(currentDevotional.id, eveningCheckInDay, 'evening')
    : undefined;

  // Time-aware card visibility — cards appear during their window and expire naturally
  // Midday: 12pm-5pm (afternoon)  |  Evening: 5pm-11:30pm
  const currentHour = clockNow.getHours();
  const currentMinute = clockNow.getMinutes();
  const todayDate = clockNow.toLocaleDateString('en-CA');
  const hasDismissedMiddayCardToday = dismissedMiddayCardDate === todayDate;
  const hasDismissedEveningCardToday = dismissedEveningCardDate === todayDate;
  const hasDismissedBridgeCardToday = !qaContextSlot && dismissedBridgeCardDate === todayDate;

  const rememberedHighlight = useMemo(() => {
    if (dismissedRememberThisCardDate === todayDate) return null;
    if (highlights.length === 0) return null;
    const seed = todayDate.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return highlights[seed % highlights.length];
  }, [dismissedRememberThisCardDate, highlights, todayDate]);

  const rememberedHighlightSourceTitle = useMemo(() => {
    if (!rememberedHighlight) return 'Untitled Series';
    const devotional = devotionals.find((d) => d.id === rememberedHighlight.devotionalId);
    return devotional?.title || rememberedHighlight.devotionalTitle || 'Untitled Series';
  }, [devotionals, rememberedHighlight]);

  const handleDay1ReviewOption = useCallback(async (option: 'love' | 'okay' | 'not-for-me') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasSeenDay1Review();
    // The card promises "one quiet response helps Unfold shape the next few
    // days" — make that true: persist the answer as a day-1 check-in so it
    // syncs to the backend and reaches the generation memory for day 2.
    // timeOfDay 'morning' = right-after-reading; a later real midday/evening
    // check-in wins the backend's latest-row-per-day query, so this never
    // masks a genuine mood entry.
    const pulseDevotional = useUnfoldStore.getState().devotionals.find(
      (d) => d.id === useUnfoldStore.getState().currentDevotionalId,
    );
    if (pulseDevotional) {
      const pulse = {
        love: { mood: 4 as const, moodLabel: 'This helped me' },
        okay: { mood: 3 as const, moodLabel: 'Still settling' },
        'not-for-me': { mood: 2 as const, moodLabel: 'Not for me' },
      }[option];
      addCheckIn({
        devotionalId: pulseDevotional.id,
        dayNumber: 1,
        mood: pulse.mood,
        moodLabel: pulse.moodLabel,
        chipAnswer: `day1-pulse:${option}`,
        timeOfDay: 'morning',
      });
    }
    if (option === 'love') {
      await requestReviewOncePerVersion();
    }
  }, [setHasSeenDay1Review, addCheckIn]);

  const daysCompleted = currentDevotional ? (currentDevotional.days ?? []).filter(d => d.isRead).length : 0;
  const progressPercent = currentDevotional ? (daysCompleted / currentDevotional.totalDays) * 100 : 0;
  const homeDayData = getHomeDevotionalDayData(currentDevotional);
  const activeCurrentDayData = currentDevotional?.days.find((day) => day.dayNumber === currentDevotional.currentDay) ?? null;
  const isCurrentDevotionalComplete = currentDevotional ? daysCompleted === currentDevotional.totalDays : false;
  const currentDayData = !isCurrentDevotionalComplete && hasReadToday && activeCurrentDayData && !activeCurrentDayData.isRead
    ? activeCurrentDayData
    : homeDayData;

  const completionAmbienceKey = useMemo(() => {
    if (!currentDevotional || !hasReadToday) return null;
    const readDayKey = streakDayKey ?? todayDate;
    const completedDayMarker = daysCompleted > 0 ? daysCompleted : currentDayData?.dayNumber ?? currentDevotional.currentDay;
    return `${currentDevotional.id}:${readDayKey}:${completedDayMarker}`;
  }, [currentDevotional, currentDayData?.dayNumber, daysCompleted, hasReadToday, streakDayKey, todayDate]);

  const handleReflect = useCallback((dayNumber?: number) => {
    if (!currentDevotional) return;
    const targetDayNumber = dayNumber ?? currentDayData?.dayNumber ?? currentDevotional.currentDay;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(today)/journal',
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(targetDayNumber),
      },
    });
  }, [currentDevotional, currentDayData?.dayNumber, router]);

  // Free-write draft + save for the inline composer on the completed card.
  // Mirrors journal.tsx's saveEntry: update the existing entry (including to
  // empty — the user deleted their text), only create one for real content.
  const currentDayFreeWriteDraft = useMemo(() => {
    if (!currentDevotional || !currentDayData) return '';
    const entry = journalEntries.find(
      (journalEntry) => journalEntry.devotionalId === currentDevotional.id && journalEntry.dayNumber === currentDayData.dayNumber,
    );
    return entry?.content ?? '';
  }, [currentDevotional, currentDayData, journalEntries]);

  const handleSaveFreeWrite = useCallback((dayNumber: number, text: string) => {
    if (!currentDevotional) return;
    const store = useUnfoldStore.getState();
    const entry = store.getJournalEntry(currentDevotional.id, dayNumber);
    if (entry) {
      store.updateJournalEntry(entry.id, text);
    } else if (text.trim()) {
      store.addJournalEntry({ devotionalId: currentDevotional.id, dayNumber, content: text });
    }
  }, [currentDevotional]);

  const currentDayReflectionStatus = useMemo<ReflectionStatus>(() => {
    if (!currentDevotional || !currentDayData) return 'empty';

    const entry = journalEntries.find(
      (journalEntry) => journalEntry.devotionalId === currentDevotional.id && journalEntry.dayNumber === currentDayData.dayNumber,
    );
    if (!entry) return 'empty';

    const hasFreeWrite = entry.content.trim().length > 0;
    const hasSoap = Object.values(entry.soapResponses ?? {}).some((value) => value.trim().length > 0);
    const answeredReflectionCount = (entry.questionResponses ?? []).filter((response) => response.response.trim().length > 0).length;
    const hasPrayer = (entry.prayerRequests ?? []).some((prayer) => prayer.text.trim().length > 0);
    const hasAnyReflection = hasFreeWrite || hasSoap || answeredReflectionCount > 0 || hasPrayer;
    if (!hasAnyReflection) return 'empty';

    const totalReflectionQuestions = currentDayData.reflectionQuestions?.length ?? 0;
    if (totalReflectionQuestions > 0 && answeredReflectionCount >= totalReflectionQuestions) {
      return 'complete';
    }

    return 'started';
  }, [currentDevotional, currentDayData, journalEntries]);

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

  const isJourneyComplete = isCurrentDevotionalComplete;
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
    if (isFirstDay) return "Start Today's Reading";
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

  const effectiveBridgeText = qaContextSlot === 'bridge' ? QA_BRIDGE_TEXT : bridgeText;
  const validBridgeText = !hasDismissedBridgeCardToday && effectiveBridgeText && effectiveBridgeText.length > 20 && /[.!?…"']$/.test(effectiveBridgeText.trim())
    ? effectiveBridgeText
    : undefined;
  const isEveningWindow = (currentHour >= 17 && currentHour < 23) || (currentHour === 23 && currentMinute < 30);
  const isMiddayWindow = currentHour >= 12 && currentHour < 17;
  const shouldShowEveningStackCard = !!currentDevotional
    && isPremium
    && !hasDismissedEveningCardToday
    && !todayEveningCheckIn
    && ((isEveningWindow && hasReadToday) || qaContextSlot === 'evening');
  const shouldShowMiddayStackCard = !!currentDevotional
    && isPremium
    && !hasDismissedMiddayCardToday
    && !todayCheckIn
    && (isMiddayWindow || qaContextSlot === 'midday');
  const shouldShowBridgeStackCard = !!currentDevotional
    && isPremium
    && !hasReadToday
    && !!validBridgeText
    && (!!bridgeInput || qaContextSlot === 'bridge');
  const shouldShowBridgeLoadingStackCard = !!currentDevotional
    && isPremium
    && !hasReadToday
    && !validBridgeText
    && !hasDismissedBridgeCardToday
    && ((bridgeLoading && !!bridgeInput) || qaContextSlot === 'bridge-loading');

  const handleDismissResumeCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    clearResumeContext();
  }, [clearResumeContext]);

  const handleDismissMiddayCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setDismissedMiddayCardDate(todayDate);
  }, [setDismissedMiddayCardDate, todayDate]);

  const handleDismissEveningCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setDismissedEveningCardDate(todayDate);
  }, [setDismissedEveningCardDate, todayDate]);

  const handleDismissBridgeCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setDismissedBridgeCardDate(todayDate);
  }, [setDismissedBridgeCardDate, todayDate]);

  const handleSavedEchoPress = useCallback(() => {
    if (!rememberedHighlight) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(rememberedHighlight.devotionalId);
    router.push({
      pathname: '/(tabs)/(today)/reading',
      params: {
        devotionalId: rememberedHighlight.devotionalId,
        dayNumber: rememberedHighlight.dayNumber.toString(),
        highlightId: rememberedHighlight.id,
      },
    });
  }, [rememberedHighlight, router, setCurrentDevotional]);

  const handleDismissRememberThisCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setDismissedRememberThisCardDate(todayDate);
  }, [setDismissedRememberThisCardDate, todayDate]);

  const handleDismissDay1ReviewCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setHasSeenDay1Review();
  }, [setHasSeenDay1Review]);

  const handlePremiumNudgeStackAction = useCallback(() => {
    if (!premiumNudge) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStackPremiumFeature(getTodayPremiumFeature(premiumNudge.premiumFeature));
  }, [premiumNudge]);

  const handleDismissPremiumNudgeCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    nudgeDismiss();
  }, [nudgeDismiss]);

  const handleStackPremiumSheetClose = useCallback(() => {
    setStackPremiumFeature(null);
    animateCardDismiss();
    nudgeAction();
  }, [nudgeAction]);

  // Compute resume props for Today card stack
  const resumeProps = useMemo(() => {
    if (!shouldShowResumeCard || !resumeContext || !resumeDevotional) return undefined;

    return {
      onPress: handleResume,
      label: resumeContext.route === 'journal'
        ? (resumeDevotional.days.find(d => d.dayNumber === resumeContext.dayNumber)?.isRead
          ? `Add to Day ${resumeContext.dayNumber}`
          : 'Resume your reflection')
        : 'Resume where you left off',
      title: `${resumeDevotional.title} · Day ${resumeContext.dayNumber}${resumeContext.dayTitle ? `: ${resumeContext.dayTitle}` : ''}`,
      timeAgo: formatResumeRelativeTime(resumeContext.touchedAt),
    };
  }, [handleResume, resumeContext, resumeDevotional, shouldShowResumeCard]);

  const todayStackCards = useMemo<TodayCardStackCard[]>(() => {
    const cards: TodayCardStackCard[] = [];

    if (resumeProps) {
      const isJournalResume = resumeProps.label.toLowerCase().includes('reflection') || resumeProps.label.toLowerCase().includes('add to day');
      cards.push({
        id: 'today-stack-resume',
        kind: 'resume',
        priority: 500,
        eyebrow: resumeProps.label,
        title: resumeProps.title,
        body: `${resumeProps.timeAgo}. Your place is saved quietly.`,
        actionLabel: isJournalResume ? 'Open reflection' : 'Continue reading',
        onPress: resumeProps.onPress,
        onDismiss: handleDismissResumeCard,
        accessibilityLabel: `${resumeProps.label}. ${resumeProps.title}. ${resumeProps.timeAgo}.`,
        accessibilityHint: isJournalResume ? 'Opens the saved journal reflection' : 'Returns to the saved devotional reading',
        dismissAccessibilityLabel: 'Dismiss resume stack card',
        dismissAccessibilityHint: 'Clears this saved resume prompt without deleting your reading or reflection',
        testID: 'today-stack-card-resume',
      });
    }

    if (shouldShowEveningStackCard) {
      cards.push({
        id: 'today-stack-evening',
        kind: 'evening',
        priority: 400,
        eyebrow: 'Evening check-in',
        title: 'Wind down with today’s reading',
        body: eveningMessage,
        actionLabel: 'Wind down',
        onPress: handleEveningWindDown,
        onDismiss: handleDismissEveningCard,
        accessibilityLabel: `Evening check-in. ${eveningMessage}`,
        accessibilityHint: 'Opens the evening wind-down reflection',
        dismissAccessibilityLabel: 'Dismiss evening stack card',
        dismissAccessibilityHint: 'Hides this evening check-in card for today',
        testID: 'today-stack-card-evening',
      });
    }

    if (shouldShowMiddayStackCard) {
      cards.push({
        id: 'today-stack-midday',
        kind: 'midday',
        priority: 300,
        eyebrow: 'Companion note',
        title: 'Check in with today’s reading',
        body: middayMessage,
        actionLabel: 'Reflect',
        onPress: handleCheckIn,
        onDismiss: handleDismissMiddayCard,
        accessibilityLabel: `Companion note. ${middayMessage}`,
        accessibilityHint: 'Opens the midday check-in reflection',
        dismissAccessibilityLabel: 'Dismiss midday stack card',
        dismissAccessibilityHint: 'Hides this midday check-in card for today',
        testID: 'today-stack-card-midday',
      });
    }

    if (shouldShowBridgeStackCard && validBridgeText) {
      cards.push({
        id: 'today-stack-bridge',
        kind: 'bridge',
        priority: 200,
        eyebrow: 'Daily thread',
        title: 'A thread from yesterday to today',
        body: validBridgeText,
        onDismiss: handleDismissBridgeCard,
        accessibilityLabel: `Daily thread. ${validBridgeText}`,
        accessibilityHint: 'A personal bridge into today’s reading',
        dismissAccessibilityLabel: 'Dismiss bridge stack card',
        dismissAccessibilityHint: 'Hides this bridge text for today',
        testID: 'today-stack-card-bridge',
      });
    }

    if (shouldShowBridgeLoadingStackCard) {
      cards.push({
        id: 'today-stack-bridge-loading',
        kind: 'bridge-loading',
        priority: 100,
        eyebrow: 'Daily thread',
        title: 'Preparing today’s thread…',
        body: 'A quiet bridge from yesterday to today will appear here when it is ready.',
        onDismiss: handleDismissBridgeCard,
        accessibilityLabel: 'Preparing today’s thread',
        accessibilityHint: 'A personal bridge into today’s reading is loading',
        dismissAccessibilityLabel: 'Dismiss bridge loading stack card',
        dismissAccessibilityHint: 'Hides this bridge card for today',
        testID: 'today-stack-card-bridge-loading',
      });
    }

    if (rememberedHighlight) {
      cards.push({
        id: `today-stack-remember-this-${rememberedHighlight.id}`,
        kind: 'remember-this',
        priority: 80,
        eyebrow: 'Saved echo',
        title: 'A line worth carrying',
        // Quoted highlight is genuinely variable-length — keep a real-overflow
        // clamp (de-slop #15: authored copy wraps; only true overflow clamps).
        body: `“${stripOuterQuotes(rememberedHighlight.highlightedText)}” — Day ${rememberedHighlight.dayNumber} · ${rememberedHighlightSourceTitle}`,
        bodyNumberOfLines: 3,
        actionLabel: 'Open highlight',
        onPress: handleSavedEchoPress,
        onDismiss: handleDismissRememberThisCard,
        accessibilityLabel: `Saved highlight from Day ${rememberedHighlight.dayNumber}: ${rememberedHighlight.highlightedText}`,
        accessibilityHint: 'Opens the reading at this highlighted passage',
        dismissAccessibilityLabel: 'Dismiss saved echo stack card',
        dismissAccessibilityHint: 'Hides this saved echo card for today without deleting the highlight',
        testID: 'today-stack-card-remember-this',
      });
    }

    if (showDay1Review) {
      cards.push({
        id: 'today-stack-day1-review',
        kind: 'day1-review',
        priority: 70,
        eyebrow: 'Day 1 reflection',
        title: 'Did today’s reading feel personal?',
        body: 'One quiet response helps Unfold shape the next few days. No pressure — just a pulse check after your first reading.',
        actions: [
          {
            label: 'This helped me',
            onPress: () => { void handleDay1ReviewOption('love'); },
            accessibilityLabel: 'This reading helped me',
            accessibilityHint: 'Records a positive response and may open the App Store review prompt if available',
            tone: 'primary',
          },
          {
            label: 'Still settling',
            onPress: () => { void handleDay1ReviewOption('okay'); },
            accessibilityLabel: 'This reading was still settling',
            accessibilityHint: 'Records neutral feedback and dismisses this prompt',
            tone: 'secondary',
          },
          {
            label: 'Not for me',
            onPress: () => { void handleDay1ReviewOption('not-for-me'); },
            accessibilityLabel: 'This reading was not for me',
            accessibilityHint: 'Records that this devotional did not fit and dismisses this prompt',
            tone: 'secondary',
          },
        ],
        onDismiss: handleDismissDay1ReviewCard,
        accessibilityLabel: 'Day 1 reflection. Did today’s reading feel personal?',
        accessibilityHint: 'Choose a response to dismiss this feedback prompt',
        dismissAccessibilityLabel: 'Dismiss Day 1 review stack card',
        dismissAccessibilityHint: 'Dismisses this Day 1 feedback prompt',
        testID: 'today-stack-card-day1-review',
      });
    }

    if (premiumNudge) {
      const premiumTone = getPremiumNudgeCardTone(premiumNudge.type);
      cards.push({
        id: `today-stack-premium-${premiumNudge.type}`,
        kind: 'premium-nudge',
        priority: 50,
        eyebrow: premiumTone.kicker,
        title: premiumTone.title,
        body: `${premiumNudge.message} ${premiumTone.footnote}`,
        actionLabel: premiumNudge.cta,
        onPress: handlePremiumNudgeStackAction,
        onDismiss: handleDismissPremiumNudgeCard,
        accessibilityLabel: `${premiumTone.kicker}. ${premiumTone.title}. ${premiumNudge.message}`,
        accessibilityHint: 'Shows details about this Premium feature',
        dismissAccessibilityLabel: 'Dismiss premium invitation stack card',
        dismissAccessibilityHint: 'Hides this premium suggestion',
        testID: 'today-stack-card-premium-nudge',
      });
    }

    return cards;
  }, [
    eveningMessage,
    handleCheckIn,
    handleDay1ReviewOption,
    handleDismissBridgeCard,
    handleDismissDay1ReviewCard,
    handleDismissEveningCard,
    handleDismissMiddayCard,
    handleDismissPremiumNudgeCard,
    handleDismissRememberThisCard,
    handleDismissResumeCard,
    handleEveningWindDown,
    handlePremiumNudgeStackAction,
    handleSavedEchoPress,
    middayMessage,
    premiumNudge,
    rememberedHighlight,
    rememberedHighlightSourceTitle,
    resumeProps,
    shouldShowBridgeLoadingStackCard,
    shouldShowBridgeStackCard,
    showDay1Review,
    shouldShowEveningStackCard,
    shouldShowMiddayStackCard,
    validBridgeText,
  ]);

  const hasOptionalTodayStack = todayStackCards.length > 0;

  // Compute devotional card state
  const devotionalState = computeDevotionalState({
    currentDevotional: currentDevotional ?? null,
    currentDayData,
    hasReadToday,
    dayLabel: getReadingDayLabel(),
    isJourneyComplete,
    isPreparing: !hasReadToday && (isPreparingCurrentDay || (!currentDayData && !!currentDevotional && premiumPolicy !== 'denied')),
    premiumPolicy,
    daysCompleted,
    totalDays: currentDevotional?.totalDays ?? 0,
    progress: progressPercent,
    tomorrowTeaser: homeTomorrowTeaser,
    onContinue: handleContinueReading,
    onReflect: handleReflect,
    onCreateNew: handleCreateNew,
    onOpenBible: handleOpenBible,
    onRenewPremium: handleRenewPremium,
    onReveal: handleReveal,
    ctaText: getCtaText(),
    reflectionStatus: currentDayReflectionStatus,
    freeWriteDraft: currentDayFreeWriteDraft,
    onSaveFreeWrite: handleSaveFreeWrite,
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
          backgroundColor: colors.background,
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
      {/* Layer 0: Ambient art — one completed-day ambience owner. The
          selected option is stable for the completed devotional/day/date. */}
      <AmbientArtCanvas
        streakLevel={streakCurrent}
        hasReadToday={hasReadToday}
        stateType={devotionalState.type}
        screenFocused={isTodayFocused}
        completionAmbienceKey={completionAmbienceKey}
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
            avatarTestID="home-avatar-button"
            onAvatarPress={() => router.push('/(tabs)/(you)')}
          />

          {/* Zone 2: Context stack moved under the hero in Phase 3. */}


          {/* Zone 3: Hero Devotional — Today's primary act */}
          <View collapsable={false} onLayout={handleReadingLayout}>
            {/* No entering here — DevotionalCard runs its own FadeIn; two nested fades compounded (audit #5) */}
            <Animated.View>
              <DevotionalCard
                state={devotionalState}
                scrollY={scrollY}
                isReturningUser={isReturningUser && !isQaPreparingLoadingPreview}
              />
            </Animated.View>
          </View>

          {hasOptionalTodayStack && (
            <View collapsable={false} onLayout={handleContextLayout}>
              <TodayCardStack
                cards={todayStackCards}
                colors={colors}
                style={styles.todayStackWrapper}
              />
            </View>
          )}

          {/* Zone 5: Series Carousel — removed per user request */}


          {/* Zone 6: Daily Rhythm */}
          <View collapsable={false} onLayout={handleRhythmLayout}>
            <Animated.View
              entering={entering(FadeIn.duration(Duration.normal).delay(200).easing(Ease.out))}
              style={[
                styles.streakWrapper,
                hasOptionalTodayStack ? styles.rhythmAfterOptionalStack : styles.rhythmAfterHero,
              ]}
            >
              <StreakBox
                streakCount={streakCurrent}
                hasReadToday={hasReadToday}
                onPress={() => router.push('/streak-settings')}
              />
            </Animated.View>
          </View>

          {/* Zone 7: Bento Grid */}
          <View style={styles.bentoWrapper}>
            <BentoGrid />
          </View>

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
          dayNumber={middayCheckInDay ?? currentDevotional.currentDay}
        />
      )}

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="series"
      />

      <PremiumFeatureSheet
        visible={stackPremiumFeature !== null}
        onClose={handleStackPremiumSheetClose}
        feature={stackPremiumFeature ?? 'general'}
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
        layoutRects={tooltipLayoutRects}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  todayStackWrapper: {
    marginTop: TODAY_RELATIONSHIP_SPACING.heroToOptionalStack,
  },
  streakWrapper: {
    paddingHorizontal: Spacing['6'],
  },
  rhythmAfterHero: {
    marginTop: TODAY_RELATIONSHIP_SPACING.heroToRhythm,
  },
  rhythmAfterOptionalStack: {
    marginTop: TODAY_RELATIONSHIP_SPACING.optionalStackToRhythm,
  },
  bentoWrapper: {
    marginTop: TODAY_RELATIONSHIP_SPACING.rhythmToBento,
  },
});
