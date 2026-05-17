import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { usePrevious } from '@/hooks/usePrevious';
import { View, Text, TouchableOpacity, StyleSheet, Alert, type LayoutChangeEvent } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { shouldShowCompletedBottomGlow } from '@/lib/today-ambient-rive';
import { alpha } from '@/components/ui';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useUnfoldStore, type MoodLevel } from '@/lib/store';
import { HeartIcon, HandIcon, XIcon } from 'phosphor-react-native';
import * as StoreReview from 'expo-store-review';
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
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { getContentAwareMiddayMessage, getContentAwareEveningMessage } from '@/constants/check-in-messages';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { Duration, Ease } from '@/constants/animations';
import { submitGenerationJob, recoverCompletedGenerationResult, ApiError } from '@/lib/generation-api';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { RememberThisCard } from '@/components/home/RememberThisCard';
import { getBibleDbStatus, downloadBibleDb } from '@/lib/bible-db';
import { pullDevotionalContent } from '@/lib/devotional-sync-pull';
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

// Must match the key used in generating.tsx
const INFLIGHT_KEY = 'inflight-generation-job';
const QA_TODAY_PROFILE_MARKER = 'Seeded Today-screen runtime QA profile.';
const QA_TODAY_CONTEXT_SLOT_PREFIX = 'QA Today context slot:';
const QA_BRIDGE_TEXT = 'Nick, today’s reading picks up the thread of waiting with God before you rush toward the next decision. Isaiah slows the pace down and asks what renewed strength actually feels like.';
const DISPLAY_TEXT_MAX_SCALE = 1.18;
const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;

type QaContextSlotPreview = Extract<ContextSlotType, 'midday' | 'evening' | 'bridge' | 'bridge-loading'>;

// Zone components
import { getContextSlotType, type ContextSlotType } from '@/lib/context-slot-priority';
import { computeDevotionalState, type ReflectionStatus } from '@/components/home/compute-devotional-state';
import { DevotionalCard } from '@/components/home/DevotionalCard';
import { ContextSlot } from '@/components/home/ContextSlot';
import { GreetingRow } from '@/components/home/GreetingRow';
import { BentoGrid } from '@/components/home/BentoGrid';
import { SeriesCarousel } from '@/components/home/SeriesCarousel';
import { CompactStreakRow } from '@/components/home/CompactStreakRow';

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
  const setDismissedMiddayCardDate = useUnfoldStore((s) => s.setDismissedMiddayCardDate);
  const setDismissedEveningCardDate = useUnfoldStore((s) => s.setDismissedEveningCardDate);
  const setDismissedBridgeCardDate = useUnfoldStore((s) => s.setDismissedBridgeCardDate);

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

  // Scroll tracking for AmbientArtCanvas fade
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const [isTodayFocused, setIsTodayFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsTodayFocused(true);
      return () => setIsTodayFocused(false);
    }, [])
  );

  const [clockNow, setClockNow] = useState(() => new Date());
  const [showCheckInSheet, setShowCheckInSheet] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const { gate, showExclusiveOffer, dismissOffer } = useCreationGate();

  // Update clock-driven Today card visibility every minute.
  useEffect(() => {
    const interval = setInterval(() => {
      setClockNow(new Date());
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
        } catch (err) {
          console.warn('[home] Devotional sync refresh failed:', err instanceof Error ? err.message : err);
        }
      })();

      return () => { cancelled = true; };
    }, [currentDevotionalId, updateDevotionalDays])
  );

  // Check if today's reading has been completed — drives ember visibility
  const hasReadToday = useMemo(() => (
    hasReadDevotionalToday({ devotionals, currentDevotionalId })
  ), [currentDevotionalId, devotionals]);

  // Streak celebration: show once when hasReadToday flips from false->true
  const [showCelebration, setShowCelebration] = useState(false);
  const prevHasReadToday = usePrevious(hasReadToday);
  useEffect(() => {
    if (hasReadToday && prevHasReadToday === false) {
      setShowCelebration(true);
    }
  }, [hasReadToday, prevHasReadToday]);

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
        console.warn('[home] Auto-generation failed, will retry:', err instanceof Error ? err.message : err);
      }
    })();

    return () => { cancelled = true; };
  }, [isPreparingCurrentDay, currentDevotional]);

  const qaContextSlot = useMemo<QaContextSlotPreview | null>(() => {
    if (!isQaToolsEnabled()) return null;
    if (user?.aboutMe !== QA_TODAY_PROFILE_MARKER) return null;

    const match = user.currentSituation.match(new RegExp(`${QA_TODAY_CONTEXT_SLOT_PREFIX} ([a-z-]+)`));
    const slot = match?.[1];
    if (slot === 'midday' || slot === 'evening' || slot === 'bridge' || slot === 'bridge-loading') {
      return slot;
    }
    return null;
  }, [user?.aboutMe, user?.currentSituation]);

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
    queryKey: ['bridge', bridgeInput?.devotionalId, bridgeInput?.dayNumber, bridgeInput?.input],
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

  const handleEveningWindDown = () => {
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
  };

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

  const handleDay1ReviewOption = async (option: 'love' | 'okay' | 'not-for-me') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasSeenDay1Review();
    if (option === 'love') {
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
        }
      } catch {
        // Silently fail — review prompt is non-critical
      }
    }
  };

  const daysCompleted = currentDevotional ? (currentDevotional.days ?? []).filter(d => d.isRead).length : 0;
  const progressPercent = currentDevotional ? (daysCompleted / currentDevotional.totalDays) * 100 : 0;
  const currentDayData = getHomeDevotionalDayData(currentDevotional);

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
  const computedSlotType = getContextSlotType({
    hasResumeContext: shouldShowResumeCard,
    currentHour,
    currentMinute,
    hasDevotional: !!currentDevotional,
    hasReadToday,
    hasMiddayCheckIn: !!todayCheckIn || hasDismissedMiddayCardToday,
    hasEveningCheckIn: !!todayEveningCheckIn || hasDismissedEveningCardToday,
    hasBridgeText: !!validBridgeText,
    isBridgeLoading: !hasDismissedBridgeCardToday && bridgeLoading && !!bridgeInput,
    hasBridgeInput: !!bridgeInput,
    isPremium,
  });
  const slotType = qaContextSlot ?? computedSlotType;

  const handleDismissResumeCard = useCallback(() => {
    clearResumeContext();
  }, [clearResumeContext]);

  const handleDismissMiddayCard = useCallback(() => {
    setDismissedMiddayCardDate(todayDate);
  }, [setDismissedMiddayCardDate, todayDate]);

  const handleDismissEveningCard = useCallback(() => {
    setDismissedEveningCardDate(todayDate);
  }, [setDismissedEveningCardDate, todayDate]);

  const handleDismissBridgeCard = useCallback(() => {
    setDismissedBridgeCardDate(todayDate);
  }, [setDismissedBridgeCardDate, todayDate]);

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
      {/* Layer 0: Ambient art — single Today ambient slot (Rive light rays or embers) */}
      <AmbientArtCanvas
        streakLevel={streakCurrent}
        hasReadToday={hasReadToday}
        stateType={devotionalState.type}
        accentColor={colors.accent}
        screenFocused={isTodayFocused}
        scrollY={scrollY}
      />

      {shouldShowCompletedBottomGlow({ hasReadToday, stateType: devotionalState.type }) && (
        <LinearGradient
          pointerEvents="none"
          colors={[
            alpha(colors.accent, 0),
            alpha(colors.accent, 0.08),
            alpha(colors.accent, 0.2),
          ]}
          locations={[0, 0.58, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.completedBottomGlow}
        />
      )}

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

          {/* Zone 2: Context Slot — Companion / resume / check-in support, before the hero */}
          <View collapsable={false} onLayout={handleContextLayout}>
            <Animated.View entering={entering(FadeIn.duration(280).delay(80).easing(Ease.out))}>
              <ContextSlot
                slotType={slotType}
                colors={colors}
                onMiddayPress={handleCheckIn}
                middayMessage={middayMessage}
                onEveningPress={handleEveningWindDown}
                eveningMessage={eveningMessage}
                bridgeText={validBridgeText}
                resumeProps={resumeProps}
                onDismissResume={handleDismissResumeCard}
                onDismissMidday={handleDismissMiddayCard}
                onDismissEvening={handleDismissEveningCard}
                onDismissBridge={handleDismissBridgeCard}
              />
            </Animated.View>
          </View>

          {/* Remember This — daily random highlight */}
          <RememberThisCard />

          {/* Zone 3: Hero Devotional — Today's primary act */}
          <View collapsable={false} onLayout={handleReadingLayout}>
            <Animated.View entering={entering(FadeIn.duration(280).delay(160).easing(Ease.out))}>
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
              entering={entering(FadeIn.duration(Duration.normal).delay(200).easing(Ease.out))}
              style={styles.day1ReviewWrapper}
            >
              <View
                style={[
                  styles.day1ReviewCard,
                  {
                    backgroundColor: alpha(colors.backgroundElevated, 0.68),
                    borderColor: alpha(colors.accent, 0.14),
                    shadowColor: colors.accent,
                  },
                ]}
              >
                <View style={styles.day1ReviewContent}>
                  <View style={styles.day1ReviewKickerRow}>
                    <View style={[styles.day1ReviewRule, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.day1ReviewKicker, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Day 1 reflection</Text>
                  </View>

                  <Text style={[styles.day1ReviewTitle, { color: colors.text }]} maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}>Did today’s reading feel personal?</Text>
                  <Text style={[styles.day1ReviewSubtitle, { color: colors.textMuted }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>One quiet response helps Unfold shape the next few days. No pressure — just a pulse check after your first reading.</Text>

                  <TouchableOpacity
                    activeOpacity={0.72}
                    onPress={() => handleDay1ReviewOption('love')}
                    accessibilityRole="button"
                    accessibilityLabel="This reading helped me"
                    accessibilityHint="Records a positive response and may open the App Store review prompt if available"
                    style={[
                      styles.day1ReviewPrimaryOption,
                      {
                        backgroundColor: alpha(colors.accent, 0.1),
                        borderColor: alpha(colors.accent, 0.28),
                      },
                    ]}
                  >
                    <HeartIcon size={17} color={colors.accent} weight="light" />
                    <Text style={[styles.day1ReviewPrimaryText, { color: colors.text }]} maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}>This helped me</Text>
                    <Text style={[styles.day1ReviewOptionArrow, { color: colors.accent }]}>→</Text>
                  </TouchableOpacity>

                  <View style={styles.day1ReviewSecondaryRow}>
                    <TouchableOpacity
                      activeOpacity={0.72}
                      onPress={() => handleDay1ReviewOption('okay')}
                      accessibilityRole="button"
                      accessibilityLabel="This reading was still settling"
                      accessibilityHint="Records neutral feedback and dismisses this prompt"
                      style={[
                        styles.day1ReviewSecondaryOption,
                        {
                          backgroundColor: alpha(colors.text, 0.045),
                          borderColor: alpha(colors.text, 0.08),
                        },
                      ]}
                    >
                      <HandIcon size={15} color={colors.textMuted} weight="light" />
                      <Text style={[styles.day1ReviewSecondaryText, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Still settling</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.72}
                      onPress={() => handleDay1ReviewOption('not-for-me')}
                      accessibilityRole="button"
                      accessibilityLabel="This reading was not for me"
                      accessibilityHint="Records that this devotional did not fit and dismisses this prompt"
                      style={[
                        styles.day1ReviewSecondaryOption,
                        {
                          backgroundColor: alpha(colors.text, 0.035),
                          borderColor: alpha(colors.text, 0.07),
                        },
                      ]}
                    >
                      <XIcon size={15} color={colors.textMuted} weight="light" />
                      <Text style={[styles.day1ReviewSecondaryText, { color: colors.textMuted }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Not for me</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Zone 6: Daily Rhythm */}
          <View collapsable={false} onLayout={handleRhythmLayout}>
            <Animated.View
              entering={entering(FadeIn.duration(Duration.normal).delay(200).easing(Ease.out))}
              style={styles.streakWrapper}
            >
              <StreakBox
                streakCount={streakCurrent}
                hasReadToday={hasReadToday}
                onPress={() => router.push('/streak-settings')}
              />
            </Animated.View>
          </View>

          {/* Zone 7: Bento Grid */}
          <BentoGrid />

          {/* QA: Preview reveal screen (QA builds, only when Today has no active devotional) */}
          {isQaToolsEnabled() && !currentDevotional && (
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
                QA: Preview reveal
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
          dayNumber={middayCheckInDay ?? currentDevotional.currentDay}
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
        layoutRects={tooltipLayoutRects}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  completedBottomGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
    zIndex: 0,
  },
  day1ReviewWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  day1ReviewCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing['6'],
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 5,
  },
  day1ReviewContent: {
    zIndex: 2,
  },
  day1ReviewKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  day1ReviewRule: {
    width: 32,
    height: 1.5,
    borderRadius: 1,
  },
  day1ReviewKicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  day1ReviewTitle: {
    width: '100%',
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.35,
    marginBottom: Spacing['3'],
  },
  day1ReviewSubtitle: {
    width: '100%',
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing['5'],
  },
  day1ReviewPrimaryOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.full,
    borderWidth: 1,
    marginBottom: Spacing['3'],
  },
  day1ReviewPrimaryText: {
    flex: 1,
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  day1ReviewOptionArrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    lineHeight: 20,
    marginTop: -1,
  },
  day1ReviewSecondaryRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  day1ReviewSecondaryOption: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1.5'],
    paddingVertical: Spacing['2.5'],
    paddingHorizontal: Spacing['3'],
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  day1ReviewSecondaryText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  streakWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['5'],
  },
  premiumNudgeWrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['6'],
  },
});
